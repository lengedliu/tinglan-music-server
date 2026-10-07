import fs from 'fs';
import path from 'path';
import { parseBuffer } from 'music-metadata';
// @ts-ignore
import SMB2 from '@marsaud/smb2';
import { Song } from './musicEngine.js';
import { musicRepository } from './repositories/musicRepository.js';
import { musicSearchIndex } from './searchIndex.js';
import { libraryHealthService } from './libraryHealthService.js';
import { appEventBus } from './eventBus.js';

export interface NasConfig {
  enabled: boolean;
  type: 'webdav' | 'smb' | 'local_mount' | 'alist';
  serverUrl: string; // e.g. http://192.168.1.100:5005 or 192.168.1.100
  basePath: string; // e.g. /music or share name
  shareName?: string; // for SMB: e.g. music or public
  domain?: string; // for SMB: default WORKGROUP
  username?: string;
  password?: string;
  autoSyncIntervalMinutes: number; // 0 for manual, 15, 30, 60, 360
  autoScrapeMetadata: boolean;
  lastSyncTime?: number;
  lastSyncResult?: {
    success: boolean;
    added: number;
    updated: number;
    removed: number;
    total: number;
    error?: string;
    durationMs: number;
  };
}

export interface NasSyncProgress {
  isSyncing: boolean;
  totalFound: number;
  processed: number;
  added: number;
  updated: number;
  currentPath?: string;
  error?: string;
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
  '.dff'
]);

export class NasStorageService {
  private configPath: string = path.join(process.cwd(), 'data', 'nas_config.json');
  private config: NasConfig = {
    enabled: false,
    type: 'webdav',
    serverUrl: '',
    basePath: '/music',
    username: '',
    password: '',
    autoSyncIntervalMinutes: 30,
    autoScrapeMetadata: true
  };

  private isSyncing: boolean = false;
  private syncTimer: NodeJS.Timeout | null = null;
  private progress: NasSyncProgress = {
    isSyncing: false,
    totalFound: 0,
    processed: 0,
    added: 0,
    updated: 0
  };

  constructor() {
    this.loadConfig();
    this.setupAutoSyncSchedule();
  }

