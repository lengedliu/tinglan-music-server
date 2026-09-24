import fs from 'fs';
import path from 'path';
import { parseBuffer } from 'music-metadata';
import { Song } from './musicEngine.js';
import { musicRepository } from './repositories/musicRepository.js';
import { musicSearchIndex } from './searchIndex.js';

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
      localFilename: relPath
    };

    return song;
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
