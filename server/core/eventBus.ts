import { EventEmitter } from 'events';
import { Response } from 'express';

export interface SseClient {
  id: string;
  res: Response;
  ip: string;
  connectedAt: number;
}

export class AppEventBus extends EventEmitter {
  private clients: Map<string, SseClient> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;
  private playbackTickInterval: NodeJS.Timeout | null = null;
  private queueEngineGetter: (() => any) | null = null;

  constructor() {
    super();
    this.setMaxListeners(100);
    // Keepalive ping every 25s
    this.pingInterval = setInterval(() => {
      this.sendPing();
    }, 25000);
  }

  public setQueueEngineProvider(provider: () => any) {
    this.queueEngineGetter = provider;
  }

  public registerClient(id: string, res: Response, ip: string): void {
    const client: SseClient = { id, res, ip, connectedAt: Date.now() };
    this.clients.set(id, client);

    // Initial greeting / handshake with current queue status
    let initialQueue: any = null;
    if (this.queueEngineGetter) {
      try {
        initialQueue = this.queueEngineGetter()?.getStatus?.();
      } catch {}
    }

    this.sendToClient(client, 'connected', {
      clientId: id,
      timestamp: Date.now(),
      serverTime: new Date().toISOString(),
      activeClients: this.clients.size,
      queue: initialQueue
    });

    this.checkPlaybackTickLoop();
  }

  public removeClient(id: string): void {
    this.clients.delete(id);
    this.checkPlaybackTickLoop();
  }

  public getClientCount(): number {
    return this.clients.size;
  }

  public broadcast(eventType: string, payload: any): void {
    if (this.clients.size === 0) return;
    const dataStr = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const [id, client] of this.clients.entries()) {
      try {
        client.res.write(dataStr);
      } catch {
        this.clients.delete(id);
      }
    }
  }

  private sendToClient(client: SseClient, eventType: string, payload: any): void {
    try {
      client.res.write(`event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch {
      this.clients.delete(client.id);
    }
  }

  private sendPing(): void {
    if (this.clients.size === 0) return;
    const pingData = `: ping ${Date.now()}\n\n`;
    for (const [id, client] of this.clients.entries()) {
      try {
        client.res.write(pingData);
      } catch {
        this.clients.delete(id);
      }
    }
  }

  public checkPlaybackTickLoop(): void {
    if (!this.queueEngineGetter) return;
    const queueEngine = this.queueEngineGetter();
    const status = queueEngine?.getStatus?.();
    const isPlaying = Boolean(status?.isPlaying);

    if (isPlaying && this.clients.size > 0) {
      if (!this.playbackTickInterval) {
        this.playbackTickInterval = setInterval(() => {
          if (!this.queueEngineGetter || this.clients.size === 0) {
            this.stopPlaybackTickLoop();
            return;
          }
          const currentStatus = this.queueEngineGetter().getStatus();
          if (!currentStatus.isPlaying) {
            this.stopPlaybackTickLoop();
            return;
          }
          this.broadcast('playback:tick', {
            elapsedSeconds: currentStatus.elapsedSeconds,
            duration: currentStatus.duration,
            remainingSeconds: currentStatus.remainingSeconds,
            songId: currentStatus.currentSong?.id,
            isPlaying: true
          });
        }, 1000);
      }
    } else {
      this.stopPlaybackTickLoop();
    }
  }

  private stopPlaybackTickLoop(): void {
    if (this.playbackTickInterval) {
      clearInterval(this.playbackTickInterval);
      this.playbackTickInterval = null;
    }
  }

  public destroy(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.stopPlaybackTickLoop();
    this.clients.clear();
  }
}

export const appEventBus = new AppEventBus();
