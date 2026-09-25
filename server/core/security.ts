import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

export interface SecuritySettings {
  requireAuth: boolean;
  authScope: 'all' | 'wan_only';
  allowRegistration?: boolean;
  allowUserMiotControl?: boolean;
  allowUserMiotTts?: boolean;
  updatedAt: string;
}

export function getClientIp(req: Request): string {
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
  const rawIp = req.socket.remoteAddress || (req as any).ip || '127.0.0.1';
  return String(rawIp).replace(/^::ffff:/, '');
}

export function isPrivateOrLocalIp(ip: string): boolean {
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
  if (cleanIp.startsWith('10.')) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(cleanIp)) return true;
  if (cleanIp.startsWith('192.168.')) return true;
  if (/^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./.test(cleanIp)) return true;
  return false;
}

export function isAuthRequiredForRequest(req: Request, getSecuritySettings: () => SecuritySettings): boolean {
  const securitySettings = getSecuritySettings();
  if (!securitySettings.requireAuth) {
    return false;
  }
  if (securitySettings.authScope === 'wan_only') {
    const clientIp = getClientIp(req);
    const isLan = isPrivateOrLocalIp(clientIp);
    if (isLan) {
      return false;
    }
  }
  return true;
}

const loginAttemptTracker = new Map<string, { count: number; lockedUntil: number }>();

export function checkLoginRateLimit(ip: string): { allowed: boolean; remainingLockSeconds?: number } {
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

export function recordLoginAttempt(ip: string, isSuccess: boolean) {
  if (isSuccess) {
    loginAttemptTracker.delete(ip);
    return;
  }
  const now = Date.now();
  const record = loginAttemptTracker.get(ip) || { count: 0, lockedUntil: 0 };
  record.count += 1;
  if (record.count >= 5) {
    record.lockedUntil = now + 5 * 60 * 1000;
  }
  loginAttemptTracker.set(ip, record);

  if (loginAttemptTracker.size > 200) {
    for (const [trackedIp, data] of loginAttemptTracker.entries()) {
      if (data.lockedUntil > 0 && data.lockedUntil < now) {
        loginAttemptTracker.delete(trackedIp);
      }
    }
  }
}

export function generateStreamToken(songId: string, jwtSecret: string, ttlSeconds: number = 86400): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const dataToSign = `${songId}:${exp}`;
  const hmac = crypto.createHmac('sha256', jwtSecret).update(dataToSign).digest('hex').slice(0, 16);
  return `${exp}.${hmac}`;
}

export function verifyStreamToken(songId: string, token: string, jwtSecret: string): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const exp = parseInt(parts[0], 10);
  if (isNaN(exp) || Math.floor(Date.now() / 1000) > exp) return false;
  const dataToSign = `${songId}:${exp}`;
  const expectedHmac = crypto.createHmac('sha256', jwtSecret).update(dataToSign).digest('hex').slice(0, 16);
  try {
    return crypto.timingSafeEqual(Buffer.from(parts[1]), Buffer.from(expectedHmac));
  } catch {
    return false;
  }
}

export function isSafeRemoteStreamUrl(urlString: string, navidromeServerUrl?: string): boolean {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname === '169.254.169.254' ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.local')
    ) {
      if (navidromeServerUrl) {
        try {
          const naviHost = new URL(navidromeServerUrl).hostname.toLowerCase();
          if (hostname === naviHost) return true;
        } catch {}
      }
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function createCsrfMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }

    const origin = (req.headers['origin'] || req.headers['referer'] || '') as string;
    if (!origin) {
      return next();
    }

    try {
      const originUrl = new URL(origin);
      const hostHeader = (req.headers['x-forwarded-host'] || req.headers['host'] || '') as string;
      const cleanHost = hostHeader.split(':')[0].toLowerCase();
      const originHost = originUrl.hostname.toLowerCase();

      if (originHost === cleanHost || originUrl.host.toLowerCase() === hostHeader.toLowerCase()) {
        return next();
      }

      if (originHost === 'localhost' || originHost === '127.0.0.1' || originHost === '::1') {
        return next();
      }

      if (
        /^192\.168\.\d{1,3}\.\d{1,3}$/.test(originHost) ||
        /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(originHost) ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(originHost) ||
        /^.*\.local$/.test(originHost)
      ) {
        return next();
      }

      if (
        originHost.endsWith('.run.app') ||
        originHost.endsWith('.google.com') ||
        originHost.endsWith('.aistudio.google.com')
      ) {
        return next();
      }

      console.warn(`🛡️ [CSRF Protection] Blocked cross-origin ${req.method} request to ${req.path} from untrusted origin: ${origin}`);
      return res.status(403).json({
        error: 'Cross-Site Request Blocked',
        message: '跨站请求伪造保护（CSRF Protection）已拦截来自非受信任外部网站的控制指令。'
      });
    } catch {
      return next();
    }
  };
}

export interface AuthMiddlewareOptions {
  getSecuritySettings: () => SecuritySettings;
  jwtSecret: string;
  apiKey?: string;
}

export function createAuthMiddleware(options: AuthMiddlewareOptions) {
  const { getSecuritySettings, jwtSecret, apiKey } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const original = (req.originalUrl || req.url).split('?')[0];
    const relative = (req.path || req.url).split('?')[0];
    const fullPath = original.startsWith('/api') ? original : `/api${original}`;

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

    if (
      fullPath.startsWith('/api/stream') ||
      fullPath.startsWith('/api/tts') ||
      (fullPath.startsWith('/api/songs/') && (fullPath.endsWith('/stream') || fullPath.endsWith('/cover')))
    ) {
      return next();
    }

    if (fullPath.startsWith('/rest/')) {
      return next();
    }

    const reqApiKey = req.headers['x-api-key'] || req.query.apiKey;
    if (apiKey && reqApiKey === apiKey) {
      (req as any).user = { id: 'api-key-user', username: 'api-key-client', role: 'admin' };
      return next();
    }

    const authHeader = req.headers['authorization'];
    let token: string | null = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else if (req.query.token) {
      token = String(req.query.token).trim();
    }

    const authRequired = isAuthRequiredForRequest(req, getSecuritySettings);

    if (token) {
      try {
        const decoded: any = jwt.verify(token, jwtSecret);
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

    if (authRequired) {
      return res.status(401).json({
        success: false,
        error: '系统已开启访问安全保护（全网或公网访问限制），请先登录账号方可操作',
        requireLogin: true
      });
    }

    return next();
  };
}
