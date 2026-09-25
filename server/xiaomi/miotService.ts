import os from 'os';
import net from 'net';
import dgram from 'dgram';
import crypto from 'crypto';
import { dlnaEngine } from '../dlnaEngine.js';
import { xiaomiPassport } from '../xiaomiPassport.js';
import { deviceRepository, XiaomiDeviceEntity } from '../core/repositories/deviceRepository.js';
import { musicRepository } from '../core/repositories/musicRepository.js';
import { xiaoaiResolverEngine } from '../xiaoaiResolver.js';
import { ttsEngine } from '../ttsEngine.js';
import { xiaomiAdapter } from './xiaomiAdapter.js';
import { adaptiveHeartbeatEngine } from './adaptiveHeartbeatEngine.js';
import { transcodeSemaphorePool } from '../streaming/transcodeSemaphore.js';
import { queueEngine } from '../core/queueEngine.js';

export interface MiotCastLog {
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
}

export const castLogs: MiotCastLog[] = [
  {
    id: 'log-1',
    timestamp: new Date(Date.now() - 3600000).toLocaleTimeString(),
    type: 'sync',
    message: 'TingLan MIoT 协议引擎已初始化',
    detail: `发现 ${deviceRepository.getAllDevices().length} 台小米智能音箱设备`,
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

export function addCastLog(log: MiotCastLog) {
  castLogs.unshift(log);
  if (castLogs.length > 50) castLogs.pop();
}

export function getCastLogs(): MiotCastLog[] {
  return castLogs;
}

export function sanitizeDevice(dev: any, isTranscoding = false) {
  if (!dev) return dev;
  const token = dev.token;
  const hasToken = Boolean(token && String(token).trim().length > 0);
  const isOnline = Boolean(dev.online ?? dev.isOnline ?? false);
  const tokenMasked = token ? (String(token).length > 8 ? `${String(token).slice(0, 4)}••••••••${String(token).slice(-4)}` : '••••••••') : '';

  let deviceState: 'online' | 'offline' | 'unknown' | 'connecting' | 'playing' | 'paused' | 'buffering' | 'transcoding' | 'error' = 'offline';
  const transcodingActive = isTranscoding || (transcodeSemaphorePool.getStats().activeCount > 0 && queueEngine.getStatus().targetDid === dev.did);
  if (!isOnline) {
    deviceState = 'offline';
  } else if (dev.status?.error) {
    deviceState = 'error';
  } else if (transcodingActive) {
    deviceState = 'transcoding';
  } else if (dev.status?.buffering || dev.status?.connecting) {
    deviceState = dev.status?.buffering ? 'buffering' : 'connecting';
  } else if (dev.status?.playing) {
    deviceState = 'playing';
  } else if (dev.status?.paused) {
    deviceState = 'paused';
  } else {
    deviceState = 'online';
  }

  const isGenuineUuid = (id?: string) => {
    if (!id) return false;
    const s = String(id).trim();
    if (s.startsWith('did-') || s.startsWith('manual_')) return false;
    if (/^\d{6,16}$/.test(s)) return false;
    return true;
  };

  const rawDevId = dev.deviceID || dev.uuid || dev.hardwareDeviceId;
  const genuineDeviceID = isGenuineUuid(rawDevId) ? String(rawDevId) : undefined;
  const genuineHwId = isGenuineUuid(dev.hardwareDeviceId) ? String(dev.hardwareDeviceId) : genuineDeviceID;

  return {
    did: String(dev.did),
    deviceID: genuineDeviceID,
    uuid: genuineDeviceID,
    hardwareDeviceId: genuineHwId,
    cloudDid: (dev.cloudDid && String(dev.cloudDid) !== genuineDeviceID) ? String(dev.cloudDid) : undefined,
    homeId: dev.homeId || dev.home_id || undefined,
    roomId: dev.roomId || dev.room_id || undefined,
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
    },
    raw: dev.raw || undefined
  };
}

export function sanitizeMiotConfig(config: any) {
  if (!config) return config;
  const {
    serviceToken,
    ssecurity,
    password,
    micoServiceToken,
    miotServiceToken,
    xiaomiioServiceToken,
    passToken,
    psecurity_ph,
    securityToken,
    ...safeConfig
  } = config;
  const hasToken = Boolean(serviceToken && String(serviceToken).trim().length > 0);
  return {
    ...safeConfig,
    hasServiceToken: hasToken,
    hasMicoServiceToken: Boolean(micoServiceToken),
    hasMiotServiceToken: Boolean(miotServiceToken),
    hasXiaomiioServiceToken: Boolean(xiaomiioServiceToken),
    hasPassToken: Boolean(passToken),
    serviceToken: hasToken ? `${String(serviceToken).slice(0, 4)}••••••••` : '',
    miUserMasked: config.miUser ? (config.miUser.length > 4 ? `${config.miUser.slice(0, 2)}***${config.miUser.slice(-2)}` : '***') : ''
  };
}

export function parseServiceTokenAndUserId(inputUid: string, inputToken: string, inputPassToken?: string): { userId: string; serviceToken: string; passToken: string; cUserId?: string } {
  let userId = String(inputUid || '').trim();
  let serviceToken = String(inputToken || '').trim();
  let passToken = String(inputPassToken || '').trim();
  let cUserId = '';

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

  const cUidMatch = combined.match(/\bcUserId\s*[:=]\s*["']?([^;\s,"'}{]+)/i);
  if (cUidMatch) {
    cUserId = cUidMatch[1].replace(/^["']|["']$/g, '').trim();
  }

  const numericUidMatch = combined.match(/\b(?:userId|uid)\s*[:=]\s*["']?(\d{5,15})["']?/i);
  if (numericUidMatch) {
    userId = numericUidMatch[1];
  } else {
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

export async function validateMicoServiceToken(userId: string, serviceToken: string): Promise<{ valid: boolean; status?: number; error?: string }> {
  if (!userId || !serviceToken) return { valid: false, error: '缺少 userId 或 serviceToken' };
  try {
    const testUrl = 'https://api2.mina.mi.com/admin/v2/device_list?master=1';
    const cookieHeader = `userId=${userId}; serviceToken=${serviceToken}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(testUrl, {
      headers: {
        'Cookie': cookieHeader,
        'User-Agent': 'MISoundBox/1.4.0 (Linux; U; Android 11; zh_CN; Build/RP1A.200720.011)'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (resp.status === 401 || resp.status === 403) {
      return { valid: false, status: resp.status, error: `小米云端鉴权失败 (HTTP ${resp.status})，Token 无效或已过期` };
    }
    return { valid: true, status: resp.status };
  } catch (err: any) {
    return { valid: false, error: err.message || '网络请求超时' };
  }
}

export async function queryXiaomiMinaDevices(userId: string, serviceToken: string): Promise<any[]> {
  try {
    const url = 'https://api2.mina.mi.com/admin/v2/device_list?master=1';
    const cookieHeader = `userId=${userId}; serviceToken=${serviceToken}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(url, {
      headers: {
        'Cookie': cookieHeader,
        'User-Agent': 'MISoundBox/1.4.0 (Linux; U; Android 11; zh_CN; Build/RP1A.200720.011)'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!resp.ok) return [];
    const json = await resp.json();
    return json.data || [];
  } catch {
    return [];
  }
}

export async function authenticateXiaomiPassport(user: string, pass: string): Promise<{
  success: boolean;
  userId?: string;
  serviceToken?: string;
  micoServiceToken?: string;
  xiaomiioServiceToken?: string;
  passToken?: string;
  ssecurity?: string;
  devices?: any[];
  error?: string;
}> {
  return xiaomiPassport.loginWithPassword(user, pass);
}

let isRefreshingTokens = false;
let lastTokenRefreshTimestamp = 0;
let refreshTokensPromiseInstance: Promise<{ success: boolean; serviceToken?: string; error?: string }> | null = null;

export async function refreshXiaomiTokens(
  miotConfig: any,
  saveMiotConfigFn: (cfg: any) => void,
  reason: string = 'token_expired',
  force: boolean = false
): Promise<{ success: boolean; serviceToken?: string; error?: string }> {
  const now = Date.now();
  if (!force && now - lastTokenRefreshTimestamp < 10 * 60 * 1000) {
    return {
      success: true,
      serviceToken: miotConfig.micoServiceToken || miotConfig.serviceToken,
      error: 'Token refresh skipped (within 10-minute cooldown window)'
    };
  }

  if (isRefreshingTokens && refreshTokensPromiseInstance) {
    return refreshTokensPromiseInstance;
  }

  const cleanUid = String(miotConfig.userId || '').trim();
  const passToken = String(miotConfig.passToken || '').trim();
  if (!cleanUid || !passToken) {
    return { success: false, error: 'No passToken available for silent refresh' };
  }

  isRefreshingTokens = true;
  refreshTokensPromiseInstance = (async () => {
    try {
      console.log(`🔑 [Token Refresh] 正在执行小米凭证无感静默续期 (原因: ${reason}, 用户: ${cleanUid})...`);
      const [micoRes, ioRes] = await Promise.allSettled([
        xiaomiPassport.fetchAdditionalStsToken(cleanUid, passToken, 'micoapi'),
        xiaomiPassport.fetchAdditionalStsToken(cleanUid, passToken, 'xiaomiio')
      ]);

      let updated = false;
      let newMicoToken = '';

      if (micoRes.status === 'fulfilled' && micoRes.value.serviceToken) {
        newMicoToken = micoRes.value.serviceToken;
        miotConfig.serviceToken = newMicoToken;
        miotConfig.micoServiceToken = newMicoToken;
        if (micoRes.value.ssecurity) miotConfig.ssecurity = micoRes.value.ssecurity;
        updated = true;
        console.log(`🔑 [Token Refresh] ✅ micoapi 域 serviceToken 续期成功: ${newMicoToken.slice(0, 6)}••••`);
      }

      if (ioRes.status === 'fulfilled' && ioRes.value.serviceToken) {
        const newIoToken = ioRes.value.serviceToken;
        miotConfig.xiaomiioToken = newIoToken;
        miotConfig.xiaomiioServiceToken = newIoToken;
        miotConfig.miotServiceToken = newIoToken;
        if (ioRes.value.ssecurity) miotConfig.xiaomiioSsecurity = ioRes.value.ssecurity;
        updated = true;
        console.log(`🔑 [Token Refresh] ✅ xiaomiio 域 serviceToken 续期成功: ${newIoToken.slice(0, 6)}••••`);
      }

      if (updated) {
        lastTokenRefreshTimestamp = Date.now();
        saveMiotConfigFn(miotConfig);
        return { success: true, serviceToken: newMicoToken || miotConfig.serviceToken };
      }

      return { success: false, error: 'Both token refresh requests failed' };
    } catch (err: any) {
      console.warn('🔑 [Token Refresh] 异常:', err?.message || err);
      return { success: false, error: err?.message || 'Token refresh failed' };
    } finally {
      isRefreshingTokens = false;
      refreshTokensPromiseInstance = null;
    }
  })();

  return refreshTokensPromiseInstance;
}

const minaUbusQueues = new Map<string, Promise<void>>();

export async function callMinaCloudApi(
  pathName: string,
  methodName: string,
  messageObj: any,
  targetDid?: string,
  retryCount: number = 0,
  miotConfig?: any,
  saveMiotConfigFn?: (cfg: any) => void
): Promise<{ success: boolean; data?: any; error?: string; raw?: string; statusCode?: number }> {
  const queueKey = targetDid || 'default';
  const prev = minaUbusQueues.get(queueKey) || Promise.resolve();
  let resolveNext: () => void;
  const next = new Promise<void>(r => { resolveNext = r; });
  minaUbusQueues.set(queueKey, next);

  try {
    await prev;
    return await doCallMinaCloudApi(pathName, methodName, messageObj, targetDid, retryCount, miotConfig, saveMiotConfigFn);
  } finally {
    resolveNext!();
    if (minaUbusQueues.get(queueKey) === next) {
      minaUbusQueues.delete(queueKey);
    }
  }
}

async function doCallMinaCloudApi(
  pathName: string,
  methodName: string,
  messageObj: any,
  targetDid?: string,
  retryCount: number = 0,
  miotConfig?: any,
  saveMiotConfigFn?: (cfg: any) => void
): Promise<{ success: boolean; data?: any; error?: string; raw?: string; statusCode?: number }> {
  if (!miotConfig) return { success: false, error: '未配置小米凭证' };

  const rawToken = miotConfig.micoServiceToken || miotConfig.serviceToken || '';
  const rawUid = miotConfig.userId || '';

  const activeMicoToken = String(rawToken).replace(/[^\x20-\x7E]/g, '').trim();
  const cleanUid = String(rawUid).replace(/[^\x20-\x7E]/g, '').trim();

  if ((!activeMicoToken || !cleanUid) && miotConfig.passToken && retryCount === 0 && saveMiotConfigFn) {
    try {
      const refreshed = await xiaomiPassport.fetchAdditionalStsToken(cleanUid || '0', miotConfig.passToken, 'micoapi');
      if (refreshed.serviceToken) {
        miotConfig.micoServiceToken = refreshed.serviceToken;
        miotConfig.isMicoValid = true;
        miotConfig.serviceToken = refreshed.serviceToken;
        if (refreshed.ssecurity) miotConfig.ssecurity = refreshed.ssecurity;
        if (refreshed.userId) {
          miotConfig.userId = refreshed.userId;
          miotConfig.miUser = `uid_${refreshed.userId}`;
        }
        miotConfig.isLoggedIn = true;
        saveMiotConfigFn(miotConfig);
        return doCallMinaCloudApi(pathName, methodName, messageObj, targetDid, retryCount + 1, miotConfig, saveMiotConfigFn);
      }
    } catch (err: any) {
      console.warn('[Mina] Pre-flight STS refresh failed:', err.message);
    }
  }

  if (!activeMicoToken || !cleanUid) {
    return { success: false, error: '缺少有效的 micoapi serviceToken 或 userId' };
  }

  let finalDeviceId = targetDid;
  if (!finalDeviceId || finalDeviceId.startsWith('did-') || finalDeviceId.startsWith('manual_')) {
    const devices = deviceRepository.getAllDevices();
    const resolvedDev = devices.find((d: any) => d.did === targetDid || (d as any).deviceID === targetDid);
    if (resolvedDev) {
      finalDeviceId = (resolvedDev as any).deviceID || (resolvedDev as any).uuid || (resolvedDev as any).cloudDid || resolvedDev.did;
    }
  }

  const endpoint = 'https://api2.mina.mi.com/remote/ubus';
  const requestId = `req_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const messageStr = typeof messageObj === 'string' ? messageObj : JSON.stringify(messageObj);

  const formBody = new URLSearchParams({
    deviceId: finalDeviceId || '',
    message: messageStr,
    method: methodName,
    path: pathName,
    requestId
  }).toString();

  const cookieHeader = `userId=${cleanUid}; serviceToken=${activeMicoToken}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookieHeader,
        'User-Agent': 'MISoundBox/1.4.0 (Linux; U; Android 11; zh_CN; Build/RP1A.200720.011)'
      },
      body: formBody,
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (resp.status === 401 && retryCount < 1 && miotConfig.passToken && saveMiotConfigFn) {
      const refreshed = await refreshXiaomiTokens(miotConfig, saveMiotConfigFn, 'mina_rest_401');
      if (refreshed.success) {
        return doCallMinaCloudApi(pathName, methodName, messageObj, targetDid, retryCount + 1, miotConfig, saveMiotConfigFn);
      }
    }

    const text = await resp.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {}

    if (!resp.ok) {
      return { success: false, statusCode: resp.status, error: `Mina HTTP ${resp.status}`, raw: text };
    }

    if (json && json.code === 0) {
      return { success: true, data: json.data || json, raw: text };
    }

    return { success: false, statusCode: resp.status, error: json?.message || `Mina Code: ${json?.code}`, raw: text };
  } catch (err: any) {
    return { success: false, error: err.message || 'Mina UBUS 请求网络异常' };
  }
}

export function getLocalNetworkIps(): string[] {
  const interfaces = os.networkInterfaces();
  const candidates: Array<{ name: string; ip: string; isPhysical: boolean; isPrivateSubnet: boolean; priority: number }> = [];

  const virtualNicRegex = /^(docker|br-|veth|virbr|cni|tailscale|wg|tun|tap|utun|dummy|vboxnet)/i;
  const dockerSubnetRegex = /^172\.(1[6-9]|2[0-9]|3[0-1])\./;

  for (const name of Object.keys(interfaces)) {
    const isVirtualName = virtualNicRegex.test(name);
    for (const net of interfaces[name] || []) {
      if (
        net.family === 'IPv4' &&
        !net.internal &&
        !net.address.startsWith('127.') &&
        !net.address.startsWith('169.254.')
      ) {
        const isDockerSubnet = dockerSubnetRegex.test(net.address);
        const isPhysical = /^(eth|en|wlan|wlp|eno|enp|lan)/i.test(name) && !isVirtualName;
        const isPrivateSubnet = /^192\.168\./.test(net.address) || /^10\./.test(net.address);

        let priority = 0;
        if (isPhysical) priority += 100;
        if (isPrivateSubnet) priority += 50;
        if (isVirtualName) priority -= 100;
        if (isDockerSubnet) priority -= 80;

        candidates.push({ name, ip: net.address, isPhysical, isPrivateSubnet, priority });
      }
    }
  }

  candidates.sort((a, b) => b.priority - a.priority);
  return candidates.map(c => c.ip);
}

export function getBestLanIpForTarget(targetSpeakerIp?: string, serverHost?: string): string {
  const allIps = getLocalNetworkIps();
  if (allIps.length === 0) return '127.0.0.1';

  const envHost = process.env.SERVER_HOST || process.env.HOST_LAN_IP;
  if (envHost) {
    const match = envHost.match(/https?:\/\/([^:/]+)/);
    if (match && match[1] && !match[1].startsWith('127.') && match[1] !== 'localhost') {
      return match[1];
    }
    if (/^\d+\.\d+\.\d+\.\d+$/.test(envHost)) {
      return envHost;
    }
  }

  if (serverHost && serverHost.startsWith('http')) {
    const hostMatch = serverHost.match(/https?:\/\/([^:/]+)/);
    if (hostMatch && hostMatch[1] && !hostMatch[1].startsWith('127.') && hostMatch[1] !== 'localhost') {
      const configuredHost = hostMatch[1];
      if (allIps.includes(configuredHost)) {
        return configuredHost;
      }
    }
  }

  if (targetSpeakerIp) {
    const cleanSpeakerIp = targetSpeakerIp.replace(/^::ffff:/, '').trim();
    const speakerParts = cleanSpeakerIp.split('.');
    if (speakerParts.length === 4) {
      const match24 = allIps.find(ip => {
        const parts = ip.split('.');
        return parts.length === 4 && parts[0] === speakerParts[0] && parts[1] === speakerParts[1] && parts[2] === speakerParts[2];
      });
      if (match24) return match24;

      const match16 = allIps.find(ip => {
        const parts = ip.split('.');
        return parts.length === 4 && parts[0] === speakerParts[0] && parts[1] === speakerParts[1];
      });
      if (match16) return match16;
    }
  }

  const primaryPhysical = allIps.find(ip => ip.startsWith('192.168.') || ip.startsWith('10.'));
  return primaryPhysical || allIps[0];
}

export function sendMiioHello(ip: string, timeoutMs = 1800): Promise<{ reachable: boolean; did?: string; stamp?: number; latency: number }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const client = dgram.createSocket('udp4');
    let isResolved = false;
    let burstTimer1: NodeJS.Timeout | null = null;
    let burstTimer2: NodeJS.Timeout | null = null;

    const cleanup = () => {
      if (burstTimer1) clearTimeout(burstTimer1);
      if (burstTimer2) clearTimeout(burstTimer2);
      try { client.close(); } catch {}
    };

    const timer = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        cleanup();
        resolve({ reachable: false, latency: timeoutMs });
      }
    }, timeoutMs);

    client.on('message', (msg) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timer);
        cleanup();
        const latency = Date.now() - start;
        try {
          let didStr = '';
          let stamp = 0;
          if (msg.length >= 32 && msg[0] === 0x21 && msg[1] === 0x31) {
            const didNum = msg.readUInt32BE(8);
            stamp = msg.readUInt32BE(12);
            didStr = String(didNum);
          }
          resolve({ reachable: true, did: didStr, stamp, latency });
        } catch {
          resolve({ reachable: true, latency });
        }
      }
    });

    client.on('error', () => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timer);
        cleanup();
        resolve({ reachable: false, latency: Date.now() - start });
      }
    });

    const helloPacket = Buffer.from('21310020ffffffffffffffffffffffffffffffffffffffffffffffffffffffff', 'hex');
    const sendBurst = () => {
      if (isResolved) return;
      try {
        client.send(helloPacket, 0, helloPacket.length, 54321, ip, () => {});
      } catch {}
    };

    sendBurst();
    burstTimer1 = setTimeout(sendBurst, 250);
    burstTimer2 = setTimeout(sendBurst, 600);
  });
}

