import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { createServer as createViteServer } from 'vite';

import { MiotConfig } from './src/types.js';
import {
  loadJson,
  saveJson,
  flushAllPendingWritesSync,
  configureStoragePaths
} from './server/storage/jsonStorage.js';
import { initSqliteDatabase } from './server/storage/sqliteInit.js';
import {
  getClientIp,
  isPrivateOrLocalIp,
  isAuthRequiredForRequest,
  checkLoginRateLimit,
  recordLoginAttempt,
  generateStreamToken,
  verifyStreamToken,
  isSafeRemoteStreamUrl,
  createCsrfMiddleware,
  createAuthMiddleware,
  SecuritySettings
} from './server/core/security.js';
import { ensureSampleTracksSeeded } from './server/core/sampleTracks.js';
import {
  restoreSessionAndDevicesOnStartup,
  bindVoiceCommandCallbacks
} from './server/core/bootstrap.js';

import {
  FfmpegTranscoder,
  MusicEngine,
  PlaylistEngine,
  DeviceManager,
  StreamServer,
  XiaomiAdapter,
  AdaptiveHeartbeatEngine,
  queueEngine,
  musicRepository,
  deviceRepository,
  interactionRepository,
  scheduledTaskRepository,
  speakerGroupRepository,
  smartPlaylistRepository,
  deviceCustomizationRepository,
  fingerprintCacheRepository,
  playbackCheckpointRepository,
  resumePointRepository,
  deviceStrategyRepository,
  taskSchedulerEngine,
  appEventBus,
  lyricsService,
  transcodeSemaphorePool,
  castPipelineManager,
  castLogs,
  getLocalNetworkIps,
  sendMiioCommand,
  dispatchCastSongDirectly,
  callMinaCloudApi
} from './server/index.js';

import { DynamicPlaylistEngine } from './server/core/dynamicPlaylistEngine.js';
import { ttsEngine } from './server/ttsEngine.js';
import { createAuthRouter, createSecurityRouter } from './server/routes/authRoutes.js';
import { createDbRouter } from './server/routes/dbRoutes.js';
import { createTtsRouter } from './server/routes/ttsRoutes.js';
import { createSongsRouter, createPlaylistsRouter } from './server/routes/musicRoutes.js';
import { createMiotRouter } from './server/routes/miotRoutes.js';
import { createQueueRouter } from './server/routes/queueRoutes.js';
import { createSubsonicRouter } from './server/routes/subsonicRoutes.js';
import { createSystemRouter } from './server/routes/systemRoutes.js';
import { createNavidromeRouter } from './server/routes/navidromeRoutes.js';
import { createStreamRouter } from './server/routes/streamRoutes.js';
import { createTaskRouter } from './server/routes/taskRoutes.js';
import { createGroupRouter } from './server/routes/groupRoutes.js';
import { createRadioRouter } from './server/routes/radioRoutes.js';
import { createAutomationRouter } from './server/routes/automationRoutes.js';
import { createSystemBackupRouter } from './server/routes/systemBackupRoutes.js';
import { automationService } from './server/services/automationService.js';

const app = express();
const PORT = 3000;
const SERVER_START_TIME = Date.now();
const API_KEY = process.env.API_KEY || '';

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(createCsrfMiddleware());

// Storage & Working Directories
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const MUSIC_DIR = process.env.MUSIC_DIR || path.join(process.cwd(), 'music');
const TRANSCODE_CACHE_DIR = path.join(DATA_DIR, 'transcode_cache');
const SONGS_FILE = path.join(DATA_DIR, 'songs.json');
const PLAYLISTS_FILE = path.join(DATA_DIR, 'playlists.json');
const DEVICES_FILE = path.join(DATA_DIR, 'devices.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const QUEUE_FILE = path.join(DATA_DIR, 'queue.json');
const NAVIDROME_FILE = path.join(DATA_DIR, 'navidrome.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const DB_CONFIG_FILE = path.join(DATA_DIR, 'db_config.json');
const SECURITY_FILE = path.join(DATA_DIR, 'security.json');
const SQLITE_FILE = path.join(DATA_DIR, 'tinglan.sqlite');

for (const dir of [DATA_DIR, MUSIC_DIR, TRANSCODE_CACHE_DIR]) {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      console.error(`Failed to create dir: ${dir}`, err);
    }
  }
}

configureStoragePaths({
  DATA_DIR,
  MUSIC_DIR,
  CONFIG_FILE,
  DEVICES_FILE,
  NAVIDROME_FILE,
  DB_CONFIG_FILE
});

