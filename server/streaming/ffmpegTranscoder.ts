import fs from 'fs';
import path from 'path';
import { spawnSync, execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface TranscodeResult {
  success: boolean;
  filePath: string;
  format: string;
  isTranscoded: boolean;
  durationSeconds?: number;
}

export interface CacheStats {
  count: number;
  totalSizeBytes: number;
  totalSizeMb: string;
}

/**
 * FFmpeg Transcoder Engine
 * Standardizes any input audio (FLAC, WAV, AAC, M4A, OGG, APE, irregular MP3)
 * into standard XiaoAi hardware-compatible MP3 (44.1kHz, Stereo, CBR 320kbps, ID3v2.3, Xing header)
 * Uses safe argument vectors (no shell execution) and deduplicated async transcoding.
 */
export class FfmpegTranscoder {
  private ffmpegAvailable: boolean = false;
  private cacheDir: string;
  private inFlightTranscodes: Map<string, Promise<TranscodeResult>> = new Map();

  constructor(cacheDir: string) {
    this.cacheDir = cacheDir;
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
        console.log('🎵 [FfmpegTranscoder] FFmpeg binary verified in PATH. Standard MP3 engine active.');
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

  /**
   * Async non-blocking transcode with deduplication
   */
  public async ensureStandardMp3Async(sourcePath: string, songId: string): Promise<TranscodeResult> {
    if (!fs.existsSync(sourcePath)) {
      return {
        success: false,
        filePath: sourcePath,
        format: path.extname(sourcePath),
        isTranscoded: false
      };
    }

    const sanitizedId = songId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const inFlight = this.inFlightTranscodes.get(sanitizedId);
    if (inFlight) {
      return inFlight;
    }

    const transcodePromise = (async () => {
      try {
        const sourceExt = path.extname(sourcePath).toLowerCase();
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

        // 2. If source is already MP3, try normalizing ID3/headers asynchronously
        if (sourceExt === '.mp3') {
          if (this.ffmpegAvailable) {
            try {
              const args = [
                '-y', '-i', sourcePath,
                '-vn', '-c:a', 'libmp3lame',
                '-ar', '44100', '-ac', '2', '-b:a', '320k',
                '-id3v2_version', '3', '-write_xing', '1',
                cachedMp3Path
              ];
              await execFileAsync('ffmpeg', args, { timeout: 25000 });
              if (fs.existsSync(cachedMp3Path) && fs.statSync(cachedMp3Path).size > 1024) {
                return {
                  success: true,
                  filePath: cachedMp3Path,
                  format: '.mp3',
                  isTranscoded: true
                };
              }
            } catch (normErr: any) {
              console.warn(`[FfmpegTranscoder] MP3 normalization fallback for ${songId}:`, normErr?.message);
            }
          }
          return {
            success: true,
            filePath: sourcePath,
            format: '.mp3',
            isTranscoded: false
          };
        }

        // 3. For non-MP3 files (FLAC, WAV, AAC, M4A, OGG, APE), transcode asynchronously
        if (this.ffmpegAvailable) {
          try {
            console.log(`🎵 [FfmpegTranscoder] Async Transcoding ${sourceExt} -> Standard MP3 for ${songId}...`);
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
                isTranscoded: true
              };
            }
          } catch (transErr: any) {
            console.error(`[FfmpegTranscoder] Async transcode error for ${songId}:`, transErr?.message);
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

    const ffmpegArgs = [
      '-y', '-i', sourcePath,
      '-vn', '-c:a', 'libmp3lame',
      '-ar', '44100', '-ac', '2', '-b:a', '320k',
      '-id3v2_version', '3', '-write_xing', '1',
      cachedMp3Path
    ];

    // 2. If source is MP3
    if (sourceExt === '.mp3') {
      if (this.ffmpegAvailable) {
        try {
          spawnSync('ffmpeg', ffmpegArgs, { timeout: 15000, stdio: 'ignore' });
          if (fs.existsSync(cachedMp3Path) && fs.statSync(cachedMp3Path).size > 1024) {
            return {
              success: true,
              filePath: cachedMp3Path,
              format: '.mp3',
              isTranscoded: true
            };
          }
        } catch (normErr: any) {
          console.warn(`[FfmpegTranscoder] MP3 normalization fallback for ${songId}:`, normErr?.message);
        }
      }
      return {
        success: true,
        filePath: sourcePath,
        format: '.mp3',
        isTranscoded: false
      };
    }

    // 3. For non-MP3 files
    if (this.ffmpegAvailable) {
      try {
        console.log(`🎵 [FfmpegTranscoder] Transcoding ${sourceExt} -> Standard MP3 for ${songId}...`);
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
