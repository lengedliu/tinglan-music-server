import fs from 'fs';
import path from 'path';
import { spawn, execFile, ChildProcessWithoutNullStreams } from 'child_process';
import { promisify } from 'util';
import { Readable, PassThrough } from 'stream';
import { transcodeSemaphorePool, TranscodeSemaphorePool, TranscodePoolStats } from './transcodeSemaphore.js';
import { CacheQuotaManager, CacheManagerStats } from './cacheQuotaManager.js';

const execFileAsync = promisify(execFile);

export interface TranscodeResult {
  success: boolean;
  filePath: string;
  format: string;
  isTranscoded: boolean;
  durationSeconds?: number;
  strategy?: 'immediate' | 'queued' | 'passthrough_fallback' | 'timeout_error';
}

export interface LiveTranscodeSession {
  stream: Readable;
  process: ChildProcessWithoutNullStreams;
  sessionId: string;
  kill: (reason?: string) => void;
  notifyClientDisconnected: (gracePeriodMs?: number) => void;
  notifyClientReconnected: () => void;
  isPassThrough?: boolean;
}

export interface CacheStats {
  count: number;
  totalSizeBytes: number;
  totalSizeMb: string;
}

/**
 * FFmpeg Transcoder Engine with Concurrency Semaphore & Zombie Process Reaper
 * Standardizes any input audio (FLAC, WAV, AAC, M4A, OGG, APE, irregular MP3)
 * into standard XiaoAi hardware-compatible MP3 (44.1kHz, Stereo, CBR 320kbps, ID3v2.3, Xing header)
 * Features live streaming pipeline (0ms latency), Tee Pipe dual-output caching, hardware resource protection, and safe process cleanup.
 */
export class FfmpegTranscoder {
  private ffmpegAvailable: boolean = false;
  private cacheDir: string;
  private inFlightTranscodes: Map<string, Promise<TranscodeResult>> = new Map();
  public semaphore: TranscodeSemaphorePool;
  public quotaManager: CacheQuotaManager;

  constructor(cacheDir: string, customSemaphore?: TranscodeSemaphorePool, dataDir?: string) {
    this.cacheDir = cacheDir;
    this.semaphore = customSemaphore || transcodeSemaphorePool;
    this.quotaManager = new CacheQuotaManager(this.cacheDir, dataDir);

    if (!fs.existsSync(this.cacheDir)) {
      try {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      } catch (err) {
        console.error(`[FfmpegTranscoder] Failed to create cache directory ${cacheDir}:`, err);
      }
    }

    // Optimization 1: Boot-time orphan .part file sweeper
    this.cleanOrphanPartFiles();

    // Asynchronously probe FFmpeg binary without blocking the event loop
    this.ffmpegAvailable = true; // Default optimistic on Linux systems with /usr/bin/ffmpeg
    execFile('ffmpeg', ['-version'], (err, stdout) => {
      if (!err && stdout) {
        this.ffmpegAvailable = true;
        console.log('🎵 [FfmpegTranscoder] FFmpeg binary verified in PATH (Async). Pipeline stream & Semaphore pool active.');
      } else {
        this.ffmpegAvailable = false;
        console.warn('⚠️ [FfmpegTranscoder] FFmpeg binary check failed. Audio transcoding will fallback to pass-through.');
      }
    });
  }

  public isAvailable(): boolean {
    return this.ffmpegAvailable;
  }

  public getCacheDir(): string {
    return this.cacheDir;
  }

  public getPoolStats(): TranscodePoolStats {
    return this.semaphore.getStats();
  }

  /**
   * Fast-lookup for existing fresh cached MP3 file on disk
   */
  public getCachedMp3(sourcePath: string, songId: string): string | null {
    if (!fs.existsSync(sourcePath)) return null;
    const sanitizedId = songId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const cachedMp3Path = path.join(this.cacheDir, `${sanitizedId}_standard.mp3`);
    try {
      if (fs.existsSync(cachedMp3Path)) {
        const cacheStat = fs.statSync(cachedMp3Path);
        const sourceStat = fs.statSync(sourcePath);
        if (cacheStat.size > 1024 && cacheStat.mtimeMs >= sourceStat.mtimeMs) {
          // Touch cache for LRU/LFU frequency tracking
          this.quotaManager.touchCache(path.basename(cachedMp3Path), cachedMp3Path, sourcePath);
          return cachedMp3Path;
        }
      }
    } catch {}
    return null;
  }

