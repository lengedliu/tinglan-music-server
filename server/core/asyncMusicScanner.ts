import fs from 'fs';
import path from 'path';
import { parseBuffer } from 'music-metadata';
import { Song } from './musicEngine.js';
import { musicRepository } from './repositories/musicRepository.js';
import { musicSearchIndex } from './searchIndex.js';
import { parseCueSheet } from './cueParser.js';

export interface ScanProgress {
  status: 'idle' | 'scanning' | 'completed' | 'failed';
  totalFound: number;
  processed: number;
  newAdded: number;
  updated: number;
  currentFile?: string;
  error?: string;
  durationMs?: number;
}

export class AsyncMusicScanner {
  private isScanning: boolean = false;
  private progress: ScanProgress = {
    status: 'idle',
    totalFound: 0,
    processed: 0,
    newAdded: 0,
    updated: 0
  };

  public getProgress(): ScanProgress {
    return { ...this.progress };
  }

  public isBusy(): boolean {
    return this.isScanning;
  }

  /**
   * Non-blocking asynchronous recursive directory scanner
   */
  public async scanMusicDirectoryAsync(
    musicDir: string,
    concurrency = 4
  ): Promise<{ added: number; updated: number; total: number; durationMs: number }> {
    if (this.isScanning) {
      console.warn('[AsyncMusicScanner] Scan already in progress, skipping duplicate scan request.');
      return { added: 0, updated: 0, total: musicRepository.getAllSongs().length, durationMs: 0 };
    }

    this.isScanning = true;
    const startTime = Date.now();
    this.progress = {
      status: 'scanning',
      totalFound: 0,
      processed: 0,
      newAdded: 0,
      updated: 0
    };

    try {
      console.log(`[AsyncMusicScanner] Starting non-blocking scan in: ${musicDir}`);
      const audioFiles = await this.collectAudioFilesAsync(musicDir);
      this.progress.totalFound = audioFiles.length;
      console.log(`[AsyncMusicScanner] Discovered ${audioFiles.length} audio candidates.`);

      const existingSongs = musicRepository.getAllSongs();
      const existingMap = new Map<string, Song>();
      for (const s of existingSongs) {
        if (s.localFilename) existingMap.set(s.localFilename, s);
      }

      let added = 0;
      let updated = 0;

      // Enable batch mode in repository to suspend intermediate disk writes
      musicRepository.beginBatch();

      // Process in chunks with concurrency control (Zero Event-Loop Stalls)
      for (let i = 0; i < audioFiles.length; i += concurrency) {
        const chunk = audioFiles.slice(i, i + concurrency);
        await Promise.all(
          chunk.map(async (filePath) => {
            const relPath = path.relative(musicDir, filePath);
            this.progress.currentFile = path.basename(filePath);

            try {
              const fileStats = await fs.promises.stat(filePath);
              const existing = existingMap.get(relPath);

              // If already exists and size matches, skip heavy metadata re-parse
              if (existing && existing.fileSize === `${(fileStats.size / (1024 * 1024)).toFixed(1)} MB`) {
                this.progress.processed++;
                return;
              }

              const song = await this.parseAudioMetadataAsync(filePath, relPath, fileStats);
              if (song) {
                if (existing) {
                  musicRepository.addOrUpdateSong({ ...existing, ...song, id: existing.id }, false);
                  updated++;
                } else {
                  musicRepository.addOrUpdateSong(song, false);
                  added++;
                }
              }
            } catch (err: any) {
              console.warn(`[AsyncMusicScanner] Error parsing ${relPath}:`, err.message);
            } finally {
              this.progress.processed++;
            }
          })
        );

        // Yield to event loop to allow concurrent HTTP / Cast requests
        await new Promise((r) => setImmediate(r));
      }

      // Process CUE sheets to create virtual split tracks
      const cueFiles = await this.collectCueFilesAsync(musicDir);
      for (const cuePath of cueFiles) {
        try {
          const cueSheet = parseCueSheet(cuePath);
          if (cueSheet && cueSheet.tracks.length > 0 && cueSheet.resolvedAudioPath) {
            const relAudio = path.relative(musicDir, cueSheet.resolvedAudioPath);
            const parentSong = existingMap.get(relAudio);
            const parentBaseId = parentSong ? parentSong.id : `song-${path.basename(cueSheet.resolvedAudioPath, path.extname(cueSheet.resolvedAudioPath))}`;

            for (const track of cueSheet.tracks) {
              const trackId = `${parentBaseId}_cue_t${track.trackNumber.toString().padStart(2, '0')}`;
              const virtualSong: Song = {
                id: trackId,
                title: track.title || `Track ${track.trackNumber}`,
                artist: track.performer || cueSheet.albumPerformer || parentSong?.artist || '未知歌手',
                album: cueSheet.albumTitle || parentSong?.album || 'CUE专辑分轨',
                duration: track.durationSeconds || 180,
                url: `/api/stream/${trackId}`,
                coverUrl: parentSong?.coverUrl || '/covers/default.jpg',
                genre: cueSheet.genre || parentSong?.genre || '分轨音乐',
                year: cueSheet.date ? parseInt(cueSheet.date, 10) : parentSong?.year,
                bitrate: parentSong?.bitrate || '无损分轨',
                fileSize: parentSong?.fileSize || '虚拟分轨',
                isFavorite: false,
                source: 'local',
                localFilename: relAudio,
                cueTrack: {
                  cueFilePath: path.relative(musicDir, cuePath),
                  parentFilename: relAudio,
                  trackNumber: track.trackNumber,
                  startSeconds: track.startSeconds,
                  endSeconds: track.endSeconds,
                  durationSeconds: track.durationSeconds,
                  rawIndex: track.rawIndex,
                  performer: track.performer,
                  title: track.title
                }
              };
              musicRepository.addOrUpdateSong(virtualSong, false);
              added++;
            }
          }
        } catch (cueErr: any) {
          console.warn(`[AsyncMusicScanner] CUE parsing error for ${cuePath}:`, cueErr?.message);
        }
      }

      // Commit all changes in a single atomic disk write & rebuild search index
      await musicRepository.commitBatch();

      const durationMs = Date.now() - startTime;
      this.progress.status = 'completed';
      this.progress.newAdded = added;
      this.progress.updated = updated;
      this.progress.durationMs = durationMs;

      console.log(`✨ [AsyncMusicScanner] Scan completed in ${durationMs}ms: +${added} added, ~${updated} updated, total ${musicRepository.getAllSongs().length} tracks.`);
      return { added, updated, total: musicRepository.getAllSongs().length, durationMs };
    } catch (err: any) {
      console.error('[AsyncMusicScanner] Scan failed:', err);
      this.progress.status = 'failed';
      this.progress.error = err.message;
      return { added: 0, updated: 0, total: 0, durationMs: Date.now() - startTime };
    } finally {
      this.isScanning = false;
      try {
        await musicRepository.commitBatch();
      } catch (commitErr) {
        console.warn('[AsyncMusicScanner] Batch commit warning in finally:', commitErr);
      }
    }
  }

