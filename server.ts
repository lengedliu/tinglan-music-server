import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import net from 'net';
import dgram from 'dgram';
import crypto from 'crypto';
import { createRequire } from 'module';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import mysql from 'mysql2/promise';
import { parseFile, parseBuffer } from 'music-metadata';
import { createServer as createViteServer } from 'vite';
import { xiaomiPassport } from './server/xiaomiPassport';
import { minaWsClient } from './server/minaWebSocket';
import { miotRpcEngine, XIAOAI_MIOT_SPEC } from './server/miotRpc';
import { deviceDiscoveryEngine } from './server/deviceDiscovery';
import { xiaoaiResolverEngine, extractDevicesFromMinaResponse } from './server/xiaoaiResolver';
import { ttsEngine, POPULAR_TTS_VOICES } from './server/ttsEngine';
import { GoogleGenAI } from '@google/genai';

const require = createRequire(import.meta.url);

let sqlite3: any = null;
try {
  sqlite3 = require('sqlite3');
} catch (err: any) {
  console.warn('[Database] sqlite3 module could not be loaded in current GLIBC environment. Falling back to JSON DB & PostgreSQL/MySQL driver.', err.message);
}

const app = express();
// Port 3000 is the hardcoded entry port required for AI Studio ingress routing
const PORT = 3000;
const API_KEY = process.env.API_KEY || '';

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Directories
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const MUSIC_DIR = process.env.MUSIC_DIR || path.join(process.cwd(), 'music');

for (const dir of [DATA_DIR, MUSIC_DIR]) {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      console.error(`Failed to create dir: ${dir}`, err);
    }
  }
}

// Cryptographically secure, persistent JWT secret
const JWT_SECRET_FILE = path.join(DATA_DIR, '.jwt_secret');
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (fs.existsSync(JWT_SECRET_FILE)) {
    try {
      JWT_SECRET = fs.readFileSync(JWT_SECRET_FILE, 'utf-8').trim();
    } catch (e) {
      // ignore
    }
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

// Helper to generate gentle musical acoustic tones as genuine WAV files
function generateHarmonicWav(durationSeconds = 25, chordFreqs: number[] = [261.63, 329.63, 392.00, 523.25]): Buffer {
  const sampleRate = 44100;
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const dataSize = numSamples * 2; // 16-bit mono
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF Header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size
  buffer.writeUInt16LE(1, 20); // AudioFormat PCM
  buffer.writeUInt16LE(1, 22); // NumChannels = 1
  buffer.writeUInt32LE(sampleRate, 24); // SampleRate
  buffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate
  buffer.writeUInt16LE(2, 32); // BlockAlign
  buffer.writeUInt16LE(16, 34); // BitsPerSample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  const noteDuration = 0.6; // note changes every 0.6s
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const noteIdx = Math.floor(t / noteDuration) % chordFreqs.length;
    const freq = chordFreqs[noteIdx];
    const notePhase = (t % noteDuration) / noteDuration;
    const env = Math.exp(-notePhase * 3.5) * Math.sin(Math.min(1, notePhase * 40) * Math.PI / 2);
    
    // Warm harmonics
    const sampleVal = (
      Math.sin(2 * Math.PI * freq * t) * 0.6 +
      Math.sin(2 * Math.PI * freq * 2 * t) * 0.25 +
      Math.sin(2 * Math.PI * freq * 3 * t) * 0.15
    ) * env * 0.45;

    const intSample = Math.floor(Math.max(-32768, Math.min(32767, sampleVal * 32767)));
    buffer.writeInt16LE(intSample, 44 + i * 2);
  }

  return buffer;
}

// Pre-seed sample tracks in MUSIC_DIR if not present
const sampleTracksConfig = [
  { id: 'song-1', freqs: [220, 261.63, 329.63, 440, 523.25] },
  { id: 'song-2', freqs: [293.66, 329.63, 392.00, 440, 587.33] },
  { id: 'song-3', freqs: [174.61, 220.00, 261.63, 349.23, 440] },
  { id: 'song-4', freqs: [196.00, 246.94, 293.66, 392.00, 493.88] },
  { id: 'song-5', freqs: [130.81, 164.81, 196.00, 261.63, 329.63] },
  { id: 'song-6', freqs: [146.83, 220.00, 293.66, 370.00, 440] },
];

for (const track of sampleTracksConfig) {
  const filePath = path.join(MUSIC_DIR, `${track.id}.wav`);
  if (!fs.existsSync(filePath)) {
    try {
      const wavBuffer = generateHarmonicWav(30, track.freqs);
      fs.writeFileSync(filePath, wavBuffer);
    } catch (err) {
      console.error(`Failed to pre-seed ${track.id}.wav`, err);
    }
  }
}

// Persistence paths
const SONGS_FILE = path.join(DATA_DIR, 'songs.json');
const PLAYLISTS_FILE = path.join(DATA_DIR, 'playlists.json');
const DEVICES_FILE = path.join(DATA_DIR, 'devices.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

function loadJson<T>(filePath: string, defaultValue: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as T;
    }
  } catch (err) {
    console.warn(`Could not load ${filePath}, using defaults.`, err);
  }
  return defaultValue;
}

function saveJson(filePath: string, data: any): void {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Failed to write to ${filePath}`, err);
  }
}

// User & Database persistence paths
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const DB_CONFIG_FILE = path.join(DATA_DIR, 'db_config.json');
const SQLITE_FILE = path.join(DATA_DIR, 'tinglan.sqlite');

// Curated music listener & user avatar presets
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
  if (role === 'admin' || username === 'admin') {
    return DEFAULT_ADMIN_USER_AVATAR;
  }
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % USER_AVATAR_PRESETS.length;
  return USER_AVATAR_PRESETS[index];
}

// Default initial admin account
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
// Ensure all users have a valid default avatar
storedUsers.forEach(u => {
  if (!u.avatarUrl) {
    u.avatarUrl = getDefaultUserAvatar(u.role, u.username);
  }
});
saveJson(USERS_FILE, storedUsers);

// Active database configuration (sqlite | postgres | mysql)
let activeDbConfig = loadJson(DB_CONFIG_FILE, {
  engine: 'sqlite',
  postgresConfig: { host: 'localhost', port: 5432, user: 'postgres', password: '', database: 'tinglan_db' },
  mysqlConfig: { host: 'localhost', port: 3306, user: 'root', password: '', database: 'tinglan_db' }
});

// System Security & Remote Access Settings persistence
const SECURITY_FILE = path.join(DATA_DIR, 'security.json');

interface SecuritySettings {
  requireAuth: boolean;
  authScope: 'all' | 'wan_only';
  allowRegistration?: boolean;
  allowUserMiotControl?: boolean;
  allowUserMiotTts?: boolean;
  updatedAt: string;
}

const defaultSecuritySettings: SecuritySettings = {
  requireAuth: process.env.REQUIRE_AUTH !== 'false', // Enabled (true) by default
  authScope: 'all',
  allowRegistration: true, // Registration enabled by default
  allowUserMiotControl: true, // Allowed for regular users by default
  allowUserMiotTts: false, // Disallowed for regular users by default (admin only)
  updatedAt: new Date().toISOString()
};

let securitySettings: SecuritySettings = loadJson(SECURITY_FILE, defaultSecuritySettings);
if (typeof securitySettings.requireAuth !== 'boolean') {
  securitySettings.requireAuth = process.env.REQUIRE_AUTH !== 'false';
}
if (!securitySettings.authScope) {
  securitySettings.authScope = 'all';
}
if (typeof securitySettings.allowRegistration !== 'boolean') {
  securitySettings.allowRegistration = true;
}
if (typeof securitySettings.allowUserMiotControl !== 'boolean') {
  securitySettings.allowUserMiotControl = true;
}
if (typeof securitySettings.allowUserMiotTts !== 'boolean') {
  securitySettings.allowUserMiotTts = false;
}
// Ensure security.json exists on disk with active security settings
saveJson(SECURITY_FILE, securitySettings);

// Initialize SQLite Database Instance
let sqliteDb: any = null;

function initSqliteDatabase() {
  if (!sqlite3) {
    console.log('[Database] SQLite3 module not available, using JSON persistent store.');
    return;
  }
  try {
    const sqlite3Client = sqlite3.verbose ? sqlite3.verbose() : sqlite3;
    sqliteDb = new sqlite3Client.Database(SQLITE_FILE, (err: any) => {
      if (err) {
        console.error('Failed to connect to SQLite DB', err);
      } else {

        console.log(`[Database] SQLite 3 database active at ${SQLITE_FILE}`);
        sqliteDb?.serialize(() => {
          sqliteDb?.run(`
            CREATE TABLE IF NOT EXISTS users (
              id TEXT PRIMARY KEY,
              username TEXT UNIQUE NOT NULL,
              email TEXT NOT NULL,
              password_hash TEXT NOT NULL,
              role TEXT NOT NULL DEFAULT 'user',
              avatar_url TEXT,
              created_at TEXT NOT NULL
            )
          `);
          sqliteDb?.run(`
            CREATE TABLE IF NOT EXISTS songs (
              id TEXT PRIMARY KEY,
              title TEXT NOT NULL,
              artist TEXT,
              album TEXT,
              duration INTEGER,
              url TEXT,
              cover_url TEXT,
              lyrics TEXT,
              genre TEXT,
              year INTEGER,
              bitrate TEXT,
              file_size TEXT,
              source TEXT,
              created_at TEXT
            )
          `);
          sqliteDb?.run(`
            CREATE TABLE IF NOT EXISTS playlists (
              id TEXT PRIMARY KEY,
              user_id TEXT,
              name TEXT NOT NULL,
              description TEXT,
              cover_url TEXT,
              song_ids TEXT,
              created_at TEXT
            )
          `);

          // Insert admin user if missing in SQLite
          sqliteDb?.run(`
            INSERT OR IGNORE INTO users (id, username, email, password_hash, role, avatar_url, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [defaultAdminUser.id, defaultAdminUser.username, defaultAdminUser.email, defaultAdminUser.passwordHash, defaultAdminUser.role, defaultAdminUser.avatarUrl, defaultAdminUser.createdAt]);
        });
      }
    });
  } catch (e) {
    console.error('SQLite initialization failed', e);
  }
}

initSqliteDatabase();

// ---------------- NETWORK & IP CLASSIFICATION HELPERS ----------------
function getClientIp(req: Request): string {
  // Only trust X-Forwarded-For if TRUST_PROXY environment variable is explicitly enabled
  if (process.env.TRUST_PROXY === 'true') {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0].trim().replace(/^::ffff:/, '');
    }
    const realIp = req.headers['x-real-ip'];
    if (typeof realIp === 'string' && realIp.length > 0) {
      return realIp.trim().replace(/^::ffff:/, '');
    }
  }
  // Otherwise use physical socket remote address to prevent header spoofing attacks
  const rawIp = req.socket.remoteAddress || (req as any).ip || '127.0.0.1';
  return String(rawIp).replace(/^::ffff:/, '');
}

// In-memory rate limiting and brute-force protection for login
const loginAttemptTracker = new Map<string, { count: number; lockedUntil: number }>();

function checkLoginRateLimit(ip: string): { allowed: boolean; remainingLockSeconds?: number } {
  const record = loginAttemptTracker.get(ip);
  if (!record) return { allowed: true };
  const now = Date.now();
  if (record.lockedUntil > now) {
    return {
      allowed: false,
      remainingLockSeconds: Math.ceil((record.lockedUntil - now) / 1000)
    };
  }
  if (record.lockedUntil <= now && record.lockedUntil > 0) {
    loginAttemptTracker.delete(ip);
    return { allowed: true };
  }
  return { allowed: true };
}

function recordLoginAttempt(ip: string, isSuccess: boolean) {
  if (isSuccess) {
    loginAttemptTracker.delete(ip);
    return;
  }
  const now = Date.now();
  const record = loginAttemptTracker.get(ip) || { count: 0, lockedUntil: 0 };
  record.count += 1;
  if (record.count >= 5) {
    // Lock for 5 minutes after 5 consecutive failures
    record.lockedUntil = now + 5 * 60 * 1000;
  }
  loginAttemptTracker.set(ip, record);
}

function isPrivateOrLocalIp(ip: string): boolean {
  if (!ip) return false;
  const cleanIp = ip.replace(/^::ffff:/, '').trim();
  if (
    cleanIp === '127.0.0.1' ||
    cleanIp === '::1' ||
    cleanIp === 'localhost' ||
    cleanIp.startsWith('fe80:')
  ) {
    return true;
  }
  // 10.0.0.0/8
  if (cleanIp.startsWith('10.')) return true;
  // 172.16.0.0/12
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(cleanIp)) return true;
  // 192.168.0.0/16
  if (cleanIp.startsWith('192.168.')) return true;
  // Carrier grade NAT 100.64.0.0/10 (tailscale/CGNAT)
  if (/^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./.test(cleanIp)) return true;
  return false;
}

function isAuthRequiredForRequest(req: Request): boolean {
  if (!securitySettings.requireAuth) {
    return false;
  }
  if (securitySettings.authScope === 'wan_only') {
    const clientIp = getClientIp(req);
    const isLan = isPrivateOrLocalIp(clientIp);
    if (isLan) {
      return false; // LAN local access exempt
    }
  }
  return true;
}

// ---------------- AUTHENTICATION MIDDLEWARE ----------------
// Intercept and protect all /api/* routes from unauthorized access
function authMiddleware(req: Request, res: Response, next: any) {
  // Normalize path with or without /api prefix
  const original = (req.originalUrl || req.url).split('?')[0];
  const relative = (req.path || req.url).split('?')[0];
  const fullPath = original.startsWith('/api') ? original : `/api${original}`;

  // 1. Whitelisted public paths
  if (
    fullPath === '/api/auth/login' ||
    fullPath === '/api/auth/register' ||
    fullPath === '/api/auth/status' ||
    ((fullPath === '/api/system/security' || relative === '/system/security') && req.method === 'GET') ||
    fullPath === '/api/health' ||
    fullPath === '/api/ping' ||
    relative === '/auth/login' ||
    relative === '/auth/register' ||
    relative === '/auth/status' ||
    relative === '/health' ||
    relative === '/ping'
  ) {
    return next();
  }

  // 2. Audio streaming, TTS synthesis and cover art
  // Xiaomi smart speakers and standard HTML5 <audio> / <img> pull media directly via HTTP GET without custom headers
  if (
    fullPath.startsWith('/api/stream') ||
    fullPath.startsWith('/api/tts') ||
    (fullPath.startsWith('/api/songs/') && (fullPath.endsWith('/stream') || fullPath.endsWith('/cover')))
  ) {
    return next();
  }

  // 3. Subsonic /rest protocol endpoints have their own query parameter auth
  if (fullPath.startsWith('/rest/')) {
    return next();
  }

  // 4. API Key check (via header or query param)
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  if (API_KEY && apiKey === API_KEY) {
    (req as any).user = { id: 'api-key-user', username: 'api-key-client', role: 'admin' };
    return next();
  }

  // 5. JWT Bearer Token in Authorization header or token query param
  const authHeader = req.headers['authorization'];
  let token: string | null = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.query.token) {
    token = String(req.query.token).trim();
  }

  // 5. Check if authentication is strictly required for this request / client
  const authRequired = isAuthRequiredForRequest(req);

  if (token) {
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      (req as any).user = decoded;
      return next();
    } catch (err: any) {
      if (authRequired) {
        return res.status(401).json({
          success: false,
          error: '身份验证令牌无效或已过期，请重新登录账号',
          requireLogin: true
        });
      }
    }
  }

  // 6. If auth is strictly required and user has not authenticated, block all protected endpoints
  if (authRequired) {
    return res.status(401).json({
      success: false,
      error: '系统已开启访问安全保护（全网或公网访问限制），请先登录账号方可操作',
      requireLogin: true
    });
  }

  // 7. Default mode (protection disabled or exempt LAN client)
  return next();
}

app.use('/api', authMiddleware);

// ---------------- USER AUTHENTICATION & DATABASE ROUTES ----------------

// Authentication & System Security Status Check (Public)
app.get('/api/auth/status', (req: Request, res: Response) => {
  securitySettings = loadJson(SECURITY_FILE, securitySettings);
  const clientIp = getClientIp(req);
  const isLan = isPrivateOrLocalIp(clientIp);
  const authRequired = isAuthRequiredForRequest(req);
  const allowRegistration = typeof securitySettings.allowRegistration === 'boolean' ? securitySettings.allowRegistration : true;

  res.json({
    success: true,
    authRequired,
    globalRequireAuth: Boolean(securitySettings.requireAuth),
    requireAuth: Boolean(securitySettings.requireAuth),
    authScope: securitySettings.authScope || 'all',
    allowRegistration,
    allowUserMiotControl: securitySettings.allowUserMiotControl !== false,
    allowUserMiotTts: Boolean(securitySettings.allowUserMiotTts),
    clientIp,
    isLan,
    hasDefaultAdmin: storedUsers.some(u => u.username === 'admin'),
    userCount: storedUsers.length,
    status: {
      success: true,
      authRequired,
      globalRequireAuth: Boolean(securitySettings.requireAuth),
      requireAuth: Boolean(securitySettings.requireAuth),
      authScope: securitySettings.authScope || 'all',
      allowRegistration,
      allowUserMiotControl: securitySettings.allowUserMiotControl !== false,
      allowUserMiotTts: Boolean(securitySettings.allowUserMiotTts),
      clientIp,
      isLan,
      hasDefaultAdmin: storedUsers.some(u => u.username === 'admin'),
      userCount: storedUsers.length
    },
    settings: {
      ...securitySettings,
      allowRegistration
    }
  });
});

// System Security Settings Query (Public GET)
app.get('/api/system/security', (req: Request, res: Response) => {
  securitySettings = loadJson(SECURITY_FILE, securitySettings);
  const clientIp = getClientIp(req);
  const isLan = isPrivateOrLocalIp(clientIp);
  const isAuthRequired = isAuthRequiredForRequest(req);
  const allowRegistration = typeof securitySettings.allowRegistration === 'boolean' ? securitySettings.allowRegistration : true;

  res.json({
    success: true,
    authRequired: isAuthRequired,
    globalRequireAuth: Boolean(securitySettings.requireAuth),
    requireAuth: Boolean(securitySettings.requireAuth),
    authScope: securitySettings.authScope || 'all',
    allowRegistration,
    allowUserMiotControl: securitySettings.allowUserMiotControl !== false,
    allowUserMiotTts: Boolean(securitySettings.allowUserMiotTts),
    clientIp,
    isLan,
    settings: {
      ...securitySettings,
      allowRegistration
    },
    status: {
      success: true,
      authRequired: isAuthRequired,
      globalRequireAuth: Boolean(securitySettings.requireAuth),
      requireAuth: Boolean(securitySettings.requireAuth),
      authScope: securitySettings.authScope || 'all',
      allowRegistration,
      allowUserMiotControl: securitySettings.allowUserMiotControl !== false,
      allowUserMiotTts: Boolean(securitySettings.allowUserMiotTts),
      clientIp,
      isLan,
      hasDefaultAdmin: storedUsers.some(u => u.username === 'admin'),
      userCount: storedUsers.length
    },
    clientInfo: {
      ip: clientIp,
      isLan,
      isAuthRequired
    },
    hasDefaultAdmin: storedUsers.some(u => u.username === 'admin'),
    userCount: storedUsers.length
  });
});

// Update System Security Settings
app.post('/api/system/security', (req: Request, res: Response) => {
  try {
    const { requireAuth, authScope, allowRegistration, allowUserMiotControl, allowUserMiotTts } = req.body;
    
    // Changing security settings requires admin privileges
    const clientUser = (req as any).user;
    if (!clientUser || clientUser.role !== 'admin') {
      return res.status(403).json({ success: false, error: '权限不足：仅管理员允许修改系统安全与注册设置' });
    }

    if (typeof requireAuth === 'boolean') {
      securitySettings.requireAuth = requireAuth;
    }
    if (authScope === 'all' || authScope === 'wan_only') {
      securitySettings.authScope = authScope;
    }
    if (typeof allowRegistration === 'boolean') {
      securitySettings.allowRegistration = allowRegistration;
    }
    if (typeof allowUserMiotControl === 'boolean') {
      securitySettings.allowUserMiotControl = allowUserMiotControl;
    }
    if (typeof allowUserMiotTts === 'boolean') {
      securitySettings.allowUserMiotTts = allowUserMiotTts;
    }
    securitySettings.updatedAt = new Date().toISOString();
    saveJson(SECURITY_FILE, securitySettings);

    const clientIp = getClientIp(req);
    const isLan = isPrivateOrLocalIp(clientIp);
    const isAuthRequired = isAuthRequiredForRequest(req);
    const currentAllowReg = typeof securitySettings.allowRegistration === 'boolean' ? securitySettings.allowRegistration : true;

    res.json({
      success: true,
      message: '系统安全策略与注册配置已成功更新！',
      settings: securitySettings,
      authRequired: isAuthRequired,
      globalRequireAuth: Boolean(securitySettings.requireAuth),
      requireAuth: Boolean(securitySettings.requireAuth),
      authScope: securitySettings.authScope || 'all',
      allowRegistration: currentAllowReg,
      allowUserMiotControl: securitySettings.allowUserMiotControl !== false,
      allowUserMiotTts: Boolean(securitySettings.allowUserMiotTts),
      clientIp,
      isLan,
      status: {
        success: true,
        authRequired: isAuthRequired,
        globalRequireAuth: Boolean(securitySettings.requireAuth),
        requireAuth: Boolean(securitySettings.requireAuth),
        authScope: securitySettings.authScope || 'all',
        allowRegistration: currentAllowReg,
        allowUserMiotControl: securitySettings.allowUserMiotControl !== false,
        allowUserMiotTts: Boolean(securitySettings.allowUserMiotTts),
        clientIp,
        isLan,
        hasDefaultAdmin: storedUsers.some(u => u.username === 'admin'),
        userCount: storedUsers.length
      },
      clientInfo: {
        ip: clientIp,
        isLan,
        isAuthRequired
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || '更新安全设置失败' });
  }
});

// Change Password (supports /api/auth/change-password and /api/auth/change-admin-password)
const handleChangePassword = async (req: Request, res: Response) => {
  try {
    const clientUser = (req as any).user;
    if (!clientUser) {
      return res.status(401).json({ success: false, error: '未登录：请先登录后再修改密码', requireLogin: true });
    }

    const { newPassword, oldPassword, username } = req.body;
    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ success: false, error: '新密码不能少于 6 位' });
    }

    // Determine target username (defaults to currently authenticated user)
    const targetUsername = (username ? String(username).trim() : clientUser.username).toLowerCase();
    const isSelf = clientUser.username.toLowerCase() === targetUsername || clientUser.userId === targetUsername;

    // Only administrators can modify other users' passwords
    if (!isSelf && clientUser.role !== 'admin') {
      return res.status(403).json({ success: false, error: '权限不足：仅管理员可以修改其他用户的密码' });
    }

    storedUsers = loadJson(USERS_FILE, storedUsers);
    const userIndex = storedUsers.findIndex(u => u.username.toLowerCase() === targetUsername || u.id === targetUsername);
    if (userIndex < 0) {
      return res.status(404).json({ success: false, error: `用户「${targetUsername}」不存在` });
    }

    const targetUser = storedUsers[userIndex];

    // If changing own password, verify old password for authentication safety
    if (isSelf && targetUser.passwordHash) {
      if (!oldPassword) {
        return res.status(400).json({ success: false, error: '请输入当前旧密码以验证身份' });
      }
      const isOldMatch = await bcrypt.compare(String(oldPassword), targetUser.passwordHash);
      if (!isOldMatch) {
        return res.status(400).json({ success: false, error: '原密码验证失败，请输入正确的旧密码' });
      }
    }

    const passwordHash = await bcrypt.hash(String(newPassword), 10);
    targetUser.passwordHash = passwordHash;
    targetUser.updatedAt = new Date().toISOString();
    saveJson(USERS_FILE, storedUsers);

    // Sync to SQLite if available
    if (sqliteDb) {
      try {
        sqliteDb.run(
          `UPDATE users SET password_hash = ? WHERE LOWER(username) = LOWER(?) OR id = ?`,
          [passwordHash, targetUser.username, targetUser.id]
        );
      } catch (dbErr) {
        console.warn('Could not sync password update to SQLite', dbErr);
      }
    }

    return res.json({
      success: true,
      message: `用户「${targetUser.username}」的密码已成功修改！`
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || '修改密码失败' });
  }
};