  /**
   * Real-time live transcode stream via FFmpeg standard output pipe (0ms TTFB)
   * with Tee Pipe Dual-Output (streams to client AND simultaneously writes to persistent MP3 cache in a SINGLE process)
   * with Semaphore Concurrency Control, Hardware Pass-Through Strategy B fallback, and Zombie Reaper registration.
   */
  public async createLiveTranscodeStreamAsync(
    sourcePath: string,
    startSeconds: number = 0,
    options: {
      sessionId?: string;
      songId?: string;
      clientIp?: string;
      userAgent?: string;
      deviceModel?: string;
      timeoutMs?: number;
      persistCache?: boolean;
      durationSeconds?: number;
      replayGainDb?: number;
      normalizeLoudness?: boolean;
      targetLufs?: number;
    } = {}
  ): Promise<LiveTranscodeSession | null> {
    if (!this.ffmpegAvailable || !fs.existsSync(sourcePath)) {
      return null;
    }

    const ext = path.extname(sourcePath).toLowerCase();
    const sessionId = options.sessionId || `live-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // 1. Acquire slot from TranscodeSemaphorePool (Strategy A: queue with 3s timeout / Strategy B: lossless direct pass-through)
    const slot = await this.semaphore.acquire({
      sessionId,
      timeoutMs: options.timeoutMs ?? 3000,
      deviceModel: options.deviceModel,
      userAgent: options.userAgent,
      clientIp: options.clientIp,
      fileExtension: ext
    });

    if (!slot.acquired || slot.strategy === 'timeout_error') {
      console.warn(`[FfmpegTranscoder] Semaphore acquire rejected/timed out for ${sessionId}. Aborting live FFmpeg process.`);
      return null;
    }

    if (slot.strategy === 'passthrough_fallback') {
      // Direct pass-through strategy B: pipe original file stream directly without spawning FFmpeg
      console.log(`⚡ [FfmpegTranscoder] Serving ${sourcePath} via direct pass-through (Strategy B)...`);
      const fileStream = fs.createReadStream(sourcePath);
      return {
        stream: fileStream,
        process: null as any,
        sessionId,
        isPassThrough: true,
        kill: () => {
          try { fileStream.destroy(); } catch {}
        },
        notifyClientDisconnected: () => {
          try { fileStream.destroy(); } catch {}
        },
        notifyClientReconnected: () => {}
      };
    }

    // 2. Prepare Tee Pipe cache target if caching from start (0s) and not a virtual sub-track
    let tmpCachePath: string | null = null;
    let targetCachePath: string | null = null;
    let cacheWriteStream: fs.WriteStream | null = null;

    if (startSeconds === 0 && !options.durationSeconds && options.songId && options.persistCache !== false) {
      const sanitizedId = options.songId.replace(/[^a-zA-Z0-9_-]/g, '_');
      targetCachePath = path.join(this.cacheDir, `${sanitizedId}_standard.mp3`);
      if (!fs.existsSync(targetCachePath)) {
        tmpCachePath = path.join(this.cacheDir, `${sanitizedId}_standard.tmp.${Date.now()}`);
        try {
          cacheWriteStream = fs.createWriteStream(tmpCachePath);
        } catch (writeErr) {
          console.warn('[FfmpegTranscoder] Failed to create Tee write stream:', writeErr);
          tmpCachePath = null;
          cacheWriteStream = null;
        }
      }
    }

    // 3. Spawn live FFmpeg process with accurate seek & audio filters
    const args: string[] = [];
    if (startSeconds > 0) {
      // Accurate seek before input guarantees exact audio sample alignment without drift
      args.push('-accurate_seek', '-ss', startSeconds.toFixed(3));
    }
    args.push('-i', sourcePath);

    // Duration bounding (vital for CUE virtual track splitting)
    if (options.durationSeconds && options.durationSeconds > 0) {
      args.push('-t', options.durationSeconds.toFixed(3));
    }

    args.push(
      '-vn',
      '-c:a', 'libmp3lame',
      '-ar', '44100',
      '-ac', '2',
      '-b:a', '320k'
    );

    // Audio Filters: ReplayGain & EBU R128 Smart Loudness
    const audioFilters: string[] = [];
    if (typeof options.replayGainDb === 'number' && !isNaN(options.replayGainDb)) {
      // Clamp replayGain to safe audio range (-20dB to +12dB)
      const clampedGain = Math.max(-20, Math.min(12, options.replayGainDb));
      audioFilters.push(`volume=${clampedGain.toFixed(1)}dB`);
    } else if (options.normalizeLoudness) {
      // EBU R128 standard loudness normalizer (-16 LUFS is broadcast standard for smart speakers)
      const targetI = typeof options.targetLufs === 'number' ? options.targetLufs : -16;
      audioFilters.push(`loudnorm=I=${targetI}:TP=-1.5:LRA=11`);
    }

    if (audioFilters.length > 0) {
      args.push('-af', audioFilters.join(','));
    }

    args.push(
      '-id3v2_version', '3',
      '-write_xing', '1',
      '-f', 'mp3',
      'pipe:1'
    );

    try {
      const child = spawn('ffmpeg', args, {
        stdio: ['ignore', 'pipe', 'ignore']
      });

      let released = false;
      const releaseTicket = () => {
        if (released) return;
        released = true;
        slot.release();
      };

      // Register session with Zombie Reaper
      this.semaphore.registerSession({
        sessionId,
        process: child,
        sourcePath,
        clientIp: options.clientIp,
        userAgent: options.userAgent,
        deviceModel: options.deviceModel,
        releaseFn: releaseTicket
      });

      const clientPassThrough = new PassThrough({ highWaterMark: 128 * 1024 });

      // Tee stream branching with Backpressure Control & Watchdog Feeding:
      // When client or network is slow, pause FFmpeg stdout to prevent RAM bloat
      child.stdout.on('data', (chunk: Buffer) => {
        // Feed watchdog to confirm process is healthy and actively producing audio
        this.semaphore.feedSession(sessionId, chunk.length);

        const canContinue = clientPassThrough.write(chunk);
        if (!canContinue) {
          child.stdout.pause();
          clientPassThrough.once('drain', () => {
            child.stdout.resume();
          });
        }
        if (cacheWriteStream && !cacheWriteStream.destroyed) {
          try {
            cacheWriteStream.write(chunk);
          } catch {}
        }
      });

      let killed = false;
      const kill = (reason = 'manual kill') => {
        if (killed) return;
        killed = true;
        if (cacheWriteStream && !cacheWriteStream.destroyed) {
          try { cacheWriteStream.destroy(); } catch {}
          if (tmpCachePath && fs.existsSync(tmpCachePath)) {
            try { fs.unlinkSync(tmpCachePath); } catch {}
          }
        }
        try { clientPassThrough.end(); } catch {}
        try {
          if (!child.killed) {
            child.kill('SIGTERM');
            setTimeout(() => {
              try {
                if (!child.killed) child.kill('SIGKILL');
              } catch {}
            }, 500);
          }
        } catch {}
        this.semaphore.reapSession(sessionId, reason);
      };

      // Self-healing: if client aborts or closes stream, kill child FFmpeg process
      clientPassThrough.on('close', () => {
        kill('client pass-through closed');
      });
      clientPassThrough.on('error', (err) => {
        kill(`client pass-through error: ${err.message}`);
      });

      child.on('error', (err) => {
        console.warn(`[FfmpegTranscoder] Live transcode process error (${sessionId}):`, err.message);
        kill(`error: ${err.message}`);
      });

      child.on('close', (code) => {
        releaseTicket();
        try { clientPassThrough.end(); } catch {}

        if (cacheWriteStream && tmpCachePath && targetCachePath) {
          cacheWriteStream.end(() => {
            try {
              if (code === 0 && fs.existsSync(tmpCachePath!) && fs.statSync(tmpCachePath!).size > 1024) {
                fs.renameSync(tmpCachePath!, targetCachePath!);
                const finalSize = fs.statSync(targetCachePath!).size;
                const fileName = path.basename(targetCachePath!);
                const cleanId = (options.songId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
                this.quotaManager.registerNewCache(fileName, cleanId, finalSize, sourcePath);
                console.log(`✨ [FfmpegTranscoder] Tee Stream dual-output completed: Standard MP3 cached to ${fileName} (Single FFmpeg run)`);
              } else if (tmpCachePath && fs.existsSync(tmpCachePath)) {
                fs.unlinkSync(tmpCachePath);
              }
            } catch (err: any) {
              console.warn('[FfmpegTranscoder] Tee Stream cache finalize error:', err.message);
            }
          });
        }
      });

      return {
        stream: clientPassThrough,
        process: child,
        sessionId,
        kill,
        notifyClientDisconnected: (gracePeriodMs = 5000) => {
          this.semaphore.notifyClientDisconnected(sessionId, gracePeriodMs);
        },
        notifyClientReconnected: () => {
          this.semaphore.notifyClientReconnected(sessionId);
        }
      };
    } catch (err: any) {
      slot.release();
      if (tmpCachePath && fs.existsSync(tmpCachePath)) {
        try { fs.unlinkSync(tmpCachePath); } catch {}
      }
      console.error('[FfmpegTranscoder] Failed to spawn live FFmpeg pipe:', err.message);
      return null;
    }
  }

  /**
   * Synchronous signature helper for backward compatibility
   */
  public createLiveTranscodeStream(sourcePath: string, startSeconds: number = 0): LiveTranscodeSession | null {
    if (!this.ffmpegAvailable || !fs.existsSync(sourcePath)) {
      return null;
    }

    const sessionId = `sync-live-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const args: string[] = [];
    if (startSeconds > 0) {
      args.push('-ss', startSeconds.toFixed(2));
    }
    args.push(
      '-i', sourcePath,
      '-vn',
      '-c:a', 'libmp3lame',
      '-ar', '44100',
      '-ac', '2',
      '-b:a', '320k',
      '-id3v2_version', '3',
      '-write_xing', '1',
      '-f', 'mp3',
      'pipe:1'
    );

    try {
      const child = spawn('ffmpeg', args, {
        stdio: ['ignore', 'pipe', 'ignore']
      });

      this.semaphore.registerSession({
        sessionId,
        process: child,
        sourcePath
      });

      const kill = () => {
        this.semaphore.reapSession(sessionId, 'stream closed');
      };

      child.on('error', (err) => {
        console.warn('[FfmpegTranscoder] Live transcode process error:', err.message);
        kill();
      });

      return {
        stream: child.stdout,
        process: child,
        sessionId,
        kill,
        notifyClientDisconnected: (gracePeriodMs = 5000) => {
          this.semaphore.notifyClientDisconnected(sessionId, gracePeriodMs);
        },
        notifyClientReconnected: () => {
          this.semaphore.notifyClientReconnected(sessionId);
        }
      };
    } catch (err: any) {
      console.error('[FfmpegTranscoder] Failed to spawn live FFmpeg pipe:', err.message);
      return null;
    }
  }

