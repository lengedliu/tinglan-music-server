import fs from 'fs';
import path from 'path';
import { parseBuffer } from 'music-metadata';
import { Song } from './musicEngine.js';
import { musicRepository } from './repositories/musicRepository.js';
import { musicSearchIndex } from './searchIndex.js';
import { libraryHealthService } from './libraryHealthService.js';
import { appEventBus } from './eventBus.js';
import { parseCueSheet } from './cueParser.js';

export interface WatcherEventLog {
  id: string;
  time: number;
  type: 'added' | 'updated' | 'removed';
  filename: string;
  songTitle?: string;
  artist?: string;
  details?: string;
}

export interface WatcherStatus {
  enabled: boolean;
  status: 'watching' | 'processing' | 'paused' | 'error';
  musicDir: string;
  autoScrapeOnWatch: boolean;
  debounceMs: number;
  totalWatchedFiles: number;
  recentEvents: WatcherEventLog[];
  lastTriggeredAt?: number;
}

const SUPPORTED_EXTS = new Set([
  '.flac',
  '.wav',
  '.mp3',
  '.m4a',
  '.aac',
  '.ogg',
  '.opus',
  '.ape',
  '.dsf',
  '.dff',
  '.cue'
]);

export class LibraryWatcherService {
  private fsWatcher: fs.FSWatcher | null = null;
  private musicDir: string = path.join(process.cwd(), 'music');
  private enabled: boolean = true;
  private autoScrapeOnWatch: boolean = true;
  private debounceMs: number = 1800; // 1.8s debounce to wait for file writing to complete

  private pendingChangedFiles: Set<string> = new Set();
  private debounceTimer: NodeJS.Timeout | null = null;
  private isProcessing: boolean = false;
  private recentEvents: WatcherEventLog[] = [];
  private lastTriggeredAt?: number;

  constructor() {
    this.ensureMusicDirectory();
  }

  public init(musicDir?: string, autoStart: boolean = true): void {
    if (musicDir) {
      this.musicDir = musicDir;
    }
    this.ensureMusicDirectory();

    if (autoStart && this.enabled) {
      this.startWatching();
    }
  }

  private ensureMusicDirectory(): void {
    if (!fs.existsSync(this.musicDir)) {
      try {
        fs.mkdirSync(this.musicDir, { recursive: true });
      } catch (err) {
        console.error('[LibraryWatcher] Failed to create music directory:', err);
      }
    }
  }

  /**
   * Start native recursive directory watcher
   */
  public startWatching(): boolean {
    if (this.fsWatcher) {
      return true; // already active
    }

    try {
      this.ensureMusicDirectory();
      console.log(`[LibraryWatcher] 🚀 启动曲库文件夹实时自动监控: ${this.musicDir}`);

      this.fsWatcher = fs.watch(
        this.musicDir,
        { recursive: true },
        (eventType, filename) => {
          if (!this.enabled || !filename) return;

          const ext = path.extname(filename).toLowerCase();
          // Filter out temporary / hidden files like ._file, .DS_Store, .tmp, etc.
          if (filename.startsWith('.') || filename.includes('~$') || filename.endsWith('.tmp') || filename.endsWith('.part')) {
            return;
          }

          if (SUPPORTED_EXTS.has(ext)) {
            this.handleFileChangeEvent(filename);
          }
        }
      );

      this.fsWatcher.on('error', (err) => {
        console.error('[LibraryWatcher] FSWatcher error:', err);
        this.stopWatching();
      });

      this.enabled = true;
      appEventBus.broadcast('watcher:status', this.getStatus());
      return true;
    } catch (err: any) {
      console.error('[LibraryWatcher] Failed to start fs.watch:', err.message);
      return false;
    }
  }

