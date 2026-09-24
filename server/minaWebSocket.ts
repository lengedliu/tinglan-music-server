import WebSocket from 'ws';
import { EventEmitter } from 'events';

export interface MinaEvent {
  id: string;
  type: 'speaker_status' | 'voice_dialogue' | 'tts_event' | 'volume_change' | 'raw';
  timestamp: string;
  deviceId?: string;
  data: any;
  summary: string;
}

export interface MinaWsStatus {
  connected: boolean;
  connecting: boolean;
  userId?: string;
  lastHeartbeat: string | null;
  messageCount: number;
  reconnectCount: number;
  lastError: string | null;
  endpoint: string;
}

/**
 * Mina WebSocket Client
 * Maintains real-time persistent duplex connection to Xiaomi Mina Cloud API
 * to receive XiaoAi speaker state, conversation logs, and remote control events.
 */
export class MinaWebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private userId = '';
  private serviceToken = '';
  private deviceId = '';
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private connected = false;
  private connecting = false;
  private messageCount = 0;
  private reconnectCount = 0;
  private lastHeartbeat: string | null = null;
  private lastError: string | null = null;
  private shouldRun = false;
  private recentEvents: MinaEvent[] = [];
  private authRefreshHandler?: () => Promise<{ userId: string; serviceToken: string; deviceId?: string } | null>;
  private lastAuthRefreshTime = 0;
  private authFailCount = 0;

  constructor() {
    super();
    // Suppress unhandled crash while avoiding spamming console on expected 403/1006 closures
    this.on('error', (err: any) => {
      const msg = err?.message || String(err);
      if (!msg.includes('403') && !msg.includes('401') && !msg.includes('1006')) {
        console.warn('[Mina WebSocket] Handled socket error:', msg);
      }
    });
  }

  /**
   * Register global token refresh handler for automatic silent credential renewal
   */
  public setAuthRefreshHandler(fn: () => Promise<{ userId: string; serviceToken: string; deviceId?: string } | null>): void {
    this.authRefreshHandler = fn;
  }

  public getStatus(): MinaWsStatus {
    return {
      connected: this.connected,
      connecting: this.connecting,
      userId: this.userId || undefined,
      lastHeartbeat: this.lastHeartbeat,
      messageCount: this.messageCount,
      reconnectCount: this.reconnectCount,
      lastError: this.lastError,
      endpoint: 'wss://api.mina.mi.com/ws'
    };
  }

  public getRecentEvents(): MinaEvent[] {
    return this.recentEvents.slice(0, 50);
  }

  /**
   * Connect to Mina Cloud WebSocket
   */
  public connect(userId: string, serviceToken: string, deviceId = ''): void {
    if (!userId || !serviceToken) {
      this.lastError = 'Missing userId or serviceToken';
      return;
    }

    this.userId = String(userId).trim();
    this.serviceToken = String(serviceToken).trim();
    this.deviceId = String(deviceId).trim();
    this.shouldRun = true;

    this.disconnect(false);
    this.initWebSocket();
  }

  /**
   * Disconnect WebSocket
   */
  public disconnect(stopAutoReconnect = true): void {
    if (stopAutoReconnect) {
      this.shouldRun = false;
    }

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    this.connected = false;
    this.connecting = false;
  }

  private initWebSocket(): void {
    if (!this.shouldRun) return;
    this.connecting = true;

    const wsUrl = `wss://api.mina.mi.com/ws?userId=${encodeURIComponent(this.userId)}&deviceId=${encodeURIComponent(this.deviceId)}&appId=micoapi`;
    const headers = {
      'User-Agent': 'MISoundBox/1.4.0 (iPhone; iOS 14.4; Scale/3.00)',
      'Cookie': `userId=${this.userId}; serviceToken=${this.serviceToken}`,
      'Origin': 'https://api.mina.mi.com'
    };

    try {
      this.ws = new WebSocket(wsUrl, {
        headers,
        handshakeTimeout: 10000
      });

      this.ws.on('open', () => {
        this.connected = true;
        this.connecting = false;
        this.reconnectCount = 0; // Reset reconnection ladder upon successful connection
        this.authFailCount = 0;
        this.lastError = null;
        this.lastHeartbeat = new Date().toISOString();
        this.emit('connected', { userId: this.userId });
        this.startHeartbeat();

        // Push connection event
        this.recordEvent({
          id: `evt-${Date.now()}`,
          type: 'speaker_status',
          timestamp: new Date().toLocaleTimeString(),
          deviceId: this.deviceId || undefined,
          data: { status: 'ws_connected', userId: this.userId },
          summary: `已建立与小米 Mina 云端 WebSocket 长连接 (用户: ${this.userId})`
        });
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.messageCount++;
        this.lastHeartbeat = new Date().toISOString();
        this.handleMessage(data.toString());
      });

      this.ws.on('error', (err: Error) => {
        const errMsg = err?.message || 'WebSocket error';
        this.lastError = errMsg;
        
        const isAuthRejection = errMsg.includes('403') || errMsg.includes('401');

        if (isAuthRejection) {
          this.authFailCount++;
          // WebSocket 403 is WAF client-fingerprint rejection, NOT token expiry.
          // DO NOT trigger authRefreshHandler to prevent false periodic token refresh loops.
        }

        this.recordEvent({
          id: `evt-${Date.now()}`,
          type: 'raw',
          timestamp: new Date().toLocaleTimeString(),
          deviceId: this.deviceId || undefined,
          data: { error: errMsg, isAuthRejection },
          summary: isAuthRejection
            ? 'Mina 云端 WebSocket 受小米 WAF 策略限制 (已由 HTTPS 语音引擎无缝接管)'
            : `Mina 云端 WebSocket 状态: ${errMsg}`
        });
        try {
          this.emit('error', err);
        } catch {}
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        this.connected = false;
        this.connecting = false;
        this.emit('disconnected', { code, reason: reason.toString() });

        if (this.shouldRun) {
          this.reconnectCount++;
          
          // If repeatedly blocked by WAF (e.g. 403), enter quiet ultra-long standby (15-30 minutes)
          const isPersistentWafBlock = this.authFailCount >= 2 || this.reconnectCount >= 5;
          const baseDelay = isPersistentWafBlock
            ? 900000 // 15 minutes quiet standby
            : Math.min(300000, 5000 * Math.pow(1.8, Math.min(this.reconnectCount, 6)));
          const jitter = Math.floor(Math.random() * 3000);
          const delay = baseDelay + jitter;
          
          if (this.reconnectCount === 1) {
            console.log(`[Mina WebSocket] ℹ️ 长连接握手未完成 (code: ${code})，将在 ${(delay / 1000).toFixed(0)} 秒后自适应探测`);
          } else if (this.reconnectCount === 3 && isPersistentWafBlock) {
            console.log(`[Mina WebSocket] 🛡️ 云端长连接受小米网关安全策略限制 (403)，已转入后台静默待命模式 (语音口令由 HTTPS 引擎全量稳定保障)`);
          }
          
          if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
          }
          this.reconnectTimeout = setTimeout(() => {
            if (this.shouldRun) this.initWebSocket();
          }, delay);
        }
      });
    } catch (e: any) {
      this.connecting = false;
      this.connected = false;
      this.lastError = e.message;
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
          this.lastHeartbeat = new Date().toISOString();
        } catch {}
      }
    }, 30000);
  }

  private handleMessage(rawMessage: string): void {
    try {
      const parsed = JSON.parse(rawMessage);
      const timestamp = new Date().toLocaleTimeString();

      let eventType: MinaEvent['type'] = 'raw';
      let summary = '收到 Mina 云端通知';

      // Dialogue / conversation event
      if (parsed.query || parsed.answers || parsed.type === 'dialogue') {
        eventType = 'voice_dialogue';
        const queryText = parsed.query || parsed.text || '';
        const answerText = parsed.answers?.[0]?.tts?.text || parsed.answer || '';
        summary = `小爱对话: “${queryText}” -> “${answerText}”`;
      } else if (parsed.type === 'player_status' || parsed.status !== undefined) {
        eventType = 'speaker_status';
        summary = `音箱状态变动: ${parsed.status === 'playing' ? '正在播放' : '已暂停'}`;
      } else if (parsed.type === 'volume') {
        eventType = 'volume_change';
        summary = `音量调节: ${parsed.volume}%`;
      } else if (parsed.type === 'tts') {
        eventType = 'tts_event';
        summary = `TTS 播报: “${parsed.text}”`;
      }

      const event: MinaEvent = {
        id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: eventType,
        timestamp,
        deviceId: parsed.deviceId || this.deviceId || undefined,
        data: parsed,
        summary
      };

      this.recordEvent(event);
      this.emit('event', event);
    } catch {
      // Raw string message
      const event: MinaEvent = {
        id: `evt-${Date.now()}`,
        type: 'raw',
        timestamp: new Date().toLocaleTimeString(),
        data: rawMessage,
        summary: rawMessage.slice(0, 80)
      };
      this.recordEvent(event);
      this.emit('event', event);
    }
  }

  private recordEvent(evt: MinaEvent): void {
    this.recentEvents.unshift(evt);
    if (this.recentEvents.length > 100) {
      this.recentEvents.pop();
    }
  }
}

export const minaWsClient = new MinaWebSocketClient();
