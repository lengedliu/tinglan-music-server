import './cryptoLegacyCompat.js';
import fs from 'fs';
import path from 'path';
import net from 'net';
import { parseBuffer } from 'music-metadata';
// @ts-ignore
import SMB2 from '@marsaud/smb2';
import { Song } from './musicEngine.js';
import { musicRepository } from './repositories/musicRepository.js';
import { musicSearchIndex } from './searchIndex.js';
import { libraryHealthService } from './libraryHealthService.js';
import { appEventBus } from './eventBus.js';
import { logEngine } from './logEngine.js';

export interface NasConfig {
  enabled: boolean;
  type: 'webdav' | 'smb' | 'local_mount' | 'alist';
  serverUrl: string; // e.g. http://192.168.1.100:5005 or 192.168.1.100
  basePath: string; // e.g. /music or share name
  shareName?: string; // for SMB: e.g. music or public
  port?: number; // for SMB: default 445
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
      logEngine.info('system', 'NAS 存储配置保存成功', `配置已更新: 协议=${this.config.type}, 服务器=${this.config.serverUrl || this.config.basePath}${this.config.port ? ':' + this.config.port : ''}`, {
        type: this.config.type,
        serverUrl: this.config.serverUrl,
        port: this.config.port,
        basePath: this.config.basePath,
        shareName: this.config.shareName,
        enabled: this.config.enabled
      });
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
  public getSmbTarget(cfg: NasConfig): {
    host: string; port: number; shareName: string; subFolder: string;
    domain: string; username: string; password: string;
  } {
    let rawHost = (cfg.serverUrl || '').replace(/^(?:smb:\/\/|\\\\)/i, '').replace(/[\/\\]+.*$/, '').trim();
    if (!rawHost) throw new Error('请输入 SMB 服务器 IP 或主机名，例如 192.168.50.153');

    let host = rawHost;
    let port = cfg.port && cfg.port > 0 ? cfg.port : 445;
    const hp = rawHost.match(/^(.+):([0-9]+)$/);
    if (hp) {
      host = hp[1].trim();
      const n = Number(hp[2]);
      if (Number.isInteger(n) && n > 0 && n <= 65535) port = n;
    }

    let rawShare = (cfg.shareName || cfg.basePath || 'music').trim().replace(/^[\\/]+/, '');
    rawShare = rawShare.replace(/^volume\d+[\\/]+/i, '');
    const parts = rawShare.split(/[\\/]+/).filter(Boolean);
    const shareName = parts.shift() || 'music';

    return {
      host, port, shareName,
      subFolder: parts.join('\\'),
      domain: cfg.domain || 'WORKGROUP',
      username: cfg.username || 'guest',
      password: cfg.password || ''
    };
  }

  public createSmbClient(cfg: NasConfig): { smb: any; target: ReturnType<NasStorageService['getSmbTarget']> } {
    const target = this.getSmbTarget(cfg);
    const smb = new SMB2({
      share: `\\\\${target.host}\\${target.shareName}`,
      port: target.port,
      domain: target.domain,
      username: target.username,
      password: target.password,
      autoCloseTimeout: 60000
    });
    if (smb && (smb as any).socket) {
      (smb as any).socket.on('error', (err: any) => {
        console.warn('[NasStorageService] SMB socket handled error:', err?.message || err);
      });
    }
    return { smb, target };
  }