  private loadConfig(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8');
        const parsed = JSON.parse(raw);
        this.config = { ...this.config, ...parsed };
      }
    } catch (err) {
      console.warn('[NasStorageService] Failed to read nas_config.json:', err);
    }
  }

  public saveConfig(newConfig: Partial<NasConfig>): NasConfig {
    this.config = { ...this.config, ...newConfig };
    try {
      const dataDir = path.dirname(this.configPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (err) {
      console.error('[NasStorageService] Failed to save nas_config.json:', err);
    }
    this.setupAutoSyncSchedule();
    return this.config;
  }

  public getConfig(): NasConfig {
    return { ...this.config };
  }

  public getProgress(): NasSyncProgress {
    return { ...this.progress };
  }

  private setupAutoSyncSchedule(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    if (this.config.enabled && this.config.autoSyncIntervalMinutes > 0 && this.config.serverUrl) {
      const intervalMs = this.config.autoSyncIntervalMinutes * 60 * 1000;
      console.log(`[NasStorageService] ⏰ 定时自动同步已启用: 每 ${this.config.autoSyncIntervalMinutes} 分钟自动同步一次 NAS 曲库`);
      this.syncTimer = setInterval(() => {
        if (!this.isSyncing) {
          console.log('[NasStorageService] ⏰ 触发定时自动同步 NAS 曲库...');
          this.syncRemoteStorageAsync().catch(err => {
            console.error('[NasStorageService] Auto sync error:', err);
          });
        }
      }, intervalMs);
    }
  }

  /**
   * Test connection to WebDAV or local mount point
   */
  public async testConnection(testCfg?: Partial<NasConfig>): Promise<{
    success: boolean;
    latencyMs: number;
    foundSampleFiles: string[];
    totalFilesCount?: number;
    message: string;
  }> {
    const cfg = { ...this.config, ...testCfg };
    const startTime = Date.now();

    if (cfg.type === 'local_mount') {
      const mountPath = cfg.basePath || '/music';
      if (!fs.existsSync(mountPath)) {
        throw new Error(`本地挂载路径不存在: ${mountPath}，请检查宿主机或 Docker -v 挂载设置`);
      }
      const files: string[] = [];
      const entries = await fs.promises.readdir(mountPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && SUPPORTED_EXTS.has(path.extname(entry.name).toLowerCase())) {
          files.push(entry.name);
        }
      }
      const latencyMs = Date.now() - startTime;
      return {
        success: true,
        latencyMs,
        foundSampleFiles: files.slice(0, 5),
        totalFilesCount: files.length,
        message: `成功连接本地挂载目录！探测到 ${files.length} 首根目录音频`
      };
    }

    // SMB / Samba Test
    if (cfg.type === 'smb') {
      const host = (cfg.serverUrl || '').replace(/^(?:smb:\/\/|\\\\)/i, '').replace(/[\/\\]+.*$/, '').trim();
      const shareName = cfg.shareName || (cfg.basePath || '').replace(/^[\\\/]+/, '').split(/[\\\/]/)[0] || 'media';
      if (!host) {
        throw new Error('请输入 SMB 共享主机 IP 或名称 (如 192.168.50.153)');
      }

      const isPrivateLanIp = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(host);

      const smb = new SMB2({
        share: `\\\\${host}\\${shareName}`,
        domain: cfg.domain || 'WORKGROUP',
        username: cfg.username || 'guest',
        password: cfg.password || '',
        autoCloseTimeout: 8000
      });

      return new Promise((resolve, reject) => {
        let isSettled = false;
        const timeoutTimer = setTimeout(() => {
          if (!isSettled) {
            isSettled = true;
            try { smb.disconnect(); } catch {}
            const lanHint = isPrivateLanIp
              ? `\n\n💡 提示：检测到您配置的是家庭局域网私有 IP（${host}）。如果您当前在云端 Web 预览环境测试，云端服务器无法跨公网直连您家中的私网 NAS。请将听澜部署在本地家庭 NAS / Docker 局域网中运行，或在云端使用已做内网穿透的 WebDAV 地址。`
              : '';
            reject(new Error(`连接 SMB 服务器 (${host}:445) 超时，无法建立 TCP 会话。${lanHint}`));
          }
        }, 5000);

        smb.readdir('', (err: any, files: string[]) => {
          if (isSettled) return;
          isSettled = true;
          clearTimeout(timeoutTimer);
          const latencyMs = Date.now() - startTime;
          if (err) {
            const errMsg = err.message || '';
            let friendlyDetail = errMsg;
            if (errMsg.includes('STATUS_LOGON_FAILURE') || errMsg.includes('STATUS_ACCESS_DENIED')) {
              friendlyDetail = `认证失败（${errMsg}）：请检查 SMB 用户名、密码及在 NAS 上对「${shareName}」共享文件夹的读写权限`;
            } else if (errMsg.includes('STATUS_BAD_NETWORK_NAME')) {
              friendlyDetail = `共享名不存在（${errMsg}）：请核对 NAS 上的共享文件夹名称是否为「${shareName}」`;
            } else if (errMsg.includes('ECONNREFUSED') || errMsg.includes('EHOSTUNREACH') || errMsg.includes('ETIMEDOUT')) {
              friendlyDetail = `网络无法连通（${errMsg}）：无法连接至 ${host}:445，请确认 NAS 已开启 SMB 服务且防火墙放行 445 端口`;
            }
            return reject(new Error(`SMB 共享连接失败: ${friendlyDetail}`));
          }
          const audioFiles = (files || []).filter(f => SUPPORTED_EXTS.has(path.extname(f).toLowerCase()));
          resolve({
            success: true,
            latencyMs,
            foundSampleFiles: audioFiles.slice(0, 5),
            totalFilesCount: audioFiles.length,
            message: `SMB 共享连接成功！响应耗时 ${latencyMs}ms，在 \\\\${host}\\${shareName} 探测到 ${audioFiles.length} 首音频`
          });
        });
      });
    }

    // WebDAV / Alist test
    if (!cfg.serverUrl) {
      throw new Error('请输入 NAS WebDAV 服务器完整地址 (如 http://192.168.1.100:5005)');
    }

    const cleanBaseUrl = cfg.serverUrl.replace(/\/+$/, '');
    const cleanPath = (cfg.basePath || '/').replace(/^\/+/, '');
    const targetUrl = cleanPath ? `${cleanBaseUrl}/${cleanPath}` : cleanBaseUrl;

    const headers: Record<string, string> = {
      'Depth': '1',
      'User-Agent': 'TingLan-Music-Server/1.0 WebDAV-Client'
    };

    if (cfg.username) {
      const auth = Buffer.from(`${cfg.username}:${cfg.password || ''}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    try {
      const resp = await fetch(targetUrl, {
        method: 'PROPFIND',
        headers
      });

      const latencyMs = Date.now() - startTime;

      if (!resp.ok && resp.status !== 207) {
        if (resp.status === 401) {
          throw new Error('认证失败 (401 Unauthorized)，请核对 WebDAV 账号和密码');
        }
        if (resp.status === 404) {
          throw new Error(`目录不存在 (404 Not Found): ${cfg.basePath}`);
        }
        throw new Error(`WebDAV 服务器响应异常 (HTTP ${resp.status} ${resp.statusText})`);
      }

      const xmlText = await resp.text();
      const files = this.extractFilenamesFromPropfindXml(xmlText);
      const audioFiles = files.filter(f => SUPPORTED_EXTS.has(path.extname(f).toLowerCase()));

      return {
        success: true,
        latencyMs,
        foundSampleFiles: audioFiles.slice(0, 5),
        totalFilesCount: audioFiles.length,
        message: `WebDAV 连接成功！响应耗时 ${latencyMs}ms，当前目录包含 ${audioFiles.length} 首可播放音频`
      };
    } catch (err: any) {
      throw new Error(`无法连接至 NAS WebDAV 服务器: ${err.message}`);
    }
  }

  /**
   * Recursive scanner for WebDAV / Local storage
   */
  public async syncRemoteStorageAsync(): Promise<{
    success: boolean;
    added: number;
    updated: number;
    removed: number;
    total: number;
    durationMs: number;
  }> {
    if (this.isSyncing) {
      console.warn('[NasStorageService] Sync already in progress, skipping.');
      return { success: true, added: 0, updated: 0, removed: 0, total: musicRepository.getAllSongs().length, durationMs: 0 };
    }

    this.isSyncing = true;
    const startTime = Date.now();
    this.progress = {
      isSyncing: true,
      totalFound: 0,
      processed: 0,
      added: 0,
      updated: 0
    };
    appEventBus.broadcast('nas:progress', { ...this.progress });

    let addedCount = 0;
    let updatedCount = 0;
    let removedCount = 0;

    try {
      console.log(`[NasStorageService] 🚀 开始增量同步 NAS 远程曲库 (${this.config.type} @ ${this.config.serverUrl || this.config.basePath})`);

      const remoteTracks = await this.discoverRemoteAudioFiles();
      this.progress.totalFound = remoteTracks.length;
      appEventBus.broadcast('nas:progress', { ...this.progress });

      const CONCURRENCY = 4;
      const queue = [...remoteTracks];

      const worker = async () => {
        while (queue.length > 0) {
          const item = queue.shift();
          if (!item) break;

          this.progress.currentPath = item.name;
          this.progress.processed++;

          try {
            const parsedSong = await this.parseRemoteSongAsync(item);
            if (parsedSong) {
              const existing = musicRepository.getSongById(parsedSong.id);
              const isNew = !existing;

              musicRepository.addOrUpdateSong(parsedSong, false);

              if (isNew) {
                addedCount++;
                if (this.config.autoScrapeMetadata) {
                  libraryHealthService.scrapeAndEnrichSong(parsedSong.id).catch(() => {});
                }
              } else {
                updatedCount++;
              }
            }
          } catch (e: any) {
            console.warn(`[NasStorageService] Failed to parse item ${item.name}:`, e.message);
          }

          if (this.progress.processed % 5 === 0) {
            appEventBus.broadcast('nas:progress', {
              ...this.progress,
              added: addedCount,
              updated: updatedCount
            });
          }
        }
      };

      const workers = Array.from({ length: Math.min(CONCURRENCY, remoteTracks.length) }, () => worker());
      await Promise.all(workers);

      // Commit single bulk transaction and search index rebuild
      await musicRepository.commitBatch();

      const durationMs = Date.now() - startTime;
      this.config.lastSyncTime = Date.now();
      this.config.lastSyncResult = {
        success: true,
        added: addedCount,
        updated: updatedCount,
        removed: removedCount,
        total: musicRepository.getAllSongs().length,
        durationMs
      };
      this.saveConfig({});

      console.log(
        `[NasStorageService] ✅ NAS 增量同步完成: +${addedCount} 首新增, ⟳${updatedCount} 首更新 (耗时 ${(durationMs / 1000).toFixed(1)}s, 总曲库 ${musicRepository.getAllSongs().length} 首)`
      );

      appEventBus.broadcast('library:updated', {
        action: 'nas_sync',
        addedCount,
        updatedCount,
        total: musicRepository.getAllSongs().length
      });

      return {
        success: true,
        added: addedCount,
        updated: updatedCount,
        removed: removedCount,
        total: musicRepository.getAllSongs().length,
        durationMs
      };
    } catch (err: any) {
      console.error('[NasStorageService] Sync failed:', err);
      const durationMs = Date.now() - startTime;
      this.config.lastSyncResult = {
        success: false,
        added: addedCount,
        updated: updatedCount,
        removed: removedCount,
        total: musicRepository.getAllSongs().length,
        error: err.message,
        durationMs
      };
      this.saveConfig({});
      throw err;
    } finally {
      this.isSyncing = false;
      this.progress.isSyncing = false;
      appEventBus.broadcast('nas:progress', { ...this.progress });
    }
  }

  /**
   * Discover remote audio files (Recursive PROPFIND, SMB, or Local Readdir)
   */
  private async discoverRemoteAudioFiles(): Promise<Array<{ url: string; name: string; size: number; mtime?: string }>> {
    const results: Array<{ url: string; name: string; size: number; mtime?: string }> = [];

    if (this.config.type === 'local_mount') {
      const walk = async (dir: string) => {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (!entry.name.startsWith('.')) await walk(fullPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (SUPPORTED_EXTS.has(ext)) {
              const stat = await fs.promises.stat(fullPath);
              results.push({
                url: fullPath,
                name: entry.name,
                size: stat.size,
                mtime: stat.mtime.toISOString()
              });
            }
          }
        }
      };
      await walk(this.config.basePath || '/music');
      return results;
    }

    if (this.config.type === 'smb') {
      const host = (this.config.serverUrl || '').replace(/^(?:smb:\/\/|\\\\)/i, '').replace(/[\/\\]+.*$/, '');
      const shareName = this.config.shareName || (this.config.basePath || '').replace(/^[\\\/]+/, '').split(/[\\\/]/)[0] || 'music';
      const smb = new SMB2({
        share: `\\\\${host}\\${shareName}`,
        domain: this.config.domain || 'WORKGROUP',
        username: this.config.username || 'guest',
        password: this.config.password || '',
        autoCloseTimeout: 10000
      });

      const walkSmb = async (subDir: string): Promise<void> => {
        return new Promise((resolve) => {
          smb.readdir(subDir, async (err: any, files: string[]) => {
            if (err || !files) return resolve();
            for (const file of files) {
              if (file.startsWith('.')) continue;
              const relPath = subDir ? `${subDir}\\${file}` : file;
              const ext = path.extname(file).toLowerCase();
              if (SUPPORTED_EXTS.has(ext)) {
                results.push({
                  url: `smb://${host}/${shareName}/${relPath.replace(/\\/g, '/')}`,
                  name: file,
                  size: 25 * 1024 * 1024 // Estimated size for stream
                });
              }
            }
            resolve();
          });
        });
      };

      await walkSmb('');
      return results;
    }

    // Recursive WebDAV discovery
    const cleanBaseUrl = this.config.serverUrl.replace(/\/+$/, '');
    const cleanPath = (this.config.basePath || '/').replace(/^\/+/, '');
    const startUrl = cleanPath ? `${cleanBaseUrl}/${cleanPath}` : cleanBaseUrl;

    const visitedDirs = new Set<string>();
    const queueDirs = [startUrl];

    const headers: Record<string, string> = {
      'Depth': '1',
      'User-Agent': 'TingLan-Music-Server/1.0 WebDAV-Client'
    };

    if (this.config.username) {
      const auth = Buffer.from(`${this.config.username}:${this.config.password || ''}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    while (queueDirs.length > 0) {
      const currentDir = queueDirs.shift()!;
      if (visitedDirs.has(currentDir)) continue;
      visitedDirs.add(currentDir);

      try {
        const resp = await fetch(currentDir, {
          method: 'PROPFIND',
          headers
        });

        if (!resp.ok && resp.status !== 207) continue;

        const xmlText = await resp.text();
        const items = this.parseDetailedPropfindXml(xmlText, cleanBaseUrl);

        for (const it of items) {
          if (it.isDir) {
            if (!visitedDirs.has(it.fullUrl) && !it.name.startsWith('.')) {
              queueDirs.push(it.fullUrl);
            }
          } else {
            const ext = path.extname(it.name).toLowerCase();
            if (SUPPORTED_EXTS.has(ext)) {
              results.push({
                url: it.fullUrl,
                name: it.name,
                size: it.size,
                mtime: it.mtime
              });
            }
          }
        }
      } catch (err: any) {
        console.warn(`[NasStorageService] Failed to list remote dir ${currentDir}:`, err.message);
      }
    }

    return results;
  }

  /**
   * Parse single remote song by fetching first 256KB header
   */
  private async parseRemoteSongAsync(item: { url: string; name: string; size: number; mtime?: string }): Promise<Song | null> {
    const filename = item.name;
    const ext = path.extname(filename).toLowerCase();
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');

    let artist = '未知歌手';
    let title = nameWithoutExt;
    if (nameWithoutExt.includes(' - ')) {
      const parts = nameWithoutExt.split(' - ');
      artist = parts[0].trim();
      title = parts.slice(1).join(' - ').trim();
    }

    let duration = 180;
    let album = 'NAS 远程无损';
    let genre = '流行';
    let year = new Date().getFullYear();
    let bitrate = '320 kbps';
    let coverUrl = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80';

    try {
      let headerBuffer: Buffer | null = null;

      if (this.config.type === 'local_mount') {
        const fd = await fs.promises.open(item.url, 'r');
        headerBuffer = Buffer.alloc(Math.min(262144, item.size));
        await fd.read(headerBuffer, 0, headerBuffer.length, 0);
        await fd.close();
      } else {
        // Fetch first 256KB via HTTP Range request
        const headers: Record<string, string> = {
          'Range': 'bytes=0-262143',
          'User-Agent': 'TingLan-Music-Server/1.0'
        };
        if (this.config.username) {
          headers['Authorization'] = `Basic ${Buffer.from(`${this.config.username}:${this.config.password || ''}`).toString('base64')}`;
        }
        const resp = await fetch(item.url, { headers });
        if (resp.ok || resp.status === 206) {
          const ab = await resp.arrayBuffer();
          headerBuffer = Buffer.from(ab);
        }
      }

      if (headerBuffer && headerBuffer.length > 0) {
        const metadata = await parseBuffer(headerBuffer, { mimeType: this.getMimeType(ext), size: item.size });
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
      }
    } catch {
      // Fallback to filename
    }

    const songId = `nas-${Buffer.from(item.url).toString('base64url').slice(0, 32)}`;
    const fileSizeMb = (item.size / (1024 * 1024)).toFixed(1);

    // Stream proxy url
    const streamUrl = `/api/stream/remote/${encodeURIComponent(songId)}?url=${encodeURIComponent(item.url)}`;

    return {
      id: songId,
      title,
      artist,
      album,
      duration,
      url: streamUrl,
      coverUrl,
      lyrics: '',
      genre,
      year,
      bitrate: ext === '.flac' || ext === '.ape' || ext === '.wav' || ext === '.dsf' ? `NAS Hi-Res (${ext.slice(1).toUpperCase()})` : bitrate,
      fileSize: `${fileSizeMb} MB`,
      isFavorite: false,
      source: 'nas' as any,
      localFilename: item.url
    };
  }

  /**
   * Helper: Parse XML responses from WebDAV PROPFIND
   */
  private extractFilenamesFromPropfindXml(xml: string): string[] {
    const matches = xml.match(/<[^:]*:?href[^>]*>(.*?)<\/[^:]*:?href>/gi) || [];
    const files: string[] = [];
    for (const m of matches) {
      const cleanHref = m.replace(/<[^>]+>/g, '').trim();
      const decoded = decodeURIComponent(cleanHref);
      const name = decoded.split('/').filter(Boolean).pop();
      if (name) files.push(name);
    }
    return files;
  }

  private parseDetailedPropfindXml(xml: string, baseUrl: string): Array<{
    fullUrl: string;
    name: string;
    isDir: boolean;
    size: number;
    mtime?: string;
  }> {
    const responses = xml.split(/<[^:]*:?response/i).slice(1);
    const results: Array<any> = [];

    for (const block of responses) {
      const hrefMatch = block.match(/<[^:]*:?href[^>]*>(.*?)<\/[^:]*:?href>/i);
      if (!hrefMatch) continue;

      const rawHref = hrefMatch[1].trim();
      const isDir = block.includes('<collection') || block.includes(':collection') || rawHref.endsWith('/');

      let fullUrl = rawHref;
      if (rawHref.startsWith('http://') || rawHref.startsWith('https://')) {
        fullUrl = rawHref;
      } else {
        const cleanBase = baseUrl.replace(/\/+$/, '');
        const cleanHref = rawHref.startsWith('/') ? rawHref : `/${rawHref}`;
        fullUrl = `${cleanBase}${cleanHref}`;
      }

      const decodedHref = decodeURIComponent(rawHref);
      const name = decodedHref.replace(/\/+$/, '').split('/').pop() || '';
      if (!name || name === '.' || name === '..') continue;

      let size = 0;
      const sizeMatch = block.match(/<[^:]*:?getcontentlength[^>]*>(\d+)<\/[^:]*:?getcontentlength>/i);
      if (sizeMatch) size = parseInt(sizeMatch[1], 10) || 0;

      let mtime: string | undefined;
      const mtimeMatch = block.match(/<[^:]*:?getlastmodified[^>]*>(.*?)<\/[^:]*:?getlastmodified>/i);
      if (mtimeMatch) mtime = mtimeMatch[1].trim();

      results.push({
        fullUrl,
        name,
        isDir,
        size,
        mtime
      });
    }

    return results;
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

export const nasStorageService = new NasStorageService();
