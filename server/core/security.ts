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

/**
 * Normalize an IPv4 literal written in any common encoding
 * (dotted decimal, pure decimal, 0x-hex, bare 8-digit hex, octal parts)
 * into a standard dotted-decimal string, or null if not an IPv4 literal.
 */
function normalizeIpv4Literal(host: string): string | null {
  const h = host.replace(/^\[|\]$/g, '').trim();
  if (!h) return null;
  // Dotted form (possibly with hex/octal parts) — normalize each part
  if (h.includes('.')) {
    const parts = h.split('.');
    if (parts.length !== 4) return null;
    const nums: number[] = [];
    for (const part of parts) {
      let n: number;
      if (/^0x[0-9a-f]+$/i.test(part)) n = parseInt(part, 16);
      else if (/^0[0-7]+$/.test(part) && part.length > 1) n = parseInt(part, 8);
      else if (/^\d{1,10}$/.test(part)) n = parseInt(part, 10);
      else return null;
      if (isNaN(n) || n < 0 || n > 255) return null;
      nums.push(n);
    }
    return nums.join('.');
  }
  // Single-integer forms: decimal / 0x-hex / bare 8-digit hex
  if (/^\d{1,10}$/.test(h)) {
    const n = parseInt(h, 10);
    if (n > 0xffffffff) return null;
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  }
  if (/^0x[0-9a-f]{1,8}$/i.test(h) || /^[0-9a-f]{8}$/i.test(h)) {
    const n = parseInt(h.replace(/^0x/i, ''), 16);
    if (n > 0xffffffff) return null;
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  }
  return null;
}

function isBlockedIpV4(dotted: string): boolean {
  const parts = dotted.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p))) return false;
  const [a, b] = parts;
  // Loopback 127.0.0.0/8 (incl. 127.0.0.1 in every encoding)
  if (a === 127) return true;
  // Link-local 169.254.0.0/16 (incl. AWS/GCP/OpenStack metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // "This network" / unspecified 0.0.0.0/8
  if (a === 0) return true;
  // Alibaba Cloud metadata endpoint
  if (dotted === '100.100.100.200') return true;
  return false;
}

const BLOCKED_METADATA_HOSTNAMES = new Set([
  'metadata.google.internal',
  'metadata',
  'metadata.goog',
  'metadata.azure.internal'
]);

export function isSafeRemoteStreamUrl(urlString: string, _navidromeServerUrl?: string): boolean {
  try {
    if (!urlString || typeof urlString !== 'string') return false;
    const parsed = new URL(urlString.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase().replace(/\.+$/, '');
    const bareHost = hostname.replace(/^\[|\]$/g, '');

    // Block cloud metadata service hostnames (DNS forms)
    if (BLOCKED_METADATA_HOSTNAMES.has(hostname) || BLOCKED_METADATA_HOSTNAMES.has(bareHost)) {
      return false;
    }

    // Block localhost in every form (name, IPv4 loopback in every encoding, IPv6 loopback)
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) return false;
    if (bareHost === '::1' || bareHost === '::' || bareHost.startsWith('::ffff:127.')) return false;

    // Block IPv4 literals in any encoding that resolve to loopback / link-local / metadata ranges
    const normalizedV4 = normalizeIpv4Literal(hostname);
    if (normalizedV4 && isBlockedIpV4(normalizedV4)) return false;

    // IPv6 link-local (fe80::/10) — used by some metadata/link-local services
    if (/^fe[89ab][0-9a-f]?:/i.test(bareHost)) return false;

    // NOTE: RFC1918 private ranges (10.x / 172.16-31.x / 192.168.x) stay ALLOWED by design —
    // this is a self-hosted home music server whose Navidrome / NAS / radio sources commonly
    // live on the same LAN. Only loopback, link-local and cloud-metadata targets are blocked.
    return true;
  } catch {
    return false;
  }
}

/**
 * SSRF-safe fetch wrapper: follows redirects MANUALLY and re-validates every
 * redirect target with isSafeRemoteStreamUrl, so an allowed URL cannot bounce
 * to a blocked (metadata/loopback) target via 3xx.
 */
export async function ssrfSafeFetch(
  url: string,
  init: RequestInit & { maxRedirects?: number } = {}
): Promise<globalThis.Response> {
  const { maxRedirects = 3, ...fetchInit } = init;
  let currentUrl = String(url || '');
  let method = (fetchInit.method as string) || 'GET';

  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!isSafeRemoteStreamUrl(currentUrl)) {
      throw new Error(`Blocked unsafe remote stream URL (SSRF guard): ${currentUrl}`);
    }
    const res = await fetch(currentUrl, { ...fetchInit, method, redirect: 'manual' });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      if (!location) return res;
      // Discard redirect body to release the socket
      try { await res.arrayBuffer(); } catch {}
      currentUrl = new URL(location, currentUrl).toString();
      // 303 always converts to GET; 301/302 historically downgrade POST but keep HEAD/GET
      if (res.status === 303 && method !== 'HEAD') method = 'GET';
      continue;
    }
    return res;
  }
  throw new Error('Too many redirects while fetching remote stream (SSRF guard)');
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

    // 1. API key authentication
    const reqApiKey = req.headers['x-api-key'] || req.query.apiKey;
    if (apiKey && reqApiKey === apiKey) {
      (req as any).user = { id: 'api-key-user', username: 'api-key-client', role: 'admin' };
      return next();
    }

    // 2. Token resolution (always attach user if valid token exists)
    const authHeader = req.headers['authorization'];
    let token: string | null = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else if (req.query.token) {
      token = String(req.query.token).trim();
    }

    let tokenInvalid = false;
    if (token) {
      try {
        const decoded: any = jwt.verify(token, jwtSecret);
        (req as any).user = decoded;
      } catch (err: any) {
        tokenInvalid = true;
      }
    }

    // 3. Whitelisted public and self-verifying endpoints
    if (
      fullPath === '/api/auth/login' ||
      fullPath === '/api/auth/register' ||
      fullPath === '/api/auth/status' ||
      fullPath === '/api/auth/change-password' ||
      fullPath === '/api/auth/change-admin-password' ||
      ((fullPath === '/api/system/security' || relative === '/system/security') && req.method === 'GET') ||
      fullPath === '/api/health' ||
      fullPath === '/api/ping' ||
      relative === '/auth/login' ||
      relative === '/auth/register' ||
      relative === '/auth/status' ||
      relative === '/auth/change-password' ||
      relative === '/auth/change-admin-password' ||
      relative === '/health' ||
      relative === '/ping'
    ) {
      return next();
    }

    if (
      fullPath.startsWith('/api/stream') ||
      fullPath.startsWith('/api/tts') ||
      fullPath.startsWith('/api/skill')
    ) {
      // NOTE: These route families self-verify access inside their handlers
      // (stream HMAC token / JWT / isAuthRequiredForRequest) — they are NOT open endpoints.
      return next();
    }

    if (fullPath.startsWith('/rest/')) {
      return next();
    }

    const authRequired = isAuthRequiredForRequest(req, getSecuritySettings);

    if (token && (req as any).user) {
      return next();
    }

    if (tokenInvalid && authRequired) {
      return res.status(401).json({
        success: false,
        error: '身份验证令牌无效或已过期，请重新登录账号',
        requireLogin: true
      });
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