  public smbReaddir(smb: any, dir: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      smb.readdir(dir || '', (err: any, files: string[]) => {
        if (err) return reject(err);
        resolve(Array.isArray(files) ? files : []);
      });
    });
  }

  public smbStat(smb: any, filePath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (typeof smb.stat !== 'function') return reject(new Error('@marsaud/smb2 当前版本不提供 stat()，无法安全递归 SMB 目录'));
      smb.stat(filePath, (err: any, stat: any) => err ? reject(err) : resolve(stat));
    });
  }

  public smbReadFile(smb: any, filePath: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      if (typeof smb.readFile !== 'function') return reject(new Error('@marsaud/smb2 当前版本不提供 readFile()'));
      smb.readFile(filePath, (err: any, data: Buffer) => err ? reject(err) : resolve(Buffer.isBuffer(data) ? data : Buffer.from(data)));
    });
  }

  public isSmbDirectory(stat: any): boolean {
    if (!stat) return false;
    if (typeof stat.isDirectory === 'function') return stat.isDirectory();
    if (typeof stat.isDirectory === 'boolean') return stat.isDirectory;
    if (typeof stat.mode === 'number') return (stat.mode & 0o170000) === 0o040000;
    return false;
  }

  public closeSmb(smb: any): void {
    try { if (smb && (smb as any).socket) (smb as any).socket.destroy(); } catch {}
    try { if (typeof smb?.disconnect === 'function') smb.disconnect(); } catch {}
  }

  public async readSmbFile(smbUrl: string): Promise<Buffer> {
    if (this.config.type !== 'smb') throw new Error('当前 NAS 存储类型不是 SMB');
    const { smb, target } = this.createSmbClient(this.config);
    try {
      const prefix = `smb://${target.host}/${target.shareName}/`;
      let remotePath = smbUrl.startsWith(prefix) ? smbUrl.slice(prefix.length) : smbUrl;
      remotePath = decodeURIComponent(remotePath).replace(/\//g, '\\');
      return await this.smbReadFile(smb, remotePath);
    } finally {
      this.closeSmb(smb);
    }
  }

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
      const target = this.getSmbTarget(cfg);
      const { host: smbHost, port: smbPort, shareName, subFolder } = target;

      // 阶段 1：原生 TCP 端口连通性快速探测 (3.5 秒超时)
      // 快速精准定位：到底是网络层/端口不通，还是连通后 SMB 协议握手问题
      try {
        await new Promise<void>((resolveTcp, rejectTcp) => {
          const socket = net.createConnection({ host: smbHost, port: smbPort }, () => {
            socket.destroy();
            resolveTcp();
          });
          socket.setTimeout(3500);
          socket.on('timeout', () => {
            socket.destroy();
            rejectTcp(new Error(`TCP 端口连接超时 (3.5秒): 无法与 ${smbHost}:${smbPort} 建立网络连接。\n\n局域网排查清单：\n` +
              `1. 局域网连通性：请在终端执行 ping ${smbHost} 确认本地电脑与 NAS 能够通信；\n` +
              `2. WSL2 / 虚拟机环境：如果在 Windows WSL2 或虚拟机终端中运行，WSL2 虚拟网卡与宿主机防火墙默认会阻断局域网 445 出站端口；\n` +
              `3. 路由器隔离：请检查 Wi-Fi 是否开启了「AP 隔离」或电脑连接了「访客 Wi-Fi」；\n` +
              `4. NAS 防火墙：请检查 NAS 防火墙是否放行了 TCP ${smbPort} 端口。`));
          });
          socket.on('error', (netErr: any) => {
            socket.destroy();
            const errCode = netErr.code || netErr.message;
            rejectTcp(new Error(`TCP 网络连接失败 (${errCode}): 无法连接至 ${smbHost}:${smbPort}。\n\n局域网排查清单：\n` +
              `1. 请核对 NAS 主机 IP「${smbHost}」是否正确在线；\n` +
              `2. 确认 NAS 已开启 SMB 文件服务且监听 ${smbPort} 端口；\n` +
              `3. 检查本地电脑或 NAS 防火墙是否拦截了 ${smbPort} 端口。`));
          });
        });
      } catch (tcpErr: any) {
        logEngine.error('system', 'NAS SMB TCP 端口探测失败', `TCP 探测失败 (${smbHost}:${smbPort}): ${tcpErr.message}`, {
          protocol: 'smb',
          host: smbHost,
          port: smbPort,
          error: tcpErr.message
        });
        throw tcpErr;
      }

      // 阶段 2：SMB2 协议握手探测
      const { smb } = this.createSmbClient(cfg);

      return new Promise((resolve, reject) => {
        let isSettled = false;
        let timeoutTimer: NodeJS.Timeout;
        const safeClose = () => this.closeSmb(smb);

        const safeReject = (err: Error) => {
          if (isSettled) return;
          isSettled = true;
          clearTimeout(timeoutTimer);
          safeClose();
          logEngine.error('system', 'NAS SMB 连接测试失败', `SMB 共享 \\\\${smbHost}\\${shareName}:${smbPort} 测试失败: ${err.message}`, {
            protocol: 'smb',
            host: smbHost,
            port: smbPort,
            share: shareName,
            subFolder,
            user: target.username || '(匿名)',
            error: err.message
          });
          reject(err);
        };

        const safeResolve = (data: any) => {
          if (isSettled) return;
          isSettled = true;
          clearTimeout(timeoutTimer);
          safeClose();
          logEngine.info('system', 'NAS SMB 连接测试成功', `SMB 共享 \\\\${smbHost}\\${shareName}:${smbPort} 测试通过，探测到 ${data.totalFilesCount || 0} 首音频`, {
            protocol: 'smb',
            host: smbHost,
            port: smbPort,
            share: shareName,
            subFolder,
            latencyMs: data.latencyMs,
            totalFilesCount: data.totalFilesCount
          });
          resolve(data);
        };

        timeoutTimer = setTimeout(() => {
          safeReject(new Error(`TCP 端口 ${smbPort} 已连通，但 SMB2 协议协商应答超时 (20秒)。\n\n排查建议：\n` +
            `1. 加密传输冲突：检查 NAS 是否设置了「强制加密传输 (SMB Encryption)」，目前客户端暂不支持强制传输加密，请在 NAS 端将传输加密设为「自动/允许」；\n` +
            `2. 共享权限：确认账号「${target.username}」对共享文件夹「${shareName}」拥有读取权限；\n` +
            `3. 运行环境：Node.js 17+ / 22+ 运行环境下，需配置 NODE_OPTIONS="--openssl-legacy-provider" 以支持 NTLM 算法协商。`));
        }, 20000);

        try {
          smb.readdir(subFolder || '', (err: any, files: string[]) => {
            if (isSettled) return;
            const latencyMs = Date.now() - startTime;
            if (err) {
              const errMsg = err.message || '';
              let friendlyDetail = errMsg;
              if (errMsg.includes('STATUS_LOGON_FAILURE') || errMsg.includes('STATUS_ACCESS_DENIED') || errMsg.includes('STATUS_WRONG_PASSWORD') || errMsg.includes('STATUS_NTLM_BLOCKED')) {
                friendlyDetail = `认证失败（${errMsg}）：\n1. 请检查 SMB 账号密码及用户对「${shareName}」共享文件夹的访问权限；\n2. 密码若包含特殊字符请核对是否正确；\n3. 强烈建议：若您的 WebDAV 已测试成功，WebDAV 协议天然支持流式播放且无此问题，推荐优先使用 WebDAV。`;
              } else if (errMsg.includes('STATUS_BAD_NETWORK_NAME')) {
                friendlyDetail = `共享名不存在（${errMsg}）：请核对 NAS 上的共享文件夹名称是否确为「${shareName}」（注意不要填写磁盘卷路径如 /volume1/music，只填共享文件夹名 music）。`;
              } else if (errMsg.includes('STATUS_OBJECT_NAME_NOT_FOUND')) {
                friendlyDetail = `子目录不存在（${errMsg}）：在共享文件夹「${shareName}」下未找到子路径「${subFolder}」。`;
              } else if (errMsg.includes('STATUS_INVALID_PARAMETER') || errMsg.includes('STATUS_NOT_SUPPORTED')) {
                friendlyDetail = `协议版本不兼容（${errMsg}）：NAS 可能设置了「仅允许 SMB3」或强制加密传输。请在 NAS 的 SMB 高级设置中将「最低 SMB协议」设为 SMB2。`;
              } else if (errMsg.includes('ECONNREFUSED') || errMsg.includes('EHOSTUNREACH') || errMsg.includes('ETIMEDOUT') || errMsg.includes('ENOTFOUND')) {
                friendlyDetail = `网络无法连通（${errMsg}）：无法连接至 ${smbHost}:${smbPort}。\n1. 请确认 NAS 已开启 SMB 服务且防火墙放行 ${smbPort} 端口；\n2. 请确认服务与 NAS 处于同一局域网或内网互通网络。`;
              }
              return safeReject(new Error(`SMB 共享连接失败: ${friendlyDetail}`));
            }
            const audioFiles = (files || []).filter(f => SUPPORTED_EXTS.has(path.extname(f).toLowerCase()));
            safeResolve({
              success: true,
              latencyMs,
              foundSampleFiles: audioFiles.slice(0, 5),
              totalFilesCount: audioFiles.length,
              message: `SMB 共享连接成功！响应耗时 ${latencyMs}ms，在 \\\\${smbHost}\\${shareName}${subFolder ? '\\' + subFolder : ''} 探测到 ${audioFiles.length} 首音频`
            });
          });
        } catch (callErr: any) {
          safeReject(new Error(`SMB 探测异常: ${callErr.message}`));
        }
      });
    }

    // WebDAV / Alist test
    if (!cfg.serverUrl) {
      throw new Error('请输入 NAS WebDAV 服务器完整地址 (如 http://192.168.1.100:5005)');
    }

    let cleanBaseUrl = cfg.serverUrl.replace(/\/+$/, '');
    // 智能容错：如果是 Alist 或 5244 端口且未带 /dav，自动追加 /dav
    if ((cfg.type === 'alist' || /:5244(?:\/|$)/.test(cleanBaseUrl)) && !cleanBaseUrl.endsWith('/dav') && !cleanBaseUrl.includes('/dav/')) {
      cleanBaseUrl = `${cleanBaseUrl}/dav`;
    }

    const rawPath = (cfg.basePath || '/').trim();
    const cleanPath = rawPath.replace(/^\/+/, '');

    const authHeader = cfg.username
      ? `Basic ${Buffer.from(`${cfg.username}:${cfg.password || ''}`).toString('base64')}`
      : undefined;

    let targetUrl = cleanPath ? `${cleanBaseUrl}/${cleanPath}` : cleanBaseUrl;

    let propfindRes = await this.executeWebdavPropfind(targetUrl, authHeader);

    // 智能容错：群晖误填 /volume1/music 格式，500/404 时自动剥离 volume1 重试
    if (!propfindRes.ok && /^volume\d+\//i.test(cleanPath)) {
      const strippedPath = cleanPath.replace(/^volume\d+\//i, '');
      const retryUrl = strippedPath ? `${cleanBaseUrl}/${strippedPath}` : cleanBaseUrl;
      const retryRes = await this.executeWebdavPropfind(retryUrl, authHeader);
      if (retryRes.ok) {
        propfindRes = retryRes;
        targetUrl = retryUrl;
        cfg.basePath = `/${strippedPath}`;
      }
    }

    const latencyMs = Date.now() - startTime;

    if (!propfindRes.ok) {
      if (propfindRes.status === 401) {
        throw new Error('认证失败 (401 Unauthorized)，请核对 WebDAV 账号和密码');
      }
      if (propfindRes.status === 403) {
        throw new Error('访问被拒绝 (403 Forbidden)，请在 NAS 控制面板确认该用户具有 WebDAV 访问权限');
      }
      if (propfindRes.status === 404) {
        throw new Error(`目录不存在 (404 Not Found): ${cfg.basePath || '/'}，请核对 NAS 上的共享文件夹名称`);
      }
      if (propfindRes.status === 500) {
        const detail = propfindRes.errorDetail ? `\n[服务端详情: ${propfindRes.errorDetail}]` : '';
        throw new Error(
          `WebDAV 服务器响应异常 (HTTP 500 Internal Server Error)${detail}\n\n排查建议：\n` +
          `1. 远程根目录：群晖 WebDAV 请直接填写共享文件夹名（如 /music 或 /media），切勿加 /volume1 等底层卷前缀；\n` +
          `2. 群晖用户权限：需在群晖「控制面板 -> 应用程序权限 -> WebDAV Server」中勾选允许该用户访问；\n` +
          `3. Alist 聚合网盘：服务地址必须包含 /dav 路径（如 http://IP:5244/dav），且挂载点需正常在线；\n` +
          `4. 确认 NAS 目标共享文件夹是否存在且该用户具有读取权限。`
        );
      }
      throw new Error(`WebDAV 服务器响应异常 (HTTP ${propfindRes.status} ${propfindRes.statusText}) ${propfindRes.errorDetail || ''}`);
    }

    const files = this.extractFilenamesFromPropfindXml(propfindRes.text);
    const audioFiles = files.filter(f => SUPPORTED_EXTS.has(path.extname(f).toLowerCase()));

    return {
      success: true,
      latencyMs,
      foundSampleFiles: audioFiles.slice(0, 5),
      totalFilesCount: audioFiles.length,
      message: `WebDAV 连接成功！响应耗时 ${latencyMs}ms，当前目录包含 ${audioFiles.length} 首可播放音频`
    };
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
      const { smb, target } = this.createSmbClient(this.config);
      const { host: smbHost, shareName, subFolder: initialSubFolder } = target;

      const walkSmb = async (subDir: string): Promise<void> => {
        const files = await this.smbReaddir(smb, subDir);
        for (const file of files) {
          if (!file || file === '.' || file === '..' || file.startsWith('.')) continue;
          const relPath = subDir ? `${subDir}\\${file}` : file;
          let stat: any;
          try {
            stat = await this.smbStat(smb, relPath);
          } catch (err: any) {
            console.warn(`[NasStorageService][SMB] stat failed: ${relPath}:`, err?.message || err);
            continue;
          }
          if (this.isSmbDirectory(stat)) {
            await walkSmb(relPath);
            continue;
          }
          const ext = path.extname(file).toLowerCase();
          if (!SUPPORTED_EXTS.has(ext)) continue;
          results.push({
            url: `smb://${smbHost}/${shareName}/${relPath.replace(/\\/g, '/')}`,
            name: file,
            size: Number(stat?.size) || 0,
            mtime: stat?.mtime ? new Date(stat.mtime).toISOString() : undefined
          });
        }
      };

      try {
        await walkSmb(initialSubFolder);
      } finally {
        this.closeSmb(smb);
      }
      return results;
    }

    // Recursive WebDAV discovery
    let cleanBaseUrl = this.config.serverUrl.replace(/\/+$/, '');
    if ((this.config.type === 'alist' || /:5244(?:\/|$)/.test(cleanBaseUrl)) && !cleanBaseUrl.endsWith('/dav') && !cleanBaseUrl.includes('/dav/')) {
      cleanBaseUrl = `${cleanBaseUrl}/dav`;
    }

    const cleanPath = (this.config.basePath || '/').replace(/^\/+/, '');
    const startUrl = cleanPath ? `${cleanBaseUrl}/${cleanPath}` : cleanBaseUrl;

    const visitedDirs = new Set<string>();
    const queueDirs = [startUrl];

    const authHeader = this.config.username
      ? `Basic ${Buffer.from(`${this.config.username}:${this.config.password || ''}`).toString('base64')}`
      : undefined;

    while (queueDirs.length > 0) {
      const currentDir = queueDirs.shift()!;
      if (visitedDirs.has(currentDir)) continue;
      visitedDirs.add(currentDir);

      try {
        const propfindRes = await this.executeWebdavPropfind(currentDir, authHeader);
        if (!propfindRes.ok) continue;

        const items = this.parseDetailedPropfindXml(propfindRes.text, cleanBaseUrl);

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
      } else if (this.config.type === 'smb') {
        // Native fetch() does not support smb://. Use SMB2 for SMB metadata reads.
        if (item.size <= 50 * 1024 * 1024) {
          try {
            const data = await this.readSmbFile(item.url);
            headerBuffer = data.subarray(0, Math.min(262144, data.length));
          } catch (smbErr: any) {
            console.warn(`[NasStorageService] SMB read failed for tag parsing (${item.name}):`, smbErr?.message);
          }
        }
      } else {
        // WebDAV / HTTP: Fetch first 256KB via HTTP Range request
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

    // Stream proxy url: standard TingLan streaming endpoint
    const streamUrl = `/api/stream/${encodeURIComponent(songId)}`;

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
   * Helper: Send robust WebDAV PROPFIND with automatic trailing slash,
   * standard XML request payload, and fallback negotiation.
   */
  private async executeWebdavPropfind(
    url: string,
    authHeader?: string,
    depth: string = '1'
  ): Promise<{ ok: boolean; status: number; statusText: string; text: string; errorDetail?: string }> {
    const propfindXml = `<?xml version="1.0" encoding="utf-8" ?>\n<D:propfind xmlns:D="DAV:">\n  <D:allprop/>\n</D:propfind>`;
    const urlWithSlash = url.endsWith('/') ? url : `${url}/`;
    const urlWithoutSlash = url.replace(/\/+$/, '');

    // WebDAV 服务端行为差异：
    // 1. 部分服务器对 collection 要求 URI 结尾必须带 '/'；
    // 2. 部分服务器(如 Alist / Go-WebDAV)解析空请求体时会报错抛 500，要求必须附带标准 XML 请求体；
    // 3. 部分极简服务器则不期望带有复杂 XML 结构。
    // 因此优先采用 RFC 标准格式 (带斜杠 + 标准 XML 载荷)，如遇异常自动降级探测。
    const attempts = [
      { targetUrl: urlWithSlash, body: propfindXml, hasXmlHeader: true },
      { targetUrl: urlWithSlash, body: undefined, hasXmlHeader: false },
      { targetUrl: urlWithoutSlash, body: propfindXml, hasXmlHeader: true },
      { targetUrl: urlWithoutSlash, body: undefined, hasXmlHeader: false }
    ];

    let lastResult = { ok: false, status: 500, statusText: 'Internal Server Error', text: '', errorDetail: '' };

    for (const att of attempts) {
      try {
        const headers: Record<string, string> = {
          'Depth': depth,
          'User-Agent': 'TingLan-Music-Server/1.0 WebDAV-Client'
        };
        if (authHeader) {
          headers['Authorization'] = authHeader;
        }
        if (att.hasXmlHeader) {
          headers['Content-Type'] = 'application/xml; charset=utf-8';
        }

        const resp = await fetch(att.targetUrl, {
          method: 'PROPFIND',
          headers,
          body: att.body
        });

        const text = await resp.text().catch(() => '');
        lastResult = {
          ok: resp.ok || resp.status === 207,
          status: resp.status,
          statusText: resp.statusText,
          text,
          errorDetail: ''
        };

        if (lastResult.ok) {
          return lastResult;
        }

        // 提取服务端详细报错原因（常见于 JSON、XML 或 HTML title）
        if (text) {
          try {
            const parsed = JSON.parse(text);
            if (parsed.message || parsed.error) {
              lastResult.errorDetail = parsed.message || parsed.error;
            }
          } catch {}
          if (!lastResult.errorDetail) {
            const match = text.match(/<(?:[^:>]+:)?message[^>]*>(.*?)<\/(?:[^:>]+:)?message>/i) ||
                          text.match(/<(?:[^:>]+:)?error[^>]*>(.*?)<\/(?:[^:>]+:)?error>/i) ||
                          text.match(/<title[^>]*>(.*?)<\/title>/i);
            if (match && match[1]) {
              const cleaned = match[1].replace(/<[^>]+>/g, '').trim();
              if (cleaned && cleaned.length < 150) {
                lastResult.errorDetail = cleaned;
              }
            }
          }
        }

        // 明确的身份验证错误（401/403）无需再尝试其他报文格式
        if (resp.status === 401 || resp.status === 403) {
          return lastResult;
        }
      } catch (err: any) {
        lastResult = {
          ok: false,
          status: 0,
          statusText: err.message || 'Fetch failed',
          text: '',
          errorDetail: err.message
        };
      }
    }

    return lastResult;
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