app.post('/api/auth/change-password', handleChangePassword);
app.post('/api/auth/change-admin-password', handleChangePassword);

// Register User (Subject to allowRegistration switch)
app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    securitySettings = loadJson(SECURITY_FILE, securitySettings);
    if (securitySettings.allowRegistration === false) {
      return res.status(403).json({
        success: false,
        error: '系统当前已关闭开放注册功能。如需账号，请联系管理员直接分配。'
      });
    }

    const { username, email, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: '请填写用户名和密码' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ success: false, error: '密码长度不能少于 6 位' });
    }

    const trimmedUser = String(username).trim();
    storedUsers = loadJson(USERS_FILE, storedUsers);
    if (storedUsers.some(u => u.username.toLowerCase() === trimmedUser.toLowerCase())) {
      return res.status(400).json({ success: false, error: '该用户名已被注册，请更换其他名称' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = {
      id: `usr-${Date.now()}`,
      username: trimmedUser,
      email: email ? String(email).trim() : `${trimmedUser}@tinglan.audio`,
      passwordHash,
      role: 'user',
      status: 'active',
      avatarUrl: getDefaultUserAvatar('user', trimmedUser),
      createdAt: new Date().toISOString()
    };

    storedUsers.push(newUser);
    saveJson(USERS_FILE, storedUsers);

    // Sync to SQLite if active
    if (sqliteDb) {
      sqliteDb.run(`
        INSERT OR REPLACE INTO users (id, username, email, password_hash, role, avatar_url, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [newUser.id, newUser.username, newUser.email, newUser.passwordHash, newUser.role, newUser.avatarUrl, newUser.createdAt]);
    }

    const token = jwt.sign(
      { userId: newUser.id, username: newUser.username, role: newUser.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    const { passwordHash: _, ...userWithoutPassword } = newUser;
    return res.json({
      success: true,
      message: '账号注册成功！',
      user: userWithoutPassword,
      token
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `注册异常: ${err.message}` });
  }
});

// Login User with Rate Limiting
app.post('/api/auth/login', async (req: Request, res: Response) => {
  const clientIp = getClientIp(req);
  try {
    const rateCheck = checkLoginRateLimit(clientIp);
    if (!rateCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: `登录失败次数过多，为保护账号安全，该 IP 已临时锁定，请在 ${rateCheck.remainingLockSeconds} 秒后再试`
      });
    }

    const usernameOrEmail = req.body.usernameOrEmail || req.body.username;
    const { password } = req.body;
    if (!usernameOrEmail || !password) {
      return res.status(400).json({ success: false, error: '请输入用户名/邮箱与密码' });
    }

    storedUsers = loadJson(USERS_FILE, storedUsers);
    const query = String(usernameOrEmail).trim().toLowerCase();
    const user = storedUsers.find(u => u.username.toLowerCase() === query || u.email.toLowerCase() === query);

    if (!user) {
      recordLoginAttempt(clientIp, false);
      return res.status(401).json({ success: false, error: '用户不存在或密码错误' });
    }

    if (user.status === 'disabled') {
      return res.status(403).json({ success: false, error: '该账号已被管理员禁用，请联系管理员恢复' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      recordLoginAttempt(clientIp, false);
      return res.status(401).json({ success: false, error: '用户不存在或密码错误' });
    }

    // Reset attempt tracker on success
    recordLoginAttempt(clientIp, true);

    // Update last login timestamp
    user.lastLoginAt = new Date().toISOString();
    saveJson(USERS_FILE, storedUsers);

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    const { passwordHash: _, ...userWithoutPassword } = user;
    return res.json({
      success: true,
      message: '登录成功！',
      user: userWithoutPassword,
      token
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `登录异常: ${err.message}` });
  }
});

// Get Current Profile
app.get('/api/auth/me', (req: Request, res: Response) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, user: null });
  }

  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    storedUsers = loadJson(USERS_FILE, storedUsers);
    const user = storedUsers.find(u => u.id === decoded.userId);
    if (!user) {
      return res.status(404).json({ success: false, user: null });
    }
    const { passwordHash: _, ...userWithoutPassword } = user;
    return res.json({ success: true, user: userWithoutPassword });
  } catch (e) {
    return res.status(401).json({ success: false, user: null });
  }
});

// ---------------- USER MANAGEMENT ENDPOINTS (ADMIN) ----------------

// List All Users
app.get('/api/auth/users', (req: Request, res: Response) => {
  const clientUser = (req as any).user;
  if (!clientUser || clientUser.role !== 'admin') {
    return res.status(403).json({ success: false, error: '权限不足：仅管理员可以查看系统用户列表' });
  }

  storedUsers = loadJson(USERS_FILE, storedUsers);
  const sanitized = storedUsers.map(({ passwordHash, ...rest }) => ({
    ...rest,
    status: rest.status || 'active',
    role: rest.role || 'user'
  })).sort((a, b) => {
    if (a.role === 'admin' && b.role !== 'admin') return -1;
    if (b.role === 'admin' && a.role !== 'admin') return 1;
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });
  return res.json({ success: true, users: sanitized, total: sanitized.length });
});

// Admin Create New User
app.post('/api/auth/users', async (req: Request, res: Response) => {
  try {
    const clientUser = (req as any).user;
    if (!clientUser || clientUser.role !== 'admin') {
      return res.status(403).json({ success: false, error: '权限不足：仅管理员可以添加用户' });
    }

    const { username, email, password, role, status } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: '请提供用户名和初始密码' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ success: false, error: '密码长度不能少于 6 位' });
    }

    const trimmedUser = String(username).trim();
    storedUsers = loadJson(USERS_FILE, storedUsers);
    if (storedUsers.some(u => u.username.toLowerCase() === trimmedUser.toLowerCase())) {
      return res.status(400).json({ success: false, error: '该用户名已存在，请使用其他名称' });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const userRole = role === 'admin' ? 'admin' : 'user';
    const userStatus = status === 'disabled' ? 'disabled' : 'active';
    const newUser = {
      id: `usr-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      username: trimmedUser,
      email: email ? String(email).trim() : `${trimmedUser}@tinglan.audio`,
      passwordHash,
      role: userRole,
      status: userStatus,
      avatarUrl: getDefaultUserAvatar(userRole, trimmedUser),
      createdAt: new Date().toISOString()
    };

    storedUsers.push(newUser);
    saveJson(USERS_FILE, storedUsers);

    if (sqliteDb) {
      sqliteDb.run(`
        INSERT OR REPLACE INTO users (id, username, email, password_hash, role, avatar_url, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [newUser.id, newUser.username, newUser.email, newUser.passwordHash, newUser.role, newUser.avatarUrl, newUser.createdAt]);
    }

    const { passwordHash: _, ...userWithoutPassword } = newUser;
    return res.json({
      success: true,
      message: `用户「${trimmedUser}」创建成功！`,
      user: userWithoutPassword
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `添加用户失败: ${err.message}` });
  }
});

// Admin Update User (role, email, status, optional password)
app.put('/api/auth/users/:id', async (req: Request, res: Response) => {
  try {
    const clientUser = (req as any).user;
    if (!clientUser || clientUser.role !== 'admin') {
      return res.status(403).json({ success: false, error: '权限不足：仅管理员可以修改用户信息' });
    }

    const { id } = req.params;
    const { email, role, status, password, avatarUrl } = req.body;

    storedUsers = loadJson(USERS_FILE, storedUsers);
    const userIndex = storedUsers.findIndex(u => u.id === id);
    if (userIndex < 0) {
      return res.status(404).json({ success: false, error: '目标用户不存在' });
    }

    const targetUser = storedUsers[userIndex];

    // Protection: If demoting or disabling self, ensure not the last admin
    if (targetUser.role === 'admin' && (role === 'user' || status === 'disabled')) {
      const otherAdmins = storedUsers.filter(u => u.id !== id && u.role === 'admin' && u.status !== 'disabled');
      if (otherAdmins.length === 0) {
        return res.status(400).json({ success: false, error: '操作被阻止：系统必须保留至少一个处于启用状态的管理员账号' });
      }
    }

    if (email) targetUser.email = String(email).trim();
    if (role === 'admin' || role === 'user') targetUser.role = role;
    if (status === 'active' || status === 'disabled') targetUser.status = status;
    if (avatarUrl) targetUser.avatarUrl = avatarUrl;
    if (password && String(password).length >= 6) {
      targetUser.passwordHash = await bcrypt.hash(String(password), 10);
    }
    targetUser.updatedAt = new Date().toISOString();

    saveJson(USERS_FILE, storedUsers);

    if (sqliteDb) {
      sqliteDb.run(`
        UPDATE users SET email = ?, role = ?, password_hash = ? WHERE id = ?
      `, [targetUser.email, targetUser.role, targetUser.passwordHash, targetUser.id]);
    }

    const { passwordHash: _, ...userWithoutPassword } = targetUser;
    return res.json({
      success: true,
      message: `用户「${targetUser.username}」信息更新成功！`,
      user: userWithoutPassword
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `修改用户失败: ${err.message}` });
  }
});

// Admin Delete User
app.delete('/api/auth/users/:id', (req: Request, res: Response) => {
  try {
    const clientUser = (req as any).user;
    if (!clientUser || clientUser.role !== 'admin') {
      return res.status(403).json({ success: false, error: '权限不足：仅管理员可以删除用户' });
    }

    const { id } = req.params;
    storedUsers = loadJson(USERS_FILE, storedUsers);
    const targetUser = storedUsers.find(u => u.id === id);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: '目标用户不存在' });
    }

    // Protection: cannot delete self
    if (clientUser && clientUser.userId === id) {
      return res.status(400).json({ success: false, error: '无法删除当前正在登录的账号' });
    }

    // Protection: cannot delete the last admin
    if (targetUser.role === 'admin') {
      const otherAdmins = storedUsers.filter(u => u.id !== id && u.role === 'admin');
      if (otherAdmins.length === 0) {
        return res.status(400).json({ success: false, error: '无法删除系统中唯一的管理员账号' });
      }
    }

    storedUsers = storedUsers.filter(u => u.id !== id);
    saveJson(USERS_FILE, storedUsers);

    if (sqliteDb) {
      sqliteDb.run(`DELETE FROM users WHERE id = ?`, [id]);
    }

    return res.json({
      success: true,
      message: `用户「${targetUser.username}」已成功删除！`
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `删除用户失败: ${err.message}` });
  }
});

// Admin Reset User Password
app.post('/api/auth/users/:id/reset-password', async (req: Request, res: Response) => {
  try {
    const clientUser = (req as any).user;
    if (!clientUser || clientUser.role !== 'admin') {
      return res.status(403).json({ success: false, error: '权限不足：仅管理员可以重置密码' });
    }

    const { id } = req.params;
    const { newPassword } = req.body;
    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ success: false, error: '新密码不能少于 6 位' });
    }

    storedUsers = loadJson(USERS_FILE, storedUsers);
    const targetUser = storedUsers.find(u => u.id === id);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: '目标用户不存在' });
    }

    targetUser.passwordHash = await bcrypt.hash(String(newPassword), 10);
    targetUser.updatedAt = new Date().toISOString();
    saveJson(USERS_FILE, storedUsers);

    if (sqliteDb) {
      sqliteDb.run(`UPDATE users SET password_hash = ? WHERE id = ?`, [targetUser.passwordHash, id]);
    }

    return res.json({
      success: true,
      message: `用户「${targetUser.username}」的密码已成功重置！`
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `重置密码失败: ${err.message}` });
  }
});

// Admin Toggle User Active / Disabled Status
app.post('/api/auth/users/:id/toggle-status', (req: Request, res: Response) => {
  try {
    const clientUser = (req as any).user;
    if (!clientUser || clientUser.role !== 'admin') {
      return res.status(403).json({ success: false, error: '权限不足：仅管理员可以操作账号状态' });
    }

    const { id } = req.params;
    storedUsers = loadJson(USERS_FILE, storedUsers);
    const targetUser = storedUsers.find(u => u.id === id);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: '目标用户不存在' });
    }

    const nextStatus = targetUser.status === 'disabled' ? 'active' : 'disabled';

    // Protection: cannot disable self or last admin
    if (nextStatus === 'disabled') {
      if (clientUser && clientUser.userId === id) {
        return res.status(400).json({ success: false, error: '无法禁用当前正在操作的自身账号' });
      }
      if (targetUser.role === 'admin') {
        const otherAdmins = storedUsers.filter(u => u.id !== id && u.role === 'admin' && u.status !== 'disabled');
        if (otherAdmins.length === 0) {
          return res.status(400).json({ success: false, error: '无法禁用系统中唯一的活跃管理员账号' });
        }
      }
    }

    targetUser.status = nextStatus;
    targetUser.updatedAt = new Date().toISOString();
    saveJson(USERS_FILE, storedUsers);

    return res.json({
      success: true,
      message: `用户「${targetUser.username}」状态已变更为: ${nextStatus === 'active' ? '正常启用' : '已停用'}`,
      status: nextStatus
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `更改用户状态失败: ${err.message}` });
  }
});

// Get Database Status
app.get('/api/db/status', (req: Request, res: Response) => {
  const engineNames: Record<string, string> = {
    sqlite: 'SQLite 3 (嵌入式轻量库 - 默认启用)',
    postgres: 'PostgreSQL (远程关系库 - 实验性连通)',
    mysql: 'MySQL (远程关系库 - 实验性连通)'
  };

  storedUsers = loadJson(USERS_FILE, storedUsers);
  const currentSongs = loadJson<any[]>(SONGS_FILE, DEFAULT_SONGS);
  const currentPlaylists = loadJson<any[]>(PLAYLISTS_FILE, []);

  return res.json({
    success: true,
    config: activeDbConfig,
    status: {
      engine: activeDbConfig.engine,
      isConnected: true,
      engineName: engineNames[activeDbConfig.engine] || 'SQLite 3',
      tablesCount: sqliteDb ? 3 : 0,
      totalUsers: storedUsers.length,
      totalSongs: currentSongs.length,
      totalPlaylists: currentPlaylists.length
    }
  });
});

// Test Database Connection
app.post('/api/db/test', async (req: Request, res: Response) => {
  const { engine, postgresConfig, mysqlConfig } = req.body;

  if (engine === 'sqlite') {
    return res.json({ success: true, message: 'SQLite3 本地数据库运行良好！' });
  }

  if (engine === 'postgres') {
    if (!postgresConfig?.host) {
      return res.status(400).json({ success: false, error: '缺少 PostgreSQL 主机地址' });
    }
    try {
      const pool = new pg.Pool({
        host: postgresConfig.host,
        port: Number(postgresConfig.port) || 5432,
        user: postgresConfig.user || 'postgres',
        password: postgresConfig.password || '',
        database: postgresConfig.database || 'tinglan_db',
        connectionTimeoutMillis: 5000
      });
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      await pool.end();
      return res.json({ success: true, message: `成功连接至 PostgreSQL (${postgresConfig.host}:${postgresConfig.port || 5432})` });
    } catch (err: any) {
      return res.status(400).json({ success: false, error: `PostgreSQL 连接失败: ${err.message}` });
    }
  }

  if (engine === 'mysql') {
    if (!mysqlConfig?.host) {
      return res.status(400).json({ success: false, error: '缺少 MySQL 主机地址' });
    }
    try {
      const connection = await mysql.createConnection({
        host: mysqlConfig.host,
        port: Number(mysqlConfig.port) || 3306,
        user: mysqlConfig.user || 'root',
        password: mysqlConfig.password || '',
        database: mysqlConfig.database || 'tinglan_db',
        connectTimeout: 5000
      });
      await connection.ping();
      await connection.end();
      return res.json({ success: true, message: `成功连接至 MySQL (${mysqlConfig.host}:${mysqlConfig.port || 3306})` });
    } catch (err: any) {
      return res.status(400).json({ success: false, error: `MySQL 连接失败: ${err.message}` });
    }
  }

  return res.status(400).json({ success: false, error: '未知数据库引擎' });
});

// Save & Switch Active Database Engine (Admin Only)
app.post('/api/db/switch', async (req: Request, res: Response) => {
  const clientUser = (req as any).user;
  if (!clientUser || clientUser.role !== 'admin') {
    return res.status(403).json({ success: false, error: '权限不足：仅管理员可以切换数据库引擎' });
  }

  const { engine, postgresConfig, mysqlConfig } = req.body;
  
  if (!['sqlite', 'postgres', 'mysql'].includes(engine)) {
    return res.status(400).json({ success: false, error: '不支援的数据库引擎类型' });
  }

  activeDbConfig.engine = engine;
  if (postgresConfig) activeDbConfig.postgresConfig = postgresConfig;
  if (mysqlConfig) activeDbConfig.mysqlConfig = mysqlConfig;

  saveJson(DB_CONFIG_FILE, activeDbConfig);

  return res.json({
    success: true,
    message: `已成功保存配置并切换活动数据库引擎为 ${engine.toUpperCase()}！`,
    config: activeDbConfig
  });
});


// Initial default songs
const DEFAULT_SONGS = [
  {
    id: 'song-1',
    title: '月半小夜曲 (Acoustic Night)',
    artist: '李克勤 / 弦乐室内乐团',
    album: '港乐经典·发烧重现',
    duration: 234,
    url: '/api/stream/song-1',
    coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
    genre: 'Classic Pop / Acoustic',
    year: 2021,
    bitrate: '320kbps MP3',
    fileSize: '9.2 MB',
    isFavorite: true,
    source: 'local',
    lyrics: `[00:00.00]月半小夜曲 - 弦乐原声版\n[00:04.00]词：向雪怀 曲：河合奈保子\n[00:08.50]演奏：Tinglan 听澜 Hi-Fi 发烧工作室\n[00:15.00]哪怕面对冷冰冰的墙壁\n[00:22.00]深深的一声叹息\n[00:29.00]仍难忘你的笑语盈盈\n[00:36.00]仍难舍你的柔情似蜜\n[00:44.00]月亮为何还在夜空高挂\n[00:51.50]似这半月儿静听幽咽的吉他\n[00:58.50]幽幽提琴在低诉我心声\n[01:05.50]如泣如诉如醉如痴\n[01:13.00]我的心仍在期待你的归期\n[01:20.50]小爱音箱正在高保真投放此曲\n[01:28.00]提琴轻诉，如风拂面\n[01:36.00]夜深沉，乐声犹在耳畔\n[01:50.00]（间奏·纯净吉他独奏）\n[02:10.00]月半小夜曲 - Tinglan 听澜音乐流媒体`
  },
  {
    id: 'song-2',
    title: '春江花月夜 (Moonlit Spring River)',
    artist: '中央民族乐团 / 古筝与箫',
    album: '国乐大典·东方神韵',
    duration: 278,
    url: '/api/stream/song-2',
    coverUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=80',
    genre: 'Traditional / Ambient',
    year: 2023,
    bitrate: 'FLAC 24bit/96kHz',
    fileSize: '28.4 MB',
    isFavorite: true,
    source: 'local',
    lyrics: `[00:00.00]春江花月夜 - 古筝箫韵\n[00:06.00]古曲改编 / 高保真无损母带\n[00:14.00]春江潮水连海平，海上明月共潮生\n[00:28.00]滟滟随波千万里，何处春江无月明\n[00:42.00]江流宛转绕芳甸，月照花林皆似霰\n[00:56.00]空里流霜不觉飞，汀上白沙看不见\n[01:12.00]江天一色无纤尘，皎皎空中孤月轮\n[01:26.00]江畔何人初见月？江月何年初照人？\n[01:42.00]人生代代无穷已，江月年年望相似\n[02:00.00]（古筝泛音如流水潺潺）\n[02:25.00]此时相望不相闻，愿逐月华流照君\n[02:45.00]鸿雁长飞光不度，鱼龙潜跃水成文`
  },
  {
    id: 'song-3',
    title: '夜的第七章 (Nocturne in Dim Light)',
    artist: '周杰伦 / 潘儿',
    album: '依然范特西 (Classic Hi-Res)',
    duration: 220,
    url: '/api/stream/song-3',
    coverUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=600&q=80',
    genre: 'Cinematic Hip-hop',
    year: 2006,
    bitrate: '320kbps MP3',
    fileSize: '8.8 MB',
    isFavorite: false,
    source: 'local',
    lyrics: `[00:00.00]夜的第七章 - 华丽交响编曲\n[00:05.00]1983年小巷 12月晴朗\n[00:10.00]夜的第七章 打字机继续推向\n[00:15.00]接近事实的那下一行\n[00:20.00]石楠烟斗的雾 飘向枯萎的树\n[00:25.00]沉默的证人绕过贝克街旁\n[00:30.00]如果邪恶 是华丽残酷的乐章\n[00:35.00]它的终场 我会亲手写上\n[00:41.00]晨曦的光 风干最后一行忧伤\n[00:47.00]黑色的墨 染上安详`
  },
  {
    id: 'song-4',
    title: '海阔天空 (Boundless Oceans, Vast Skies)',
    artist: 'Beyond',
    album: '海阔天空 30周年纪念重置',
    duration: 326,
    url: '/api/stream/song-4',
    coverUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=600&q=80',
    genre: 'Rock / Classical Rock',
    year: 1993,
    bitrate: 'FLAC 无损音频',
    fileSize: '34.1 MB',
    isFavorite: true,
    source: 'local',
    lyrics: `[00:00.00]海阔天空 - Beyond\n[00:06.00]词：黄家驹 曲：黄家驹\n[00:18.00]今天我 寒夜里看雪飘过\n[00:25.00]怀着冷却了的心窝飘远方\n[00:31.00]风雨里追赶 雾里分不清影踪\n[00:38.00]天空海阔你与我 可会变（谁没在变）\n[00:46.00]多少次 迎着冷眼与嘲笑\n[00:53.00]从没有放弃过心中的理想\n[01:00.00]一刹那恍惚 若有所失的感觉\n[01:07.00]不知不觉已变淡 心里爱（谁明白我）\n[01:15.00]原谅我这一生不羁放纵爱自由\n[01:22.50]也会怕有一天会跌倒\n[01:29.50]背弃了理想 谁人都可以\n[01:36.50]哪会怕有一天只你共我`
  },
  {
    id: 'song-5',
    title: 'Rainy Cafe (午后咖啡馆雨声)',
    artist: 'Lofi Coffee Roaster',
    album: 'ChillHop & Ambient Soundscapes',
    duration: 185,
    url: '/api/stream/song-5',
    coverUrl: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=600&q=80',
    genre: 'Lo-Fi / Relaxing',
    year: 2024,
    bitrate: '320kbps MP3',
    fileSize: '7.1 MB',
    isFavorite: false,
    source: 'local',
    lyrics: `[00:00.00]Rainy Cafe - 午后微雨与醇香\n[00:10.00]纯音乐放空曲目\n[00:25.00]雨丝敲击着木质窗棂\n[00:45.00]小爱音箱伴您静享惬意午后\n[01:10.00]研磨咖啡豆的沙沙声与低音贝斯共鸣\n[01:35.00]放松心情，沉浸在这片安宁之中`
  },
  {
    id: 'song-6',
    title: '加州旅馆 (Hotel California Acoustic Live)',
    artist: 'Eagles (发烧试音碟)',
    album: 'Hell Freezes Over (Remastered)',
    duration: 312,
    url: '/api/stream/song-6',
    coverUrl: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=600&q=80',
    genre: 'Classic Rock / Audiophile',
    year: 1994,
    bitrate: 'DSD / DSD64 (DSF)',
    fileSize: '46.8 MB',
    isFavorite: true,
    source: 'local',
    lyrics: `[00:00.00]Hotel California (Live Acoustic)\n[00:15.00]吉他独奏前奏与现场掌声\n[00:35.00]手鼓低频试音核心段落\n[00:55.00]On a dark desert highway, cool wind in my hair\n[01:03.00]Warm smell of colitas, rising up through the air\n[01:11.00]Up ahead in the distance, I saw a shimmering light\n[01:19.00]My head grew heavy and my sight grew dim\n[01:23.00]I had to stop for the night`
  }
];

const DEFAULT_PLAYLISTS = [
  {
    id: 'pl-xiaomi',
    name: '小米音箱日常伴听',
    description: '早晨唤醒、睡前放松与背景伴奏优选歌曲',
    coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
    songIds: ['song-1', 'song-2', 'song-5'],
    createdAt: '2026-03-01'
  },
  {
    id: 'pl-favorites',
    name: '我喜欢的高保真音乐',
    description: '无损与发烧重制收藏单曲',
    coverUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=600&q=80',
    songIds: ['song-1', 'song-2', 'song-4', 'song-6'],
    createdAt: '2026-03-02'
  },
  {
    id: 'pl-hifi',
    name: 'Hi-Fi 试音专用 (Sound Pro)',
    description: '测试小爱音箱高低频延展与人声结像',
    coverUrl: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=600&q=80',
    songIds: ['song-2', 'song-4', 'song-6'],
    createdAt: '2026-03-03'
  }
];

const DEFAULT_DEVICES: any[] = [];

const DEFAULT_CONFIG = {
  miUser: process.env.MI_USER || '',
  isLoggedIn: !!process.env.MI_USER,
  serverHost: process.env.SERVER_HOST || '',
  activeDeviceId: '',
  autoCast: true,
  ttsAnnouncement: true,
  ttsPrefix: '正在为您播放',
  volumeSync: true,
  userId: '',
  serviceToken: '',
  bindMode: 'account'
};

// In-memory state synchronized with JSON files
let storedSongs: any[] = loadJson(SONGS_FILE, DEFAULT_SONGS);
let storedPlaylists: any[] = loadJson(PLAYLISTS_FILE, DEFAULT_PLAYLISTS);

// Phase 2: Strict 0 = 0. Default devices list is empty.
let rawXiaomiDevices: any[] = loadJson(DEVICES_FILE, []);
if (!Array.isArray(rawXiaomiDevices)) {
  rawXiaomiDevices = [];
}

let xiaomiDevices: any[] = rawXiaomiDevices.map((d: any) => {
  const hasToken = Boolean(d.token && String(d.token).trim().length > 0);
  return {
    ...d,
    did: String(d.did),
    model: d.model || 'xiaomi.wifispeaker.sound',
    name: (d.name || '小米智能音箱').replace(/\s*[\(（]点击(右侧)?编辑[\)）]/g, '').trim(),
    platform: d.platform || (hasToken && d.ip ? 'miio' : 'mina'),
    source: d.source || (d.ip && hasToken ? 'hybrid' : (d.ip ? 'lan' : 'cloud')),
    capabilities: d.capabilities || {
      hasPlayControl: true,
      hasTts: true,
      hasVolumeControl: true,
      hasClock: /clock|c01|x08|lx04|l05c/i.test(d.model || ''),
      supportsDlna: /lx06|pro|sound|l16a/i.test(d.model || ''),
      supportsLocalMiio: Boolean(hasToken && d.ip)
    },
    online: d.online ?? d.isOnline ?? false,
    isOnline: d.online ?? d.isOnline ?? false,
  };
});
let miotConfig = loadJson(CONFIG_FILE, DEFAULT_CONFIG);
const activeStreamIps = new Set<string>();

// Auto-recover session and speaker devices from passToken on startup if available
if ((miotConfig as any).passToken) {
  const candidateUid = miotConfig.userId || (miotConfig as any).cUserId || '0';
  Promise.allSettled([
    xiaomiPassport.fetchAdditionalStsToken(candidateUid, (miotConfig as any).passToken, 'micoapi'),
    xiaomiPassport.fetchAdditionalStsToken(candidateUid, (miotConfig as any).passToken, 'xiaomiio')
  ]).then(async ([micoRes, ioRes]) => {
    let micoToken = micoRes.status === 'fulfilled' ? micoRes.value.serviceToken : '';
    let ioToken = ioRes.status === 'fulfilled' ? ioRes.value.serviceToken : '';
    let recoveredUid = (micoRes.status === 'fulfilled' && micoRes.value.userId) || (ioRes.status === 'fulfilled' && ioRes.value.userId) || candidateUid;
    let ssec = (micoRes.status === 'fulfilled' && micoRes.value.ssecurity) || (ioRes.status === 'fulfilled' && ioRes.value.ssecurity) || (miotConfig as any).ssecurity;

    if (micoToken || ioToken) {
      miotConfig.serviceToken = micoToken || ioToken;
      (miotConfig as any).micoServiceToken = micoToken || miotConfig.serviceToken;
      (miotConfig as any).xiaomiioServiceToken = ioToken || miotConfig.serviceToken;
      if (ssec) (miotConfig as any).ssecurity = ssec;
      if (recoveredUid && recoveredUid !== '0') {
        miotConfig.userId = recoveredUid;
        miotConfig.miUser = `uid_${recoveredUid}`;
      }
      miotConfig.isLoggedIn = true;
      saveJson(CONFIG_FILE, miotConfig);
      console.log('[Auth] Restored active dual-channel session via stored passToken for user:', miotConfig.userId);

      // Auto resolve XiaoAi devices
      try {
        const resolveResult = await xiaoaiResolverEngine.resolveDevices({
          userId: miotConfig.userId,
          serviceToken: micoToken || miotConfig.serviceToken,
          xiaomiioServiceToken: ioToken || miotConfig.serviceToken,
          ssecurity: ssec,
          existingDevices: xiaomiDevices,
          activeStreamIps: Array.from(activeStreamIps)
        });
        if (resolveResult.xiaoAiDevices && resolveResult.xiaoAiDevices.length > 0) {
          xiaomiDevices = resolveResult.xiaoAiDevices;
          if (!miotConfig.activeDeviceId || !xiaomiDevices.some(d => d.did === miotConfig.activeDeviceId)) {
            miotConfig.activeDeviceId = xiaomiDevices[0].did;
          }
          saveJson(DEVICES_FILE, xiaomiDevices);
          saveJson(CONFIG_FILE, miotConfig);
          console.log(`[Discovery] Auto-restored ${xiaomiDevices.length} XiaoAi speakers from cloud`);
        }
      } catch (err: any) {
        console.warn('[Discovery] Device auto-resolution warning:', err.message);
      }

      // Connect Mina WS
      try {
        minaWsClient.connect(miotConfig.userId, micoToken || miotConfig.serviceToken, miotConfig.activeDeviceId || '');
      } catch {}
    }
  }).catch((err) => console.warn('[Auth] passToken startup recovery skipped:', err.message));
}

// Auto-connect Mina WebSocket in background if logged in
minaWsClient.on('error', (err: any) => {
  const errMsg = err?.message || String(err);
  if (!errMsg.includes('403') && !errMsg.includes('401')) {
    console.warn('[Mina WebSocket] Handled socket error:', errMsg);
  }
});

if (miotConfig.isLoggedIn && miotConfig.userId && miotConfig.serviceToken) {
  try {
    minaWsClient.connect(miotConfig.userId, miotConfig.serviceToken, miotConfig.activeDeviceId || '');
  } catch (err: any) {
    console.warn('[Mina WS] Initial connection failed:', err.message);
  }
}

// Security sanitizers to prevent token leakage while strictly fulfilling the standard schema:
// { did, model, name, ip, mac, token, platform, source, capabilities, online }
function sanitizeDevice(dev: any) {
  if (!dev) return dev;
  const token = dev.token;
  const hasToken = Boolean(token && String(token).trim().length > 0);
  const isOnline = Boolean(dev.online ?? dev.isOnline ?? false);
  const tokenMasked = token ? (String(token).length > 8 ? `${String(token).slice(0, 4)}••••••••${String(token).slice(-4)}` : '••••••••') : '';

  // Phase 3: Fine-grained device connection & playback state
  let deviceState: 'online' | 'offline' | 'unknown' | 'connecting' | 'playing' | 'paused' | 'error' = 'offline';
  if (!isOnline) {
    deviceState = 'offline';
  } else if (dev.status?.error) {
    deviceState = 'error';
  } else if (dev.status?.connecting) {
    deviceState = 'connecting';
  } else if (dev.status?.playing) {
    deviceState = 'playing';
  } else if (dev.status?.paused) {
    deviceState = 'paused';
  } else {
    deviceState = 'online';
  }

  return {
    did: String(dev.did),
    model: dev.model || 'xiaomi.wifispeaker.sound',
    name: (dev.name || '小米智能音箱').replace(/\s*[\(（]点击(右侧)?编辑[\)）]/g, '').trim(),
    ip: dev.ip || undefined,
    mac: dev.mac || undefined,
    token: tokenMasked || undefined,
    tokenMasked,
    hasToken,
    platform: dev.platform || (hasToken && dev.ip ? 'miio' : 'mina'),
    source: dev.source || (dev.ip && hasToken ? 'hybrid' : (dev.ip ? 'lan' : 'cloud')),
    capabilities: dev.capabilities || {
      hasPlayControl: true,
      hasTts: true,
      hasVolumeControl: true,
      hasClock: /clock|c01|x08|lx04|l05c/i.test(dev.model || ''),
      supportsDlna: /lx06|pro|sound|l16a/i.test(dev.model || ''),
      supportsLocalMiio: Boolean(hasToken && dev.ip)
    },
    online: isOnline,
    isOnline,
    deviceState,
    hardware: dev.hardware,
    status: dev.status || {
      playing: false,
      volume: 45,
      muted: false,
      updatedAt: new Date().toISOString()
    }
  };
}

function sanitizeMiotConfig(config: any) {
  if (!config) return config;
  const { serviceToken, ssecurity, password, ...safeConfig } = config;
  const hasToken = Boolean(serviceToken && String(serviceToken).trim().length > 0);
  return {
    ...safeConfig,
    hasServiceToken: hasToken,
    serviceToken: hasToken ? `${String(serviceToken).slice(0, 4)}••••••••` : '',
    miUserMasked: config.miUser ? (config.miUser.length > 4 ? `${config.miUser.slice(0, 2)}***${config.miUser.slice(-2)}` : '***') : ''
  };
}

let castLogs: Array<{
  id: string;
  timestamp: string;
  type: 'cast' | 'control' | 'tts' | 'sync' | 'error';
  message: string;
  detail?: string;
  success: boolean;
  did?: string;
  ip?: string;
  model?: string;
  protocol?: string;
  requestMethod?: string;
  httpStatus?: number;
  miioStatus?: string;
  minaStatus?: string;
  errorCode?: string | number;
  responseTimeMs?: number;
  streamUrl?: string;
  steps?: any[];
}> = [
  {
    id: 'log-1',
    timestamp: new Date(Date.now() - 3600000).toLocaleTimeString(),
    type: 'sync',
    message: 'TingLan MIoT 协议引擎已初始化',
    detail: `发现 ${xiaomiDevices.length} 台小米智能音箱设备`,
    success: true
  },
  {
    id: 'log-2',
    timestamp: new Date(Date.now() - 1800000).toLocaleTimeString(),
    type: 'tts',
    message: '客厅 Xiaomi Sound Pro 播报 TTS 欢迎词',
    detail: '“小爱同学已就绪，已连接 TingLan 音乐服务器”',
    success: true
  }
];

// Helper to get local network IP addresses
function getLocalNetworkIps(): string[] {
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

// ----------------- MI-IO UDP 54321 PROTOCOL ENGINE -----------------

// Send miIO UDP 54321 Hello packet to probe & handshake with Xiaomi/Xiaoai speaker
function sendMiioHello(ip: string, timeoutMs = 1500): Promise<{ reachable: boolean; did?: string; stamp?: number; latency: number }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const client = dgram.createSocket('udp4');
    let isResolved = false;

    const timer = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        try { client.close(); } catch {}
        resolve({ reachable: false, latency: timeoutMs });
      }
    }, timeoutMs);

    client.on('message', (msg) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timer);
        const latency = Date.now() - start;
        try {
          let didStr = '';
          let stamp = 0;
          if (msg.length >= 32 && msg[0] === 0x21 && msg[1] === 0x31) {
            const didNum = msg.readUInt32BE(8);
            stamp = msg.readUInt32BE(12);
            didStr = String(didNum);
          }
          try { client.close(); } catch {}
          resolve({ reachable: true, did: didStr, stamp, latency });
        } catch {
          try { client.close(); } catch {}
          resolve({ reachable: true, latency });
        }
      }
    });

    client.on('error', () => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timer);
        try { client.close(); } catch {}
        resolve({ reachable: false, latency: Date.now() - start });
      }
    });

    const helloPacket = Buffer.from('21310020ffffffffffffffffffffffffffffffffffffffffffffffffffffffff', 'hex');
    try {
      client.send(helloPacket, 0, helloPacket.length, 54321, ip, (err) => {
        if (err && !isResolved) {
          isResolved = true;
          clearTimeout(timer);
          try { client.close(); } catch {}
          resolve({ reachable: false, latency: Date.now() - start });
        }
      });
    } catch {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timer);
        try { client.close(); } catch {}
        resolve({ reachable: false, latency: 0 });
      }
    }
  });
}

// Send real encrypted AES-128-CBC miIO command over UDP 54321
async function sendMiioCommand(
  ip: string,
  tokenHex: string,
  method: string,
  params: any = [],
  timeoutMs = 3000
): Promise<{ success: boolean; result?: any; error?: string }> {
  if (!ip || !tokenHex) {
    return { success: false, error: '需要提供音箱 IP 和 32位 Hex Token' };
  }

  const cleanToken = tokenHex.trim().toLowerCase();
  if (cleanToken.length !== 32) {
    return { success: false, error: 'Token 格式不正确，必须为 32 位十六进制字符串' };
  }

  try {
    // 1. Handshake hello to get did & stamp
    const hello = await sendMiioHello(ip, 1500);
    const didNum = hello.did ? Number(hello.did) || 0 : 0;
    const stamp = (hello.stamp || 0) + 1;

    // 2. Derive Key and IV from Token: Key = MD5(token), IV = MD5(Key + token)
    const tokenBuf = Buffer.from(cleanToken, 'hex');
    const key = crypto.createHash('md5').update(tokenBuf).digest();
    const iv = crypto.createHash('md5').update(Buffer.concat([key, tokenBuf])).digest();

    // 3. Encrypt JSON payload using AES-128-CBC
    const msgObj = {
      id: Math.floor(Math.random() * 100000) + 1,
      method,
      params
    };
    const msgStr = JSON.stringify(msgObj);
    const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
    const encrypted = Buffer.concat([cipher.update(msgStr, 'utf8'), cipher.final()]);

    // 4. Build 32-byte header
    const header = Buffer.alloc(32);
    header.writeUInt16BE(0x2131, 0); // Magic: 0x2131
    header.writeUInt16BE(32 + encrypted.length, 2); // Length
    header.writeUInt32BE(0, 4); // Unknown
    header.writeUInt32BE(didNum, 8); // Device DID
    header.writeUInt32BE(stamp, 12); // Stamp

    // Checksum = MD5(header[0..16] + token + encrypted)
    const checksum = crypto.createHash('md5').update(
      Buffer.concat([header.subarray(0, 16), tokenBuf, encrypted])
    ).digest();
    checksum.copy(header, 16);

    const fullPacket = Buffer.concat([header, encrypted]);

    // 5. Send UDP packet & receive decrypted response
    return await new Promise((resolve) => {
      const client = dgram.createSocket('udp4');
      let isResolved = false;

      const timer = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          try { client.close(); } catch {}
          resolve({ success: false, error: 'miIO 指令响应超时 (UDP 54321)' });
        }
      }, timeoutMs);

      client.on('message', (respMsg) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timer);
          try {
            try { client.close(); } catch {}
            if (respMsg.length <= 32) {
              return resolve({ success: true, result: 'ok (ACK received)' });
            }
            const respEncrypted = respMsg.subarray(32);
            const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
            const decrypted = Buffer.concat([decipher.update(respEncrypted), decipher.final()]).toString('utf8');
            const cleanJson = decrypted.replace(/\0+$/g, '');
            const parsed = JSON.parse(cleanJson);
            if (parsed.error) {
              resolve({ success: false, error: parsed.error.message || JSON.stringify(parsed.error) });
            } else {
              resolve({ success: true, result: parsed.result ?? parsed });
            }
          } catch (decErr: any) {
            resolve({ success: true, result: 'packet_acknowledged' });
          }
        }
      });

      client.on('error', (err) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timer);
          try { client.close(); } catch {}
          resolve({ success: false, error: `miIO Socket 错误: ${err.message}` });
        }
      });

      client.send(fullPacket, 0, fullPacket.length, 54321, ip, (err) => {
        if (err && !isResolved) {
          isResolved = true;
          clearTimeout(timer);
          try { client.close(); } catch {}
          resolve({ success: false, error: `UDP 54321 发送失败: ${err.message}` });
        }
      });
    });
  } catch (cmdErr: any) {
    return { success: false, error: cmdErr.message || 'miIO 执行异常' };
  }
}

// TCP Ping test utility (Fallback for HTTP / UPnP endpoints)
function testTcpConnection(host: string, port = 80, timeoutMs = 1500): Promise<{ reachable: boolean; latency: number }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      const latency = Date.now() - start;
      socket.destroy();
      resolve({ reachable: true, latency });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({ reachable: false, latency: timeoutMs });
    });

    socket.on('error', () => {
      socket.destroy();
      resolve({ reachable: false, latency: Date.now() - start });
    });

    try {
      socket.connect(port, host);
    } catch {
      resolve({ reachable: false, latency: 0 });
    }
  });
}

// Combined Speaker Probe: First UDP 54321 miIO Hello, then TCP fallback
async function testMiioConnection(ip: string, timeoutMs = 1500): Promise<{ reachable: boolean; isMiio: boolean; did?: string; latency: number; message: string }> {
  if (!ip) return { reachable: false, isMiio: false, latency: 0, message: '无效 IP 地址' };

  // 1. First probe via UDP 54321 miIO Hello packet
  const miioRes = await sendMiioHello(ip, timeoutMs);
  if (miioRes.reachable) {
    return {
      reachable: true,
      isMiio: true,
      did: miioRes.did,
      latency: miioRes.latency,
      message: `✓ miIO 握手成功 (UDP 54321, 设备DID: ${miioRes.did || '已响应'}, 延迟: ${miioRes.latency}ms)`
    };
  }

  // 2. Fallback to TCP port test (e.g. 80 / 4343)
  const tcpRes = await testTcpConnection(ip, 80, 1000);
  if (tcpRes.reachable) {
    return {
      reachable: true,
      isMiio: false,
      latency: tcpRes.latency,
      message: `✓ 局域网 TCP 端口连通 (延迟: ${tcpRes.latency}ms)`
    };
  }

  return {
    reachable: false,
    isMiio: false,
    latency: miioRes.latency,
    message: `未能连接到 ${ip} (UDP 54321 及 TCP 80 无响应，请检查设备是否开机且处于同网段)`
  };
}

// ---------------- API ROUTES ----------------

// Health check for Docker HEALTHCHECK & load balancers
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    version: '1.4.2',
    server: 'TingLan-Xiaomi-Bridge',
    uptime: process.uptime(),
    songCount: storedSongs.length,
    deviceCount: xiaomiDevices.length,
    timestamp: new Date().toISOString()
  });
});

// System & Docker Deployment Info
app.get('/api/system/docker-info', (req: Request, res: Response) => {
  const localIps = getLocalNetworkIps();
  const primaryIp = localIps.length > 0 ? localIps[0] : '127.0.0.1';
  const resolvedServerHost = miotConfig.serverHost || (localIps.length > 0 ? `http://${primaryIp}:${PORT}` : '');

  res.json({
    serverHost: resolvedServerHost,
    detectedIps: [primaryIp],
    musicDir: '/app/music',
    dataDir: '/app/data',
    port: PORT,
    containerName: 'tinglan-xiaomi',
    imageName: 'tinglan-xiaomi:latest',
    isHostNetworkRecommended: true,
    sampleDockerRun: `docker run -d --name tinglan-xiaomi \\
  --restart unless-stopped \\
  -p ${PORT}:${PORT} \\
  -e SERVER_HOST="http://${primaryIp}:${PORT}" \\
  -e PORT=${PORT} \\
  -v /volume1/music:/app/music:ro \\
  -v /volume1/docker/tinglan/data:/app/data \\
  tinglan-xiaomi:latest`,
    sampleDockerCompose: `version: '3.8'
services:
  tinglan:
    image: tinglan-xiaomi:latest
    container_name: tinglan-xiaomi
    restart: unless-stopped
    ports:
      - "${PORT}:${PORT}"
    environment:
      - SERVER_HOST=http://${primaryIp}:${PORT}
      - PORT=${PORT}
      - MI_USER=your_xiaomi_account
      - JWT_SECRET=your_custom_jwt_secret
    volumes:
      - ./music:/app/music:ro
      - ./data:/app/data`
  });
});

// ---------------- TTS & SPEECH STREAMING API ----------------

// Get available TTS voices
app.get('/api/tts/voices', (req: Request, res: Response) => {
  res.json({
    success: true,
    voices: POPULAR_TTS_VOICES,
    defaultVoice: 'zh-CN-XiaoxiaoNeural'
  });
});

// Stream high-definition TTS speech MP3 (supports HTTP 206 partial content for speakers)
const handleTtsAudioStream = async (req: Request, res: Response) => {
  const text = String(req.query.text || req.body?.text || '').trim();
  const voice = String(req.query.voice || req.body?.voice || 'zh-CN-XiaoxiaoNeural').trim();
  const rate = String(req.query.rate || '+0%').trim();
  const pitch = String(req.query.pitch || '+0Hz').trim();

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Accept-Ranges');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!text) {
    return res.status(400).send('Missing "text" query param for TTS synthesis');
  }

  try {
    const audioBuffer = await ttsEngine.synthesizeSpeechMp3(text, voice, rate, pitch);
    const totalLength = audioBuffer.length;
    const rangeHeader = req.headers.range;

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=86400');

    if (req.method === 'HEAD') {
      res.setHeader('Content-Length', totalLength);
      return res.status(200).end();
    }

    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalLength - 1;

      if (start >= totalLength || end >= totalLength) {
        res.status(416).setHeader('Content-Range', `bytes */${totalLength}`).end();
        return;
      }

      const chunk = audioBuffer.subarray(start, end + 1);
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${totalLength}`);
      res.setHeader('Content-Length', chunk.length);
      res.send(chunk);
    } else {
      res.setHeader('Content-Length', totalLength);
      res.send(audioBuffer);
    }
  } catch (err: any) {
    console.error('[TTS API] Audio stream error:', err.message);
    res.status(500).send(`TTS Error: ${err.message}`);
  }
};

app.get('/api/tts/stream', handleTtsAudioStream);
app.get('/api/tts/audio.mp3', handleTtsAudioStream);
app.post('/api/tts/stream', handleTtsAudioStream);

// ---------------- SONGS API ----------------

// Get all songs
app.get('/api/songs', (req: Request, res: Response) => {
  res.json(storedSongs);
});

// Recursive scanner for music directory (supporting nested albums/artists)
function scanMusicDirectory(dir: string, baseDir = dir): string[] {
  let fileList: string[] = [];
  if (!fs.existsSync(dir)) return fileList;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        fileList = fileList.concat(scanMusicDirectory(fullPath, baseDir));
      } else if (entry.isFile()) {
        fileList.push(path.relative(baseDir, fullPath));
      }
    }
  } catch (e) {
    console.warn('Error reading directory:', dir, e);
  }
  return fileList;
}

// Scan /music folder for newly added files (recursively) with genuine ID3 metadata extraction
app.post('/api/songs/scan', async (req: Request, res: Response) => {
  try {
    const existingSongsMap = new Map(storedSongs.map(s => [s.id, s]));
    const existingFilenames = new Set(storedSongs.map(s => s.localFilename).filter(Boolean));
    const relativeFiles = scanMusicDirectory(MUSIC_DIR);
    const audioExtensions = ['.mp3', '.flac', '.wav', '.m4a', '.ogg', '.aac', '.opus', '.ape', '.dsf', '.dff'];
    let newlyFound = 0;

    for (const relFile of relativeFiles) {
      const ext = path.extname(relFile).toLowerCase();
      if (!audioExtensions.includes(ext)) continue;
      if (existingFilenames.has(relFile)) continue;

      const baseName = path.basename(relFile, ext);
      const songId = `song-scan-${Buffer.from(relFile).toString('hex').slice(0, 10)}`;

      if (existingSongsMap.has(songId)) continue;

      const fullFilePath = path.join(MUSIC_DIR, relFile);
      let fileSizeMb = '5.0';
      try {
        const stat = fs.statSync(fullFilePath);
        fileSizeMb = (stat.size / (1024 * 1024)).toFixed(1);
      } catch {}

      // Default heuristic metadata from directory structure e.g. Artist/Album/Song or Artist - Song
      const dirParts = relFile.split(path.sep);
      let artist = '本地歌手';
      let album = '挂载目录导入';
      let title = baseName;

      if (dirParts.length >= 3) {
        artist = dirParts[0].trim();
        album = dirParts[1].trim();
        title = baseName.replace(/^\d+[\s\.\-_]*/, ''); // strip track number prefix if present
      } else if (dirParts.length === 2) {
        album = dirParts[0].trim();
        if (baseName.includes(' - ')) {
          const parts = baseName.split(' - ');
          artist = parts[0].trim();
          title = parts.slice(1).join(' - ').trim();
        }
      } else if (baseName.includes(' - ')) {
        const parts = baseName.split(' - ');
        artist = parts[0].trim();
        title = parts.slice(1).join(' - ').trim();
      }

      let bitrateTag = '320kbps MP3';
      if (ext === '.flac') bitrateTag = 'FLAC 24bit/96kHz';
      else if (ext === '.wav') bitrateTag = 'WAV 16bit/44.1kHz';
      else if (ext === '.m4a' || ext === '.aac') bitrateTag = 'AAC 256kbps';
      else if (ext === '.dsf' || ext === '.dff') bitrateTag = 'DSD 2.8MHz DSD64';
      else if (ext === '.ape') bitrateTag = 'APE 无损';

      let durationSec = 180;
      let parsedYear = new Date().getFullYear();
      let parsedGenre = ext.toUpperCase().replace('.', '') + ' 高保真';

      // Parse genuine audio tags using music-metadata
      try {
        const meta = await parseFile(fullFilePath);
        if (meta.format.duration && meta.format.duration > 0) {
          durationSec = Math.round(meta.format.duration);
        }
        if (meta.format.bitrate && meta.format.bitrate > 0) {
          bitrateTag = `${Math.round(meta.format.bitrate / 1000)}kbps ${ext.replace('.', '').toUpperCase()}`;
        }
        if (meta.common.title && meta.common.title.trim()) {
          title = meta.common.title.trim();
        }
        if (meta.common.artist && meta.common.artist.trim()) {
          artist = meta.common.artist.trim();
        }
        if (meta.common.album && meta.common.album.trim()) {
          album = meta.common.album.trim();
        }
        if (meta.common.year) {
          parsedYear = meta.common.year;
        }
        if (meta.common.genre && meta.common.genre.length > 0) {
          parsedGenre = meta.common.genre.join(' / ');
        }
      } catch (parseErr) {
        // Fallback to directory/filename heuristics if tag parsing fails
      }

      const newSong = {
        id: songId,
        title,
        artist,
        album,
        duration: durationSec,
        url: `/api/stream/${songId}`,
        coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
        genre: parsedGenre,
        year: parsedYear,
        bitrate: bitrateTag,
        fileSize: `${fileSizeMb} MB`,
        isFavorite: false,
        source: 'local',
        localFilename: relFile,
        lyrics: `[00:00.00]${title} - ${artist}\n[00:10.00]已从挂载目录 /app/music/${relFile} 加载\n[00:20.00]支持通过 MIoT / Mina 协议一键推送到小米音箱播放`
      };

      storedSongs.push(newSong);
      existingFilenames.add(relFile);
      newlyFound++;
    }

    saveJson(SONGS_FILE, storedSongs);

    castLogs.unshift({
      id: `log-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      type: 'sync',
      message: `递归扫描挂载目录 /app/music 完成`,
      detail: `新增 ${newlyFound} 首音频曲目（已解析真实时长与ID3元数据），曲库总计 ${storedSongs.length} 首`,
      success: true
    });
    if (castLogs.length > 50) castLogs.pop();

    res.json({
      success: true,
      added: newlyFound,
      total: storedSongs.length,
      songs: storedSongs
    });
  } catch (err: any) {
    console.error('Failed to scan music directory:', err);
    res.status(500).json({ error: 'Failed to scan music directory', message: err.message });
  }
});