  /**
   * Async non-blocking transcode with semaphore slot reservation and deduplication.
   * Native MP3 files are passed through with zero delay.
   */
  public async ensureStandardMp3Async(
    sourcePath: string,
    songId: string,
    options: {
      deviceModel?: string;
      userAgent?: string;
      clientIp?: string;
      cueStartSeconds?: number;
      cueDurationSeconds?: number;
      replayGainDb?: number;
      normalizeLoudness?: boolean;
      targetLufs?: number;
    } = {}
  ): Promise<TranscodeResult> {
    if (!fs.existsSync(sourcePath)) {
      return {
        success: false,
        filePath: sourcePath,
        format: path.extname(sourcePath),
        isTranscoded: false
      };
    }

    const sourceExt = path.extname(sourcePath).toLowerCase();
    // Zero-delay pass-through for native MP3
    if (sourceExt === '.mp3') {
      return {
        success: true,
        filePath: sourcePath,
        format: '.mp3',
        isTranscoded: false
      };
    }

    const sanitizedId = songId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const inFlight = this.inFlightTranscodes.get(sanitizedId);
    if (inFlight) {
      return inFlight;
    }

    const transcodePromise = (async (): Promise<TranscodeResult> => {
      try {
        const sourceStat = fs.statSync(sourcePath);
        const cachedMp3Name = `${sanitizedId}_standard.mp3`;
        const cachedMp3Path = path.join(this.cacheDir, cachedMp3Name);

        // 1. Check if cached standard MP3 already exists and is fresh
        if (fs.existsSync(cachedMp3Path)) {
          try {
            const cacheStat = fs.statSync(cachedMp3Path);
            if (cacheStat.size > 1024 && cacheStat.mtimeMs >= sourceStat.mtimeMs) {
              return {
                success: true,
                filePath: cachedMp3Path,
                format: '.mp3',
                isTranscoded: true
              };
            }
          } catch {}
        }

        // 2. Transcode under concurrency semaphore protection
        if (this.ffmpegAvailable) {
          const slot = await this.semaphore.acquire({
            sessionId: `async-${sanitizedId}`,
            timeoutMs: 3500,
            deviceModel: options.deviceModel,
            userAgent: options.userAgent,
            clientIp: options.clientIp,
            fileExtension: sourceExt
          });

          if (slot.strategy === 'passthrough_fallback') {
            console.log(`⚡ [FfmpegTranscoder] [Strategy B] Hardware pass-through enabled for ${songId} (${sourceExt})`);
            return {
              success: true,
              filePath: sourcePath,
              format: sourceExt,
              isTranscoded: false,
              strategy: 'passthrough_fallback'
            };
          }

          if (!slot.acquired) {
            console.warn(`[FfmpegTranscoder] Semaphore queue full/timed out for ${songId}. Fallback to direct file pass-through.`);
            return {
              success: true,
              filePath: sourcePath,
              format: sourceExt,
              isTranscoded: false,
              strategy: 'timeout_error'
            };
          }

          const partPath = `${cachedMp3Path}.part.${Date.now()}_${process.pid}`;
          try {
            console.log(`🎵 [FfmpegTranscoder] Transcoding ${sourceExt} -> Standard MP3 for ${songId} (Slot allocated, strategy=${slot.strategy})...`);
            const args: string[] = ['-y'];
            if (typeof options.cueStartSeconds === 'number' && options.cueStartSeconds > 0) {
              args.push('-accurate_seek', '-ss', options.cueStartSeconds.toString());
            }
            args.push('-i', sourcePath);
            if (typeof options.cueDurationSeconds === 'number' && options.cueDurationSeconds > 0) {
              args.push('-t', options.cueDurationSeconds.toString());
            }
            args.push('-vn', '-c:a', 'libmp3lame', '-ar', '44100', '-ac', '2', '-b:a', '320k');
            const audioFilters: string[] = [];
            if (typeof options.replayGainDb === 'number' && !isNaN(options.replayGainDb)) {
              const clampedGain = Math.max(-20, Math.min(12, options.replayGainDb));
              audioFilters.push(`volume=${clampedGain.toFixed(1)}dB`);
            } else if (options.normalizeLoudness) {
              const targetI = typeof options.targetLufs === 'number' ? options.targetLufs : -16;
              audioFilters.push(`loudnorm=I=${targetI}:TP=-1.5:LRA=11`);
            }
            if (audioFilters.length > 0) {
              args.push('-af', audioFilters.join(','));
            }
            args.push(
              '-id3v2_version', '3', '-write_xing', '1',
              partPath
            );
            await execFileAsync('ffmpeg', args, { timeout: 45000 });
            if (fs.existsSync(partPath) && fs.statSync(partPath).size > 1024) {
              await fs.promises.rename(partPath, cachedMp3Path);
              const finalSize = fs.statSync(cachedMp3Path).size;
              const fileName = path.basename(cachedMp3Path);
              this.quotaManager.registerNewCache(fileName, songId, finalSize, sourcePath);
              return {
                success: true,
                filePath: cachedMp3Path,
                format: '.mp3',
                isTranscoded: true,
                strategy: slot.strategy
              };
            }
          } catch (transErr: any) {
            console.error(`[FfmpegTranscoder] Async transcode error for ${songId}:`, transErr?.message);
            try {
              if (fs.existsSync(partPath)) await fs.promises.unlink(partPath);
            } catch {}
          } finally {
            slot.release();
          }
        }

        // Fallback to original
        return {
          success: true,
          filePath: sourcePath,
          format: sourceExt,
          isTranscoded: false
        };
      } finally {
        this.inFlightTranscodes.delete(sanitizedId);
      }
    })();

    this.inFlightTranscodes.set(sanitizedId, transcodePromise);
    return transcodePromise;
  }