// ---------------- 6-MODULE ARCHITECTURE CORE INSTANCES ----------------
export const ffmpegTranscoder = new FfmpegTranscoder(TRANSCODE_CACHE_DIR, undefined, DATA_DIR);
export const musicEngine = new MusicEngine(MUSIC_DIR, DATA_DIR, ffmpegTranscoder);
export const playlistEngine = new PlaylistEngine(DATA_DIR);
export const deviceManager = new DeviceManager(DATA_DIR);
export const streamServer = new StreamServer(MUSIC_DIR, musicEngine, ffmpegTranscoder, deviceManager, PORT);
export const xiaomiAdapter = new XiaomiAdapter(deviceManager);
export const adaptiveHeartbeatEngine = new AdaptiveHeartbeatEngine(deviceManager);
export const dynamicPlaylistEngine = new DynamicPlaylistEngine(DATA_DIR);
const audioTranscoder = ffmpegTranscoder;

// Seed sample harmonic tracks in background
ensureSampleTracksSeeded(MUSIC_DIR);

// Cryptographically secure, persistent JWT secret
const JWT_SECRET_FILE = path.join(DATA_DIR, '.jwt_secret');
let JWT_SECRET = process.env.JWT_SECRET || '';
if (!JWT_SECRET) {
  if (fs.existsSync(JWT_SECRET_FILE)) {
    try {
      JWT_SECRET = fs.readFileSync(JWT_SECRET_FILE, 'utf-8').trim();
    } catch {}
  }
  if (!JWT_SECRET || JWT_SECRET.length < 16) {
    JWT_SECRET = crypto.randomBytes(32).toString('hex');
    try {
      fs.writeFileSync(JWT_SECRET_FILE, JWT_SECRET, { encoding: 'utf-8', mode: 0o600 });
      console.log(`🔒 [Security] Generated fresh unique JWT_SECRET saved to ${JWT_SECRET_FILE}`);
    } catch (e) {
      console.warn('⚠️ [Security] Could not persist JWT_SECRET to disk, using in-memory secret.', e);
    }
  }
}

// User accounts & authentication
const DEFAULT_REGULAR_USER_AVATAR = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80';
const DEFAULT_ADMIN_USER_AVATAR = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80';
const USER_AVATAR_PRESETS = [
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=300&q=80'
];

function getDefaultUserAvatar(role: string = 'user', username: string = 'user'): string {
  if (role === 'admin' || username === 'admin') return DEFAULT_ADMIN_USER_AVATAR;
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash = username.charCodeAt(i) + ((hash << 5) - hash);
  return USER_AVATAR_PRESETS[Math.abs(hash) % USER_AVATAR_PRESETS.length];
}

const defaultAdminUser = {
  id: 'usr-admin-001',
  username: 'admin',
  email: 'admin@tinglan.audio',
  passwordHash: bcrypt.hashSync('admin123', 10),
  role: 'admin',
  avatarUrl: DEFAULT_ADMIN_USER_AVATAR,
  createdAt: new Date().toISOString()
};

let storedUsers: any[] = loadJson(USERS_FILE, [defaultAdminUser]);
if (!storedUsers.some(u => u.username === 'admin')) {
  storedUsers.unshift(defaultAdminUser);
}
storedUsers.forEach(u => {
  if (!u.avatarUrl) u.avatarUrl = getDefaultUserAvatar(u.role, u.username);
});
saveJson(USERS_FILE, storedUsers);

// Database configuration
let activeDbConfig = loadJson(DB_CONFIG_FILE, {
  engine: 'sqlite',
  postgresConfig: { host: 'localhost', port: 5432, user: 'postgres', password: '', database: 'tinglan_db' },
  mysqlConfig: { host: 'localhost', port: 3306, user: 'root', password: '', database: 'tinglan_db' }
});
const sqliteDb = initSqliteDatabase(SQLITE_FILE, defaultAdminUser);
if (sqliteDb) {
  musicRepository.setSqliteDb(sqliteDb);
  interactionRepository.setSqliteDb(sqliteDb);
  scheduledTaskRepository.setSqliteDb(sqliteDb);
  speakerGroupRepository.setSqliteDb(sqliteDb);
  smartPlaylistRepository.setSqliteDb(sqliteDb);
  deviceCustomizationRepository.setSqliteDb(sqliteDb);
  fingerprintCacheRepository.setSqliteDb(sqliteDb);
  playbackCheckpointRepository.setSqliteDb(sqliteDb);
  resumePointRepository.setSqliteDb(sqliteDb);
  deviceStrategyRepository.setSqliteDb(sqliteDb);
}