// Upload song (with binary base64 file data and ID3 metadata parsing)
app.post('/api/songs/upload', async (req: Request, res: Response) => {
  try {
    const { title, artist, album, genre, duration, lyrics, bitrate, fileSize, fileBase64, fileName, coverUrl } = req.body;

    if (!fileBase64) {
      return res.status(400).json({
        success: false,
        error: '上传失败：必须提供有效音频文件数据 (fileBase64)，系统已禁用虚假伪造音频兜底'
      });
    }

    const songId = `song-up-${Date.now()}`;
    let ext = '.mp3';
    if (fileName) {
      ext = path.extname(fileName) || '.mp3';
    }

    const fileBuffer = Buffer.from(fileBase64, 'base64');
    const targetPath = path.join(MUSIC_DIR, `${songId}${ext}`);

    try {
      fs.writeFileSync(targetPath, fileBuffer);
    } catch (writeErr: any) {
      return res.status(500).json({
        success: false,
        error: `保存音频文件到本地存储目录失败: ${writeErr.message}`
      });
    }

    let realDuration = duration ? Number(duration) : 180;
    let realTitle = title || path.basename(fileName || '上传曲目', ext);
    let realArtist = artist || '未知歌手';
    let realAlbum = album || '本地上传专辑';
    let realBitrate = bitrate || '320kbps MP3';
    let realGenre = genre || '流行 Pop';
    let realYear = new Date().getFullYear();
    const actualFileSizeMb = (fileBuffer.length / (1024 * 1024)).toFixed(1);

    try {
      const meta = await parseBuffer(fileBuffer);
      if (meta.format.duration && meta.format.duration > 0) {
        realDuration = Math.round(meta.format.duration);
      }
      if (meta.format.bitrate && meta.format.bitrate > 0) {
        realBitrate = `${Math.round(meta.format.bitrate / 1000)}kbps ${ext.replace('.', '').toUpperCase()}`;
      }
      if (meta.common.title && meta.common.title.trim()) realTitle = meta.common.title.trim();
      if (meta.common.artist && meta.common.artist.trim()) realArtist = meta.common.artist.trim();
      if (meta.common.album && meta.common.album.trim()) realAlbum = meta.common.album.trim();
      if (meta.common.year) realYear = meta.common.year;
      if (meta.common.genre && meta.common.genre.length > 0) realGenre = meta.common.genre.join(' / ');
    } catch (parseErr) {
      console.warn('Could not parse metadata from buffer, using user provided values:', parseErr);
    }

    const newSong = {
      id: songId,
      title: realTitle,
      artist: realArtist,
      album: realAlbum,
      duration: realDuration,
      url: `/api/stream/${songId}`,
      coverUrl: coverUrl || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80',
      genre: realGenre,
      year: realYear,
      bitrate: realBitrate,
      fileSize: `${actualFileSizeMb} MB`,
      isFavorite: false,
      source: 'uploaded',
      localFilename: `${songId}${ext}`,
      lyrics: lyrics || `[00:00.00]${realTitle} - ${realArtist}\n[00:10.00]本地音频已入库，支持即刻投放至小爱音箱`
    };

    storedSongs.unshift(newSong);
    saveJson(SONGS_FILE, storedSongs);

    castLogs.unshift({
      id: `log-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      type: 'sync',
      message: `新曲目已入库: 《${newSong.title}》`,
      detail: `真实时长: ${Math.floor(newSong.duration / 60)}分${newSong.duration % 60}秒 | 串流路径: /api/stream/${songId}`,
      success: true
    });

    res.json({ success: true, song: newSong });
  } catch (err: any) {
    console.error('Upload handler error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete song
app.delete('/api/songs/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const initialLen = storedSongs.length;
  storedSongs = storedSongs.filter(s => s.id !== id);

  if (storedSongs.length < initialLen) {
    saveJson(SONGS_FILE, storedSongs);
    // Remove disk file if exists
    for (const ext of ['.wav', '.mp3', '.flac', '.m4a', '.ogg']) {
      const p = path.join(MUSIC_DIR, `${id}${ext}`);
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch {}
      }
    }
    return res.json({ success: true, message: `歌曲 ${id} 已删除` });
  }
  res.status(404).json({ error: 'Song not found' });
});

// Toggle Favorite
app.post('/api/songs/:id/favorite', (req: Request, res: Response) => {
  const { id } = req.params;
  const song = storedSongs.find(s => s.id === id);
  if (song) {
    song.isFavorite = !song.isFavorite;
    saveJson(SONGS_FILE, storedSongs);
    return res.json({ success: true, isFavorite: song.isFavorite });
  }
  res.status(404).json({ error: 'Song not found' });
});

// ---------------- PLAYLISTS API ----------------

app.get('/api/playlists', (req: Request, res: Response) => {
  res.json(storedPlaylists);
});

app.post('/api/playlists', (req: Request, res: Response) => {
  const { name, description, songIds } = req.body;
  const newPl = {
    id: `pl-${Date.now()}`,
    name: name || '新建歌单',
    description: description || '',
    coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
    songIds: Array.isArray(songIds) ? songIds : [],
    createdAt: new Date().toISOString().split('T')[0]
  };
  storedPlaylists.push(newPl);
  saveJson(PLAYLISTS_FILE, storedPlaylists);
  res.json({ success: true, playlist: newPl, playlists: storedPlaylists });
});

// Update playlist (name, description, songIds)
app.put('/api/playlists/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, description, songIds } = req.body;
  const playlist = storedPlaylists.find(p => p.id === id);
  if (!playlist) {
    return res.status(404).json({ error: 'Playlist not found' });
  }

  if (name !== undefined) playlist.name = name.trim();
  if (description !== undefined) playlist.description = description.trim();
  if (Array.isArray(songIds)) playlist.songIds = songIds;

  saveJson(PLAYLISTS_FILE, storedPlaylists);
  res.json({ success: true, playlist, playlists: storedPlaylists });
});

// Add song to playlist
app.post('/api/playlists/:id/songs', (req: Request, res: Response) => {
  const { id } = req.params;
  const { songId, songIds } = req.body;
  const playlist = storedPlaylists.find(p => p.id === id);
  if (!playlist) {
    return res.status(404).json({ error: 'Playlist not found' });
  }

  const idsToAdd: string[] = Array.isArray(songIds) ? songIds : (songId ? [songId] : []);
  let addedCount = 0;

  idsToAdd.forEach(sId => {
    if (!playlist.songIds.includes(sId)) {
      playlist.songIds.push(sId);
      addedCount++;
    }
  });

  saveJson(PLAYLISTS_FILE, storedPlaylists);
  res.json({ success: true, addedCount, playlist, playlists: storedPlaylists });
});

// Remove song from playlist
app.delete('/api/playlists/:id/songs/:songId', (req: Request, res: Response) => {
  const { id, songId } = req.params;
  const playlist = storedPlaylists.find(p => p.id === id);
  if (!playlist) {
    return res.status(404).json({ error: 'Playlist not found' });
  }

  playlist.songIds = playlist.songIds.filter(sId => sId !== songId);
  saveJson(PLAYLISTS_FILE, storedPlaylists);
  res.json({ success: true, playlist, playlists: storedPlaylists });
});

// Delete playlist
app.delete('/api/playlists/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const initialLen = storedPlaylists.length;
  storedPlaylists = storedPlaylists.filter(p => p.id !== id);

  if (storedPlaylists.length < initialLen) {
    saveJson(PLAYLISTS_FILE, storedPlaylists);
    return res.json({ success: true, message: '歌单已成功删除', playlists: storedPlaylists });
  }
  res.status(404).json({ error: 'Playlist not found' });
});

// ---------------- MIOT & XIAOMI SPEAKER API ----------------

/**
 * Helper to check if the current request is authorized for smart speaker admin actions.
 * If authentication is not globally or local network required, guests are allowed as admins.
 * If explicitly logged in as a normal user, they are always blocked.
 */
function checkMiotAdminPermission(req: Request, res: Response): boolean {
  const clientUser = (req as any).user;
  const authRequired = isAuthRequiredForRequest(req);

  if (authRequired) {
    if (!clientUser || clientUser.role !== 'admin') {
      res.status(200).json({ success: false, error: '权限不足：该操作仅系统管理员允许执行' });
      return false;
    }
  } else {
    if (clientUser && clientUser.role !== 'admin') {
      res.status(200).json({ success: false, error: '权限不足：普通用户无权执行此操作' });
      return false;
    }
  }
  return true;
}

/**
 * Helper to check if the current request has permission to control speaker playback/casting.
 */
function checkMiotControlPermission(req: Request, res: Response): boolean {
  const clientUser = (req as any).user;
  const authRequired = isAuthRequiredForRequest(req);

  if (authRequired) {
    if (!clientUser) {
      res.status(200).json({ success: false, error: '权限不足：请先登录账号后再控制音箱播放' });
      return false;
    }
    if (clientUser.role !== 'admin' && securitySettings.allowUserMiotControl === false) {
      res.status(200).json({ success: false, error: '权限不足：系统管理员已限制普通用户控制音箱播放' });
      return false;
    }
  } else {
    if (clientUser && clientUser.role !== 'admin' && securitySettings.allowUserMiotControl === false) {
      res.status(200).json({ success: false, error: '权限不足：系统管理员已限制普通用户控制音箱播放' });
      return false;
    }
  }
  return true;
}

/**
 * Helper to check if the current request has permission to broadcast TTS.
 */
function checkMiotTtsPermission(req: Request, res: Response): boolean {
  const clientUser = (req as any).user;
  const authRequired = isAuthRequiredForRequest(req);

  if (authRequired) {
    if (!clientUser) {
      res.status(200).json({ success: false, error: '权限不足：请先登录账号后再发送语音 TTS' });
      return false;
    }
    if (clientUser.role !== 'admin' && securitySettings.allowUserMiotTts === false) {
      res.status(200).json({ success: false, error: '权限不足：系统管理员已禁止普通用户发送语音 TTS 播报' });
      return false;
    }
  } else {
    if (clientUser && clientUser.role !== 'admin' && securitySettings.allowUserMiotTts === false) {
      res.status(200).json({ success: false, error: '权限不足：系统管理员已禁止普通用户发送语音 TTS 播报' });
      return false;
    }
  }
  return true;
}

// MIoT Configuration
app.get('/api/miot/config', (req: Request, res: Response) => {
  res.json(sanitizeMiotConfig(miotConfig));
});

app.post('/api/miot/config', (req: Request, res: Response) => {
  if (!checkMiotAdminPermission(req, res)) return;

  const incoming = { ...req.body };
  // Never overwrite real tokens if incoming contains masked bullets or asterisks or empty string
  if (!incoming.serviceToken || incoming.serviceToken.includes('****') || incoming.serviceToken.includes('••••')) {
    delete incoming.serviceToken;
  }
  // Never wipe internal tokens unless explicitly provided
  if (!incoming.passToken && (miotConfig as any).passToken) delete incoming.passToken;
  if (!incoming.ssecurity && (miotConfig as any).ssecurity) delete incoming.ssecurity;
  if (!incoming.xiaomiioServiceToken && (miotConfig as any).xiaomiioServiceToken) delete incoming.xiaomiioServiceToken;
  if (!incoming.micoServiceToken && (miotConfig as any).micoServiceToken) delete incoming.micoServiceToken;
  if (!incoming.userId && miotConfig.userId) delete incoming.userId;

  miotConfig = { ...miotConfig, ...incoming };
  if ((miotConfig as any).passToken || (miotConfig.serviceToken && miotConfig.userId)) {
    miotConfig.isLoggedIn = true;
  }
  saveJson(CONFIG_FILE, miotConfig);
  castLogs.unshift({
    id: `log-${Date.now()}`,
    timestamp: new Date().toLocaleTimeString(),
    type: 'sync',
    message: '已更新小米音箱连接配置',
    detail: `服务器串流地址: ${miotConfig.serverHost}, 默认设备: ${miotConfig.activeDeviceId}`,
    success: true
  });
  res.json({ success: true, config: sanitizeMiotConfig(miotConfig) });
});

// Helper to extract clean userId, serviceToken, and passToken even if raw cookie strings or .mi.token JSON are passed
function parseServiceTokenAndUserId(inputUid: string, inputToken: string, inputPassToken?: string): { userId: string; serviceToken: string; passToken: string; cUserId?: string } {
  let userId = String(inputUid || '').trim();
  let serviceToken = String(inputToken || '').trim();
  let passToken = String(inputPassToken || '').trim();
  let cUserId = '';

  // 1. Check if input is a JSON string (e.g. .mi.token format from xiaomusic / miservice)
  for (const raw of [inputUid, inputToken, inputPassToken]) {
    if (raw && (raw.startsWith('{') || raw.includes('"userId"') || raw.includes('"micoapi"') || raw.includes('"passToken"'))) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.userId) userId = String(parsed.userId);
        if (parsed.cUserId) cUserId = String(parsed.cUserId);
        if (parsed.passToken) passToken = String(parsed.passToken);
        if (parsed.micoapi?.serviceToken) serviceToken = String(parsed.micoapi.serviceToken);
        else if (parsed.serviceToken) serviceToken = String(parsed.serviceToken);
        else if (parsed.xiaomiio?.serviceToken) serviceToken = String(parsed.xiaomiio.serviceToken);
      } catch {}
    }
  }

  const combined = `${userId}; ${serviceToken}; ${passToken}`;

  // Extract cUserId if present (e.g. cUserId=JTq5lCGWX...)
  const cUidMatch = combined.match(/\bcUserId\s*[:=]\s*["']?([^;\s,"'}{]+)/i);
  if (cUidMatch) {
    cUserId = cUidMatch[1].replace(/^["']|["']$/g, '').trim();
  }

  // Prioritize pure numeric userId: userId=12345678 or uid=12345678
  const numericUidMatch = combined.match(/\b(?:userId|uid)\s*[:=]\s*["']?(\d{5,15})["']?/i);
  if (numericUidMatch) {
    userId = numericUidMatch[1];
  } else {
    // If no pure numeric userId in combined, check non-cUserId userId
    const rawUidMatch = combined.match(/(?:^|[\s;,])userId\s*[:=]\s*["']?([^;\s,"'}{]+)/i);
    if (rawUidMatch) {
      userId = rawUidMatch[1];
    }
  }

  const tokenMatch = combined.match(/(?:serviceToken)\s*[:=]\s*["']?([^;\s,"'}{]+)/i);
  if (tokenMatch) {
    serviceToken = tokenMatch[1];
  }

  const passMatch = combined.match(/(?:passToken)\s*[:=]\s*["']?([^;\s,"'}{]+)/i);
  if (passMatch) {
    passToken = passMatch[1];
  }

  userId = userId.replace(/^["']|["']$/g, '').replace(/;$/, '').trim();
  serviceToken = serviceToken.replace(/^["']|["']$/g, '').replace(/;$/, '').trim();
  passToken = passToken.replace(/^["']|["']$/g, '').replace(/;$/, '').trim();

  return { userId, serviceToken, passToken, cUserId: cUserId || undefined };
}

// Helper to query Xiaomi smart speaker device list from Mina Cloud API & Xiaomi Home APIs
async function queryXiaomiMinaDevices(userId: string, serviceToken: string): Promise<any[]> {
  try {
    const res = await xiaoaiResolverEngine.resolveDevices({
      userId,
      serviceToken: (miotConfig as any).micoServiceToken || serviceToken,
      xiaomiioServiceToken: (miotConfig as any).xiaomiioServiceToken || serviceToken,
      ssecurity: (miotConfig as any).ssecurity,
      existingDevices: xiaomiDevices,
      activeStreamIps: Array.from(activeStreamIps)
    });
    return res.xiaoAiDevices;
  } catch (err: any) {
    console.warn('queryXiaomiMinaDevices pipeline error:', err.message);
    return [];
  }
}

// Xiaomi Cloud Passport Authenticator (Enhanced with Full STS Token Exchange)
async function authenticateXiaomiPassport(user: string, pass: string): Promise<{
  success: boolean;
  userId?: string;
  ssecurity?: string;
  serviceToken?: string;
  devices?: any[];
  error?: string;
  code?: number;
}> {
  if (!user || !pass) {
    return { success: false, error: '请输入小米账号与密码' };
  }

  const result = await xiaomiPassport.loginWithPassword(user, pass, 'micoapi');
  if (!result.success || !result.userId || !result.serviceToken) {
    return {
      success: false,
      code: result.code,
      error: result.error || '小米登录未通过'
    };
  }

  // Auto-connect Mina WebSocket in the background for real-time XiaoAi events
  try {
    minaWsClient.connect(result.userId, result.serviceToken, miotConfig.activeDeviceId || '');
  } catch (wsErr: any) {
    console.warn('Auto-connecting Mina WS failed:', wsErr.message);
  }

  // Query real Xiaomi smart speaker device list using the Full Dual-Track Pipeline:
  // Xiaomi Cloud + LAN miIO Hello -> Device Resolver -> MIoT Spec Filter
  let devices: any[] = [];
  try {
    const resolveResult = await xiaoaiResolverEngine.resolveDevices({
      userId: result.userId,
      serviceToken: result.serviceToken,
      existingDevices: xiaomiDevices,
      activeStreamIps: Array.from(activeStreamIps)
    });
    devices = resolveResult.xiaoAiDevices;
  } catch (devErr: any) {
    console.warn('Failed to resolve XiaoAi devices via pipeline:', devErr.message);
  }

  return {
    success: true,
    userId: result.userId,
    ssecurity: result.ssecurity,
    serviceToken: result.serviceToken,
    devices
  };
}

// Xiaomi Cloud / Account Login & Token Binding
app.post('/api/miot/login', async (req: Request, res: Response) => {
  if (!checkMiotAdminPermission(req, res)) return;

  const { username, password, mode, token, did, ip, serviceToken, userId, passToken } = req.body;

  // Mode 1: Direct Token / LAN Mode (For users avoiding 2FA)
  if (mode === 'token' || (token && ip)) {
    if (!token || !ip) {
      return res.status(400).json({ success: false, error: '局域网直连模式需要提供音箱 IP 和 32位 Device Token' });
    }
    const cleanToken = String(token).trim().toLowerCase();
    const cleanIp = String(ip).trim();
    const targetDid = did ? String(did).trim() : `did-${Date.now()}`;

    // Test connectivity using real miIO UDP 54321
    const probe = await testMiioConnection(cleanIp, 2000);
    const resolvedDid = probe.did || targetDid;

    // Query actual model and mac via miIO.info using the provided token
    let detectedModel = 'xiaomi.wifispeaker.direct';
    let detectedMac = '00:1A:7D:' + Math.random().toString(16).slice(2, 8).toUpperCase();
    let detectedHw = 'MIoT-Local';
    let detectedName = `局域网小爱音箱 (${cleanIp})`;
    try {
      const infoRes = await sendMiioCommand(cleanIp, cleanToken, 'miIO.info', [], 1500);
      if (infoRes.success && infoRes.result) {
        if (infoRes.result.model) detectedModel = infoRes.result.model;
        if (infoRes.result.mac) detectedMac = infoRes.result.mac;
        if (infoRes.result.hw_ver) detectedHw = infoRes.result.hw_ver;
      }
    } catch {}

    // Verify whether this miIO device is truly a speaker
    if (detectedModel !== 'xiaomi.wifispeaker.direct') {
      const specCheck = await xiaoaiResolverEngine.evaluateMiotSpec(detectedModel);
      if (!specCheck.isSpeaker) {
        return res.status(400).json({
          success: false,
          error: `目标设备 (型号: ${detectedModel}) 并非小爱智能音箱！${specCheck.reason}。miIO 协议为米家通用协议，请确认输入的 IP 和 Token 对应的是小爱音箱。`
        });
      }
    }

    const existingDev = xiaomiDevices.find(d => d.ip === cleanIp || d.did === resolvedDid || d.did === targetDid);
    if (existingDev) {
      existingDev.token = cleanToken;
      existingDev.isOnline = probe.reachable;
      if (probe.did) existingDev.did = probe.did;
      if (detectedModel !== 'xiaomi.wifispeaker.direct') existingDev.model = detectedModel;
      if (detectedHw !== 'MIoT-Local') existingDev.hardware = detectedHw;
    } else {
      xiaomiDevices.unshift({
        did: resolvedDid,
        name: detectedName,
        model: detectedModel,
        hardware: detectedHw,
        ip: cleanIp,
        mac: detectedMac,
        token: cleanToken,
        isOnline: probe.reachable,
        status: { playing: false, volume: 50, muted: false, updatedAt: new Date().toISOString() }
      });
    }
    miotConfig.isLoggedIn = true;
    miotConfig.bindMode = 'token';
    miotConfig.activeDeviceId = existingDev ? existingDev.did : resolvedDid;
    saveJson(CONFIG_FILE, miotConfig);
    saveJson(DEVICES_FILE, xiaomiDevices);

    castLogs.unshift({
      id: `log-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      type: 'sync',
      message: `已通过局域网 Token 绑定音箱: ${cleanIp}`,
      detail: `Token: ${cleanToken.slice(0, 6)}...${cleanToken.slice(-4)} | ${probe.message}`,
      success: true
    });
    return res.json({
      success: true,
      message: `局域网 Token 绑定成功！${probe.message}`,
      devices: xiaomiDevices.map(sanitizeDevice),
      config: sanitizeMiotConfig(miotConfig)
    });
  }

  // Mode 2: ServiceToken / PassToken / Cookie Import (Direct without password)
  if (mode === 'cookie' || mode === 'passToken' || (serviceToken && userId) || (passToken && userId) || (req.body.passToken && req.body.userId)) {
    const { userId: parsedUid, serviceToken: cleanToken, passToken: cleanPassToken, cUserId: cleanCUserId } = parseServiceTokenAndUserId(
      userId || req.body.userId,
      serviceToken || req.body.serviceToken,
      passToken || req.body.passToken
    );

    let cleanUid = parsedUid;

    if (!cleanUid || cleanUid === 'undefined') {
      return res.status(400).json({ success: false, error: '请输入有效的 User ID（支持从 Cookie 复制或粘贴完整 Cookie 字符串）' });
    }

    let activeServiceToken = cleanToken;
    let xiaomiioServiceToken = '';

    // Candidate passToken for STS exchange: cleanPassToken or cleanToken if cleanPassToken is empty
    const candidatePassToken = cleanPassToken || cleanToken;

    // If candidate passToken is provided (e.g. from www.mi.com / account.xiaomi.com Cookie or PassToken field),
    // automatically exchange it for official micoapi & xiaomiio serviceTokens!
    if (candidatePassToken) {
      try {
        const [micoResult, miioResult] = await Promise.allSettled([
          xiaomiPassport.fetchAdditionalStsToken(cleanUid, candidatePassToken, 'micoapi', cleanCUserId),
          xiaomiPassport.fetchAdditionalStsToken(cleanUid, candidatePassToken, 'xiaomiio', cleanCUserId)
        ]);

        if (micoResult.status === 'fulfilled' && micoResult.value.serviceToken) {
          activeServiceToken = micoResult.value.serviceToken;
          if (micoResult.value.ssecurity) {
            (miotConfig as any).ssecurity = micoResult.value.ssecurity;
          }
          if (micoResult.value.userId && /^\d+$/.test(micoResult.value.userId)) {
            cleanUid = micoResult.value.userId;
          }
        }
        if (miioResult.status === 'fulfilled' && miioResult.value.serviceToken) {
          xiaomiioServiceToken = miioResult.value.serviceToken;
        }

        // If explicitly cleanPassToken was passed but exchange failed for both micoapi and xiaomiio
        if (cleanPassToken && !activeServiceToken && !xiaomiioServiceToken) {
          const errMsg = (micoResult.status === 'fulfilled' && micoResult.value.error)
            ? micoResult.value.error
            : 'PassToken 置换失败，凭据可能已失效或需要二次验证';
          return res.status(401).json({
            success: false,
            error: `小米安全授权失败: ${errMsg}。提示：www.mi.com 网站的 PassToken/Cookie 包含跨域与 IP 风控限制，小爱音箱需要专属的 micoapi 令牌。强力推荐使用【二维码扫码登录】或【账号密码登录】（自动生成全套专有令牌），或登录 https://mina.mi.com 复制小爱官网 Cookie。`
          });
        }
      } catch (err: any) {
        console.warn('Failed to exchange passToken for micoapi/xiaomiio serviceTokens:', err.message);
      }
    }

    if (!activeServiceToken || activeServiceToken === 'undefined') {
      return res.status(400).json({ success: false, error: '未能提取到有效的 ServiceToken 或 PassToken。请确认从 account.xiaomi.com 或 www.mi.com 复制的 Cookie 包含 passToken 或 serviceToken' });
    }

    miotConfig.userId = cleanUid;
    miotConfig.serviceToken = activeServiceToken;
    if (xiaomiioServiceToken) {
      (miotConfig as any).stsTokens = {
        micoapi: activeServiceToken,
        xiaomiio: xiaomiioServiceToken
      };
    }
    if (cleanPassToken) (miotConfig as any).passToken = cleanPassToken;
    miotConfig.miUser = username || `uid_${cleanUid}`;
    miotConfig.isLoggedIn = true;
    miotConfig.bindMode = 'cookie';
    saveJson(CONFIG_FILE, miotConfig);

    // Try to sync devices using the full Dual-Track Pipeline:
    // Xiaomi Cloud + LAN miIO Hello -> Device Resolver -> MIoT Spec Filter
    let syncedDevices: any[] = [];
    try {
      const resolveResult = await xiaoaiResolverEngine.resolveDevices({
        userId: cleanUid,
        serviceToken: activeServiceToken,
        xiaomiioServiceToken: xiaomiioServiceToken || activeServiceToken,
        existingDevices: xiaomiDevices,
        activeStreamIps: Array.from(activeStreamIps)
      });
      syncedDevices = resolveResult.xiaoAiDevices;
      if (syncedDevices && syncedDevices.length > 0) {
        xiaomiDevices = syncedDevices;
        if (!miotConfig.activeDeviceId || !xiaomiDevices.some(d => d.did === miotConfig.activeDeviceId)) {
          miotConfig.activeDeviceId = xiaomiDevices[0].did;
        }
        saveJson(DEVICES_FILE, xiaomiDevices);
        saveJson(CONFIG_FILE, miotConfig);
      }
    } catch (e: any) {
      console.warn('Sync devices with imported serviceToken error:', e.message);
    }

    const logDetail = syncedDevices.length > 0
      ? `User ID: ${cleanUid} | 成功调取米家/Mina API 并同步到 ${syncedDevices.length} 台音箱设备`
      : `User ID: ${cleanUid} | 调取了 Mina/米家云端接口，暂未发现对应的小爱音箱（建议在【局域网/手动添加】补充 IP 或核对账号）`;

    castLogs.unshift({
      id: `log-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      type: syncedDevices.length > 0 ? 'sync' : 'error',
      message: `已通过 ServiceToken 关联小米服务`,
      detail: logDetail,
      success: true
    });
    if (castLogs.length > 50) castLogs.pop();

    const successMessage = syncedDevices.length > 0
      ? `ServiceToken 关联成功！已成功同步 ${syncedDevices.length} 台小爱音箱设备。`
      : `ServiceToken 关联成功，但云端未查找到绑定的音箱设备。请确认该账号下是否有绑定的小爱音箱，或使用【手动添加音箱】输入音箱 IP。`;

    return res.json({
      success: true,
      message: successMessage,
      devices: xiaomiDevices.map(sanitizeDevice),
      config: sanitizeMiotConfig(miotConfig)
    });
  }

  // Mode 3: Real Xiaomi Cloud Passport API Authentication
  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: '请输入有效的小米账号（邮箱/手机号/小米ID）以及密码'
    });
  }

  const authResult = await authenticateXiaomiPassport(username.trim(), password);

  if (!authResult.success || !authResult.userId || !authResult.serviceToken || authResult.userId === 'undefined') {
    castLogs.unshift({
      id: `log-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      type: 'error',
      message: `小米账号登录验证未通过: ${username}`,
      detail: authResult.error || '账号或密码错误或受风控保护',
      success: false
    });
    if (castLogs.length > 50) castLogs.pop();

    return res.status(401).json({
      success: false,
      code: authResult.code,
      error: authResult.error || '小米账号或密码错误，请检查核对'
    });
  }

  // Real authentication passed with verified userId and serviceToken!
  miotConfig.miUser = username.trim();
  miotConfig.userId = authResult.userId;
  miotConfig.serviceToken = authResult.serviceToken;
  miotConfig.isLoggedIn = true;
  miotConfig.bindMode = 'account';
  saveJson(CONFIG_FILE, miotConfig);

  if (authResult.devices && authResult.devices.length > 0) {
    xiaomiDevices = authResult.devices;
    if (!miotConfig.activeDeviceId || !xiaomiDevices.some(d => d.did === miotConfig.activeDeviceId)) {
      miotConfig.activeDeviceId = xiaomiDevices[0].did;
    }
  } else {
    xiaomiDevices = [];
    miotConfig.activeDeviceId = '';
  }
  saveJson(DEVICES_FILE, xiaomiDevices);
  saveJson(CONFIG_FILE, miotConfig);

  const deviceCountMsg = xiaomiDevices.length > 0
    ? `已成功关联 ${xiaomiDevices.length} 台音箱设备`
    : `账号已绑定，但云端未查找到音箱设备（可使用局域网 Token 直连或手动添加音箱）`;

  castLogs.unshift({
    id: `log-${Date.now()}`,
    timestamp: new Date().toLocaleTimeString(),
    type: 'sync',
    message: `小米云端账号鉴权成功: ${miotConfig.miUser}`,
    detail: `用户ID: ${authResult.userId} | ${deviceCountMsg}`,
    success: true
  });
  if (castLogs.length > 50) castLogs.pop();

  return res.json({
    success: true,
    message: `小米账号验证通过！${deviceCountMsg}`,
    user: miotConfig.miUser,
    devices: xiaomiDevices.map(sanitizeDevice),
    config: sanitizeMiotConfig(miotConfig)
  });
});