  private async collectAudioFilesAsync(dir: string): Promise<string[]> {
    const validExts = new Set(['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.ape', '.dsf', '.dff']);
    const results: string[] = [];

    async function walk(currentDir: string) {
      if (!fs.existsSync(currentDir)) return;
      try {
        const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          if (entry.isDirectory()) {
            await walk(fullPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (validExts.has(ext)) {
              results.push(fullPath);
            }
          }
        }
      } catch (err) {
        console.warn(`[AsyncMusicScanner] Directory read error on ${currentDir}:`, err);
      }
    }

    await walk(dir);
    return results;
  }

  private async parseAudioMetadataAsync(filePath: string, relPath: string, stats: fs.Stats): Promise<Song | null> {
    const filename = path.basename(filePath);
    const ext = path.extname(filename).toLowerCase();
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');

    // Default metadata inferred from filename (e.g. "Artist - Title")
    let artist = '未知歌手';
    let title = nameWithoutExt;
    if (nameWithoutExt.includes(' - ')) {
      const parts = nameWithoutExt.split(' - ');
      artist = parts[0].trim();
      title = parts.slice(1).join(' - ').trim();
    }

    let duration = 180;
    let album = '本地音乐';
    let genre = '流行';
    let year = new Date(stats.mtime).getFullYear();
    let bitrate = '320 kbps';

    let replayGain: Song['replayGain'] | undefined;

    try {
      // Read first 256KB for fast ID3 / FLAC / Vorbis header parsing without reading the whole multi-megabyte file
      const fd = await fs.promises.open(filePath, 'r');
      const headerBuffer = Buffer.alloc(Math.min(262144, stats.size));
      await fd.read(headerBuffer, 0, headerBuffer.length, 0);
      await fd.close();

      const metadata = await parseBuffer(headerBuffer, { mimeType: this.getMimeType(ext), size: stats.size });
      if (metadata.common) {
        if (metadata.common.title) title = metadata.common.title.trim();
        if (metadata.common.artist) artist = metadata.common.artist.trim();
        if (metadata.common.album) album = metadata.common.album.trim();
        if (metadata.common.genre && metadata.common.genre[0]) genre = metadata.common.genre[0];
        if (metadata.common.year) year = metadata.common.year;

        // Extract ReplayGain metadata
        const rawGain = (metadata.common as any).replaygain_track_gain;
        let trackGainDb: number | undefined;
        if (typeof rawGain === 'number') {
          trackGainDb = rawGain;
        } else if (typeof rawGain === 'string') {
          const parsed = parseFloat(rawGain.replace(/[^\d.-]/g, ''));
          if (!isNaN(parsed)) trackGainDb = parsed;
        } else if (rawGain && typeof rawGain === 'object' && typeof rawGain.dB === 'number') {
          trackGainDb = rawGain.dB;
        }

        if (trackGainDb === undefined && metadata.native) {
          for (const tagList of Object.values(metadata.native)) {
            for (const tag of tagList) {
              const tagId = (tag.id || '').toUpperCase();
              if (tagId.includes('REPLAYGAIN_TRACK_GAIN') || tagId === 'R128_TRACK_GAIN') {
                const parsed = parseFloat(String(tag.value).replace(/[^\d.-]/g, ''));
                if (!isNaN(parsed)) {
                  trackGainDb = parsed;
                  break;
                }
              }
            }
            if (trackGainDb !== undefined) break;
          }
        }

        if (trackGainDb !== undefined) {
          replayGain = { trackGainDb };
        }
      }
      if (metadata.format) {
        if (metadata.format.duration) duration = Math.round(metadata.format.duration);
        if (metadata.format.bitrate) bitrate = `${Math.round(metadata.format.bitrate / 1000)} kbps`;
      }
    } catch {
      // Graceful fallback to file naming heuristics
    }

    const songId = `song-${nameWithoutExt.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_')}-${stats.size.toString(36)}`;
    const song: Song = {
      id: songId,
      title,
      artist,
      album,
      duration,
      url: `/api/stream/${songId}`,
      coverUrl: '/covers/default.jpg',
      genre,
      year,
      bitrate,
      fileSize: `${(stats.size / (1024 * 1024)).toFixed(1)} MB`,
      isFavorite: false,
      source: 'local',
      localFilename: relPath,
      replayGain
    };

    return song;
  }

  private async collectCueFilesAsync(dir: string): Promise<string[]> {
    const results: string[] = [];
    async function walk(currentDir: string) {
      if (!fs.existsSync(currentDir)) return;
      try {
        const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          if (entry.isDirectory()) {
            await walk(fullPath);
          } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.cue') {
            results.push(fullPath);
          }
        }
      } catch {}
    }
    await walk(dir);
    return results;
  }

  private getMimeType(ext: string): string {
    switch (ext) {
      case '.mp3': return 'audio/mpeg';
      case '.flac': return 'audio/flac';
      case '.wav': return 'audio/wav';
      case '.m4a': return 'audio/mp4';
      case '.aac': return 'audio/aac';
      case '.ogg': case '.opus': return 'audio/ogg';
      case '.ape': return 'audio/ape';
      default: return 'audio/mpeg';
    }
  }
}

export const asyncMusicScanner = new AsyncMusicScanner();