// ---------------- TASK SCHEDULER ENGINE SETUP (P0) ----------------
taskSchedulerEngine.setHandlers({
  pauseDevice: async (did: string) => {
    const dev = deviceRepository.getDeviceByDid(did) || deviceRepository.getAllDevices().find(d => (d as any).deviceID === did);
    if (!dev) return;
    try {
      await xiaomiAdapter.setPlaybackOperation(
        dev,
        'pause',
        (path, method, msg, tDid, retry) => callMinaCloudApi(path, method, msg, tDid, retry, miotConfig, (cfg) => saveJson(CONFIG_FILE, cfg)),
        (ip, token, method, params, timeoutMs) => sendMiioCommand(ip, token, method, params, timeoutMs || 2500),
        miotConfig
      );
    } catch (err: any) {
      console.warn('[TaskScheduler] Pause device error:', err.message);
    }
  },
  playSongOnDevice: async (did: string, songId: string) => {
    const song = musicRepository.getSongById(songId);
    if (!song) return false;
    const res = await dispatchCastSongDirectly({
      song,
      targetDid: did,
      miotConfig,
      saveMiotConfigFn: (cfg) => saveJson(CONFIG_FILE, cfg),
      serverPort: PORT,
      jwtSecret: JWT_SECRET,
      activeStreamIps
    });
    return res.success;
  },
  playPlaylistOnDevice: async (did: string, playlistId: string) => {
    const pl = musicRepository.getAllPlaylists().find(p => p.id === playlistId);
    if (!pl || !pl.songIds || pl.songIds.length === 0) return false;
    const firstSong = musicRepository.getSongById(pl.songIds[0]);
    if (!firstSong) return false;
    const res = await dispatchCastSongDirectly({
      song: firstSong,
      targetDid: did,
      miotConfig,
      saveMiotConfigFn: (cfg) => saveJson(CONFIG_FILE, cfg),
      serverPort: PORT,
      jwtSecret: JWT_SECRET,
      activeStreamIps
    });
    return res.success;
  },
  setVolumeOnDevice: async (did: string, volume: number) => {
    const dev = deviceRepository.getDeviceByDid(did);
    if (!dev) return false;
    const res = await xiaomiAdapter.setVolume(
      dev,
      volume,
      (path, method, msg, tDid, retry) => callMinaCloudApi(path, method, msg, tDid, retry, miotConfig, (cfg) => saveJson(CONFIG_FILE, cfg)),
      sendMiioCommand,
      miotConfig
    );
    return res.success;
  },
  speakTtsOnDevice: async (did: string, text: string) => {
    const dev = deviceRepository.getDeviceByDid(did);
    if (!dev) return false;
    const res = await ttsEngine.dispatchToSpeaker({
      targetDevice: dev,
      text,
      miotConfig,
      sendMiioCommandFn: sendMiioCommand,
      callMinaCloudApiFn: (path, method, msg, tDid, retry) => callMinaCloudApi(path, method, msg, tDid, retry, miotConfig, (cfg) => saveJson(CONFIG_FILE, cfg))
    });
    return res.success;
  }
});
taskSchedulerEngine.start();
taskSchedulerEngine.on('taskExecuted', (task) => {
  appEventBus.broadcast('task:executed', task);
});

adaptiveHeartbeatEngine.setRpcHandlers(
  (path, method, msg, tDid) => callMinaCloudApi(path, method, msg, tDid, 0, miotConfig, (cfg) => saveJson(CONFIG_FILE, cfg)),
  (ip, token, method, params, timeoutMs) => sendMiioCommand(ip, token, method, params, timeoutMs)
);
adaptiveHeartbeatEngine.onStateSync((did, status) => {
  appEventBus.broadcast('device:status', { did, ...status });
});
adaptiveHeartbeatEngine.start();

// Security Settings
const defaultSecuritySettings: SecuritySettings = {
  requireAuth: process.env.REQUIRE_AUTH !== 'false',
  authScope: 'all',
  allowRegistration: true,
  allowUserMiotControl: true,
  allowUserMiotTts: false,
  updatedAt: new Date().toISOString()
};
let securitySettings: SecuritySettings = loadJson(SECURITY_FILE, defaultSecuritySettings);
if (typeof securitySettings.requireAuth !== 'boolean') securitySettings.requireAuth = process.env.REQUIRE_AUTH !== 'false';
if (!securitySettings.authScope) securitySettings.authScope = 'all';
if (typeof securitySettings.allowRegistration !== 'boolean') securitySettings.allowRegistration = true;
if (typeof securitySettings.allowUserMiotControl !== 'boolean') securitySettings.allowUserMiotControl = true;
if (typeof securitySettings.allowUserMiotTts !== 'boolean') securitySettings.allowUserMiotTts = false;
saveJson(SECURITY_FILE, securitySettings, true);

// Auth middleware for API routes
app.use('/api', createAuthMiddleware({
  getSecuritySettings: () => securitySettings,
  jwtSecret: JWT_SECRET,
  apiKey: API_KEY
}));

// Flush writes on shutdown
process.on('beforeExit', flushAllPendingWritesSync);
process.on('SIGINT', () => {
  flushAllPendingWritesSync();
  process.exit(0);
});
process.on('SIGTERM', () => {
  flushAllPendingWritesSync();
  process.exit(0);
});