  /**
   * Safe non-blocking method for ensuring standard MP3.
   * Returns cached MP3 file immediately if fresh on disk, or fires non-blocking async transcode in background.
   * Never freezes the Node.js event loop with spawnSync.
   */
  public ensureStandardMp3(sourcePath: string, songId: string): TranscodeResult {
    if (!fs.existsSync(sourcePath)) {
      return {
        success: false,
        filePath: sourcePath,
        format: path.extname(sourcePath),
        isTranscoded: false
      };
    }

    const sourceExt = path.extname(sourcePath).toLowerCase();
    if (sourceExt === '.mp3') {
      return {
        success: true,
        filePath: sourcePath,
        format: '.mp3',
        isTranscoded: false
      };
    }

    const sourceStat = fs.statSync(sourcePath);
    const sanitizedId = songId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const cachedMp3Name = `${sanitizedId}_standard.mp3`;
    const cachedMp3Path = path.join(this.cacheDir, cachedMp3Name);

    // 1. Fast path: check cache on disk
    if (fs.existsSync(cachedMp3Path)) {
      try {
        const cacheStat = fs.statSync(cachedMp3Path);
        if (cacheStat.size > 1024 && cacheStat.mtimeMs >= sourceStat.mtimeMs) {
          return {
            success: true,
            filePath: cachedMp3Path,
            format: '.mp3',
            isTranscoded: true
          };
        }
      } catch {}
    }

    // 2. Non-blocking async dispatch for non-MP3 files (Event loop remains 100% responsive)
    if (this.ffmpegAvailable) {
      this.ensureStandardMp3Async(sourcePath, songId).catch((transErr: any) => {
        console.warn(`[FfmpegTranscoder] Non-blocking background transcode error for ${songId}:`, transErr?.message);
      });
    }

    return {
      success: true,
      filePath: sourcePath,
      format: sourceExt,
      isTranscoded: false
    };
  }

