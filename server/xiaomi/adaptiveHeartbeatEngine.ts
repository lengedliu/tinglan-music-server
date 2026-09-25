import dgram from 'dgram';
import net from 'net';
import { XiaomiDevice, DeviceManager, deviceManager } from './deviceManager.js';
import { xiaomiCircuitBreaker } from '../circuitBreaker.js';

export interface HeartbeatStatus {
  did: string;
  ip?: string;
  isOnline: boolean;
  latencyMs: number;
  lastChecked: string;
  activeProtocol: 'miIO_UDP' | 'DLNA_TCP' | 'MINA_CLOUD' | 'NONE';
  isPlaying?: boolean;
  volume?: number;
  track?: string;
  consecutiveFailures?: number;
  backoffDelayMs?: number;
  nextProbeDueInSec?: number;
  isBackingOff?: boolean;
  recoveredRecently?: boolean;
}

export interface DeviceBackoffState {
  consecutiveFailures: number;
  nextProbeTime: number;
  lastBackoffIntervalMs: number;
  wasOffline: boolean;
  lastRecoveryTime?: number;
}

export type StateSyncCallback = (deviceDid: string, status: Partial<XiaomiDevice>) => void;

/**
 * Smart Adaptive Heartbeat & Self-Healing State Synchronizer
 * - Idle Mode: 60s low-frequency keepalive
 * - Active/Playing Mode: 3s fast probe
 * - Exponential Backoff with Jitter for offline/failed speakers (prevents ARP & socket storms)
 * - Circuit Breaker Aware: suppresses Cloud Mina requests when circuit breaker is tripped
 * - Dynamic IP Drift Self-Healing: Resolves IP changes over LAN broadcast
 * - Bi-directional Hardware Playback State Sync & Disaster Recovery
 */
export class AdaptiveHeartbeatEngine {
  private deviceManager: DeviceManager;
  private callMinaCloudApiFn?: (path: string, method: string, message: any, deviceId?: string) => Promise<any>;
  private sendMiioCommandFn?: (ip: string, token: string, method: string, params: any, timeoutMs?: number) => Promise<any>;
  private timer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private syncCallbacks: Set<StateSyncCallback> = new Set();
  private isHighFrequency: boolean = false;
  private consecutiveFailures: Map<string, number> = new Map();
  private lastHeartbeatMap: Map<string, HeartbeatStatus> = new Map();
  private deviceBackoffMap: Map<string, DeviceBackoffState> = new Map();

  constructor(deviceManager: DeviceManager) {
    this.deviceManager = deviceManager;
  }

  public setRpcHandlers(
    callMinaCloudApiFn: (path: string, method: string, message: any, deviceId?: string) => Promise<any>,
    sendMiioCommandFn: (ip: string, token: string, method: string, params: any, timeoutMs?: number) => Promise<any>
  ) {
    this.callMinaCloudApiFn = callMinaCloudApiFn;
    this.sendMiioCommandFn = sendMiioCommandFn;
  }

  public onStateSync(callback: StateSyncCallback): () => void {
    this.syncCallbacks.add(callback);
    return () => this.syncCallbacks.delete(callback);
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[AdaptiveHeartbeat] Smart Adaptive Heartbeat Engine started.');
    this.scheduleNextTick(1000);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log('[AdaptiveHeartbeat] Smart Adaptive Heartbeat Engine stopped.');
  }

  /**
   * Reset backoff cooldown and failures counter for a specific device (e.g. when user triggers action)
   */
  public resetDeviceBackoff(did: string): void {
    const state = this.deviceBackoffMap.get(did);
    if (state) {
      state.consecutiveFailures = 0;
      state.nextProbeTime = 0;
      state.lastBackoffIntervalMs = 0;
    }
    this.consecutiveFailures.set(did, 0);
  }

  /**
   * Called when playback or volume command is issued to a device:
   * Resets backoff delays and immediately boosts to active fast-probe mode
   */
  public notifyDeviceActivity(did: string): void {
    this.resetDeviceBackoff(did);
    this.triggerActiveMode(35000);
  }