// Navidrome remote integration state & helpers
let navidromeConfig = loadJson(NAVIDROME_FILE, {
  serverUrl: '',
  username: '',
  password: '',
  isConnected: false,
  apiVersion: '1.16.1',
  serverVersion: ''
});
if (navidromeConfig.password === '••••••••' || navidromeConfig.password === '********') {
  navidromeConfig.password = '';
  navidromeConfig.isConnected = false;
}

function getSubsonicAuthQuery(user: string, pass: string, apiVer?: string): string {
  const salt = crypto.randomBytes(6).toString('hex');
  const token = crypto.createHash('md5').update(pass + salt).digest('hex');
  const ver = apiVer || navidromeConfig.apiVersion || '1.16.1';
  return `u=${encodeURIComponent(user)}&t=${token}&s=${salt}&v=${encodeURIComponent(ver)}&c=TingLanMusic&f=json`;
}

function getSubsonicPassAuthQuery(user: string, pass: string, apiVer?: string): string {
  const ver = apiVer || navidromeConfig.apiVersion || '1.16.1';
  return `u=${encodeURIComponent(user)}&p=${encodeURIComponent(pass)}&v=${encodeURIComponent(ver)}&c=TingLanMusic&f=json`;
}

function refreshNavidromeSongCredentials(): { songsUpdated: number; playlistsUpdated: number } {
  if (!navidromeConfig.serverUrl || !navidromeConfig.username) {
    return { songsUpdated: 0, playlistsUpdated: 0 };
  }
  const srvUrl = String(navidromeConfig.serverUrl || '').trim().replace(/\/+$/, '');
  const passQuery = getSubsonicPassAuthQuery(navidromeConfig.username, navidromeConfig.password);
  let songsUpdated = 0;

  for (const song of musicRepository.getAllSongs()) {
    const isNavi = (song.id && String(song.id).startsWith('navidrome-')) ||
                   (song.url && (/rest\/stream/i.test(song.url) || /rest\/stream\.view/i.test(song.url)));
    if (isNavi) {
      let rawId = '';
      if (song.id && String(song.id).startsWith('navidrome-')) {
        rawId = String(song.id).replace(/^navidrome-/, '');
      } else if (song.url) {
        const m = song.url.match(/[?&]id=([^&]+)/);
        if (m) rawId = decodeURIComponent(m[1]);
      }
      if (rawId) {
        song.url = `${srvUrl}/rest/stream?id=${encodeURIComponent(rawId)}&${passQuery}`;
        if (song.coverUrl && (/rest\/getCoverArt/i.test(song.coverUrl) || song.coverUrl.includes(':4533') || song.coverUrl.includes(srvUrl))) {
          let coverId = rawId;
          const cm = song.coverUrl.match(/[?&]id=([^&]+)/);
          if (cm) coverId = decodeURIComponent(cm[1]);
          song.coverUrl = `${srvUrl}/rest/getCoverArt?id=${encodeURIComponent(coverId)}&${passQuery}`;
        }
        songsUpdated++;
      }
    }
  }

  if (songsUpdated > 0) {
    musicRepository.schedulePersistSongs(100);
    console.log(`[Navidrome] 🔄 已自动使用最新凭据更新 ${songsUpdated} 首历史导入歌曲的拉流与封面鉴权`);
  }

  let playlistsUpdated = 0;
  for (const pl of musicRepository.getAllPlaylists()) {
    const isNaviPl = (pl.id && String(pl.id).startsWith('navidrome-pl-')) ||
                     (pl.coverUrl && (/rest\/getCoverArt/i.test(pl.coverUrl) || pl.coverUrl.includes(':4533') || pl.coverUrl.includes(srvUrl)));
    if (isNaviPl) {
      let coverId = '';
      if (pl.coverUrl) {
        const cm = pl.coverUrl.match(/[?&]id=([^&]+)/);
        if (cm) coverId = decodeURIComponent(cm[1]);
      }
      if (!coverId && pl.id && String(pl.id).startsWith('navidrome-pl-')) {
        coverId = String(pl.id).replace(/^navidrome-pl-/, '');
      }
      if (coverId) {
        pl.coverUrl = `${srvUrl}/rest/getCoverArt?id=${encodeURIComponent(coverId)}&${passQuery}`;
        playlistsUpdated++;
      }
    }
  }

  if (playlistsUpdated > 0) {
    musicRepository.schedulePersistPlaylists(100);
    console.log(`[Navidrome] 🔄 已自动使用最新凭据更新 ${playlistsUpdated} 个歌单封面鉴权`);
  }

  return { songsUpdated, playlistsUpdated };
}

if (navidromeConfig.serverUrl && navidromeConfig.username && navidromeConfig.password) {
  try {
    refreshNavidromeSongCredentials();
  } catch (err) {
    console.warn('[Navidrome] Initial credential refresh warning:', err);
  }
}