  /**
   * Pre-transcodes the next song in the background if the concurrency pool is idle.
   * Enables instant zero-delay playback when the queue advances to the next track.
   */
  public async preheatSongAsync(
    sourcePath: string,
    songId: string,
    options: {
      deviceModel?: string;
      cueStartSeconds?: number;
      cueDurationSeconds?: number;
      replayGainDb?: number;
      normalizeLoudness?: boolean;
      targetLufs?: number;
    } = {}
  ): Promise<boolean> {
    if (!this.ffmpegAvailable || !fs.existsSync(sourcePath)) return false;
    const sourceExt = path.extname(sourcePath).toLowerCase();
    if (sourceExt === '.mp3') return true;

    // If already cached, no work needed
    if (this.getCachedMp3(sourcePath, songId)) return true;

    // If concurrency pool has no idle capacity, do NOT contend with active playback
    if (!this.semaphore.canAcquireImmediately()) {
      return false;
    }

    const sanitizedId = songId.replace(/[^a-zA-Z0-9_-]/g, '_');
    if (this.inFlightTranscodes.has(sanitizedId)) {
      return true;
    }

    console.log(`⚡ [PreheatEngine] Queue is idle, pre-transcoding next track in background: ${songId} (${sourceExt})`);
    this.ensureStandardMp3Async(sourcePath, songId, {
      deviceModel: options.deviceModel,
      cueStartSeconds: options.cueStartSeconds,
      cueDurationSeconds: options.cueDurationSeconds,
      replayGainDb: options.replayGainDb,
      normalizeLoudness: options.normalizeLoudness,
      targetLufs: options.targetLufs,
      userAgent: 'QueuePreheatEngine'
    }).then(res => {
      if (res.isTranscoded) {
        console.log(`🚀 [PreheatEngine] Next track preheat complete for ${songId}: ready for zero-latency cast.`);
      }
    }).catch(err => {
      console.warn(`[PreheatEngine] Background preheat skipped for ${songId}:`, err?.message);
    });

    return true;
  }

