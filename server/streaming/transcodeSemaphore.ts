import os from 'os';
import { ChildProcess } from 'child_process';

export interface SemaphoreAcquireResult {
  acquired: boolean;
  strategy: 'immediate' | 'queued' | 'passthrough_fallback' | 'timeout_error';
  release: () => void;
  waitDurationMs: number;
}

export interface ActiveProcessSession {
  sessionId: string;
  pid: number;
  process: ChildProcess;
  sourcePath: string;
  clientIp?: string;
  userAgent?: string;
  deviceModel?: string;
  startTime: number;
  lastActivityTime: number;
  hasConsumer: boolean;
  reaperTimer?: NodeJS.Timeout;
  releaseFn?: () => void;
  killed?: boolean;
}

export interface TranscodePoolStats {
  maxConcurrency: number;
  activeCount: number;
  queuedCount: number;
  totalAcquired: number;
  totalQueued: number;
  totalTimeouts: number;
  totalDirectPassThrough: number;
  totalReapedZombies: number;
  systemCores: number;
  activeSessions: Array<{
    sessionId: string;
    pid: number;
    runningSeconds: number;
    clientIp?: string;
    sourcePath: string;
    hasConsumer: boolean;
    isZombiePending: boolean;
  }>;
}

// Hardware speaker models with native lossless (FLAC/WAV/ALAC/AAC) hardware DSP decoding
const KNOWN_LOSSLESS_SPEAKERS = [
  'OH2P',
  'L16A',
  'LX06',
  'L09A',
  'L09B',
  'X08A',
  'X08C',
  'X08E',
  'X10A',
  'LX04',
  'Xiaomi Sound',
  'Xiaomi Sound Pro',
  'xiaomi.wifispeaker.l16a',
  'xiaomi.wifispeaker.oh2p',
  'xiaomi.wifispeaker.lx06',
  'xiaomi.wifispeaker.x08a',
  'xiaomi.wifispeaker.l09a'
];

/**
 * TranscodeSemaphorePool
 * Manages concurrency limits, queuing, lossless direct pass-through, and zombie process cleanup
 * for FFmpeg transcoding jobs on low-power hardware (Raspberry Pi, NAS, Soft Router).
 */
export class TranscodeSemaphorePool {
  private maxConcurrency: number;
  private activeCount: number = 0;
  private queue: Array<{
    id: string;
    resolve: (res: SemaphoreAcquireResult) => void;
    reject: (err: Error) => void;
    createdAt: number;
    timer: NodeJS.Timeout;
    deviceModel?: string;
    userAgent?: string;
  }> = [];

  private activeSessions: Map<string, ActiveProcessSession> = new Map();
  private reaperSweepInterval: NodeJS.Timeout | null = null;

  // Metrics
  private totalAcquired: number = 0;
  private totalQueued: number = 0;
  private totalTimeouts: number = 0;
  private totalDirectPassThrough: number = 0;
  private totalReapedZombies: number = 0;

  constructor(customMaxConcurrency?: number) {
    const cores = os.cpus()?.length || 2;
    // Default: for low-power (<= 2 cores), maxConcurrency = 2; for 4 cores = 2 or 3; max 4.
    if (customMaxConcurrency && customMaxConcurrency > 0) {
      this.maxConcurrency = customMaxConcurrency;
    } else {
      this.maxConcurrency = Math.max(1, Math.min(cores > 2 ? cores - 1 : 2, 4));
    }

    console.log(`🛡️ [TranscodeSemaphorePool] Initialized. CPU Cores: ${cores}, Max FFmpeg Concurrency: ${this.maxConcurrency}`);

    // Periodic sweep for any orphaned or untracked zombie processes every 15 seconds
    this.reaperSweepInterval = setInterval(() => {
      this.sweepZombieSessions();
    }, 15000);
  }

  public getMaxConcurrency(): number {
    return this.maxConcurrency;
  }

  public setMaxConcurrency(val: number): void {
    if (val > 0) {
      this.maxConcurrency = Math.min(val, 8);
      this.drainQueue();
    }
  }