// MIoT Device & Config State
const DEFAULT_CONFIG: MiotConfig = {
  miUser: process.env.MI_USER || '',
  isLoggedIn: !!process.env.MI_USER,
  serverHost: process.env.SERVER_HOST || '',
  activeDeviceId: '',
  autoCast: true,
  ttsAnnouncement: false,
  ttsPrefix: '正在为您播放',
  volumeSync: true,
  userId: '',
  serviceToken: '',
  micoServiceToken: '',
  miotServiceToken: '',
  isMicoValid: false,
  bindMode: 'account',
  castMode: 'auto'
};

let miotConfig = loadJson(CONFIG_FILE, DEFAULT_CONFIG);
if ((miotConfig as any).enableReplayGain) {
  streamServer.setLoudnessConfig(true, (miotConfig as any).targetLufs || -16);
}

// Canonical Single Source of Truth delegating to repositories
export const getStoredSongs = () => musicRepository.getAllSongs();
export const setStoredSongs = (newSongs: any[]) => musicRepository.setSongs(newSongs);
export const getStoredPlaylists = () => musicRepository.getAllPlaylists();
export const setStoredPlaylists = (newPlaylists: any[]) => musicRepository.setPlaylists(newPlaylists);
export const getStoredDevices = () => deviceRepository.getAllDevices();
export const setStoredDevices = (newDevices: any[]) => deviceRepository.setDevices(newDevices);
export function syncSongs(newSongs?: any[]) { if (newSongs) musicRepository.setSongs(newSongs); }
export function syncPlaylists(newPlaylists?: any[]) { if (newPlaylists) musicRepository.setPlaylists(newPlaylists); }
export function syncDevices(newDevices?: any[]) { if (newDevices) deviceRepository.setDevices(newDevices); }

// ---------------- MOUNT DOMAIN ROUTERS ----------------

// 1. Auth & Security
app.use('/api/auth', createAuthRouter({
  getSecuritySettings: () => {
    securitySettings = loadJson(SECURITY_FILE, securitySettings);
    return securitySettings;
  },
  setSecuritySettings: (settings) => {
    securitySettings = settings;
    saveJson(SECURITY_FILE, securitySettings, true);
  },
  getStoredUsers: () => {
    storedUsers = loadJson(USERS_FILE, storedUsers);
    return storedUsers;
  },
  setStoredUsers: (users) => {
    storedUsers = users;
    saveJson(USERS_FILE, storedUsers);
  },
  getClientIp,
  isPrivateOrLocalIp,
  isAuthRequiredForRequest: (req) => isAuthRequiredForRequest(req, () => securitySettings),
  checkLoginRateLimit,
  recordLoginAttempt,
  getDefaultUserAvatar,
  jwtSecret: JWT_SECRET,
  sqliteDb
}));

app.use('/api/system', createSecurityRouter({
  getSecuritySettings: () => {
    securitySettings = loadJson(SECURITY_FILE, securitySettings);
    return securitySettings;
  },
  setSecuritySettings: (settings) => {
    securitySettings = settings;
    saveJson(SECURITY_FILE, securitySettings, true);
  },
  getStoredUsers: () => {
    storedUsers = loadJson(USERS_FILE, storedUsers);
    return storedUsers;
  },
  getClientIp,
  isPrivateOrLocalIp,
  isAuthRequiredForRequest: (req) => isAuthRequiredForRequest(req, () => securitySettings)
}));

// 2. Database
app.use('/api/db', createDbRouter({
  getActiveDbConfig: () => activeDbConfig,
  setActiveDbConfig: (config) => {
    activeDbConfig = config;
    saveJson(DB_CONFIG_FILE, activeDbConfig);
  },
  getStoredUsers: () => {
    storedUsers = loadJson(USERS_FILE, storedUsers);
    return storedUsers;
  },
  getStoredSongs: () => musicRepository.getAllSongs(),
  getStoredPlaylists: () => musicRepository.getAllPlaylists(),
  sqliteDb
}));

// 3. Audio Streaming & Media
const {
  router: streamRouter,
  streamAudioHandler,
  waitForStreamConsumption,
  notifyStreamConsumed,
  activeStreamIps,
  recentStreamEvents
} = createStreamRouter({
  musicDir: MUSIC_DIR,
  dataDir: DATA_DIR,
  port: PORT,
  audioTranscoder,
  streamServer,
  getStoredSongs: () => musicRepository.getAllSongs(),
  getNavidromeConfig: () => navidromeConfig,
  getXiaomiDevices: () => deviceRepository.getAllDevices(),
  getMiotConfig: () => miotConfig,
  saveMiotConfig: (cfg) => {
    miotConfig = cfg;
    saveJson(CONFIG_FILE, miotConfig);
  },
  verifyStreamToken: (songId, token) => verifyStreamToken(songId, token, JWT_SECRET),
  isSafeRemoteStreamUrl: (url) => isSafeRemoteStreamUrl(url, navidromeConfig.serverUrl),
  getSubsonicAuthQuery,
  getSubsonicPassAuthQuery,
  logCastAction: (log) => {
    castLogs.unshift(log);
    if (castLogs.length > 50) castLogs.pop();
    interactionRepository.logCastAudit({
      id: log.id,
      timestamp: log.timestamp || new Date().toLocaleTimeString(),
      logType: log.type || 'cast',
      songTitle: log.message,
      status: log.success ? 'success' : 'failed',
      detail: log.detail
    });
  }
});
app.use(streamRouter);