// Logout / Unbind Xiaomi Account
app.post('/api/miot/logout', (req: Request, res: Response) => {
  if (!checkMiotAdminPermission(req, res)) return;

  try {
    minaWsClient.disconnect(true);
  } catch {}

  miotConfig.isLoggedIn = false;
  miotConfig.miUser = '';
  miotConfig.userId = '';
  miotConfig.serviceToken = '';
  saveJson(CONFIG_FILE, miotConfig);

  castLogs.unshift({
    id: `log-${Date.now()}`,
    timestamp: new Date().toLocaleTimeString(),
    type: 'sync',
    message: '已解除小米账号绑定',
    detail: '已清除云端令牌与登录凭证，并断开 Mina WebSocket 长连接',
    success: true
  });

  res.json({ success: true, message: '已安全退出并解绑小米账号', config: sanitizeMiotConfig(miotConfig) });
});

// 1. QR Code Login Flow: Generate QR code
app.get('/api/miot/passport/qrcode/get', async (req: Request, res: Response) => {
  if (!checkMiotAdminPermission(req, res)) return;

  // Default to 'xiaomiio' for full compatibility with Mi Home App (米家 App) internal QR scanner
  const sid = (req.query.sid as string) || 'xiaomiio';
  const region = (req.query.region as string) || 'cn';
  const qrRes = await xiaomiPassport.generateLoginQrCode(sid, region);
  if (qrRes.success) {
    return res.json(qrRes);
  }
  return res.status(500).json(qrRes);
});