  /**
   * Boost heartbeat to high-frequency (3s) when user issues playback commands
   */
  public triggerActiveMode(durationMs = 30000): void {
    this.isHighFrequency = true;
    console.log(`[AdaptiveHeartbeat] Boosted to Active Fast Probe Mode (3s) for ${durationMs / 1000}s`);
    if (this.timer) {
      clearTimeout(this.timer);
      this.scheduleNextTick(300);
    }
    setTimeout(() => {
      // Re-evaluate if any device is still playing
      const devices = this.deviceManager.getAll();
      const hasPlaying = devices.some((d) => d.isPlaying);
      if (!hasPlaying) {
        this.isHighFrequency = false;
        console.log('[AdaptiveHeartbeat] Returned to Idle Low-Power Mode (60s)');
      }
    }, durationMs);
  }

  public getHeartbeatStatuses(): HeartbeatStatus[] {
    return Array.from(this.lastHeartbeatMap.values());
  }

  private scheduleNextTick(delayMs?: number): void {
    if (!this.isRunning) return;
    const interval = delayMs !== undefined ? delayMs : this.isHighFrequency ? 3000 : 60000;
    this.timer = setTimeout(() => this.tick(), interval);
  }

  /**
   * Parallel heartbeat tick with per-device exponential backoff and jitter
   */
  private async tick(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const devices = this.deviceManager.getAll();
      const hasPlaying = devices.some((d) => d.isPlaying);
      this.isHighFrequency = hasPlaying;

      const now = Date.now();
      // Probe devices concurrently without head-of-line blocking
      await Promise.allSettled(
        devices.map((device) => this.probeDeviceWithBackoff(device, now))
      );
    } catch (err: any) {
      console.warn('[AdaptiveHeartbeat] Error during heartbeat tick:', err.message);
    } finally {
      this.scheduleNextTick();
    }
  }

  /**
   * Evaluates exponential backoff cooldown before firing network sockets
   */
  private async probeDeviceWithBackoff(device: XiaomiDevice, now: number): Promise<void> {
    let backoff = this.deviceBackoffMap.get(device.did);
    if (!backoff) {
      backoff = {
        consecutiveFailures: 0,
        nextProbeTime: 0,
        lastBackoffIntervalMs: 0,
        wasOffline: !device.online
      };
      this.deviceBackoffMap.set(device.did, backoff);
    }

    // If currently in exponential backoff cooldown, skip probe to prevent ARP/socket flooding
    if (now < backoff.nextProbeTime) {
      const remainingSec = Math.ceil((backoff.nextProbeTime - now) / 1000);
      const existing = this.lastHeartbeatMap.get(device.did);
      if (existing) {
        existing.isBackingOff = true;
        existing.nextProbeDueInSec = remainingSec;
        existing.consecutiveFailures = backoff.consecutiveFailures;
      }
      return;
    }

    await this.probeDevice(device, backoff);
  }

  private async probeDevice(device: XiaomiDevice, backoff?: DeviceBackoffState): Promise<void> {
    const startTime = Date.now();
    let isOnline = false;
    let activeProtocol: 'miIO_UDP' | 'DLNA_TCP' | 'MINA_CLOUD' | 'NONE' = 'NONE';
    let volume: number | undefined = device.currentVolume;
    let isPlaying: boolean | undefined = device.isPlaying;
    let currentTrack: string | undefined = device.currentTrack;

    if (!backoff) {
      backoff = this.deviceBackoffMap.get(device.did) || {
        consecutiveFailures: 0,
        nextProbeTime: 0,
        lastBackoffIntervalMs: 0,
        wasOffline: !device.online
      };
      this.deviceBackoffMap.set(device.did, backoff);
    }

    // 1. LAN miIO UDP 54321 Probe (if IP is configured)
    if (device.ip) {
      const miioReachable = await this.pingMiioUdp(device.ip, 1200);
      if (miioReachable) {
        isOnline = true;
        activeProtocol = 'miIO_UDP';

        // If token available, query play status & volume
        if (device.token && this.sendMiioCommandFn && (this.isHighFrequency || Math.random() < 0.2)) {
          try {
            const statusRes = await this.sendMiioCommandFn(
              device.ip,
              device.token,
              'player_get_play_status',
              [],
              1500
            );
            if (statusRes && statusRes.result) {
              const res = statusRes.result;
              if (res.status !== undefined) {
                isPlaying = res.status === 1 || res.status === 'play' || res.status === 'playing';
              }
              if (res.volume !== undefined && typeof res.volume === 'number') {
                volume = res.volume;
              }
              if (res.title || res.track) {
                currentTrack = res.title || res.track;
              }
            }
          } catch {}
        }
      } else {
        // TCP DLNA Port Check Fallback (1420 / 49152 / 80)
        const dlnaReachable = await this.pingTcpPort(device.ip, 1420, 800) || await this.pingTcpPort(device.ip, 49152, 800);
        if (dlnaReachable) {
          isOnline = true;
          activeProtocol = 'DLNA_TCP';
        }
      }
    }

    // 2. Self-Healing: If LAN probe failed 2+ times, trigger dynamic LAN ARP/miIO sniff for new IP
    if (!isOnline && device.ip) {
      const fails = (this.consecutiveFailures.get(device.did) || 0) + 1;
      this.consecutiveFailures.set(device.did, fails);

      if (fails >= 2) {
        const healedIp = await this.healDeviceIp(device);
        if (healedIp) {
          console.log(`✨ [AdaptiveHeartbeat] [Self-Healing] Re-associated device 【${device.name}】(${device.did}) from old IP ${device.ip} to new IP ${healedIp}!`);
          device.ip = healedIp;
          this.deviceManager.updateDevice(device.did, { ip: healedIp, online: true });
          this.consecutiveFailures.set(device.did, 0);
          isOnline = true;
          activeProtocol = 'miIO_UDP';
        }
      }
    }

    // 3. Cloud Mina API fallback query if available (Protected by Circuit Breaker)
    if (!isOnline && this.callMinaCloudApiFn) {
      const circuitCheck = xiaomiCircuitBreaker.canRequest('heartbeat_probe');
      if (circuitCheck.allowed) {
        try {
          const cloudRes = await this.callMinaCloudApiFn('mediaplayer', 'player_get_play_status', {}, device.did);
          if (cloudRes?.success) {
            isOnline = true;
            activeProtocol = 'MINA_CLOUD';
            const info = cloudRes.data?.info;
            if (info) {
              isPlaying = info.status === 1 || info.status === 'play';
              if (info.volume !== undefined) volume = info.volume;
            }
          }
        } catch {}
      } else {
        // Circuit breaker OPEN: safely skip cloud probing to prevent account locks and allow recovery
      }
    }

    const now = Date.now();
    let recoveredRecently = false;

    // 4. Backoff & Disaster Recovery State Tracking
    if (isOnline) {
      if (backoff.wasOffline) {
        recoveredRecently = true;
        backoff.lastRecoveryTime = now;
        console.log(`🎉 [AdaptiveHeartbeat] [Disaster Recovery] Speaker 【${device.name}】(${device.did}) recovered online via ${activeProtocol}! Reconciling state...`);
      }
      backoff.wasOffline = false;
      backoff.consecutiveFailures = 0;
      backoff.nextProbeTime = 0;
      backoff.lastBackoffIntervalMs = 0;
      this.consecutiveFailures.set(device.did, 0);
    } else {
      backoff.consecutiveFailures++;
      this.consecutiveFailures.set(device.did, backoff.consecutiveFailures);
      backoff.wasOffline = true;

      // Exponential Backoff with Jitter algorithm:
      // Base: 4s in active mode, 15s in idle mode. Multiplier = 1.8^min(fails, 6)
      // Jitter = +/- 15% to avoid synchronized bursts across multiple offline devices
      const baseDelay = this.isHighFrequency ? 4000 : 15000;
      const multiplier = Math.pow(1.8, Math.min(backoff.consecutiveFailures, 6));
      const backoffMs = Math.min(300000, Math.round(baseDelay * multiplier)); // cap at 5 minutes
      const jitter = Math.round(backoffMs * (0.85 + Math.random() * 0.3));
      backoff.nextProbeTime = now + jitter;
      backoff.lastBackoffIntervalMs = jitter;
    }

    const latencyMs = Date.now() - startTime;
    const heartbeat: HeartbeatStatus = {
      did: device.did,
      ip: device.ip,
      isOnline,
      latencyMs,
      lastChecked: new Date().toLocaleTimeString(),
      activeProtocol,
      isPlaying,
      volume,
      track: currentTrack,
      consecutiveFailures: backoff.consecutiveFailures,
      backoffDelayMs: backoff.lastBackoffIntervalMs,
      nextProbeDueInSec: backoff.nextProbeTime > now ? Math.ceil((backoff.nextProbeTime - now) / 1000) : 0,
      isBackingOff: backoff.consecutiveFailures > 0 && backoff.nextProbeTime > now,
      recoveredRecently
    };

    this.lastHeartbeatMap.set(device.did, heartbeat);

    // Sync state changes back to repository & listeners
    const stateChanged =
      device.online !== isOnline ||
      device.isPlaying !== isPlaying ||
      device.currentVolume !== volume ||
      device.currentTrack !== currentTrack;

    if (stateChanged) {
      const updates: Partial<XiaomiDevice> = {
        online: isOnline,
        isPlaying,
        currentVolume: volume,
        currentTrack,
        lastSeen: new Date().toISOString()
      };

      this.deviceManager.updateDevice(device.did, updates);

      for (const cb of this.syncCallbacks) {
        try {
          cb(device.did, updates);
        } catch {}
      }
    }
  }

  /**
   * Sniffs the local network for shifted device IP by broadcast or subnet probing
   */
  private async healDeviceIp(device: XiaomiDevice): Promise<string | null> {
    if (!device.mac && !device.did) return null;
    return new Promise((resolve) => {
      const socket = dgram.createSocket('udp4');
      const magicHello = Buffer.from(
        '21310020ffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        'hex'
      );

      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try { socket.close(); } catch {}
          resolve(null);
        }
      }, 1500);

      socket.on('message', (msg, rinfo) => {
        if (msg.length >= 32 && !resolved) {
          const hexDid = msg.subarray(8, 12).toString('hex');
          const devDidClean = device.did.replace(/[^0-9]/g, '');
          const didNumber = parseInt(hexDid, 16);

          if (String(didNumber) === devDidClean || hexDid.toLowerCase() === devDidClean.toLowerCase()) {
            resolved = true;
            clearTimeout(timer);
            try { socket.close(); } catch {}
            resolve(rinfo.address);
          }
        }
      });

      socket.on('error', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          try { socket.close(); } catch {}
          resolve(null);
        }
      });

      try {
        socket.bind(() => {
          socket.setBroadcast(true);
          socket.send(magicHello, 0, magicHello.length, 54321, '255.255.255.255');
        });
      } catch {
        clearTimeout(timer);
        resolve(null);
      }
    });
  }

  private pingMiioUdp(ip: string, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const client = dgram.createSocket('udp4');
      const magicHello = Buffer.from(
        '21310020ffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        'hex'
      );
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          try { client.close(); } catch {}
          resolve(false);
        }
      }, timeoutMs);

      client.on('message', () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          try { client.close(); } catch {}
          resolve(true);
        }
      });

      client.on('error', () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          try { client.close(); } catch {}
          resolve(false);
        }
      });

      try {
        client.send(magicHello, 0, magicHello.length, 54321, ip, (err) => {
          if (err && !settled) {
            settled = true;
            clearTimeout(timer);
            try { client.close(); } catch {}
            resolve(false);
          }
        });
      } catch {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(false);
        }
      }
    });
  }

  private pingTcpPort(ip: string, port: number, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let settled = false;

      socket.setTimeout(timeoutMs);
      socket.on('connect', () => {
        if (!settled) {
          settled = true;
          socket.destroy();
          resolve(true);
        }
      });

      socket.on('timeout', () => {
        if (!settled) {
          settled = true;
          socket.destroy();
          resolve(false);
        }
      });

      socket.on('error', () => {
        if (!settled) {
          settled = true;
          socket.destroy();
          resolve(false);
        }
      });

      try {
        socket.connect(port, ip);
      } catch {
        resolve(false);
      }
    });
  }
}

export const adaptiveHeartbeatEngine = new AdaptiveHeartbeatEngine(deviceManager);