// 4. TTS Engine & Radio & Phase 3 Automation & System Backup
app.use('/api/tts', createTtsRouter());
app.use('/api/radio', createRadioRouter({
  getMiotConfig: () => miotConfig,
  setMiotConfig: (cfg) => {
    miotConfig = cfg;
    saveJson(CONFIG_FILE, miotConfig);
  }
}));
app.use('/api/automation', createAutomationRouter());
app.use('/api/system/cluster-backup', createSystemBackupRouter());

// Register Phase 3 Automation Scene Action Handler
automationService.registerActionHandler(async (scene) => {
  const devices = deviceRepository.getAllDevices();
  if (devices.length === 0) {
    return { success: false, message: '未找到绑定的音箱设备' };
  }

  const targetDevices = scene.targetType === 'single_device' && scene.targetId
    ? devices.filter((d: any) => d.did === scene.targetId)
    : devices;

  if (targetDevices.length === 0) {
    return { success: false, message: '未找到目标音箱设备' };
  }

  const callCloudApi = (path: string, method: string, msg: any, tDid?: string, retry?: number) =>
    callMinaCloudApi(path, method, msg, tDid, retry, miotConfig, (cfg) => {
      miotConfig = cfg;
      saveJson(CONFIG_FILE, miotConfig);
    });

  const sendLocalCommand = (ip: string, token: string, method: string, params: any, timeoutMs?: number) =>
    sendMiioCommand(ip, token, method, params, timeoutMs || 2500);

  // Action: TTS Announce
  if (scene.actionType === 'tts_announce' && scene.payload.ttsText) {
    for (const dev of targetDevices) {
      try {
        if (scene.payload.volume !== undefined) {
          await xiaomiAdapter.setVolume(dev, scene.payload.volume, callCloudApi, sendLocalCommand, miotConfig);
        }
        await callCloudApi('text_to_speech', 'text_to_speech', { text: scene.payload.ttsText }, dev.did);
      } catch (e) {}
    }
    return { success: true, message: `已向 ${targetDevices.length} 台音箱下发语音播报「${scene.payload.ttsText}」` };
  }

  // Action: Play Radio Stream
  if (scene.actionType === 'play_radio' && scene.payload.radioUrl) {
    let successCount = 0;
    for (const dev of targetDevices) {
      try {
        if (scene.payload.volume !== undefined) {
          await xiaomiAdapter.setVolume(dev, scene.payload.volume, callCloudApi, sendLocalCommand, miotConfig);
        }
        const castRes = await xiaomiAdapter.playUrl(
          dev,
          scene.payload.radioUrl,
          scene.payload.radioTitle || scene.name,
          callCloudApi,
          sendLocalCommand,
          miotConfig,
          { songArtist: '定时早安电台', duration: 0 }
        );
        if (castRes.success) successCount++;
      } catch (e) {}
    }
    return { success: true, message: `已成功向 ${successCount}/${targetDevices.length} 台音箱推送电台广播流` };
  }

  // Action: Stop Playback
  if (scene.actionType === 'stop_playback') {
    for (const dev of targetDevices) {
      try {
        await xiaomiAdapter.setPlaybackOperation(dev, 'pause', callCloudApi, sendLocalCommand, miotConfig);
      } catch (e) {}
    }
    return { success: true, message: `已暂停 ${targetDevices.length} 台音箱播放` };
  }

  return { success: true, message: `定时自动化指令已执行: ${scene.actionType}` };
});

// 5. Songs & Playlists
app.use('/api/songs', createSongsRouter({
  getSongs: () => musicRepository.getAllSongs(),
  setSongs: (newSongs) => musicRepository.setSongs(newSongs),
  getPlaylists: () => musicRepository.getAllPlaylists(),
  setPlaylists: (newPlaylists) => musicRepository.setPlaylists(newPlaylists),
  musicDir: MUSIC_DIR,
  dynamicPlaylistEngine,
  hasAdminAccount: () => storedUsers.some(u => u.role === 'admin'),
  audioTranscoder,
  logCastAction: (log) => {
    castLogs.unshift(log);
    if (castLogs.length > 50) castLogs.pop();
    interactionRepository.logCastAudit({
      id: log.id,
      timestamp: log.timestamp || new Date().toLocaleTimeString(),
      logType: log.type || 'cast',
      songTitle: log.message,
      status: log.success ? 'success' : 'failed',
      detail: log.detail
    });
  }
}));