export async function sendMiioCommand(
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
    const hello = await sendMiioHello(ip, 1200);
    if (!hello.reachable) {
      return { success: false, error: `局域网设备 ${ip}:54321 握手超时未响应（设备离线或网络不可达）` };
    }
    const didNum = hello.did ? Number(hello.did) || 0 : 0;
    const stamp = (hello.stamp || 0) + 1;

    const tokenBuf = Buffer.from(cleanToken, 'hex');
    const key = crypto.createHash('md5').update(tokenBuf).digest();
    const iv = crypto.createHash('md5').update(Buffer.concat([key, tokenBuf])).digest();

    const msgObj = {
      id: Math.floor(Math.random() * 100000) + 1,
      method,
      params
    };
    const msgStr = JSON.stringify(msgObj);
    const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
    const encrypted = Buffer.concat([cipher.update(msgStr, 'utf8'), cipher.final()]);

    const header = Buffer.alloc(32);
    header.writeUInt16BE(0x2131, 0);
    header.writeUInt16BE(32 + encrypted.length, 2);
    header.writeUInt32BE(0, 4);
    header.writeUInt32BE(didNum, 8);
    header.writeUInt32BE(stamp, 12);

    const checksum = crypto.createHash('md5').update(
      Buffer.concat([header.subarray(0, 16), tokenBuf, encrypted])
    ).digest();
    checksum.copy(header, 16);

    const fullPacket = Buffer.concat([header, encrypted]);

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
          } catch {
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

export function testTcpConnection(host: string, port = 80, timeoutMs = 1500): Promise<{ reachable: boolean; latency: number }> {
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

export async function testMiioConnection(ip: string, timeoutMs = 1500): Promise<{ reachable: boolean; isMiio: boolean; isDlna?: boolean; did?: string; latency: number; message: string }> {
  if (!ip) return { reachable: false, isMiio: false, latency: 0, message: '无效 IP 地址' };

  const miioRes = await sendMiioHello(ip, timeoutMs);
  if (miioRes.reachable) {
    return {
      reachable: true,
      isMiio: true,
      isDlna: false,
      did: miioRes.did,
      latency: miioRes.latency,
      message: `✓ miIO 握手成功 (UDP 54321, 设备DID: ${miioRes.did || '已响应'}, 延迟: ${miioRes.latency}ms)`
    };
  }

  try {
    const dlnaRes = await dlnaEngine.testConnection(ip);
    if (dlnaRes.reachable) {
      return {
        reachable: true,
        isMiio: false,
        isDlna: true,
        did: dlnaRes.friendlyName,
        latency: dlnaRes.latency,
        message: dlnaRes.message
      };
    }
  } catch {}

  const tcpRes = await testTcpConnection(ip, 1420, 1000);
  if (tcpRes.reachable) {
    return {
      reachable: true,
      isMiio: false,
      isDlna: true,
      latency: tcpRes.latency,
      message: `✓ 局域网小爱 DLNA 端口 1420 连通 (延迟: ${tcpRes.latency}ms)`
    };
  }

  const tcp80 = await testTcpConnection(ip, 80, 800);
  if (tcp80.reachable) {
    return {
      reachable: true,
      isMiio: false,
      latency: tcp80.latency,
      message: `✓ 局域网 TCP 端口连通 (延迟: ${tcp80.latency}ms)`
    };
  }

  return {
    reachable: false,
    isMiio: false,
    latency: miioRes.latency,
    message: `未能连接到 ${ip} (UDP 54321 / DLNA 端口 1420/49152 无响应，请检查音箱是否开机且与本机处于同网段)`
  };
}

export function ensureValidActiveDeviceId(miotConfig: any, saveConfigFn: (cfg: any) => void) {
  const devices = deviceRepository.getAllDevices();
  if (!devices || devices.length === 0) return;
  const current = miotConfig.activeDeviceId ? String(miotConfig.activeDeviceId).trim() : '';

  if (current) {
    const matched = devices.find((d: any) =>
      String(d.did).trim() === current ||
      (d.deviceID && String(d.deviceID).trim() === current) ||
      (d.cloudDid && String(d.cloudDid).trim() === current) ||
      ((d as any).hardwareDeviceId && String((d as any).hardwareDeviceId).trim() === current)
    );

    if (matched) {
      if (matched.did !== current && !matched.did.startsWith('did-') && !matched.did.startsWith('detected_')) {
        miotConfig.activeDeviceId = matched.did;
        saveConfigFn(miotConfig);
      }
      return;
    }

    const matchedByProp = devices.find((d: any) =>
      (d.did && current.includes(d.did)) ||
      (d.deviceID && current.includes(d.deviceID)) ||
      (d.cloudDid && current.includes(d.cloudDid))
    );
    if (matchedByProp) {
      miotConfig.activeDeviceId = matchedByProp.did;
      saveConfigFn(miotConfig);
      return;
    }
  }

  const preferredDev = devices.find((d: any) => !d.did.startsWith('did-') && !d.did.startsWith('detected_')) || devices[0];
  if (preferredDev && (!miotConfig.activeDeviceId || !devices.some((d: any) => d.did === miotConfig.activeDeviceId))) {
    miotConfig.activeDeviceId = preferredDev.did;
    saveConfigFn(miotConfig);
  }
}

export interface DispatchCastOptions {
  song: any;
  targetDid: string;
  seekSeconds?: number;
  miotConfig: any;
  saveMiotConfigFn: (cfg: any) => void;
  serverPort: number;
  jwtSecret: string;
  activeStreamIps: any;
  waitForStreamConsumption?: (timeoutMs?: number) => Promise<boolean>;
}

export async function dispatchCastSongDirectly(options: DispatchCastOptions): Promise<{ success: boolean; message?: string; error?: string }> {
  const { song, targetDid, seekSeconds, miotConfig, saveMiotConfigFn, serverPort, jwtSecret, activeStreamIps, waitForStreamConsumption } = options;
  let devices = deviceRepository.getAllDevices();

  if (devices.length === 0 && miotConfig.passToken) {
    try {
      const resolveRes = await xiaoaiResolverEngine.resolveDevices({
        userId: miotConfig.userId,
        serviceToken: miotConfig.micoServiceToken || miotConfig.serviceToken,
        xiaomiioServiceToken: miotConfig.xiaomiioServiceToken || miotConfig.serviceToken,
        ssecurity: miotConfig.ssecurity,
        existingDevices: devices,
        activeStreamIps: Array.from(activeStreamIps)
      });
      if (resolveRes.xiaoAiDevices && resolveRes.xiaoAiDevices.length > 0) {
        deviceRepository.setDevices(resolveRes.xiaoAiDevices);
        devices = deviceRepository.getAllDevices();
        if (!miotConfig.activeDeviceId) {
          miotConfig.activeDeviceId = devices[0].did;
          saveMiotConfigFn(miotConfig);
        }
      }
    } catch {}
  }

  const targetDevice = devices.find((d: any) => d.did === targetDid || (d as any).deviceID === targetDid) || devices[0];
  if (!targetDevice) {
    return { success: false, error: '未找到可用的小米音箱设备' };
  }

  const primaryLanIp = getBestLanIpForTarget(targetDevice.ip, miotConfig.serverHost);

  let baseHost = (miotConfig.serverHost && miotConfig.serverHost.startsWith('http'))
    ? miotConfig.serverHost.replace(/\/$/, '')
    : (primaryLanIp ? `http://${primaryLanIp}:${serverPort}` : `http://localhost:${serverPort}`);

  const isLoopback = baseHost.includes('localhost') || baseHost.includes('127.0.0.1');
  if (isLoopback && primaryLanIp) {
    baseHost = `http://${primaryLanIp}:${serverPort}`;
  }
  if (targetDevice.ip && baseHost.includes(targetDevice.ip) && primaryLanIp && primaryLanIp !== targetDevice.ip) {
    baseHost = `http://${primaryLanIp}:${serverPort}`;
  }

  const rawId = (song.id || 'song-1').toString();
  const cleanSongId = rawId.replace(/\.(mp3|wav|flac|m4a|aac|ogg|opus|ape)$/i, '');

  const exp = Math.floor(Date.now() / 1000) + 86400;
  const dataToSign = `${cleanSongId}:${exp}`;
  const hmac = crypto.createHmac('sha256', jwtSecret).update(dataToSign).digest('hex').slice(0, 16);
  const streamToken = `${exp}.${hmac}`;

  const seekParam = (typeof seekSeconds === 'number' && seekSeconds > 0) ? `&t=${Math.floor(seekSeconds)}` : '';
  const resolvedStreamUrl = `${baseHost}/api/stream/${encodeURIComponent(cleanSongId)}.mp3?token=${streamToken}${seekParam}`;

  const selectedCastMode = (miotConfig.castMode || 'auto') as any;

  if (miotConfig.ttsAnnouncement && (!seekSeconds || seekSeconds <= 0)) {
    try {
      await ttsEngine.dispatchToSpeaker({
        targetDevice,
        text: `${miotConfig.ttsPrefix || '正在为您播放'} ${song.title || '歌曲'}`,
        mode: 'auto',
        forSongCast: true,
        serverHost: baseHost,
        miotConfig,
        sendMiioCommandFn: (ip, token, method, params, timeoutMs) => sendMiioCommand(ip, token, method, params, timeoutMs || 2500),
        callMinaCloudApiFn: (path, method, msg, tDid, retry) => callMinaCloudApi(path, method, msg, tDid, retry, miotConfig, saveMiotConfigFn)
      });
      await new Promise(r => setTimeout(r, 1200));
    } catch {}
  }

  const castResult = await xiaomiAdapter.playUrl(
    targetDevice,
    resolvedStreamUrl,
    song.title || '音乐',
    (path, method, msg, tDid, retry) => callMinaCloudApi(path, method, msg, tDid, retry, miotConfig, saveMiotConfigFn),
    (ip, token, method, params, timeoutMs) => sendMiioCommand(ip, token, method, params, timeoutMs || 2500),
    miotConfig,
    {
      songArtist: song.artist,
      duration: song.duration,
      castMode: selectedCastMode,
      waitForStreamConsumption: waitForStreamConsumption as any
    }
  );

  if (castResult.success) {
    const updatedStatus = {
      ...(targetDevice as any).status,
      playing: true,
      currentSongId: cleanSongId,
      currentTitle: song.title || '未知曲目',
      currentArtist: song.artist || '未知歌手',
      currentDuration: song.duration || 200,
      currentPosition: seekSeconds || 0,
      streamUrl: resolvedStreamUrl,
      updatedAt: new Date().toISOString()
    };
    deviceRepository.addOrUpdateDevice({
      ...targetDevice,
      status: updatedStatus
    } as any);
    adaptiveHeartbeatEngine.notifyDeviceActivity(targetDevice.did);

    addCastLog({
      id: `log-q-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      type: 'cast',
      message: seekSeconds
        ? `【跨音箱无缝流转】《${song.title}》接续至【${targetDevice.name}】(${seekSeconds}s)`
        : `【歌单队列自动切播】《${song.title}》->【${targetDevice.name}】`,
      detail: `歌手: ${song.artist} | 协议: ${castResult.protocol} | 串流源: ${resolvedStreamUrl}`,
      success: true,
      did: targetDevice.did,
      ip: targetDevice.ip,
      model: targetDevice.model,
      protocol: castResult.protocol || 'MIoT / DLNA',
      streamUrl: resolvedStreamUrl
    });

    return { success: true, message: `已成功切播《${song.title}》` };
  } else {
    addCastLog({
      id: `log-q-err-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      type: 'error',
      message: `【歌单队列切播失败】《${song.title}》`,
      detail: castResult.message || (castResult as any).error || '音箱未响应',
      success: false,
      did: targetDevice.did,
      ip: targetDevice.ip,
      model: targetDevice.model
    });

    return { success: false, error: castResult.message || (castResult as any).error || '切播失败' };
  }
}
