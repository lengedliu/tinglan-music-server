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

  constructor() {
    super();
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
        this.lastError = err.message || 'WebSocket error';
        this.emit('error', err);
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        this.connected = false;
        this.connecting = false;
        this.emit('disconnected', { code, reason: reason.toString() });

        if (this.shouldRun) {
          this.reconnectCount++;
          const delay = Math.min(30000, 3000 * Math.pow(1.5, Math.min(this.reconnectCount, 6)));
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