app.use('/api/playlists', createPlaylistsRouter({
  getPlaylists: () => musicRepository.getAllPlaylists(),
  setPlaylists: (newPlaylists) => musicRepository.setPlaylists(newPlaylists),
  getSongs: () => musicRepository.getAllSongs(),
  dynamicPlaylistEngine
}));

// 6. MIoT & Xiaomi Speaker
app.use('/api/miot', createMiotRouter({
  getMiotConfig: () => miotConfig,
  setMiotConfig: (cfg) => {
    miotConfig = cfg;
    saveJson(CONFIG_FILE, miotConfig);
  },
  getSecuritySettings: () => securitySettings,
  isAuthRequiredForRequest: (req) => isAuthRequiredForRequest(req, () => securitySettings),
  serverPort: PORT,
  jwtSecret: JWT_SECRET,
  musicDir: MUSIC_DIR,
  activeStreamIps,
  recentStreamEvents
}));

// P0: Scheduled Tasks API
app.use('/api/tasks', createTaskRouter());

// P1: Speaker Groups & Multi-room Zone API
const groupRouter = createGroupRouter({
  callMinaCloudApi,
  sendMiioCommand,
  getMiotConfig: () => miotConfig,
  saveMiotConfig: (cfg) => {
    miotConfig = cfg;
    saveJson(CONFIG_FILE, miotConfig);
  },
  dispatchCastSongDirectly: (args: any) => dispatchCastSongDirectly({
    ...args,
    serverPort: PORT,
    jwtSecret: JWT_SECRET,
    activeStreamIps
  })
});
app.use('/api/groups', groupRouter);
app.use('/api/miot/groups', groupRouter);

// 7. Queue Engine Dispatchers & Persistence
queueEngine.setCastDispatcher(async (song: any, targetDid: string, seekSeconds?: number) => {
  return dispatchCastSongDirectly({
    song,
    targetDid,
    seekSeconds,
    miotConfig,
    saveMiotConfigFn: (cfg) => saveJson(CONFIG_FILE, cfg),
    serverPort: PORT,
    jwtSecret: JWT_SECRET,
    activeStreamIps
  });
});
queueEngine.setSongProvider(() => musicRepository.getAllSongs() as any);

queueEngine.setPauseDispatcher(async (did: string) => {
  const dev = deviceRepository.getDeviceByDid(did) || deviceRepository.getAllDevices().find(d => (d as any).deviceID === did);
  if (!dev) return;
  try {
    await xiaomiAdapter.setPlaybackOperation(
      dev,
      'pause',
      (path, method, msg, tDid, retry) => callMinaCloudApi(path, method, msg, tDid, retry, miotConfig, (cfg) => saveJson(CONFIG_FILE, cfg)),
      (ip, token, method, params, timeoutMs) => sendMiioCommand(ip, token, method, params, timeoutMs || 2500),
      miotConfig
    );
  } catch (err: any) {
    console.warn('[QueueEngine] Handover pause old speaker error:', err.message);
  }
});

queueEngine.setPreheatHandler(async (nextSong, targetDid, isDeep) => {
  if (!nextSong) return;
  try {
    const rawId = (nextSong.id || '').toString();
    const cleanSongId = rawId.replace(/\.(mp3|wav|flac|m4a|aac|ogg|opus|ape)$/i, '');
    const found = musicRepository.getSongById(cleanSongId) || musicRepository.getSongById(rawId);
    let resolvedFilePath = found?.localFilename || '';
    if (!resolvedFilePath) {
      for (const ext of ['.flac', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.ape']) {
        const candidate = path.join(MUSIC_DIR, `${cleanSongId}${ext}`);
        if (fs.existsSync(candidate)) {
          resolvedFilePath = candidate;
          break;
        }
      }
    }
    if (resolvedFilePath && fs.existsSync(resolvedFilePath)) {
      const targetDev = deviceRepository.getDeviceByDid(targetDid);
      console.log(`[QueueEngine] ⚡ 双阶段预热 ${isDeep ? 'Stage 2 (全量转码)' : 'Stage 1 (轻量预备)'} 《${nextSong.title}》`);
      await audioTranscoder.preheatSongAsync(resolvedFilePath, cleanSongId, {
        deviceModel: targetDev?.model,
        cueStartSeconds: (nextSong as any).cueTrack?.startSeconds,
        cueDurationSeconds: (nextSong as any).cueTrack?.durationSeconds,
        replayGainDb: (nextSong as any).replayGain?.trackGainDb,
        normalizeLoudness: Boolean((miotConfig as any).normalizeLoudness ?? true),
        targetLufs: Number((miotConfig as any).targetLufs ?? -14)
      });
    }
  } catch (err: any) {
    console.warn('[QueueEngine] Background preheat error:', err?.message);
  }
});

try {
  const savedQueue = loadJson<any>(QUEUE_FILE, null);
  if (savedQueue && Array.isArray(savedQueue.queue) && savedQueue.queue.length > 0) {
    queueEngine.restoreState(savedQueue);
    console.log(`[QueueEngine] 🔄 成功从 ${QUEUE_FILE} 恢复上次播放队列 (${savedQueue.queue.length} 首)`);
  }
} catch (err) {
  console.warn('[QueueEngine] 恢复 queue.json 失败:', err);
}

appEventBus.setQueueEngineProvider(() => queueEngine);

queueEngine.on('change', (status) => {
  try {
    saveJson(QUEUE_FILE, {
      queue: status.queue,
      currentIndex: status.currentIndex,
      loopMode: status.loopMode,
      targetDid: status.targetDid,
      targetDeviceName: status.targetDeviceName,
      updatedAt: new Date().toISOString()
    });
  } catch {}
  appEventBus.broadcast('queue:change', status);
  appEventBus.checkPlaybackTickLoop();
});

// Real-time Unified Server-Sent Events (SSE) Hub
app.get('/api/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders?.();

  const clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const clientIp = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.socket.remoteAddress || '127.0.0.1';

  appEventBus.registerClient(clientId, res, clientIp);
  req.on('close', () => appEventBus.removeClient(clientId));
});