  /**
   * Stop watcher
   */
  public stopWatching(): void {
    if (this.fsWatcher) {
      try {
        this.fsWatcher.close();
      } catch {}
      this.fsWatcher = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pendingChangedFiles.clear();
    console.log('[LibraryWatcher] ⏸️ 已暂停曲库文件夹自动监控');
    appEventBus.broadcast('watcher:status', this.getStatus());
  }

  /**
   * Toggle enable state
   */
  public toggle(enable?: boolean): boolean {
    const nextState = enable !== undefined ? enable : !this.enabled;
    this.enabled = nextState;
    if (nextState) {
      this.startWatching();
    } else {
      this.stopWatching();
    }
    return this.enabled;
  }

  /**
   * Update configuration
   */
  public updateConfig(config: { autoScrapeOnWatch?: boolean; debounceMs?: number }): void {
    if (config.autoScrapeOnWatch !== undefined) {
      this.autoScrapeOnWatch = config.autoScrapeOnWatch;
    }
    if (config.debounceMs !== undefined && config.debounceMs >= 500) {
      this.debounceMs = config.debounceMs;
    }
    appEventBus.broadcast('watcher:status', this.getStatus());
  }

  public getStatus(): WatcherStatus {
    return {
      enabled: this.enabled,
      status: this.fsWatcher ? (this.isProcessing ? 'processing' : 'watching') : 'paused',
      musicDir: this.musicDir,
      autoScrapeOnWatch: this.autoScrapeOnWatch,
      debounceMs: this.debounceMs,
      totalWatchedFiles: musicRepository.getAllSongs().length,
      recentEvents: this.recentEvents.slice(0, 30),
      lastTriggeredAt: this.lastTriggeredAt
    };
  }

  /**
   * Debounced accumulator for file events
   */
  private handleFileChangeEvent(relFilename: string): void {
    const normalized = path.normalize(relFilename);
    this.pendingChangedFiles.add(normalized);
    this.lastTriggeredAt = Date.now();

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.processPendingChangesAsync().catch((err) => {
        console.error('[LibraryWatcher] Error processing pending changes:', err);
      });
    }, this.debounceMs);
  }

  /**
   * Process accumulated changed files in controlled concurrency batches
   */
  private async processPendingChangesAsync(): Promise<void> {
    if (this.pendingChangedFiles.size === 0) return;
    this.isProcessing = true;
    appEventBus.broadcast('watcher:status', this.getStatus());

    const fileList = Array.from(this.pendingChangedFiles);
    this.pendingChangedFiles.clear();

    const isLargeBatch = fileList.length >= 15;
    console.log(`[LibraryWatcher] ⚡ 触发增量变更处理 (共 ${fileList.length} 个文件变动, 模式: ${isLargeBatch ? '聚合批处理' : '即时增量'})`);

    let addedCount = 0;
    let updatedCount = 0;
    let removedCount = 0;

    // Controlled worker concurrency: max 4 parallel tasks
    const CONCURRENCY = 4;
    const queue = [...fileList];

    const worker = async () => {
      while (queue.length > 0) {
        const relPath = queue.shift();
        if (!relPath) break;

        const fullPath = path.join(this.musicDir, relPath);
        try {
          if (!fs.existsSync(fullPath)) {
            // File was deleted or moved
            const songId = this.findSongIdByPath(relPath, fullPath);
            if (songId) {
              const targetSong = musicRepository.getSongById(songId);
              musicRepository.deleteSong(songId);
              removedCount++;
              this.addEventLog({
                type: 'removed',
                filename: relPath,
                songTitle: targetSong?.title,
                artist: targetSong?.artist,
                details: '文件已移除或移出监控目录'
              });
            }
          } else {
            // File was created or updated
            const stats = await fs.promises.stat(fullPath);
            if (stats.isDirectory()) continue;

            const ext = path.extname(fullPath).toLowerCase();
            if (ext === '.cue') {
              // Parse CUE Sheet
              await this.handleCueFileAsync(fullPath, relPath);
            } else {
              // Parse Audio File
              const parsedSong = await this.parseAudioFileAsync(fullPath, relPath, stats);
              if (parsedSong) {
                const existing = musicRepository.getSongById(parsedSong.id);
                const isNew = !existing;

                musicRepository.addOrUpdateSong(parsedSong, false);

                if (isNew) {
                  addedCount++;
                  this.addEventLog({
                    type: 'added',
                    filename: relPath,
                    songTitle: parsedSong.title,
                    artist: parsedSong.artist,
                    details: `音质: ${parsedSong.bitrate || '高保真'} (${(stats.size / 1024 / 1024).toFixed(1)}MB)`
                  });

                  // Auto scrape missing cover/lyrics if enabled
                  if (this.autoScrapeOnWatch) {
                    libraryHealthService.scrapeAndEnrichSong(parsedSong.id).catch(() => {});
                  }
                } else {
                  updatedCount++;
                  this.addEventLog({
                    type: 'updated',
                    filename: relPath,
                    songTitle: parsedSong.title,
                    artist: parsedSong.artist,
                    details: '已刷新音频元数据与标签'
                  });
                }
              }
            }
          }
        } catch (fileErr: any) {
          console.warn(`[LibraryWatcher] Error processing file ${relPath}:`, fileErr.message);
        }
      }
    };

    const workers = Array.from({ length: Math.min(CONCURRENCY, fileList.length) }, () => worker());
    await Promise.all(workers);

    // Commit single batch persistence & search index rebuild
    await musicRepository.commitBatch();
    this.isProcessing = false;

    console.log(
      `[LibraryWatcher] ✅ 增量同步完成: +${addedCount} 首新增, ⟳${updatedCount} 首更新, -${removedCount} 首清理 (总曲库: ${musicRepository.getAllSongs().length} 首)`
    );

    // Broadcast update events to web client & Subsonic endpoints
    appEventBus.broadcast('library:updated', {
      action: 'watcher_incremental_sync',
      addedCount,
      updatedCount,
      removedCount,
      total: musicRepository.getAllSongs().length
    });
    appEventBus.broadcast('watcher:status', this.getStatus());
  }

  private addEventLog(event: Omit<WatcherEventLog, 'id' | 'time'>): void {
    this.recentEvents.unshift({
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      time: Date.now(),
      ...event
    });
    if (this.recentEvents.length > 50) {
      this.recentEvents = this.recentEvents.slice(0, 50);
    }
  }

  /**
   * Find matching song in catalog by relative or full path
   */
  private findSongIdByPath(relPath: string, fullPath: string): string | null {
    const filename = path.basename(relPath);
    const cleanId = filename.replace(/\.[^/.]+$/, '');

    const songs = musicRepository.getAllSongs();
    const match = songs.find(
      (s) =>
        s.id === cleanId ||
        s.id === filename ||
        s.localFilename === fullPath ||
        s.localFilename === relPath ||
        s.url?.includes(encodeURIComponent(filename)) ||
        s.url?.includes(filename)
    );

    return match ? match.id : null;
  }

  /**
   * Fast header metadata parser for a single audio file
   */
  private async parseAudioFileAsync(filePath: string, relPath: string, stats: fs.Stats): Promise<Song | null> {
    const filename = path.basename(filePath);
    const ext = path.extname(filename).toLowerCase();
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');

    // Default heuristics
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
    let coverUrl = 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80';
    let lyrics = '';

    try {
      // Read first 256KB for fast ID3 / FLAC / Vorbis header parsing without reading entire multi-MB file
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

    // Check for accompanying .lrc file in the same folder
    const lrcPath = filePath.replace(/\.[^/.]+$/, '.lrc');
    if (fs.existsSync(lrcPath)) {
      try {
        lyrics = await fs.promises.readFile(lrcPath, 'utf-8');
      } catch {}
    }

    const songId = nameWithoutExt.replace(/[^a-zA-Z0-9_-]/g, '_') || `song-${Date.now()}`;
    const fileSizeMb = (stats.size / (1024 * 1024)).toFixed(1);

    return {
      id: songId,
      title,
      artist,
      album,
      duration,
      url: `/api/stream/${encodeURIComponent(filename)}`,
      coverUrl,
      lyrics,
      genre,
      year,
      bitrate: ext === '.flac' || ext === '.ape' || ext === '.wav' || ext === '.dsf' ? `Hi-Res 无损 (${ext.slice(1).toUpperCase()})` : bitrate,
      fileSize: `${fileSizeMb} MB`,
      isFavorite: false,
      source: 'local',
      localFilename: filePath
    };
  }

  /**
   * Parse CUE sheet and add virtual tracks
   */
  private async handleCueFileAsync(cuePath: string, relPath: string): Promise<void> {
    try {
      const cueContent = await fs.promises.readFile(cuePath, 'utf-8');
      const cueSheet = parseCueSheet(cueContent);
      if (!cueSheet || !cueSheet.tracks || cueSheet.tracks.length === 0) return;

      const baseDir = path.dirname(cuePath);
      let targetAudioFile = cueSheet.audioFile ? path.join(baseDir, cueSheet.audioFile) : '';

      if (!targetAudioFile || !fs.existsSync(targetAudioFile)) {
        // Find matching audio file with same basename
        const cueBasename = path.basename(cuePath, '.cue');
        for (const ext of ['.flac', '.wav', '.ape', '.mp3', '.m4a']) {
          const candidate = path.join(baseDir, `${cueBasename}${ext}`);
          if (fs.existsSync(candidate)) {
            targetAudioFile = candidate;
            break;
          }
        }
      }

      if (targetAudioFile && fs.existsSync(targetAudioFile)) {
        for (const t of cueSheet.tracks) {
          const cueSongId = `cue-${path.basename(cuePath, '.cue')}-track-${t.trackNumber}`;
          const song: Song = {
            id: cueSongId,
            title: t.title || `分轨 ${t.trackNumber}`,
            artist: t.performer || cueSheet.albumPerformer || '未知艺术家',
            album: cueSheet.albumTitle || 'CUE 分轨专辑',
            duration: t.durationSeconds || 180,
            url: `/api/stream/cue/${encodeURIComponent(cueSongId)}`,
            coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
            lyrics: '',
            genre: 'CUE Hi-Res Split',
            bitrate: 'CUE 无损分轨',
            fileSize: 'CUE 分轨',
            isFavorite: false,
            source: 'local',
            localFilename: targetAudioFile,
            cueTrack: {
              cueFilePath: cuePath,
              parentFilename: path.basename(targetAudioFile),
              trackNumber: t.trackNumber,
              startSeconds: t.startSeconds,
              durationSeconds: t.durationSeconds
            }
          };
          musicRepository.addOrUpdateSong(song, false);
        }
      }
    } catch (err: any) {
      console.warn(`[LibraryWatcher] Error parsing CUE ${cuePath}:`, err.message);
    }
  }

  private getMimeType(ext: string): string {
    switch (ext) {
      case '.mp3': return 'audio/mpeg';
      case '.flac': return 'audio/flac';
      case '.wav': return 'audio/wav';
      case '.m4a':
      case '.aac': return 'audio/aac';
      case '.ogg':
      case '.opus': return 'audio/ogg';
      case '.ape': return 'audio/ape';
      default: return 'audio/mpeg';
    }
  }
}

export const libraryWatcherService = new LibraryWatcherService();