  /**
   * Returns cache stats (total files, bytes, readable MB, quota details)
   */
  public getCacheStats(): CacheStats & { quota?: CacheManagerStats } {
    const quotaStats = this.quotaManager.getStats();
    return {
      count: quotaStats.count,
      totalSizeBytes: quotaStats.totalSizeBytes,
      totalSizeMb: quotaStats.totalSizeMb,
      quota: quotaStats
    };
  }

  /**
   * Clears all transcode cache files
   */
  public clearCache(): { clearedCount: number; freedMb: string } {
    const result = this.quotaManager.clearAll();
    return {
      clearedCount: result.clearedCount,
      freedMb: result.freedMb
    };
  }

  /**
   * Automatically enforces a maximum storage limit on the transcode cache using LRU eviction.
   */
  public pruneCacheIfNeeded(maxBytes?: number, targetBytes?: number): void {
    this.quotaManager.enforceQuota(maxBytes, targetBytes);
  }

  /**
   * Cleans any leftover orphan .part files on startup to avoid disk leaks
   */
  public cleanOrphanPartFiles(): number {
    let count = 0;
    try {
      if (!fs.existsSync(this.cacheDir)) return 0;
      const files = fs.readdirSync(this.cacheDir);
      for (const file of files) {
        if (file.endsWith('.part')) {
          try {
            fs.unlinkSync(path.join(this.cacheDir, file));
            count++;
          } catch {}
        }
      }
      if (count > 0) {
        console.log(`[FfmpegTranscoder] 🧹 Swept ${count} orphaned .part files from previous sessions.`);
      }
    } catch {}
    return count;
  }
}