// 8. Queue API
app.use('/api/queue', createQueueRouter({
  getTargetDevice: (did) => {
    const targetDid = did || miotConfig.activeDeviceId || (deviceRepository.getAllDevices()[0] ? deviceRepository.getAllDevices()[0].did : '');
    return deviceRepository.getDeviceByDid(targetDid) || deviceRepository.getAllDevices().find(d => (d as any).deviceID === targetDid) || deviceRepository.getAllDevices()[0];
  },
  getAllDevices: () => deviceRepository.getAllDevices()
}));

// 9. Subsonic API
app.use('/rest', createSubsonicRouter({
  getStoredSongs: () => musicRepository.getAllSongs(),
  getStoredPlaylists: () => musicRepository.getAllPlaylists(),
  getStoredUsers: () => {
    storedUsers = loadJson(USERS_FILE, storedUsers);
    return storedUsers;
  },
  saveStoredSongs: (songs) => musicRepository.setSongs(songs),
  streamHandler: streamAudioHandler,
  lyricsService,
  getClientIp
}));

app.get('/api/subsonic/info', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    version: '1.16.1',
    server: 'TingLan-Music',
    subsonicUrl: '/rest',
    endpoints: [
      '/rest/ping',
      '/rest/getMusicFolders',
      '/rest/getIndexes',
      '/rest/search3',
      '/rest/getPlaylists',
      '/rest/getLyrics',
      '/rest/stream?id=<songId>'
    ]
  });
});

// 10. System, Health & AI Diagnosis
app.use('/api', createSystemRouter({
  musicDir: MUSIC_DIR,
  dataDir: DATA_DIR,
  serverStartTime: SERVER_START_TIME,
  getStoredSongs: () => musicRepository.getAllSongs(),
  saveStoredSongs: (songs) => musicRepository.setSongs(songs),
  lyricsService,
  queueEngine,
  xiaomiDevices: () => deviceRepository.getAllDevices(),
  audioTranscoder,
  transcodeSemaphorePool,
  getMiotConfig: () => miotConfig,
  castPipelineManager
}));

// 11. Navidrome / Subsonic Remote Sync
app.use('/api/navidrome', createNavidromeRouter({
  getNavidromeConfig: () => navidromeConfig,
  setNavidromeConfig: (cfg) => {
    navidromeConfig = cfg;
    saveJson(NAVIDROME_FILE, navidromeConfig);
  },
  refreshNavidromeSongCredentials,
  getSubsonicAuthQuery,
  getSubsonicPassAuthQuery,
  getStoredSongs: () => musicRepository.getAllSongs(),
  setStoredSongs: (songs) => musicRepository.setSongs(songs),
  getStoredPlaylists: () => musicRepository.getAllPlaylists(),
  setStoredPlaylists: (pls) => musicRepository.setPlaylists(pls)
}));

// Server bootstrap & entry point
async function startServer() {
  restoreSessionAndDevicesOnStartup({
    getMiotConfig: () => miotConfig,
    saveMiotConfig: (cfg) => saveJson(CONFIG_FILE, cfg),
    activeStreamIps,
    serverPort: PORT,
    jwtSecret: JWT_SECRET
  });

  bindVoiceCommandCallbacks({
    getMiotConfig: () => miotConfig,
    saveMiotConfig: (cfg) => saveJson(CONFIG_FILE, cfg),
    activeStreamIps,
    serverPort: PORT,
    jwtSecret: JWT_SECRET
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: ['**/data/**', '**/music/**', '**/dist/**']
        }
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TingLan Music Server running on http://0.0.0.0:${PORT}`);
    console.log(`Local network addresses: ${getLocalNetworkIps().map(ip => `http://${ip}:${PORT}`).join(', ')}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