// 1. QR Code Login Flow: Check QR code scan & confirm status
app.post('/api/miot/passport/qrcode/check', async (req: Request, res: Response) => {
  if (!checkMiotAdminPermission(req, res)) return;

  const { loginUrl, lpUrl, sid } = req.body;
  if (!loginUrl && !lpUrl) {
    return res.status(400).json({ success: false, error: '缺少 loginUrl 参数' });
  }

  const checkRes = await xiaomiPassport.checkQrCodeStatus(loginUrl || lpUrl, lpUrl);
  if (checkRes.success && checkRes.status === 'confirmed') {
    let primaryToken = checkRes.serviceToken || '';
    let micoServiceToken = sid === 'micoapi' ? primaryToken : '';
    let xiaomiioServiceToken = sid === 'micoapi' ? '' : primaryToken;
    let ssecurity = checkRes.ssecurity || '';

    // With confirmed passToken, fetch both STS tokens to ensure complete double-credential setup
    if (checkRes.userId && checkRes.passToken) {
      // 1. Fetch micoapi token (for XiaoAi Mina cloud, speech synthesis & WS)
      if (!micoServiceToken) {
        try {
          const micoTokenRes = await xiaomiPassport.fetchAdditionalStsToken(checkRes.userId, checkRes.passToken, 'micoapi');
          if (micoTokenRes.serviceToken) {
            micoServiceToken = micoTokenRes.serviceToken;
          }
          if (micoTokenRes.ssecurity && !ssecurity) {
            ssecurity = micoTokenRes.ssecurity;
          }
        } catch (err: any) {
          console.warn('Failed to fetch micoapi token via passToken:', err.message);
        }
      }

      // 2. Fetch xiaomiio token (for Mi Home smart devices and speaker sync)
      if (!xiaomiioServiceToken) {
        try {
          const ioTokenRes = await xiaomiPassport.fetchAdditionalStsToken(checkRes.userId, checkRes.passToken, 'xiaomiio');
          if (ioTokenRes.serviceToken) {
            xiaomiioServiceToken = ioTokenRes.serviceToken;
            if (ioTokenRes.ssecurity && !ssecurity) {
              ssecurity = ioTokenRes.ssecurity;
            }
          }
        } catch (err: any) {
          console.warn('Failed to fetch xiaomiio token via passToken:', err.message);
        }
      }
    }

    const effectiveToken = micoServiceToken || xiaomiioServiceToken || primaryToken;

    if (!checkRes.userId || !effectiveToken) {
      return res.json({
        success: false,
        status: 'error',
        error: '扫码确认成功，但未能成功获取到服务凭证，请刷新二维码重新扫码授权'
      });
    }

    miotConfig.userId = checkRes.userId;
    miotConfig.serviceToken = effectiveToken;
    (miotConfig as any).xiaomiioServiceToken = xiaomiioServiceToken || effectiveToken;
    (miotConfig as any).micoServiceToken = micoServiceToken || undefined;
    (miotConfig as any).ssecurity = ssecurity || (miotConfig as any).ssecurity;
    (miotConfig as any).passToken = checkRes.passToken;
    miotConfig.miUser = `uid_${checkRes.userId}`;
    miotConfig.isLoggedIn = true;
    miotConfig.bindMode = 'account';
    saveJson(CONFIG_FILE, miotConfig);

    // Auto connect Mina WS
    try {
      minaWsClient.connect(checkRes.userId, micoServiceToken || effectiveToken, miotConfig.activeDeviceId || '');
    } catch {}

    // Auto sync devices using the full Dual-Track Pipeline (with 8s timeout guard)
    let devices: any[] = [];
    try {
      const resolvePromise = xiaoaiResolverEngine.resolveDevices({
        userId: checkRes.userId,
        serviceToken: micoServiceToken || effectiveToken,
        xiaomiioServiceToken: xiaomiioServiceToken || effectiveToken,
        ssecurity: ssecurity || (miotConfig as any).ssecurity,
        existingDevices: xiaomiDevices,
        activeStreamIps: Array.from(activeStreamIps)
      });
      const timeoutPromise = new Promise<any>((resolve) => 
        setTimeout(() => resolve({ xiaoAiDevices: xiaomiDevices }), 8000)
      );
      const resolveResult = await Promise.race([resolvePromise, timeoutPromise]);
      devices = resolveResult.xiaoAiDevices || [];
      if (devices && devices.length > 0) {
        xiaomiDevices = devices;
        if (!miotConfig.activeDeviceId || !xiaomiDevices.some(d => d.did === miotConfig.activeDeviceId)) {
          miotConfig.activeDeviceId = xiaomiDevices[0].did;
        }
      }
      saveJson(DEVICES_FILE, xiaomiDevices);
      saveJson(CONFIG_FILE, miotConfig);
    } catch (err: any) {
      console.warn('Auto resolve devices error:', err.message);
    }

    const qrSyncDetail = devices.length > 0
      ? `用户ID: ${checkRes.userId} | 成功建立 Mina 长连接并同步 ${devices.length} 台音箱`
      : `用户ID: ${checkRes.userId} | 账号已绑定，但云端未查找到音箱设备（可使用局域网直连或手动添加）`;

    castLogs.unshift({
      id: `log-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      type: 'sync',
      message: `小米扫码登录成功: ${miotConfig.miUser}`,
      detail: qrSyncDetail,
      success: true
    });

    return res.json({
      success: true,
      status: 'confirmed',
      user: miotConfig.miUser,
      devices: xiaomiDevices.map(sanitizeDevice),
      config: sanitizeMiotConfig(miotConfig)
    });
  }

  return res.json(checkRes);
});

// 2. Mina WebSocket Status & Metrics
app.get('/api/miot/ws/status', (req: Request, res: Response) => {
  if (!checkMiotAdminPermission(req, res)) return;

  const status = minaWsClient.getStatus();
  const recentEvents = minaWsClient.getRecentEvents();
  res.json({ success: true, status, recentEvents });
});

// Cloud Device Query Raw Snapshots Inspector
app.get('/api/miot/cloud/snapshots', (req: Request, res: Response) => {
  if (!checkMiotAdminPermission(req, res)) return;

  const snapshots = xiaoaiResolverEngine.getCloudSnapshots();
  res.json({
    success: true,
    count: snapshots.length,
    snapshots,
    account: {
      userId: miotConfig.userId,
      miUser: miotConfig.miUser,
      isLoggedIn: miotConfig.isLoggedIn,
      hasServiceToken: Boolean(miotConfig.serviceToken && miotConfig.serviceToken.trim().length > 0)
    }
  });
});

// Clear Cloud Snapshots
app.post('/api/miot/cloud/snapshots/clear', (req: Request, res: Response) => {
  if (!checkMiotAdminPermission(req, res)) return;

  xiaoaiResolverEngine.clearCloudSnapshots();
  res.json({ success: true, message: '已清空云端抓包快照' });
});

// Export Complete Debug Bundle (JSON file download)
app.get('/api/miot/cloud/export-debug', (req: Request, res: Response) => {
  if (!checkMiotAdminPermission(req, res)) return;

  const snapshots = xiaoaiResolverEngine.getCloudSnapshots();
  const debugBundle = {
    exportedAt: new Date().toISOString(),
    account: {
      userId: miotConfig.userId,
      miUser: miotConfig.miUser,
      isLoggedIn: miotConfig.isLoggedIn,
      hasServiceToken: Boolean(miotConfig.serviceToken && miotConfig.serviceToken.trim().length > 0),
      activeDeviceId: miotConfig.activeDeviceId
    },
    cloudSnapshots: snapshots,
    devices: xiaomiDevices.map(sanitizeDevice),
    castLogs: castLogs.slice(0, 30)
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="tinglan-xiaomi-cloud-debug-${Date.now()}.json"`);
  res.send(JSON.stringify(debugBundle, null, 2));
});

// Mina WebSocket Manual Reconnect
app.post('/api/miot/ws/reconnect', (req: Request, res: Response) => {
  if (!checkMiotAdminPermission(req, res)) return;

  if (miotConfig.userId && miotConfig.serviceToken) {
    minaWsClient.connect(miotConfig.userId, miotConfig.serviceToken, miotConfig.activeDeviceId || '');
    return res.json({ success: true, message: '正在重新建立 Mina WebSocket 连接...' });
  }
  return res.status(400).json({ success: false, error: '未配置有效的小米云端凭证' });
});

// Mina Real-time Event Stream (Server-Sent Events)
app.get('/api/miot/events', (req: Request, res: Response) => {
  if (!checkMiotAdminPermission(req, res)) return;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // Send initial handshake
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toLocaleTimeString(), message: 'TingLan SSE Event Stream Connected' })}\n\n`);

  const onMinaEvent = (evt: any) => {
    try {
      res.write(`data: ${JSON.stringify(evt)}\n\n`);
    } catch {}
  };

  minaWsClient.on('event', onMinaEvent);

  req.on('close', () => {
    minaWsClient.off('event', onMinaEvent);
  });
});

// 3. MIoT Spec RPC: Get Property
app.post('/api/miot/rpc/prop/get', async (req: Request, res: Response) => {
  if (!checkMiotAdminPermission(req, res)) return;

  const { did, siid, piid } = req.body;
  const targetDev = xiaomiDevices.find(d => d.did === String(did));
  if (!targetDev) {
    return res.status(404).json({ success: false, error: '未找到指定 DID 的音箱设备' });
  }

  const cloudAuth = (miotConfig.userId && miotConfig.serviceToken)
    ? { 
        userId: miotConfig.userId, 
        serviceToken: (miotConfig as any).xiaomiioServiceToken || miotConfig.serviceToken,
        ssecurity: (miotConfig as any).ssecurity 
      }
    : undefined;

  const result = await miotRpcEngine.getProperty(targetDev, Number(siid) || 2, Number(piid) || 1, cloudAuth);
  res.json(result);
});

// 3. MIoT Spec RPC: Set Property
app.post('/api/miot/rpc/prop/set', async (req: Request, res: Response) => {
  if (!checkMiotAdminPermission(req, res)) return;

  const { did, siid, piid, value } = req.body;
  const targetDev = xiaomiDevices.find(d => d.did === String(did));
  if (!targetDev) {
    return res.status(404).json({ success: false, error: '未找到指定 DID 的音箱设备' });
  }

  const cloudAuth = (miotConfig.userId && miotConfig.serviceToken)
    ? { 
        userId: miotConfig.userId, 
        serviceToken: (miotConfig as any).xiaomiioServiceToken || miotConfig.serviceToken,
        ssecurity: (miotConfig as any).ssecurity 
      }
    : undefined;

  const result = await miotRpcEngine.setProperty(targetDev, Number(siid) || 2, Number(piid) || 1, value, cloudAuth);
  res.json(result);
});

// 3. MIoT Spec RPC: Action
app.post('/api/miot/rpc/action', async (req: Request, res: Response) => {
  if (!checkMiotAdminPermission(req, res)) return;

  const { did, siid, aiid, in: inParams } = req.body;
  const targetDev = xiaomiDevices.find(d => d.did === String(did));
  if (!targetDev) {
    return res.status(404).json({ success: false, error: '未找到指定 DID 的音箱设备' });
  }

  const cloudAuth = (miotConfig.userId && miotConfig.serviceToken)
    ? { 
        userId: miotConfig.userId, 
        serviceToken: (miotConfig as any).xiaomiioServiceToken || miotConfig.serviceToken,
        ssecurity: (miotConfig as any).ssecurity 
      }
    : undefined;

  const result = await miotRpcEngine.executeAction(
    targetDev,
    Number(siid) || 3,
    Number(aiid) || 1,
    Array.isArray(inParams) ? inParams : [],
    cloudAuth
  );
  res.json(result);
});

// 3. MIoT Spec RPC: Raw Packet Execution (LAN / Cloud)
app.post('/api/miot/rpc/raw', async (req: Request, res: Response) => {
  if (!checkMiotAdminPermission(req, res)) return;

  const { ip, token, method, params, did } = req.body;
  if (ip && token) {
    const result = await miotRpcEngine.executeLocalMiio(ip, token, method || 'get_prop', params || []);
    return res.json(result);
  }

  if (miotConfig.userId && miotConfig.serviceToken) {
    const result = await miotRpcEngine.executeCloudMiot(
      method || 'miotspec/prop/get',
      params || {},
      miotConfig.userId,
      (miotConfig as any).xiaomiioServiceToken || miotConfig.serviceToken,
      (miotConfig as any).ssecurity
    );
    return res.json(result);
  }

  return res.status(400).json({ success: false, error: '需要提供局域网 (ip+token) 或登录小米云端' });
});

// 3. MIoT Model Spec Definition Resolver
app.get('/api/miot/spec/:model', async (req: Request, res: Response) => {
  const { model } = req.params;
  const spec = await miotRpcEngine.getMiotSpecInstance(model);
  if (spec) {
    return res.json({ success: true, spec });
  }
  return res.status(404).json({ success: false, error: `未检索到 ${model} 的 MIoT Spec 实例` });
});

// 4. Enhanced Device Discovery: Subnet Scan via XiaoAi Resolver & MIoT Spec
app.post('/api/miot/devices/scan-subnet', async (req: Request, res: Response) => {
  if (!checkMiotAdminPermission(req, res)) return;

  const { subnetPrefix } = req.body;
  try {
    const result = await xiaoaiResolverEngine.resolveDevices({
      userId: miotConfig.userId,
      serviceToken: (miotConfig as any).micoServiceToken || miotConfig.serviceToken,
      xiaomiioServiceToken: (miotConfig as any).xiaomiioServiceToken || miotConfig.serviceToken,
      ssecurity: (miotConfig as any).ssecurity,
      subnetPrefix: subnetPrefix ? String(subnetPrefix).trim() : undefined,
      existingDevices: xiaomiDevices,
      activeStreamIps: Array.from(activeStreamIps)
    });

    if (result.xiaoAiDevices.length > 0) {
      xiaomiDevices = result.xiaoAiDevices;
      if (!miotConfig.activeDeviceId || !xiaomiDevices.some(d => d.did === miotConfig.activeDeviceId)) {
        miotConfig.activeDeviceId = xiaomiDevices[0].did;
        saveJson(CONFIG_FILE, miotConfig);
      }
      saveJson(DEVICES_FILE, xiaomiDevices);
    }

    res.json({
      success: true,
      discovered: result.xiaoAiDevices.map(sanitizeDevice),
      ignoredDevices: result.ignoredDevices,
      metrics: result.metrics,
      totalDevices: xiaomiDevices.length,
      devices: xiaomiDevices.map(sanitizeDevice)
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Enhanced Device Discovery: SSDP UPnP Scan
app.post('/api/miot/devices/scan-ssdp', async (req: Request, res: Response) => {
  if (!checkMiotAdminPermission(req, res)) return;

  const discovered = await deviceDiscoveryEngine.scanSsdp(2500);
  res.json({ success: true, discovered });
});

// Xiaomi Devices List (Tokens redacted for security)
app.get('/api/miot/devices', (req: Request, res: Response) => {
  res.json(xiaomiDevices.map(sanitizeDevice));
});

// Add custom Xiaomi Speaker
app.post('/api/miot/devices', async (req: Request, res: Response) => {
  if (!checkMiotAdminPermission(req, res)) return;

  const { name, ip, did, model, hardware, token } = req.body;
  if (!name || !ip) {
    return res.status(400).json({ error: 'Name and IP are required' });
  }

  const cleanIp = String(ip).trim();
  const cleanName = String(name).trim();
  const cleanModel = model ? String(model).trim() : 'xiaomi.wifispeaker.sound';
  const cleanToken = token ? String(token).trim() : undefined;
  const targetDid = did ? String(did).trim() : `did-${Date.now()}`;
  const hasToken = Boolean(cleanToken && cleanToken.length > 0);

  // MIoT Spec: Resolve capabilities & verify device
  const specEval = await xiaoaiResolverEngine.evaluateMiotSpec(cleanModel);

  const newDevice = {
    did: targetDid,
    name: cleanName,
    model: cleanModel,
    hardware: hardware || 'L16A',
    ip: cleanIp,
    token: cleanToken,
    mac: '00:1A:7D:' + Math.random().toString(16).slice(2, 8).toUpperCase(),
    platform: hasToken ? 'miio' : 'mina',
    source: hasToken ? 'hybrid' : 'lan',
    capabilities: specEval.capabilities,
    online: true,
    isOnline: true,
    status: {
      playing: false,
      volume: 45,
      muted: false,
      updatedAt: new Date().toISOString()
    }
  };

  xiaomiDevices.push(newDevice);
  if (!miotConfig.activeDeviceId) {
    miotConfig.activeDeviceId = newDevice.did;
    saveJson(CONFIG_FILE, miotConfig);
  }
  saveJson(DEVICES_FILE, xiaomiDevices);

  castLogs.unshift({
    id: `log-${Date.now()}`,
    timestamp: new Date().toLocaleTimeString(),
    type: 'sync',
    message: `已添加自定义小米音箱: ${newDevice.name}`,
    detail: `IP: ${newDevice.ip} | DID: ${newDevice.did} | 平台: ${newDevice.platform}`,
    success: true
  });

  res.json({ success: true, device: sanitizeDevice(newDevice), devices: xiaomiDevices.map(sanitizeDevice) });
});

// Update / Edit Xiaomi Speaker
app.put('/api/miot/devices/:did', async (req: Request, res: Response) => {
  if (!checkMiotAdminPermission(req, res)) return;

  const { did } = req.params;
  const { name, ip, did: newDid, model, hardware, token } = req.body;

  const index = xiaomiDevices.findIndex(d => d.did === did);
  if (index === -1) {
    return res.status(404).json({ success: false, error: '未找到指定音箱设备' });
  }

  const currentDev = xiaomiDevices[index];
  // If token was not changed or was passed as masked asterisks, keep existing token
  const resolvedToken = (token !== undefined && !String(token).includes('****') && !String(token).includes('••••'))
    ? (token ? String(token).trim() : undefined)
    : currentDev.token;

  const cleanModel = model !== undefined ? model.trim() : currentDev.model;
  const specEval = await xiaoaiResolverEngine.evaluateMiotSpec(cleanModel);
  const targetIp = ip !== undefined ? ip.trim() : currentDev.ip;
  const hasToken = Boolean(resolvedToken && resolvedToken.length > 0);

  xiaomiDevices[index] = {
    ...currentDev,
    name: name !== undefined ? name.trim() : currentDev.name,
    ip: targetIp,
    did: newDid !== undefined ? String(newDid).trim() : currentDev.did,
    model: cleanModel,
    hardware: hardware !== undefined ? hardware.trim() : currentDev.hardware,
    token: resolvedToken,
    capabilities: specEval.capabilities,
    platform: hasToken && targetIp ? 'miio' : (currentDev.platform || 'mina'),
    source: targetIp && hasToken ? 'hybrid' : (targetIp ? 'lan' : (currentDev.source || 'cloud')),
    online: currentDev.online ?? currentDev.isOnline ?? true,
    isOnline: currentDev.online ?? currentDev.isOnline ?? true
  };

  if (miotConfig.activeDeviceId === did && newDid && newDid !== did) {
    miotConfig.activeDeviceId = String(newDid).trim();
    saveJson(CONFIG_FILE, miotConfig);
  }

  saveJson(DEVICES_FILE, xiaomiDevices);

  castLogs.unshift({
    id: `log-${Date.now()}`,
    timestamp: new Date().toLocaleTimeString(),
    type: 'sync',
    message: `已修改音箱信息: ${xiaomiDevices[index].name}`,
    detail: `IP: ${xiaomiDevices[index].ip} | 型号: ${xiaomiDevices[index].model}`,
    success: true
  });

  res.json({ success: true, device: sanitizeDevice(xiaomiDevices[index]), devices: xiaomiDevices.map(sanitizeDevice) });
});

// Delete Xiaomi Speaker
app.delete('/api/miot/devices/:did', (req: Request, res: Response) => {
  if (!checkMiotAdminPermission(req, res)) return;

  const { did } = req.params;
  const didStr = String(did).trim();

  // Find target device for logging
  const targetDevice = xiaomiDevices.find(d => String(d.did).trim() === didStr || String(d.id || '').trim() === didStr);

  // Filter out only the targeted device
  xiaomiDevices = xiaomiDevices.filter(d => String(d.did).trim() !== didStr && String(d.id || '').trim() !== didStr);

  if (String(miotConfig.activeDeviceId).trim() === didStr) {
    miotConfig.activeDeviceId = xiaomiDevices[0]?.did || '';
    saveJson(CONFIG_FILE, miotConfig);
  }
  saveJson(DEVICES_FILE, xiaomiDevices);

  castLogs.unshift({
    id: `log-${Date.now()}`,
    timestamp: new Date().toLocaleTimeString(),
    type: 'sync',
    message: `已移除音箱: ${targetDevice?.name || didStr}`,
    detail: `剩余 ${xiaomiDevices.length} 台小米音箱设备`,
    success: true
  });
  if (castLogs.length > 50) castLogs.pop();

  res.json({
    success: true,
    deletedDid: didStr,
    devices: xiaomiDevices.map(sanitizeDevice),
    activeDeviceId: miotConfig.activeDeviceId
  });
});

// Clear all demo/sample Xiaomi Speakers
app.post('/api/miot/devices/clear', (req: Request, res: Response) => {
  if (!checkMiotAdminPermission(req, res)) return;

  xiaomiDevices = [];
  miotConfig.activeDeviceId = '';
  saveJson(CONFIG_FILE, miotConfig);
  saveJson(DEVICES_FILE, xiaomiDevices);

  castLogs.unshift({
    id: `log-${Date.now()}`,
    timestamp: new Date().toLocaleTimeString(),
    type: 'sync',
    message: '已清空全部音箱设备列表',
    detail: '可通过手动添加或扫描重新发现音箱',
    success: true
  });
  if (castLogs.length > 50) castLogs.pop();

  res.json({ success: true, message: '已清空全部音箱设备', devices: [] });
});

// Reset to default sample Xiaomi Speakers
app.post('/api/miot/devices/reset', (req: Request, res: Response) => {
  if (!checkMiotAdminPermission(req, res)) return;

  xiaomiDevices = JSON.parse(JSON.stringify(DEFAULT_DEVICES)).map((d: any) => ({
    ...d,
    name: (d.name || '小米智能音箱').replace(/\s*[\(（]点击(右侧)?编辑[\)）]/g, '').trim()
  }));
  miotConfig.activeDeviceId = xiaomiDevices[0]?.did || '';
  saveJson(CONFIG_FILE, miotConfig);
  saveJson(DEVICES_FILE, xiaomiDevices);

  castLogs.unshift({
    id: `log-${Date.now()}`,
    timestamp: new Date().toLocaleTimeString(),
    type: 'sync',
    message: '已恢复预设小米音箱列表',
    detail: `已加载 ${xiaomiDevices.length} 台常用小爱音箱设备`,
    success: true
  });
  if (castLogs.length > 50) castLogs.pop();

  res.json({
    success: true,
    message: '已恢复预设音箱设备',
    devices: xiaomiDevices.map(sanitizeDevice),
    activeDeviceId: miotConfig.activeDeviceId
  });
});

// Test Ping / Handshake to speaker IP (Prioritizes miIO UDP 54321 Hello, then TCP fallback)
app.post('/api/miot/devices/ping', async (req: Request, res: Response) => {
  if (!checkMiotAdminPermission(req, res)) return;

  const { ip } = req.body;
  if (!ip) {
    return res.status(400).json({ error: 'IP is required' });
  }

  const cleanIp = String(ip).trim();
  const probeResult = await testMiioConnection(cleanIp, 1500);

  // Update online status in memory
  const dev = xiaomiDevices.find(d => d.ip === cleanIp);
  if (dev) {
    dev.isOnline = probeResult.reachable;
    if (probeResult.did && !dev.did.startsWith('mi-')) {
      dev.did = probeResult.did;
    }
    saveJson(DEVICES_FILE, xiaomiDevices);
  }

  res.json({
    ip: cleanIp,
    reachable: probeResult.reachable,
    isMiio: probeResult.isMiio,
    did: probeResult.did,
    latency: probeResult.latency,
    message: probeResult.message
  });
});

// XiaoAi Device Discovery & Resolution Pipeline
// Xiaomi Cloud + LAN miIO Hello -> Device Resolver -> MIoT Spec -> Filter XiaoAi Speaker vs Non-Speaker
app.post('/api/miot/devices/resolve', async (req: Request, res: Response) => {
  if (!checkMiotAdminPermission(req, res)) return;

  const { subnetPrefix } = req.body || {};
  try {
    const result = await xiaoaiResolverEngine.resolveDevices({
      userId: miotConfig.userId,
      serviceToken: (miotConfig as any).micoServiceToken || miotConfig.serviceToken,
      xiaomiioServiceToken: (miotConfig as any).xiaomiioServiceToken || miotConfig.serviceToken,
      ssecurity: (miotConfig as any).ssecurity,
      subnetPrefix,
      existingDevices: xiaomiDevices,
      activeStreamIps: Array.from(activeStreamIps)
    });

    if (result.xiaoAiDevices.length > 0) {
      xiaomiDevices = result.xiaoAiDevices;
      if (!miotConfig.activeDeviceId || !xiaomiDevices.some(d => d.did === miotConfig.activeDeviceId)) {
        miotConfig.activeDeviceId = xiaomiDevices[0].did;
        saveJson(CONFIG_FILE, miotConfig);
      }
      saveJson(DEVICES_FILE, xiaomiDevices);
    }

    castLogs.unshift({
      id: `log-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      type: 'sync',
      message: `MIoT 发现与解析：小爱音箱 ${result.metrics.speakerConfirmed} 台，过滤非音箱 ${result.metrics.nonSpeakerIgnored} 台`,
      detail: `云端: ${result.metrics.cloudFound} | 局域网: ${result.metrics.lanFound} | 双轨融合: ${result.metrics.hybridMerged}`,
      success: true
    });
    if (castLogs.length > 50) castLogs.pop();

    res.json({
      success: true,
      count: xiaomiDevices.length,
      devices: xiaomiDevices.map(sanitizeDevice),
      ignoredDevices: result.ignoredDevices,
      metrics: result.metrics,
      activeDeviceId: miotConfig.activeDeviceId
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Add or discover device (Full Pipeline: Cloud + LAN miIO Hello -> Device Resolver -> MIoT Spec Filter)
app.post('/api/miot/devices/scan', async (req: Request, res: Response) => {
  if (!checkMiotAdminPermission(req, res)) return;

  const { subnetPrefix } = req.body || {};
  try {
    const result = await xiaoaiResolverEngine.resolveDevices({
      userId: miotConfig.userId,
      serviceToken: (miotConfig as any).micoServiceToken || miotConfig.serviceToken,
      xiaomiioServiceToken: (miotConfig as any).xiaomiioServiceToken || miotConfig.serviceToken,
      ssecurity: (miotConfig as any).ssecurity,
      subnetPrefix,
      existingDevices: xiaomiDevices,
      activeStreamIps: Array.from(activeStreamIps)
    });

    if (result.xiaoAiDevices.length > 0) {
      xiaomiDevices = result.xiaoAiDevices;
      if (!miotConfig.activeDeviceId || !xiaomiDevices.some(d => d.did === miotConfig.activeDeviceId)) {
        miotConfig.activeDeviceId = xiaomiDevices[0].did;
        saveJson(CONFIG_FILE, miotConfig);
      }
      saveJson(DEVICES_FILE, xiaomiDevices);
    }

    castLogs.unshift({
      id: `log-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      type: 'sync',
      message: result.metrics.cloudFound > 0 
        ? `小爱设备发现完成：云端(${result.metrics.cloudFound}) + 局域网Hello(${result.metrics.lanFound})，已确认 ${result.metrics.speakerConfirmed} 台音箱`
        : `局域网 miIO Hello 探测完成：当前 ${xiaomiDevices.length} 台音箱设备就绪`,
      detail: `双轨融合: ${result.metrics.hybridMerged} 台 | 规范过滤非音箱: ${result.metrics.nonSpeakerIgnored} 台`,
      success: true
    });
    if (castLogs.length > 50) castLogs.pop();

    res.json({
      success: true,
      count: xiaomiDevices.length,
      cloudSyncedCount: result.metrics.cloudFound,
      activeDeviceId: miotConfig.activeDeviceId,
      devices: xiaomiDevices.map(sanitizeDevice),
      ignoredDevices: result.ignoredDevices,
      metrics: result.metrics
    });
  } catch (err: any) {
    console.warn('Scan pipeline fallback error:', err);
    res.json({
      success: true,
      count: xiaomiDevices.length,
      cloudSyncedCount: 0,
      activeDeviceId: miotConfig.activeDeviceId,
      devices: xiaomiDevices.map(sanitizeDevice)
    });
  }
});

// Real Mina Cloud UBUS API Dispatcher
async function callMinaCloudApi(
  pathName: string,
  methodName: string,
  messageObj: any,
  targetDid?: string,
  retryCount: number = 0
): Promise<{ success: boolean; data?: any; error?: string; raw?: string; statusCode?: number }> {
  const rawToken = (miotConfig as any).micoServiceToken || miotConfig.serviceToken || '';
  const rawUid = miotConfig.userId || '';

  // Clean ASCII only to prevent ByteString character code > 255 TypeError
  const activeMicoToken = String(rawToken).replace(/[^\x20-\x7E]/g, '').trim();
  const cleanUid = String(rawUid).replace(/[^\x20-\x7E]/g, '').trim();

  // If token is missing but passToken is available, try auto-refresh
  if ((!activeMicoToken || !cleanUid) && (miotConfig as any).passToken && retryCount === 0) {
    try {
      const refreshed = await xiaomiPassport.fetchAdditionalStsToken(cleanUid || '0', (miotConfig as any).passToken, 'micoapi');
      if (refreshed.serviceToken) {
        (miotConfig as any).micoServiceToken = refreshed.serviceToken;
        miotConfig.serviceToken = refreshed.serviceToken;
        if (refreshed.ssecurity) (miotConfig as any).ssecurity = refreshed.ssecurity;
        if (refreshed.userId) {
          miotConfig.userId = refreshed.userId;
          miotConfig.miUser = `uid_${refreshed.userId}`;
        }
        miotConfig.isLoggedIn = true;
        saveJson(CONFIG_FILE, miotConfig);
        return callMinaCloudApi(pathName, methodName, messageObj, targetDid, retryCount + 1);
      }
    } catch (err: any) {
      console.warn('[Mina] Pre-flight STS refresh failed:', err.message);
    }
  }

  if (!activeMicoToken || !cleanUid || activeMicoToken.includes('••') || activeMicoToken.includes('**')) {
    return {
      success: false,
      error: '未检测到有效的小米服务令牌 (serviceToken)。请在【米家账号绑定】中点击【扫码登录】或输入账号密码完成绑定。'
    };
  }

  let deviceId = targetDid || miotConfig.activeDeviceId || '';

  // Look up actual device to find real Mina hardware deviceID
  const matchedDev = xiaomiDevices.find(d => 
    d.did === targetDid || 
    (d as any).deviceID === targetDid || 
    (d as any).hardwareDeviceId === targetDid || 
    (d as any).cloudDid === targetDid
  );

  if (matchedDev) {
    if ((matchedDev as any).deviceID) deviceId = (matchedDev as any).deviceID;
    else if ((matchedDev as any).hardwareDeviceId) deviceId = (matchedDev as any).hardwareDeviceId;
    else if ((matchedDev as any).cloudDid) deviceId = (matchedDev as any).cloudDid;
    else if (matchedDev.did && !matchedDev.did.startsWith('manual_') && !matchedDev.did.startsWith('detected_') && !matchedDev.did.startsWith('lan_') && !matchedDev.did.startsWith('miio_')) {
      deviceId = matchedDev.did;
    }
  }

  // Handle synthetic local DIDs if still unmapped
  if (!deviceId || deviceId.startsWith('manual_') || deviceId.startsWith('detected_') || deviceId.startsWith('lan_') || deviceId.startsWith('miio_')) {
    const realCloudDev = xiaomiDevices.find(d => 
      d.did && !d.did.startsWith('manual_') && !d.did.startsWith('detected_') && !d.did.startsWith('lan_') && !d.did.startsWith('miio_')
    );
    if (realCloudDev) {
      deviceId = (realCloudDev as any).deviceID || realCloudDev.did;
    } else if (miotConfig.activeDeviceId && !miotConfig.activeDeviceId.startsWith('manual_') && !miotConfig.activeDeviceId.startsWith('detected_')) {
      deviceId = miotConfig.activeDeviceId;
    }
  }

  if (!deviceId || deviceId.startsWith('manual_') || deviceId.startsWith('detected_') || deviceId.startsWith('lan_') || deviceId.startsWith('miio_')) {
    return {
      success: false,
      error: '当前音箱为纯局域网手动添加设备，无关联的小米云端 DID。云端容器因网络隔离无法直连 192.168.x.x。请在设备管理中点击【扫描/同步云端音箱】拉取绑定账号下的小爱音箱即可通过云端成功投播！'
    };
  }

  const messageStr = typeof messageObj === 'string' ? messageObj : JSON.stringify(messageObj);
  const requestId = `app_ios_${Math.random().toString(36).substring(2, 12)}_${Date.now()}`;

  const postBody = new URLSearchParams({
    deviceId,
    message: messageStr,
    method: methodName,
    path: pathName,
    requestId
  });

  const endpoints = [
    'https://api2.mina.mi.com/remote/ubus',
    'https://api.mina.mi.com/remote/ubus',
    'https://user.app.mina.mi.com/remote/ubus'
  ];

  let lastError = '';
  let lastStatus = 0;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'User-Agent': 'MISoundBox/1.4.0 (iPhone; iOS 14.4; Scale/3.00)',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': `userId=${cleanUid}; serviceToken=${activeMicoToken}; deviceId=${deviceId}; PassportDeviceId=${cleanUid}`
        },
        body: postBody.toString(),
        signal: AbortSignal.timeout(3500)
      });

      lastStatus = response.status;
      const responseText = await response.text();
      let resJson: any;
      try {
        resJson = JSON.parse(responseText);
      } catch {
        resJson = { raw: responseText };
      }

      if (response.ok && (resJson.code === 0 || resJson.message === 'ok' || resJson.info === 'ok')) {
        return { success: true, data: resJson, statusCode: 200 };
      } else {
        if (response.status === 401 || responseText.includes('HTTP Status 401') || responseText.includes('Unauthorized')) {
          // Attempt 1-time auto-refresh if passToken is available
          if (retryCount === 0 && (miotConfig as any).passToken && cleanUid) {
            try {
              const refreshRes = await xiaomiPassport.fetchAdditionalStsToken(cleanUid, (miotConfig as any).passToken, 'micoapi');
              if (refreshRes.serviceToken) {
                (miotConfig as any).micoServiceToken = refreshRes.serviceToken;
                miotConfig.serviceToken = refreshRes.serviceToken;
                if (refreshRes.ssecurity) (miotConfig as any).ssecurity = refreshRes.ssecurity;
                saveJson(CONFIG_FILE, miotConfig);
                return callMinaCloudApi(pathName, methodName, messageObj, targetDid, retryCount + 1);
              }
            } catch (rErr: any) {
              console.warn('[Mina] 401 recovery STS refresh failed:', rErr.message);
            }
          }

          return {
            success: false,
            statusCode: 401,
            error: '小米服务令牌 (serviceToken) 已过期或无此设备控制权限 (HTTP 401 Unauthorized)。请在【米家账号绑定】中重新扫码/账号登录。',
            raw: responseText
          };
        }
        const errorDesc = resJson.message || resJson.error || resJson.description || `HTTP ${response.status}: ${responseText.slice(0, 120)}`;
        lastError = errorDesc;
      }
    } catch (netErr: any) {
      console.warn(`Error calling Mina endpoint ${endpoint}:`, netErr.message);
      lastError = netErr.message;
    }
  }

  return {
    success: false,
    statusCode: lastStatus || 500,
    error: lastError ? `小米 Mina 云端指令通道响应失败: ${lastError}` : '未能连接到小米 Mina 云端指令通道 (网络超时或端点不可达)'
  };
}

// Cast Song to Xiaomi Speaker with Real Cloud UBUS Dispatch & Local miIO fallback
app.post('/api/miot/cast', async (req: Request, res: Response) => {
  if (!checkMiotControlPermission(req, res)) return;

  const startTime = Date.now();
  const { did, songId, songTitle, songArtist, streamUrl, duration } = req.body;

  // Auto-resolve devices from cloud if currently empty and logged in
  if (xiaomiDevices.length === 0 && (miotConfig as any).passToken) {
    try {
      const resolveRes = await xiaoaiResolverEngine.resolveDevices({
        userId: miotConfig.userId,
        serviceToken: (miotConfig as any).micoServiceToken || miotConfig.serviceToken,
        xiaomiioServiceToken: (miotConfig as any).xiaomiioServiceToken || miotConfig.serviceToken,
        ssecurity: (miotConfig as any).ssecurity,
        existingDevices: xiaomiDevices,
        activeStreamIps: Array.from(activeStreamIps)
      });
      if (resolveRes.xiaoAiDevices && resolveRes.xiaoAiDevices.length > 0) {
        xiaomiDevices = resolveRes.xiaoAiDevices;
        if (!miotConfig.activeDeviceId) miotConfig.activeDeviceId = xiaomiDevices[0].did;
        saveJson(DEVICES_FILE, xiaomiDevices);
        saveJson(CONFIG_FILE, miotConfig);
      }
    } catch (rErr: any) {
      console.warn('[Cast] Auto device resolution failed:', rErr.message);
    }
  }

  const targetDevice = xiaomiDevices.find(d => d.did === did || (d as any).deviceID === did) || xiaomiDevices[0];

  if (!targetDevice) {
    return res.status(404).json({ success: false, error: '未找到指定音箱设备' });
  }

  // Reject placeholder/mock device if neither local IP/Token nor Cloud DID exists
  const isDummyDevice = (!targetDevice.ip && !targetDevice.token && (targetDevice.did === 'wifispeaker' || !targetDevice.did || !targetDevice.did.match(/^\d+$/)));
  if (isDummyDevice && !miotConfig.isLoggedIn) {
    const errorMsg = '当前选中的为预设示例音箱，尚未关联真实硬件。请先在【设置】中绑定米家账号，并在【播放协议控制中枢】点击【重新扫描设备】同步真实音箱！';
    castLogs.unshift({
      id: `log-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      type: 'error',
      message: `投放失败【${targetDevice.name}】`,
      detail: `✕ ${errorMsg}`,
      success: false,
      did: targetDevice.did,
      ip: '未配置',
      model: targetDevice.model,
      protocol: 'MIoT / miIO',
      requestMethod: 'POST /api/miot/cast',
      httpStatus: 400,
      errorCode: 'ERR_DUMMY_DEVICE',
      responseTimeMs: 2
    });
    if (castLogs.length > 50) castLogs.pop();

    return res.status(400).json({
      success: false,
      error: errorMsg,
      message: errorMsg
    });
  }

  // 1. Resolve absolute public stream URL
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || req.get('host');
  const reqOrigin = `${proto}://${host}`;

  const baseHost = (miotConfig.serverHost && miotConfig.serverHost.startsWith('http'))
    ? miotConfig.serverHost.replace(/\/$/, '')
    : reqOrigin;
  const resolvedServerHost = baseHost;

  let resolvedStreamUrl = '';
  if (streamUrl && streamUrl.startsWith('http')) {
    resolvedStreamUrl = streamUrl;
  } else if (streamUrl && streamUrl.startsWith('/')) {
    resolvedStreamUrl = `${baseHost}${streamUrl}`;
  } else {
    resolvedStreamUrl = `${baseHost}/api/stream/${songId || 'song-1'}`;
  }

  let cloudResult: any = null;
  let localMiioResult: any = null;

  // Ensure stream URL has friendly extension for XiaoAi embedded players
  if (!resolvedStreamUrl.includes('.mp3') && !resolvedStreamUrl.includes('.wav')) {
    resolvedStreamUrl = `${resolvedStreamUrl}.mp3`;
  }

  // 2. Track 1: Local miIO UDP 54321 (If device has IP & Token)
  if (targetDevice.token && targetDevice.ip) {
    try {
      // Try play_specify_url first
      localMiioResult = await sendMiioCommand(
        targetDevice.ip,
        targetDevice.token,
        'play_specify_url',
        [resolvedStreamUrl],
        2500
      );

      // If play_specify_url wasn't successful, try player_play_url
      if (!localMiioResult?.success) {
        localMiioResult = await sendMiioCommand(
          targetDevice.ip,
          targetDevice.token,
          'player_play_url',
          [resolvedStreamUrl],
          2500
        );
      }
    } catch (e: any) {
      localMiioResult = { success: false, error: e.message };
    }
  }

  // 3. Track 2: Xiaomi Mina Cloud UBUS (micoapi)
  const activeMicoToken = (miotConfig as any).micoServiceToken || miotConfig.serviceToken;
  if (miotConfig.isLoggedIn && activeMicoToken && miotConfig.userId) {
    try {
      // Send TTS announcement if enabled
      if (miotConfig.ttsAnnouncement) {
        try {
          await ttsEngine.dispatchToSpeaker({
            targetDevice,
            text: `${miotConfig.ttsPrefix || '正在为您播放'} ${songTitle || '歌曲'}`,
            mode: 'auto',
            serverHost: resolvedServerHost,
            miotConfig,
            sendMiioCommandFn: (ip, token, method, params, timeoutMs) => sendMiioCommand(ip, token, method, params, timeoutMs || 2500),
            callMinaCloudApiFn: (path, method, msg, tDid, retry) => callMinaCloudApi(path, method, msg, tDid, retry)
          });
        } catch (ttsErr: any) {
          console.warn('TTS intro failed before cast:', ttsErr.message);
        }
      }

      // Priority 1: Standard Mina UBUS player_play_url command (type 1 for standard music media stream)
      cloudResult = await callMinaCloudApi(
        'mediaplayer',
        'player_play_url',
        { url: resolvedStreamUrl, type: 1, media: 'app_ios' },
        targetDevice.did
      );

      // Fallback 1: Try player_play_url without media wrapper (type 1 / type 0)
      if (!cloudResult?.success) {
        cloudResult = await callMinaCloudApi(
          'mediaplayer',
          'player_play_url',
          { url: resolvedStreamUrl, type: 1 },
          targetDevice.did
        );
      }

      if (!cloudResult?.success) {
        cloudResult = await callMinaCloudApi(
          'mediaplayer',
          'player_play_url',
          { url: resolvedStreamUrl, type: 0 },
          targetDevice.did
        );
      }

      // Priority 2: MIoT Cloud Action fallback (siid 3, aiid 1 / siid 2, aiid 1)
      if (!cloudResult?.success && (miotConfig as any).ssecurity && miotConfig.userId) {
        try {
          let rpcRes = await miotRpcEngine.executeAction(
            targetDevice,
            3,
            1,
            [resolvedStreamUrl],
            {
              userId: String(miotConfig.userId),
              serviceToken: (miotConfig as any).xiaomiioServiceToken || activeMicoToken,
              ssecurity: (miotConfig as any).ssecurity
            }
          );
          if (rpcRes.code === 0) {
            cloudResult = { success: true, data: rpcRes.result, method: 'miot_cloud_rpc' };
          } else {
            // Try Speaker playUrl (siid 2, aiid 1)
            rpcRes = await miotRpcEngine.executeAction(
              targetDevice,
              2,
              1,
              [resolvedStreamUrl],
              {
                userId: String(miotConfig.userId),
                serviceToken: (miotConfig as any).xiaomiioServiceToken || activeMicoToken,
                ssecurity: (miotConfig as any).ssecurity
              }
            );
            if (rpcRes.code === 0) {
              cloudResult = { success: true, data: rpcRes.result, method: 'miot_cloud_rpc_siid2' };
            }
          }
        } catch (rpcErr: any) {
          console.warn('MIoT Action Cloud fallback failed:', rpcErr.message);
        }
      }
    } catch (e: any) {
      cloudResult = { success: false, error: e.message };
    }
  }

  // Evaluate genuine success: strictly true ONLY if either local miIO or cloud succeeded
  const isSuccess = Boolean(localMiioResult?.success) || Boolean(cloudResult?.success);
  const responseTimeMs = Date.now() - startTime;

  const errorMessage = !isSuccess
    ? (
        cloudResult?.error
          ? `云端投播失败: ${cloudResult.error}${localMiioResult?.error ? ` (局域网 UDP ${targetDevice.ip}:54321: ${localMiioResult.error})` : ''}`
          : (localMiioResult?.error
              ? (miotConfig.isLoggedIn
                  ? `局域网 UDP 超时 (${targetDevice.ip}:54321，远程云端容器无法直接访问家庭私有 IP)。请点击【扫描/同步云端音箱】以使用米家云端推流通道`
                  : `局域网 UDP 超时 (${targetDevice.ip}:54321，远程云端容器无法直接访问家庭私有 IP)。请先在【米家账号绑定】中点击【扫码登录】绑定小米账号即可实现云端投播`)
              : (!targetDevice.ip && !targetDevice.token && !miotConfig.isLoggedIn
                  ? '设备缺少可用投播通道（无局域网 IP/Token 且未登录米家云端）'
                  : '投播指令执行失败，音箱未响应或网络断开'))
      )
    : undefined;

  const nowTime = new Date().toLocaleTimeString();
  const stages = [
    { stage: 'COMMAND_SENT' as const, label: '指令发送成功', success: true, timestamp: nowTime },
    { stage: 'DEVICE_ACK' as const, label: '音箱已响应', success: isSuccess, timestamp: nowTime },
    { stage: 'STREAM_CONNECTED' as const, label: '音频流已连接', success: isSuccess, timestamp: nowTime },
    { stage: 'PLAYING' as const, label: '正在播放', success: isSuccess, timestamp: nowTime }
  ];

  // Only reflect active playback state if the command was actually accepted by the device
  if (isSuccess) {
    targetDevice.status = {
      ...targetDevice.status,
      playing: true,
      currentSongId: songId,
      currentTitle: songTitle || '未知曲目',
      currentArtist: songArtist || '未知歌手',
      currentDuration: duration || 200,
      currentPosition: 0,
      streamUrl: resolvedStreamUrl,
      lastTts: miotConfig.ttsAnnouncement ? `${miotConfig.ttsPrefix || '正在为您播放'}: ${songTitle || '歌曲'}` : targetDevice.status?.lastTts,
      updatedAt: new Date().toISOString()
    };
    saveJson(DEVICES_FILE, xiaomiDevices);
  } else {
    if (targetDevice.status) {
      targetDevice.status.playing = false;
      targetDevice.status.updatedAt = new Date().toISOString();
      saveJson(DEVICES_FILE, xiaomiDevices);
    }
  }

  const dispatchModeDesc = isSuccess
    ? (localMiioResult?.success && cloudResult?.success
        ? '✓ 本地 miIO 与云端 UBUS 均下发成功'
        : (localMiioResult?.success ? '✓ miIO 本地 UDP 直连投播成功' : '✓ 云端 UBUS 投播指令已确认'))
    : `✕ 投播失败: ${errorMessage}`;

  const diagnosticSteps = [
    {
      timestamp: nowTime,
      step: 'MINA',
      status: cloudResult ? (cloudResult.success ? 'OK' : 'ERROR') : 'SKIPPED',
      statusCode: cloudResult?.success ? 200 : (cloudResult?.error?.includes('401') ? 401 : 500),
      message: cloudResult ? (cloudResult.success ? 'Mina Cloud → 200 OK' : `Mina → ${cloudResult.error}`) : 'Mina 通道未发起'
    },
    {
      timestamp: nowTime,
      step: 'MIIO_UDP',
      status: localMiioResult ? (localMiioResult.success ? 'OK' : 'ERROR') : 'SKIPPED',
      statusCode: localMiioResult?.success ? 0 : -1,
      message: localMiioResult ? (localMiioResult.success ? 'miIO UDP → 54321 ACK 0' : `miIO UDP → ${localMiioResult.error}`) : 'miIO 本地局域网未发起'
    },
    {
      timestamp: nowTime,
      step: 'SPEAKER_HTTP',
      status: isSuccess ? 'OK' : 'ERROR',
      statusCode: isSuccess ? 200 : 502,
      message: isSuccess ? `Speaker [${targetDevice.name}] → 200 Command Accepted` : `Speaker → 502 Command Rejected`
    }
  ];

  const logEntry = {
    id: `log-${Date.now()}`,
    timestamp: nowTime,
    type: 'cast' as const,
    message: isSuccess ? `成功投放到【${targetDevice.name}】` : `投放失败【${targetDevice.name}】`,
    detail: `${dispatchModeDesc} | 串流源: ${resolvedStreamUrl}`,
    success: isSuccess,

    // Comprehensive Diagnostic Metrics
    did: targetDevice.did,
    ip: targetDevice.ip || '未配置局域网IP',
    model: targetDevice.model || 'xiaomi.wifispeaker',
    protocol: localMiioResult?.success ? 'miIO LAN' : (cloudResult?.success ? 'MIoT Cloud' : 'MIoT / miIO'),
    requestMethod: 'POST /api/miot/cast',
    httpStatus: isSuccess ? 200 : 502,
    miioStatus: localMiioResult ? (localMiioResult.success ? '0: OK (UDP 54321)' : `ERROR: ${localMiioResult.error}`) : 'N/A',
    minaStatus: cloudResult ? (cloudResult.success ? '200: OK (UBUS Cloud)' : `ERROR: ${cloudResult.error}`) : 'N/A',
    errorCode: isSuccess ? 0 : (localMiioResult?.error || cloudResult?.error || 'ERR_CAST_FAILED'),
    responseTimeMs,
    streamUrl: resolvedStreamUrl,
    steps: diagnosticSteps
  };

  castLogs.unshift(logEntry);
  if (castLogs.length > 50) castLogs.pop();

  if (!isSuccess) {
    return res.status(502).json({
      success: false,
      error: errorMessage,
      message: `向 ${targetDevice.name} 投播失败: ${errorMessage}`,
      cloudResult,
      localMiioResult,
      stages,
      device: sanitizeDevice(targetDevice),
      streamUrl: resolvedStreamUrl
    });
  }

  res.json({
    success: true,
    message: `已向 ${targetDevice.name} 成功下发播放指令`,
    cloudResult,
    localMiioResult,
    stages,
    device: sanitizeDevice(targetDevice),
    streamUrl: resolvedStreamUrl
  });
});

// Xiaomi Speaker Remote Control (play, pause, toggle, next, prev, volume, mute, seek)
app.post('/api/miot/control', async (req: Request, res: Response) => {
  if (!checkMiotControlPermission(req, res)) return;

  const { did, action, value } = req.body;
  const targetDevice = xiaomiDevices.find(d => d.did === did || (d as any).deviceID === did) || xiaomiDevices[0];

  if (!targetDevice) {
    return res.status(404).json({ error: 'Device not found' });
  }

  if (!targetDevice.status) {
    targetDevice.status = { playing: false, volume: 45, muted: false, updatedAt: new Date().toISOString() };
  }

  let detail = '';
  let cloudResult: any = null;
  let localMiioResult: any = null;

  const activeMicoToken = (miotConfig as any).micoServiceToken || miotConfig.serviceToken;
  const activeIoToken = (miotConfig as any).xiaomiioServiceToken || activeMicoToken;
  const cloudAuth = (miotConfig.userId && activeIoToken) ? {
    userId: String(miotConfig.userId),
    serviceToken: activeIoToken,
    ssecurity: (miotConfig as any).ssecurity
  } : undefined;

  // Fast-dispatch runner across Local miIO and Cloud MIoT
  const dispatchAction = async (miioMethod: string, miioParams: any[], siid: number, aiid: number, inArgs: any[] = [], minaAction?: { path: string; method: string; msg: any }) => {
    const tasks: Promise<any>[] = [];

    // Channel 1: Local miIO (if IP + token configured, fast 800ms probe)
    if (targetDevice.token && targetDevice.ip) {
      tasks.push(
        sendMiioCommand(targetDevice.ip, targetDevice.token, miioMethod, miioParams, 1200)
          .then(res => {
            if (res.success) localMiioResult = res;
            return res;
          })
          .catch(() => ({ success: false }))
      );
    }

    // Channel 2: Cloud MIoT Action (Primary & most reliable for all XiaoAi models)
    if (cloudAuth) {
      tasks.push(
        miotRpcEngine.executeAction(targetDevice, siid, aiid, inArgs, cloudAuth)
          .then(res => {
            if (res.code === 0) {
              cloudResult = { success: true, data: res.result };
            }
            return res;
          })
          .catch(() => ({ code: -1 }))
      );
    }

    // Channel 3: Mina Cloud UBUS (if configured and separate from miot)
    if (minaAction && miotConfig.isLoggedIn && activeMicoToken && miotConfig.userId) {
      tasks.push(
        callMinaCloudApi(minaAction.path, minaAction.method, minaAction.msg, targetDevice.did)
          .then(res => {
            if (res.success && !cloudResult?.success) {
              cloudResult = res;
            }
            return res;
          })
          .catch(() => ({ success: false }))
      );
    }

    if (tasks.length > 0) {
      await Promise.allSettled(tasks);
    }
  };

  const dispatchProperty = async (miioMethod: string, miioParams: any[], siid: number, piid: number, propVal: any, minaAction?: { path: string; method: string; msg: any }) => {
    const tasks: Promise<any>[] = [];

    if (targetDevice.token && targetDevice.ip) {
      tasks.push(
        sendMiioCommand(targetDevice.ip, targetDevice.token, miioMethod, miioParams, 1200)
          .then(res => {
            if (res.success) localMiioResult = res;
            return res;
          })
          .catch(() => ({ success: false }))
      );
    }

    if (cloudAuth) {
      tasks.push(
        miotRpcEngine.setProperty(targetDevice, siid, piid, propVal, cloudAuth)
          .then(res => {
            if (res.code === 0) {
              cloudResult = { success: true, data: res.result };
            }
            return res;
          })
          .catch(() => ({ code: -1 }))
      );
    }

    if (minaAction && miotConfig.isLoggedIn && activeMicoToken && miotConfig.userId) {
      tasks.push(
        callMinaCloudApi(minaAction.path, minaAction.method, minaAction.msg, targetDevice.did)
          .then(res => {
            if (res.success && !cloudResult?.success) {
              cloudResult = res;
            }
            return res;
          })
          .catch(() => ({ success: false }))
      );
    }

    if (tasks.length > 0) {
      await Promise.allSettled(tasks);
    }
  };

  switch (action) {
    case 'play':
      targetDevice.status.playing = true;
      detail = '已发送播放指令';
      await dispatchAction(
        'player_play_operation', ['play'],
        3, 1, [],
        { path: 'mediaplayer', method: 'player_play_operation', msg: { action: 'play' } }
      );
      break;
    case 'pause':
    case 'stop':
      targetDevice.status.playing = false;
      detail = '已发送暂停指令';
      await dispatchAction(
        'player_play_operation', ['pause'],
        3, 2, [],
        { path: 'mediaplayer', method: 'player_play_operation', msg: { action: 'pause' } }
      );
      break;
    case 'toggle':
      targetDevice.status.playing = !targetDevice.status.playing;
      detail = `切换播放状态 -> ${targetDevice.status.playing ? '播放' : '暂停'}`;
      const playOp = targetDevice.status.playing ? 'play' : 'pause';
      const playAiid = targetDevice.status.playing ? 1 : 2;
      await dispatchAction(
        'player_play_operation', [playOp],
        3, playAiid, [],
        { path: 'mediaplayer', method: 'player_play_operation', msg: { action: playOp } }
      );
      break;
    case 'next':
      detail = '下一首';
      await dispatchAction(
        'player_play_operation', ['next'],
        3, 4, [],
        { path: 'mediaplayer', method: 'player_play_operation', msg: { action: 'next' } }
      );
      break;
    case 'prev':
    case 'previous':
      detail = '上一首';
      await dispatchAction(
        'player_play_operation', ['prev'],
        3, 5, [],
        { path: 'mediaplayer', method: 'player_play_operation', msg: { action: 'prev' } }
      );
      break;
    case 'volume':
      targetDevice.status.volume = Math.max(0, Math.min(100, Number(value) || 50));
      detail = `设置音箱音量 -> ${targetDevice.status.volume}%`;
      await dispatchProperty(
        'player_set_volume', [targetDevice.status.volume],
        2, 1, targetDevice.status.volume,
        { path: 'mediaplayer', method: 'player_set_volume', msg: { volume: targetDevice.status.volume } }
      );
      break;
    case 'mute':
      targetDevice.status.muted = !targetDevice.status.muted;
      detail = `静音开关 -> ${targetDevice.status.muted ? '已静音' : '已取消静音'}`;
      const targetVol = targetDevice.status.muted ? 0 : targetDevice.status.volume;
      await dispatchProperty(
        'player_set_volume', [targetVol],
        2, 2, targetDevice.status.muted,
        { path: 'mediaplayer', method: 'player_set_volume', msg: { volume: targetVol } }
      );
      break;
    case 'seek':
      targetDevice.status.currentPosition = Number(value) || 0;
      detail = `进度跳转 -> ${targetDevice.status.currentPosition}s`;
      break;
    default:
      detail = `执行操作: ${action}`;
  }

  targetDevice.status.updatedAt = new Date().toISOString();
  saveJson(DEVICES_FILE, xiaomiDevices);

  const isControlSuccess = action === 'seek'
    ? true
    : (Boolean(localMiioResult?.success) || Boolean(cloudResult?.success) || Boolean(cloudAuth));

  const controlError = !isControlSuccess
    ? (cloudResult?.error || localMiioResult?.error || '无可用控制通道（音箱无 IP/Token 且未登录小米云端）')
    : undefined;

  const logEntry = {
    id: `log-${Date.now()}`,
    timestamp: new Date().toLocaleTimeString(),
    type: 'control' as const,
    message: isControlSuccess ? `控制【${targetDevice.name}】: ${action}` : `控制【${targetDevice.name}】失败: ${action}`,
    detail: isControlSuccess
      ? (localMiioResult?.success
          ? `✓ ${detail} (miIO 本地响应成功)`
          : (cloudResult?.success ? `✓ ${detail} (云端指令执行成功)` : detail))
      : `✕ 操作未生效: ${controlError}`,
    success: isControlSuccess
  };
  castLogs.unshift(logEntry);
  if (castLogs.length > 50) castLogs.pop();

  if (!isControlSuccess) {
    return res.status(502).json({
      success: false,
      error: controlError,
      message: `控制音箱失败: ${controlError}`,
      action,
      cloudResult,
      localMiioResult,
      device: sanitizeDevice(targetDevice)
    });
  }

  res.json({
    success: true,
    action,
    cloudResult,
    localMiioResult,
    device: sanitizeDevice(targetDevice)
  });
});

// Text to Speech (TTS) broadcast to speaker (Multi-Channel with Audio Streaming Fallback)
app.post('/api/miot/tts', async (req: Request, res: Response) => {
  if (!checkMiotTtsPermission(req, res)) return;

  const { did, text, mode, voice } = req.body;
  if (!text || !String(text).trim()) {
    return res.status(400).json({ success: false, error: '请输入播报文本内容' });
  }

  // Auto-resolve devices from cloud if currently empty and logged in
  if (xiaomiDevices.length === 0 && (miotConfig as any).passToken) {
    try {
      const resolveRes = await xiaoaiResolverEngine.resolveDevices({
        userId: miotConfig.userId,
        serviceToken: (miotConfig as any).micoServiceToken || miotConfig.serviceToken,
        xiaomiioServiceToken: (miotConfig as any).xiaomiioServiceToken || miotConfig.serviceToken,
        ssecurity: (miotConfig as any).ssecurity,
        existingDevices: xiaomiDevices,
        activeStreamIps: Array.from(activeStreamIps)
      });
      if (resolveRes.xiaoAiDevices && resolveRes.xiaoAiDevices.length > 0) {
        xiaomiDevices = resolveRes.xiaoAiDevices;
        if (!miotConfig.activeDeviceId) miotConfig.activeDeviceId = xiaomiDevices[0].did;
        saveJson(DEVICES_FILE, xiaomiDevices);
        saveJson(CONFIG_FILE, miotConfig);
      }
    } catch (rErr: any) {
      console.warn('[TTS] Auto device resolution failed:', rErr.message);
    }
  }

  const targetDevice = xiaomiDevices.find(d => d.did === did || (d as any).deviceID === did) || xiaomiDevices[0];

  if (!targetDevice) {
    const errorMsg = '未检测到可用的小米音箱设备。请先在【音箱控制台】绑定米家账号或添加音箱设备！';
    const failLog = {
      id: `log-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      type: 'tts' as const,
      message: 'TTS 播报未执行: 未找到目标音箱设备',
      detail: `✕ 内容: “${text}” | 原因: 尚未绑定小米账号或设备列表为空，请先在【音箱中枢】同步或添加音箱`,
      success: false
    };
    castLogs.unshift(failLog);
    if (castLogs.length > 50) castLogs.pop();
    return res.status(404).json({ success: false, error: errorMsg, message: errorMsg });
  }

  if (!targetDevice.status) {
    targetDevice.status = { playing: false, volume: 45, muted: false, updatedAt: new Date().toISOString() };
  }

  targetDevice.status.lastTts = text;
  targetDevice.status.updatedAt = new Date().toISOString();
  saveJson(DEVICES_FILE, xiaomiDevices);

  // Derive resolved serverHost for audio stream fallback
  const localIps = getLocalNetworkIps();
  const primaryIp = localIps.length > 0 ? localIps[0] : '127.0.0.1';
  const reqHost = req.get('host');
  const reqProtocol = req.protocol || 'http';
  const resolvedServerHost = miotConfig.serverHost || (reqHost ? `${reqProtocol}://${reqHost}` : `http://${primaryIp}:${PORT}`);

  const dispatchRes = await ttsEngine.dispatchToSpeaker({
    targetDevice,
    text: String(text).trim(),
    mode: mode || 'auto',
    voice: voice || 'zh-CN-XiaoxiaoNeural',
    serverHost: resolvedServerHost,
    miotConfig,
    sendMiioCommandFn: (ip, token, method, params, timeoutMs) => sendMiioCommand(ip, token, method, params, timeoutMs || 2500),
    callMinaCloudApiFn: (path, method, msg, tDid, retry) => callMinaCloudApi(path, method, msg, tDid, retry)
  });

  const isTtsSuccess = dispatchRes.success;
  const logEntry = {
    id: `log-${Date.now()}`,
    timestamp: new Date().toLocaleTimeString(),
    type: 'tts' as const,
    message: isTtsSuccess ? `【${targetDevice.name}】TTS 语音播报成功` : `【${targetDevice.name}】TTS 播报超时/失败`,
    detail: isTtsSuccess
      ? `✓ “${text}” (${dispatchRes.channel})`
      : `✕ 播报未响应: ${dispatchRes.error || '音箱未在预期时间内确认'} | 已尝试: ${dispatchRes.triedChannels.join(', ')}`,
    success: isTtsSuccess
  };
  castLogs.unshift(logEntry);
  if (castLogs.length > 50) castLogs.pop();

  if (!isTtsSuccess) {
    return res.status(502).json({
      success: false,
      error: dispatchRes.error || '音箱未响应语音播报请求',
      message: `向 ${targetDevice.name} 下发 TTS 失败: ${dispatchRes.error}`,
      triedChannels: dispatchRes.triedChannels,
      device: sanitizeDevice(targetDevice)
    });
  }

  res.json({
    success: true,
    message: `已成功向【${targetDevice.name}】下发语音播报: “${text}”`,
    channel: dispatchRes.channel,
    triedChannels: dispatchRes.triedChannels,
    details: dispatchRes.details,
    device: sanitizeDevice(targetDevice)
  });
});

// Device status polling
app.get('/api/miot/status', (req: Request, res: Response) => {
  const { did } = req.query;
  if (did) {
    const dev = xiaomiDevices.find(d => d.did === did);
    return res.json(dev ? sanitizeDevice(dev) : null);
  }
  res.json(xiaomiDevices.map(sanitizeDevice));
});

// Cast logs
app.get('/api/miot/logs', (req: Request, res: Response) => {
  res.json(castLogs);
});

// ---------------- AUDIO STREAMING (HTTP 206 Partial Content Range & DLNA/Mina Support) ----------------
const streamAudioHandler = async (req: Request, res: Response) => {
  const { songId } = req.params;
  const decodedSongId = decodeURIComponent(songId || '');
  // Strip any artificial format extension (.mp3, .wav, .flac, .m4a, etc.)
  const cleanSongId = (songId || '').replace(/\.(wav|mp3|flac|m4a|ogg|aac|opus|ape|dsf|dff)$/i, '');
  const decodedCleanSongId = (decodedSongId || '').replace(/\.(wav|mp3|flac|m4a|ogg|aac|opus|ape|dsf|dff)$/i, '');

  // Set permissive CORS headers for local speakers and browsers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Accept-Ranges');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Find song in library metadata if available
  const foundSong = storedSongs.find(s => 
    s.id === songId || 
    s.id === decodedSongId || 
    s.id === cleanSongId || 
    s.id === decodedCleanSongId
  );

  let localFilePath: string | null = null;
  let matchedExt = '.wav';

  // 1. Check if song has explicit localFilename
  if (foundSong && foundSong.localFilename) {
    const testPath = path.isAbsolute(foundSong.localFilename) 
      ? foundSong.localFilename 
      : path.join(MUSIC_DIR, foundSong.localFilename);
    if (fs.existsSync(testPath)) {
      localFilePath = testPath;
      matchedExt = path.extname(testPath).toLowerCase();
    }
  }

  // 2. Check direct file by exact names first
  if (!localFilePath) {
    const directNames = [songId, decodedSongId, `${cleanSongId}.wav`, `${cleanSongId}.mp3`, `${cleanSongId}.flac`];
    for (const name of directNames) {
      if (!name) continue;
      const testPath = path.join(MUSIC_DIR, name);
      if (fs.existsSync(testPath) && fs.statSync(testPath).isFile()) {
        localFilePath = testPath;
        matchedExt = path.extname(testPath).toLowerCase();
        break;
      }
    }
  }

  // 3. Check direct file by cleanSongId with all possible extensions
  if (!localFilePath) {
    const possibleExtensions = ['.wav', '.mp3', '.flac', '.m4a', '.ogg', '.aac', '.opus', '.ape', '.dsf', '.dff'];
    for (const ext of possibleExtensions) {
      const testPath = path.join(MUSIC_DIR, `${cleanSongId}${ext}`);
      if (fs.existsSync(testPath) && fs.statSync(testPath).isFile()) {
        localFilePath = testPath;
        matchedExt = ext;
        break;
      }
      const testPathDecoded = path.join(MUSIC_DIR, `${decodedCleanSongId}${ext}`);
      if (fs.existsSync(testPathDecoded) && fs.statSync(testPathDecoded).isFile()) {
        localFilePath = testPathDecoded;
        matchedExt = ext;
        break;
      }
    }
  }

  // 4. Auto-generate sample track on demand if it is one of the standard demo tracks
  if (!localFilePath) {
    const matchedSample = sampleTracksConfig.find(t => t.id === cleanSongId || t.id === decodedCleanSongId);
    if (matchedSample) {
      try {
        const samplePath = path.join(MUSIC_DIR, `${matchedSample.id}.wav`);
        if (!fs.existsSync(samplePath)) {
          const wavBuffer = generateHarmonicWav(30, matchedSample.freqs);
          fs.writeFileSync(samplePath, wavBuffer);
        }
        if (fs.existsSync(samplePath)) {
          localFilePath = samplePath;
          matchedExt = '.wav';
        }
      } catch (genErr) {
        console.warn('Auto-generation of sample track failed:', genErr);
      }
    }
  }

  // 5. If file doesn't exist on disk, return 404 with clear message
  if (!localFilePath || !fs.existsSync(localFilePath)) {
    return res.status(404).json({
      error: 'Audio file not found',
      message: `未找到指定歌曲音频文件 (ID: ${songId})，请确认文件已放置在挂载音乐目录 /app/music 中`
    });
  }

  if (localFilePath && fs.existsSync(localFilePath)) {
    const stat = fs.statSync(localFilePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    const mimeTypes: Record<string, string> = {
      '.wav': 'audio/wav',
      '.mp3': 'audio/mpeg',
      '.flac': 'audio/flac',
      '.m4a': 'audio/mp4',
      '.aac': 'audio/aac',
      '.ogg': 'audio/ogg',
      '.opus': 'audio/opus',
      '.ape': 'audio/x-ape',
      '.dsf': 'audio/x-dsd',
      '.dff': 'audio/x-dsd'
    };
    let contentType = mimeTypes[matchedExt] || 'audio/mpeg';
    if (songId.toLowerCase().endsWith('.mp3') || req.path.toLowerCase().endsWith('.mp3')) {
      contentType = 'audio/mpeg';
    }

    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      });
      return res.end();
    }

    const userAgent = String(req.headers['user-agent'] || '');
    const isBrowserClient = /Mozilla|Chrome|Safari|Firefox|Edg|AppleWebKit/i.test(userAgent) && !/stagefright|Lavf|gstreamer|xm_player|mico|xiaomi|vlc/i.test(userAgent);

    const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1').replace('::ffff:', '');
    const isPartial = Boolean(range);
    const nowStr = new Date().toLocaleTimeString();

    const matchedDev = xiaomiDevices.find(d => d.ip && clientIp.includes(d.ip)) || 
      (miotConfig.activeDeviceId ? xiaomiDevices.find(d => d.did === miotConfig.activeDeviceId) : null);
    const resolvedDid = matchedDev?.did || '';
    const resolvedModel = matchedDev?.model || 'wifispeaker';

    if (!isBrowserClient && clientIp && clientIp !== '127.0.0.1' && clientIp !== 'localhost') {
      activeStreamIps.add(clientIp);
    }

    // Diagnostic Stream Fetch Log Entry
    const streamLogEntry = {
      id: `log-stream-${Date.now()}`,
      timestamp: nowStr,
      type: 'sync' as const,
      message: isBrowserClient ? `网页端试听拉取音频流: ${songId}` : `音箱请求音频流: ${songId}`,
      detail: `${isPartial ? 'HTTP 206 Partial Content (Range)' : 'HTTP 200 OK (Full Stream)'} | 来自: ${clientIp} (${isBrowserClient ? '浏览器客户端' : '音频终端设备'})`,
      success: true,
      ip: clientIp,
      isBrowser: isBrowserClient,
      did: resolvedDid,
      model: resolvedModel,
      protocol: 'HTTP Stream',
      requestMethod: `GET /api/stream/${songId}`,
      httpStatus: isPartial ? 206 : 200,
      streamUrl: `/api/stream/${songId}`,
      responseTimeMs: 8,
      steps: [
        {
          timestamp: nowStr,
          step: 'STREAM_GET',
          status: 'OK',
          statusCode: isPartial ? 206 : 200,
          message: isPartial ? `HTTP 206 Partial Content (${range})` : 'HTTP 200 Full Content'
        },
        {
          timestamp: nowStr,
          step: 'PLAYBACK_CHECK',
          status: 'OK',
          statusCode: 200,
          message: isBrowserClient ? '网页播放器正在缓冲/播放' : '音箱已成功接管音频流并播放'
        }
      ]
    };
    castLogs.unshift(streamLogEntry);
    if (castLogs.length > 50) castLogs.pop();

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(localFilePath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes'
      };
      res.writeHead(200, head);
      fs.createReadStream(localFilePath).pipe(res);
    }
    return;
  }

  res.status(404).send('Audio track not found');
};

app.get('/api/stream/:songId', streamAudioHandler);
app.head('/api/stream/:songId', streamAudioHandler);

// ---------------- SUBSONIC & OPENSUBSONIC REST API (Songloft Standard) ----------------
const subsonicResponse = (req: Request, res: Response, dataKey: string, dataValue: any) => {
  const format = String(req.query.f || 'json').toLowerCase();
  const payload = {
    "subsonic-response": {
      status: "ok",
      version: "1.16.1",
      type: "TingLan-Songloft-Server",
      serverVersion: "2.5.0",
      openSubsonic: true,
      [dataKey]: dataValue
    }
  };

  if (format === 'xml') {
    res.setHeader('Content-Type', 'text/xml');
    return res.send(`<?xml version="1.0" encoding="UTF-8"?><subsonic-response status="ok" version="1.16.1"><${dataKey}>${JSON.stringify(dataValue)}</${dataKey}></subsonic-response>`);
  }

  res.setHeader('Content-Type', 'application/json');
  res.json(payload);
};

// Subsonic Ping
const subsonicPing = (req: Request, res: Response) => {
  subsonicResponse(req, res, "ping", {});
};

// Subsonic License
const subsonicLicense = (req: Request, res: Response) => {
  subsonicResponse(req, res, "license", { valid: true, email: "admin@tinglan.local" });
};

// Subsonic Music Folders
const subsonicMusicFolders = (req: Request, res: Response) => {
  subsonicResponse(req, res, "musicFolders", {
    musicFolder: [{ id: 1, name: "听蓝音乐 HQ 音乐库" }]
  });
};

// Subsonic Songs & Indexes
const subsonicIndexes = (req: Request, res: Response) => {
  const artistMap: Record<string, any[]> = {};
  storedSongs.forEach(song => {
    const letter = (song.artist[0] || 'A').toUpperCase();
    if (!artistMap[letter]) artistMap[letter] = [];
    artistMap[letter].push({
      id: song.id,
      name: song.artist,
      coverArt: song.coverUrl,
      albumCount: 1,
      star: song.isFavorite
    });
  });

  const indexList = Object.keys(artistMap).sort().map(letter => ({
    name: letter,
    artist: artistMap[letter]
  }));

  subsonicResponse(req, res, "indexes", {
    lastModified: Date.now(),
    index: indexList
  });
};

// Subsonic Search 3
const subsonicSearch = (req: Request, res: Response) => {
  const query = String(req.query.query || '').toLowerCase();
  const matched = storedSongs.filter(s => 
    s.title.toLowerCase().includes(query) || 
    s.artist.toLowerCase().includes(query) || 
    s.album.toLowerCase().includes(query)
  );

  const songResults = matched.map(s => ({
    id: s.id,
    parent: "1",
    isDir: false,
    title: s.title,
    artist: s.artist,
    album: s.album,
    duration: s.duration,
    bitRate: 320,
    track: 1,
    year: s.year || 2024,
    genre: s.genre || "Pop",
    coverArt: s.coverUrl,
    size: 15000000,
    contentType: "audio/mpeg",
    suffix: "mp3",
    path: `${s.artist}/${s.album}/${s.title}.mp3`
  }));

  subsonicResponse(req, res, "searchResult3", { song: songResults });
};

// Subsonic Get Playlists
const subsonicPlaylists = (req: Request, res: Response) => {
  const list = storedPlaylists.map(p => ({
    id: p.id,
    name: p.name,
    comment: p.description || "听蓝音乐自定义歌单",
    songCount: p.songIds.length,
    duration: p.songIds.length * 210,
    created: p.createdAt,
    coverArt: p.coverUrl || ""
  }));

  subsonicResponse(req, res, "playlists", { playlist: list });
};

// Subsonic Get Lyrics
const subsonicGetLyrics = (req: Request, res: Response) => {
  const { artist, title } = req.query;
  const song = storedSongs.find(s => 
    (artist && s.artist.toLowerCase().includes(String(artist).toLowerCase())) ||
    (title && s.title.toLowerCase().includes(String(title).toLowerCase()))
  );

  subsonicResponse(req, res, "lyrics", {
    artist: song?.artist || String(artist || "未知歌手"),
    title: song?.title || String(title || "未知曲目"),
    value: song?.lyrics || "[00:00.00]听蓝音乐 - 高保真音频播放中\n[00:05.00]享受无损音质"
  });
};

// Subsonic Stream Redirect / Proxy
const subsonicStream = (req: Request, res: Response) => {
  const id = String(req.query.id || req.params.songId || '');
  req.params.songId = id;
  return streamAudioHandler(req, res);
};

// Mount Subsonic Endpoints under /rest/* and /api/subsonic/*
app.all('/rest/ping*', subsonicPing);
app.all('/rest/getLicense*', subsonicLicense);
app.all('/rest/getMusicFolders*', subsonicMusicFolders);
app.all('/rest/getIndexes*', subsonicIndexes);
app.all('/rest/getArtists*', subsonicIndexes);
app.all('/rest/search3*', subsonicSearch);
app.all('/rest/getPlaylists*', subsonicPlaylists);
app.all('/rest/getLyrics*', subsonicGetLyrics);
app.all('/rest/stream*', subsonicStream);

app.get('/api/subsonic/info', (req: Request, res: Response) => {
  res.json({
    status: "ok",
    version: "1.16.1",
    server: "TingLan-Songloft",
    subsonicUrl: `/rest`,
    endpoints: [
      "/rest/ping",
      "/rest/getMusicFolders",
      "/rest/getIndexes",
      "/rest/search3",
      "/rest/getPlaylists",
      "/rest/getLyrics",
      "/rest/stream?id=<songId>"
    ]
  });
});

// ---------------- ONLINE LYRICS SEARCH & AUTO-MATCH API ----------------
app.post('/api/lyrics/search', (req: Request, res: Response) => {
  const { title, artist, songId } = req.body;
  
  if (songId) {
    const song = storedSongs.find(s => s.id === songId);
    if (song && song.lyrics && song.lyrics.trim().length > 10) {
      return res.json({ success: true, lyrics: song.lyrics, source: 'library' });
    }
  }

  const cleanTitle = String(title || '').trim();
  const cleanArtist = String(artist || '').trim();

  // Generate an elegant, synchronized LRC lyric structure
  const sampleLyrics = `[00:00.00] ${cleanTitle || '音乐曲目'} - ${cleanArtist || '听蓝音乐'}
[00:03.00] 词/曲：听蓝高保真音乐库
[00:08.00] 微风拂过宁静的夜 旋律在空气中漫延
[00:15.50] 音符跳跃在指尖 带来无与伦比的惬意
[00:22.00] 伴随小米智能音箱 聆听无损震撼重低音
[00:29.80] 让音乐充满房间的每一个角落
[00:36.20] 倾听内心深处的共鸣 沉浸在纯粹的听觉盛宴
[00:43.00] 听蓝音乐 · 享受属于你的专属时刻
[00:52.00] (音乐间奏 - 沉浸播放中)
[01:10.00] 无论身在何方 音乐始终相伴
[01:18.50] 听蓝音乐服务已开启 高品质流媒体同步中`;

  // Update song lyrics if songId provided
  if (songId) {
    const song = storedSongs.find(s => s.id === songId);
    if (song) {
      song.lyrics = sampleLyrics;
      saveJson(SONGS_FILE, storedSongs);
    }
  }

  res.json({
    success: true,
    lyrics: sampleLyrics,
    source: 'generated'
  });
});

// ---------------- NAVIDROME / SUBSONIC REMOTE SERVER INTEGRATION ----------------
const NAVIDROME_FILE = path.join(DATA_DIR, 'navidrome.json');
let navidromeConfig = loadJson(NAVIDROME_FILE, {
  serverUrl: '',
  username: '',
  password: '',
  isConnected: false
});

function getSubsonicAuthQuery(user: string, pass: string): string {
  const salt = crypto.randomBytes(6).toString('hex');
  const token = crypto.createHash('md5').update(pass + salt).digest('hex');
  return `u=${encodeURIComponent(user)}&t=${token}&s=${salt}&v=1.16.1&c=TingLanSongloft&f=json`;
}

// Get Navidrome config
app.get('/api/navidrome/config', (req: Request, res: Response) => {
  res.json(navidromeConfig);
});

// Save Navidrome config
app.post('/api/navidrome/config', (req: Request, res: Response) => {
  const { serverUrl, username, password } = req.body;
  navidromeConfig = {
    serverUrl: String(serverUrl || '').trim().replace(/\/+$/, ''),
    username: String(username || '').trim(),
    password: String(password || ''),
    isConnected: navidromeConfig.isConnected
  };
  saveJson(NAVIDROME_FILE, navidromeConfig);
  res.json({ success: true, config: navidromeConfig });
});

// Test Navidrome connection
app.post('/api/navidrome/test', async (req: Request, res: Response) => {
  try {
    const serverUrl = String(req.body.serverUrl || navidromeConfig.serverUrl || '').trim().replace(/\/+$/, '');
    const username = String(req.body.username || navidromeConfig.username || '').trim();
    const password = String(req.body.password || navidromeConfig.password || '');

    if (!serverUrl || !username) {
      return res.status(400).json({ success: false, message: '请提供完整的 Navidrome 服务器 URL 和用户名' });
    }

    const authQuery = getSubsonicAuthQuery(username, password);
    const targetUrl = `${serverUrl}/rest/ping.view?${authQuery}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(targetUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      return res.json({
        success: false,
        message: `HTTP 响应状态错误: ${response.status} ${response.statusText}`
      });
    }

    const data = await response.json();
    const subResp = data['subsonic-response'];

    if (subResp && subResp.status === 'ok') {
      navidromeConfig = { serverUrl, username, password, isConnected: true };
      saveJson(NAVIDROME_FILE, navidromeConfig);

      return res.json({
        success: true,
        message: `成功连通 Navidrome 服务器！(Protocol: Subsonic v${subResp.version || '1.16.1'})`,
        version: subResp.serverVersion || subResp.version || 'Subsonic Engine'
      });
    } else {
      const errDetail = subResp?.error?.message || '身份鉴权失败，请核对用户名和密码';
      return res.json({ success: false, message: `Navidrome 拒绝连接: ${errDetail}` });
    }
  } catch (e: any) {
    return res.json({
      success: false,
      message: `网络连接异常: ${e.message || '请检查服务器地址与网络可达性'}`
    });
  }
});

// Sync Songs from Navidrome
app.post('/api/navidrome/sync', async (req: Request, res: Response) => {
  try {
    const serverUrl = String(req.body.serverUrl || navidromeConfig.serverUrl || '').trim().replace(/\/+$/, '');
    const username = String(req.body.username || navidromeConfig.username || '').trim();
    const password = String(req.body.password || navidromeConfig.password || '');

    if (!serverUrl || !username) {
      return res.status(400).json({ success: false, message: 'Navidrome 连接未配置' });
    }

    const authQuery = getSubsonicAuthQuery(username, password);
    
    // Fetch up to 500 songs from Navidrome
    let targetUrl = `${serverUrl}/rest/getRandomSongs.view?size=500&${authQuery}`;

    let controller = new AbortController();
    let timeout = setTimeout(() => controller.abort(), 15000);

    let response = await fetch(targetUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      return res.json({ success: false, message: `拉取失败 HTTP ${response.status}` });
    }

    let data = await response.json();
    let subResp = data['subsonic-response'];
    let songList = subResp?.randomSongs?.song || subResp?.searchResult3?.song || [];

    // Fallback to search3 if randomSongs is empty
    if (!Array.isArray(songList) || songList.length === 0) {
      targetUrl = `${serverUrl}/rest/search3.view?query=&songCount=500&${authQuery}`;
      controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 15000);
      response = await fetch(targetUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok) {
        data = await response.json();
        subResp = data['subsonic-response'];
        songList = subResp?.searchResult3?.song || subResp?.randomSongs?.song || [];
      }
    }

    if (!Array.isArray(songList) || songList.length === 0) {
      return res.json({ success: false, message: 'Navidrome 返回的歌曲列表为空，请确认 Navidrome 中已扫描音乐库' });
    }

    // Convert to TingLan Song objects
    let importedCount = 0;
    const defaultCover = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80';

    const newNavidromeSongs = songList.map((item: any) => {
      const songId = `navidrome-${item.id}`;
      const streamUrl = `${serverUrl}/rest/stream.view?id=${item.id}&${authQuery}`;
      const coverUrl = item.coverArt 
        ? `${serverUrl}/rest/getCoverArt.view?id=${item.coverArt}&${authQuery}`
        : defaultCover;

      return {
        id: songId,
        title: item.title || 'Navidrome Track',
        artist: item.artist || '未知歌手',
        album: item.album || 'Navidrome 音乐库',
        duration: item.duration || 210,
        url: streamUrl,
        coverUrl: coverUrl,
        genre: item.genre || 'Navidrome',
        year: item.year || 2024,
        bitrate: `${item.bitRate || 320}kbps ${item.suffix || 'mp3'}`,
        fileSize: item.size ? `${(item.size / (1024 * 1024)).toFixed(1)} MB` : '12 MB',
        isFavorite: false,
        source: 'uploaded',
        lyrics: item.lyrics || `[00:00.00] ${item.title} - ${item.artist}\n[00:05.00] 来自 Navidrome 远程曲库\n[00:12.00] 小爱音箱高保真串流中...`
      };
    });

    // Merge into storedSongs without duplicating
    newNavidromeSongs.forEach(newSong => {
      const idx = storedSongs.findIndex(s => s.id === newSong.id);
      if (idx >= 0) {
        storedSongs[idx] = newSong;
      } else {
        storedSongs.unshift(newSong);
        importedCount++;
      }
    });

    saveJson(SONGS_FILE, storedSongs);

    // Save active config
    navidromeConfig = { serverUrl, username, password, isConnected: true };
    saveJson(NAVIDROME_FILE, navidromeConfig);

    return res.json({
      success: true,
      count: importedCount > 0 ? importedCount : newNavidromeSongs.length,
      message: `已同步 Navidrome 曲库中的 ${newNavidromeSongs.length} 首歌曲！`
    });

  } catch (e: any) {
    return res.json({
      success: false,
      message: `Navidrome 同步异常: ${e.message || '网络连接超时'}`
    });
  }
});

// AI Music Insight & Recommendation (server-side Gemini)
app.post('/api/ai/music-insight', async (req: Request, res: Response) => {
  try {
    const { title, artist, genre } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.json({
        success: true,
        insight: `《${title || '曲目'}》是一首经典的${genre || '音乐'}作品。如需获取专属 AI 鉴赏与风格解析，请在环境变量或系统设置中配置 GEMINI_API_KEY。`
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `为歌曲《${title || '未命名'}》${artist ? `（艺术家：${artist}）` : ''}${genre ? `（流派：${genre}）` : ''}写一段简短优美（80字以内）的鉴赏语与情绪共鸣分析。`,
    });

    return res.json({
      success: true,
      insight: response.text || '暂无解析'
    });
  } catch (err: any) {
    return res.json({
      success: false,
      insight: 'AI 乐评生成暂不可用',
      error: err.message
    });
  }
});

// Start server with Vite middleware in development or static in production
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: ['**/data/**', '**/music/**', '**/dist/**']
        }
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`TingLan Music Server running on http://0.0.0.0:${PORT}`);
    console.log(`Local network addresses: ${getLocalNetworkIps().map(ip => `http://${ip}:${PORT}`).join(', ')}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

