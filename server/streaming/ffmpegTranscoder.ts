import fs from 'fs';
import path from 'path';
import { spawn, spawnSync, execFile, ChildProcessWithoutNullStreams } from 'child_process';
import { promisify } from 'util';
import { Readable, PassThrough } from 'stream';
import { transcodeSemaphorePool, TranscodeSemaphorePool, TranscodePoolStats } from './transcodeSemaphore.js';

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

  constructor(cacheDir: string, customSemaphore?: TranscodeSemaphorePool) {
    this.cacheDir = cacheDir;
    this.semaphore = customSemaphore || transcodeSemaphorePool;

    if (!fs.existsSync(this.cacheDir)) {
      try {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      } catch (err) {
        console.error(`[FfmpegTranscoder] Failed to create cache directory ${cacheDir}:`, err);
      }
    }

    try {
      const check = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
      this.ffmpegAvailable = check.status === 0;
      if (this.ffmpegAvailable) {
        console.log('🎵 [FfmpegTranscoder] FFmpeg binary verified in PATH. Tee Pipe stream & Semaphore pool active.');
      } else {
        console.warn('⚠️ [FfmpegTranscoder] FFmpeg binary check failed. Audio transcoding will fallback to pass-through.');
      }
    } catch {
      this.ffmpegAvailable = false;
      console.warn('⚠️ [FfmpegTranscoder] FFmpeg binary not found in PATH. Audio transcoding will fallback to direct pass-through.');
    }
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

    // 2. Prepare Tee Pipe cache target if caching from start (0s)
    let tmpCachePath: string | null = null;
    let targetCachePath: string | null = null;
    let cacheWriteStream: fs.WriteStream | null = null;

    if (startSeconds === 0 && options.songId && options.persistCache !== false) {
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

    // 3. Spawn live FFmpeg process
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

      const clientPassThrough = new PassThrough();

      // Tee stream branching: push to client AND write to cache file simultaneously
      child.stdout.on('data', (chunk: Buffer) => {
        clientPassThrough.write(chunk);
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
        this.semaphore.reapSession(sessionId, reason);
      };

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
                console.log(`✨ [FfmpegTranscoder] Tee Stream dual-output completed: Standard MP3 cached to ${path.basename(targetCachePath!)} (Single FFmpeg run)`);
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
    options: { deviceModel?: string; userAgent?: string; clientIp?: string } = {}
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

          try {
            console.log(`🎵 [FfmpegTranscoder] Transcoding ${sourceExt} -> Standard MP3 for ${songId} (Slot allocated, strategy=${slot.strategy})...`);
            const args = [
              '-y', '-i', sourcePath,
              '-vn', '-c:a', 'libmp3lame',
              '-ar', '44100', '-ac', '2', '-b:a', '320k',
              '-id3v2_version', '3', '-write_xing', '1',
              cachedMp3Path
            ];
            await execFileAsync('ffmpeg', args, { timeout: 45000 });
            if (fs.existsSync(cachedMp3Path) && fs.statSync(cachedMp3Path).size > 1024) {
              this.pruneCacheIfNeeded();
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
   * Safe synchronous fallback using spawnSync with argument vectors (no shell execution)
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

    // 1. Check cache
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

    // 2. For non-MP3 files
    if (this.ffmpegAvailable) {
      try {
        console.log(`🎵 [FfmpegTranscoder] Transcoding ${sourceExt} -> Standard MP3 for ${songId}...`);
        const ffmpegArgs = [
          '-y', '-i', sourcePath,
          '-vn', '-c:a', 'libmp3lame',
          '-ar', '44100', '-ac', '2', '-b:a', '320k',
          '-id3v2_version', '3', '-write_xing', '1',
          cachedMp3Path
        ];
        spawnSync('ffmpeg', ffmpegArgs, { timeout: 20000, stdio: 'ignore' });
        if (fs.existsSync(cachedMp3Path) && fs.statSync(cachedMp3Path).size > 1024) {
          return {
            success: true,
            filePath: cachedMp3Path,
            format: '.mp3',
            isTranscoded: true
          };
        }
      } catch (transErr: any) {
        console.error(`[FfmpegTranscoder] Transcode error for ${songId}:`, transErr?.message);
      }
    }

    return {
      success: true,
      filePath: sourcePath,
      format: sourceExt,
      isTranscoded: false
    };
  }

  /**
   * Returns cache stats (total files, bytes, readable MB)
   */
  public getCacheStats(): CacheStats {
    try {
      if (!fs.existsSync(this.cacheDir)) {
        return { count: 0, totalSizeBytes: 0, totalSizeMb: '0.0 MB' };
      }
      const files = fs.readdirSync(this.cacheDir);
      let totalBytes = 0;
      let count = 0;
      for (const file of files) {
        const filePath = path.join(this.cacheDir, file);
        try {
          const stat = fs.statSync(filePath);
          if (stat.isFile()) {
            totalBytes += stat.size;
            count++;
          }
        } catch {}
      }
      return {
        count,
        totalSizeBytes: totalBytes,
        totalSizeMb: `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`
      };
    } catch {
      return { count: 0, totalSizeBytes: 0, totalSizeMb: '0.0 MB' };
    }
  }

  /**
   * Clears all transcode cache files
   */
  public clearCache(): { clearedCount: number; freedMb: string } {
    let count = 0;
    let bytes = 0;
    try {
      if (fs.existsSync(this.cacheDir)) {
        const files = fs.readdirSync(this.cacheDir);
        for (const file of files) {
          const filePath = path.join(this.cacheDir, file);
          try {
            const stat = fs.statSync(filePath);
            bytes += stat.size;
            fs.unlinkSync(filePath);
            count++;
          } catch {}
        }
      }
    } catch (err) {
      console.error('[FfmpegTranscoder] Error clearing cache:', err);
    }
    return {
      clearedCount: count,
      freedMb: `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    };
  }

  /**
   * Automatically enforces a maximum storage limit on the transcode cache using LRU eviction.
   * Default capacity: 500 MB (prunes down to ~400 MB).
   */
  public pruneCacheIfNeeded(maxBytes: number = 500 * 1024 * 1024, targetBytes: number = 400 * 1024 * 1024): void {
    try {
      if (!fs.existsSync(this.cacheDir)) return;
      const fileNames = fs.readdirSync(this.cacheDir);
      const fileEntries: Array<{ filePath: string; size: number; mtimeMs: number }> = [];
      let totalBytes = 0;

      for (const name of fileNames) {
        const fullPath = path.join(this.cacheDir, name);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isFile()) {
            fileEntries.push({ filePath: fullPath, size: stat.size, mtimeMs: stat.mtimeMs });
            totalBytes += stat.size;
          }
        } catch {}
      }

      if (totalBytes <= maxBytes) return;

      console.log(`[FfmpegTranscoder] 🧹 Transcode cache (${(totalBytes / (1024 * 1024)).toFixed(1)} MB) exceeds limit (${(maxBytes / (1024 * 1024)).toFixed(0)} MB), triggering LRU pruning...`);

      // Sort ascending by modification time (oldest first)
      fileEntries.sort((a, b) => a.mtimeMs - b.mtimeMs);

      for (const entry of fileEntries) {
        try {
          fs.unlinkSync(entry.filePath);
          totalBytes -= entry.size;
          if (totalBytes <= targetBytes) break;
        } catch {}
      }

      console.log(`[FfmpegTranscoder] ✅ Cache pruned to ${(totalBytes / (1024 * 1024)).toFixed(1)} MB.`);
    } catch (err: any) {
      console.warn('[FfmpegTranscoder] Error pruning cache:', err.message);
    }
  }
}