  /**
   * Acquire a transcoding slot with 3-second timeout and Strategy A (queue) / Strategy B (pass-through) fallback.
   */
  public async acquire(options: {
    sessionId?: string;
    timeoutMs?: number;
    deviceModel?: string;
    userAgent?: string;
    clientIp?: string;
    fileExtension?: string;
  } = {}): Promise<SemaphoreAcquireResult> {
    const timeoutMs = options.timeoutMs ?? 3000;
    const t0 = Date.now();

    // Fast path: slot immediately available
    if (this.activeCount < this.maxConcurrency) {
      this.activeCount++;
      this.totalAcquired++;
      let released = false;

      const release = () => {
        if (released) return;
        released = true;
        this.activeCount = Math.max(0, this.activeCount - 1);
        this.drainQueue();
      };

      return {
        acquired: true,
        strategy: 'immediate',
        release,
        waitDurationMs: 0
      };
    }

    // Capacity saturated. Check Strategy B: Lossless Direct Play Pass-Through if hardware supports it
    const isLosslessFormat = options.fileExtension && ['.flac', '.wav', '.aac', '.m4a'].includes(options.fileExtension.toLowerCase());
    if (isLosslessFormat && this.isDeviceLosslessCapable(options.deviceModel, options.userAgent)) {
      this.totalDirectPassThrough++;
      console.log(`⚡ [TranscodeSemaphorePool] [Strategy B] Concurrency full (${this.activeCount}/${this.maxConcurrency}). Target device '${options.deviceModel || options.userAgent || 'Capable Player'}' supports native decoding. Bypassing FFmpeg with direct pass-through.`);
      return {
        acquired: true,
        strategy: 'passthrough_fallback',
        release: () => {},
        waitDurationMs: 0
      };
    }

    // Strategy A: Join waiting queue with 3-second timeout
    this.totalQueued++;
    const queueId = `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    console.log(`⏳ [TranscodeSemaphorePool] [Strategy A] Transcode slot busy (${this.activeCount}/${this.maxConcurrency}). Request ${queueId} joining waiting queue (max wait ${timeoutMs}ms)...`);

    return new Promise<SemaphoreAcquireResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        // Remove from queue on timeout
        const idx = this.queue.findIndex(item => item.id === queueId);
        if (idx >= 0) {
          this.queue.splice(idx, 1);
        }
        this.totalTimeouts++;

        // On timeout, check if we can fallback to pass-through rather than failing
        if (isLosslessFormat || this.isBrowser(options.userAgent)) {
          console.warn(`⏱️ [TranscodeSemaphorePool] Queue timeout (${timeoutMs}ms) for ${queueId}. Fallback to direct pass-through.`);
          this.totalDirectPassThrough++;
          resolve({
            acquired: true,
            strategy: 'passthrough_fallback',
            release: () => {},
            waitDurationMs: Date.now() - t0
          });
        } else {
          console.warn(`⏱️ [TranscodeSemaphorePool] Queue timeout (${timeoutMs}ms) for ${queueId}. Rejecting to protect hardware resources.`);
          resolve({
            acquired: false,
            strategy: 'timeout_error',
            release: () => {},
            waitDurationMs: Date.now() - t0
          });
        }
      }, timeoutMs);

      this.queue.push({
        id: queueId,
        resolve,
        reject,
        createdAt: t0,
        timer,
        deviceModel: options.deviceModel,
        userAgent: options.userAgent
      });
    });
  }

  /**
   * Drain queued jobs if concurrency slots open up
   */
  private drainQueue(): void {
    while (this.queue.length > 0 && this.activeCount < this.maxConcurrency) {
      const nextJob = this.queue.shift();
      if (!nextJob) break;

      clearTimeout(nextJob.timer);
      this.activeCount++;
      this.totalAcquired++;
      const waitDuration = Date.now() - nextJob.createdAt;

      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        this.activeCount = Math.max(0, this.activeCount - 1);
        this.drainQueue();
      };

      console.log(`✅ [TranscodeSemaphorePool] Queue slot allocated for ${nextJob.id} after ${waitDuration}ms wait.`);
      nextJob.resolve({
        acquired: true,
        strategy: 'queued',
        release,
        waitDurationMs: waitDuration
      });
    }
  }

  /**
   * Checks if target speaker or player natively supports FLAC/WAV lossless decoding
   */
  public isDeviceLosslessCapable(deviceModel?: string, userAgent?: string): boolean {
    if (deviceModel) {
      const modelUpper = deviceModel.toUpperCase();
      if (KNOWN_LOSSLESS_SPEAKERS.some(k => modelUpper.includes(k.toUpperCase()))) {
        return true;
      }
    }
    if (userAgent) {
      if (/Mozilla|Chrome|Safari|Firefox|Edg|AppleWebKit/i.test(userAgent) && !/stagefright|mico|xiaomi/i.test(userAgent)) {
        return true; // Modern browsers handle FLAC/WAV/AAC natively
      }
      if (/vlc|foobar|kodi|mpv|audirvana|roon/i.test(userAgent)) {
        return true;
      }
    }
    return false;
  }

  private isBrowser(userAgent?: string): boolean {
    if (!userAgent) return false;
    return /Mozilla|Chrome|Safari|Firefox|Edg|AppleWebKit/i.test(userAgent) && !/stagefright|mico|xiaomi/i.test(userAgent);
  }

  /**
   * Register an active live transcode session for Zombie Process Reaping
   */
  public registerSession(session: {
    sessionId: string;
    process: ChildProcess;
    sourcePath: string;
    clientIp?: string;
    userAgent?: string;
    deviceModel?: string;
    releaseFn?: () => void;
  }): void {
    const pid = session.process.pid || 0;
    const meta: ActiveProcessSession = {
      sessionId: session.sessionId,
      pid,
      process: session.process,
      sourcePath: session.sourcePath,
      clientIp: session.clientIp,
      userAgent: session.userAgent,
      deviceModel: session.deviceModel,
      startTime: Date.now(),
      lastActivityTime: Date.now(),
      hasConsumer: true,
      releaseFn: session.releaseFn,
      killed: false
    };

    this.activeSessions.set(session.sessionId, meta);
    console.log(`🎬 [TranscodeSemaphorePool] Registered live FFmpeg transcode session ${session.sessionId} (PID: ${pid}). Active sessions: ${this.activeSessions.size}`);

    session.process.once('exit', (code, sig) => {
      this.unregisterSession(session.sessionId, `process exit code=${code} sig=${sig}`);
    });
  }

  /**
   * Zombie Process Reaper Trigger:
   * Called when client HTTP connection closes (res.on('close')).
   * Starts a 5-second grace countdown. If no consumer re-attaches, sends SIGKILL.
   */
  public notifyClientDisconnected(sessionId: string, gracePeriodMs: number = 5000): void {
    const meta = this.activeSessions.get(sessionId);
    if (!meta || meta.killed) return;

    meta.hasConsumer = false;
    console.log(`🔌 [Zombie Reaper] Client disconnected from session ${sessionId} (PID: ${meta.pid}). Starting ${gracePeriodMs}ms grace timer...`);

    if (meta.reaperTimer) {
      clearTimeout(meta.reaperTimer);
    }

    meta.reaperTimer = setTimeout(() => {
      this.reapSession(sessionId, 'client disconnected > 5s with no consumers');
    }, gracePeriodMs);
  }

  /**
   * Called if consumer re-connects (e.g. rapid seek re-attach) within the grace period
   */
  public notifyClientReconnected(sessionId: string): void {
    const meta = this.activeSessions.get(sessionId);
    if (!meta || meta.killed) return;

    meta.hasConsumer = true;
    meta.lastActivityTime = Date.now();
    if (meta.reaperTimer) {
      clearTimeout(meta.reaperTimer);
      meta.reaperTimer = undefined;
      console.log(`♻️ [Zombie Reaper] Session ${sessionId} re-claimed by client. Grace timer cancelled.`);
    }
  }

  /**
   * Hard-terminate (SIGKILL) a live FFmpeg process immediately
   */
  public reapSession(sessionId: string, reason: string): void {
    const meta = this.activeSessions.get(sessionId);
    if (!meta || meta.killed) return;

    meta.killed = true;
    if (meta.reaperTimer) {
      clearTimeout(meta.reaperTimer);
      meta.reaperTimer = undefined;
    }

    console.warn(`💀 [Zombie Reaper] Terminating FFmpeg process ${meta.pid} (${sessionId}) | Reason: ${reason}`);

    try {
      if (meta.process && !meta.process.killed) {
        // Send SIGTERM first, followed quickly by SIGKILL to ensure hard release
        meta.process.kill('SIGTERM');
        setTimeout(() => {
          try {
            if (meta.process && !meta.process.killed) {
              meta.process.kill('SIGKILL');
            }
          } catch {}
        }, 500);
      }
    } catch (err: any) {
      console.warn(`[Zombie Reaper] Error killing PID ${meta.pid}:`, err.message);
    }

    this.totalReapedZombies++;
    this.unregisterSession(sessionId, reason);
  }

  /**
   * Clean up session metadata and release semaphore ticket if attached
   */
  public unregisterSession(sessionId: string, reason?: string): void {
    const meta = this.activeSessions.get(sessionId);
    if (!meta) return;

    if (meta.reaperTimer) {
      clearTimeout(meta.reaperTimer);
    }

    if (meta.releaseFn) {
      try { meta.releaseFn(); } catch {}
    }

    this.activeSessions.delete(sessionId);
    console.log(`🧹 [TranscodeSemaphorePool] Unregistered session ${sessionId} (${reason || 'done'}). Remaining active: ${this.activeSessions.size}`);
  }

  /**
   * Periodic sweep: kill processes running for > 30 minutes or without consumer for > 15s
   */
  private sweepZombieSessions(): void {
    const now = Date.now();
    for (const [sessionId, meta] of this.activeSessions.entries()) {
      const runningMs = now - meta.startTime;
      // Max TTL 30 minutes for a single stream session
      if (runningMs > 30 * 60 * 1000) {
        this.reapSession(sessionId, 'session max TTL (30m) reached');
        continue;
      }
      // If marked without consumer and running without timer for > 10s
      if (!meta.hasConsumer && !meta.reaperTimer && (now - meta.lastActivityTime > 10000)) {
        this.reapSession(sessionId, 'orphaned session with no active consumer');
      }
    }
  }

  /**
   * Get current pool diagnostic stats
   */
  public getStats(): TranscodePoolStats {
    const now = Date.now();
    const sessionsList: TranscodePoolStats['activeSessions'] = [];

    for (const [id, meta] of this.activeSessions.entries()) {
      sessionsList.push({
        sessionId: id,
        pid: meta.pid,
        runningSeconds: Math.round((now - meta.startTime) / 1000),
        clientIp: meta.clientIp,
        sourcePath: meta.sourcePath,
        hasConsumer: meta.hasConsumer,
        isZombiePending: Boolean(meta.reaperTimer)
      });
    }

    return {
      maxConcurrency: this.maxConcurrency,
      activeCount: this.activeCount,
      queuedCount: this.queue.length,
      totalAcquired: this.totalAcquired,
      totalQueued: this.totalQueued,
      totalTimeouts: this.totalTimeouts,
      totalDirectPassThrough: this.totalDirectPassThrough,
      totalReapedZombies: this.totalReapedZombies,
      systemCores: os.cpus()?.length || 2,
      activeSessions: sessionsList
    };
  }

  public destroy(): void {
    if (this.reaperSweepInterval) {
      clearInterval(this.reaperSweepInterval);
    }
    for (const [sessionId] of this.activeSessions.entries()) {
      this.reapSession(sessionId, 'pool shutdown');
    }
  }
}

export const transcodeSemaphorePool = new TranscodeSemaphorePool();
