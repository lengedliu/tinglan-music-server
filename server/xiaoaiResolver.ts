import dgram from 'dgram';
import os from 'os';
import crypto from 'crypto';
import { miotRpcEngine } from './miotRpc';

export interface DeviceCapabilities {
  hasPlayControl: boolean;     // 支持 play-control 服务 / play-url 动作
  hasTts: boolean;             // 支持 intelligent-speaker 智能语音 / text-to-speech
  hasVolumeControl: boolean;   // 支持 speaker 音量/静音调节
  hasClock?: boolean;          // 支持时钟屏 / 闹钟
  supportsDlna?: boolean;      // 支持 DLNA / UPnP 串流
  supportsLocalMiio?: boolean; // 支持局域网 UDP 54321 miIO
}

export type DevicePlatform = 'mina' | 'miio' | 'miot';
export type DeviceSource = 'cloud' | 'lan' | 'hybrid';

export interface XiaoAiDevice {
  did: string;
  deviceID?: string;
  hardwareDeviceId?: string;
  cloudDid?: string;
  model: string;
  name: string;
  ip?: string;
  mac?: string;
  token?: string;
  platform: DevicePlatform;
  source: DeviceSource;
  capabilities: DeviceCapabilities;
  online: boolean;

  // Extended UI compatibility fields
  isOnline?: boolean;
  hardware?: string;
  tokenMasked?: string;
  hasToken?: boolean;
  status?: {
    playing: boolean;
    volume: number;
    currentTitle?: string;
    currentArtist?: string;
    currentDuration?: number;
    currentPosition?: number;
    streamUrl?: string;
    muted?: boolean;
    lastTts?: string;
    updatedAt?: string;
  };
}

export interface IgnoredDevice {
  did: string;
  name: string;
  model: string;
  reason: string;
  source: DeviceSource;
  ip?: string;
  mac?: string;
}

export interface LanDiscoveredItem {
  did: string;
  ip: string;
  online: boolean;
  latency?: number;
}

export interface CloudDiscoveredItem {
  did: string;
  deviceID?: string;
  hardwareDeviceId?: string;
  cloudDid?: string;
  model: string;
  name: string;
  ip?: string;
  mac?: string;
  token?: string;
  online: boolean;
  hardware?: string;
  raw?: any;
}

/**
 * Helper to safely extract device list array from various Xiaomi Mina & MIoT response structures
 */
export function extractDevicesFromMinaResponse(minaData: any): any[] {
  if (!minaData) return [];
  let rawList: any[] = [];

  if (Array.isArray(minaData)) {
    rawList = minaData;
  } else if (typeof minaData === 'string') {
    try {
      const parsed = JSON.parse(minaData);
      return extractDevicesFromMinaResponse(parsed);
    } catch {}
  } else if (Array.isArray(minaData?.data)) {
    rawList = minaData.data;
  } else if (typeof minaData?.data === 'string') {
    try {
      const parsed = JSON.parse(minaData.data);
      return extractDevicesFromMinaResponse(parsed);
    } catch {}
  } else if (minaData?.data && typeof minaData.data === 'object') {
    const d = minaData.data;
    if (Array.isArray(d.devices)) rawList = d.devices;
    else if (Array.isArray(d.list)) rawList = d.list;
    else if (Array.isArray(d.device_list)) rawList = d.device_list;
    else if (Array.isArray(d.records)) rawList = d.records;
    else return extractDevicesFromMinaResponse(d);
  } else if (minaData?.result && typeof minaData.result === 'object') {
    const r = minaData.result;
    if (Array.isArray(r)) rawList = r;
    else if (Array.isArray(r.list)) rawList = r.list;
    else if (Array.isArray(r.devices)) rawList = r.devices;
    else if (Array.isArray(r.device_list)) rawList = r.device_list;
    else return extractDevicesFromMinaResponse(r);
  } else if (Array.isArray(minaData?.devices)) {
    rawList = minaData.devices;
  } else if (Array.isArray(minaData?.device_list)) {
    rawList = minaData.device_list;
  } else if (Array.isArray(minaData?.list)) {
    rawList = minaData.list;
  }

  return rawList;
}

/**
 * Known XiaoAi Speaker Models Database & Spec Capabilities Cache
 */
const KNOWN_XIAOAI_MODELS: Record<string, Partial<DeviceCapabilities>> = {
  'xiaomi.wifispeaker.l05c': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: true },
  'xiaomi.wifispeaker.l05b': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false },
  'xiaomi.wifispeaker.l05g': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false },
  'xiaomi.wifispeaker.lx06': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false, supportsDlna: true },
  'xiaomi.wifispeaker.lx04': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: true, supportsDlna: true },
  'xiaomi.wifispeaker.lx01': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false },
  'xiaomi.wifispeaker.lx05': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false },
  'xiaomi.wifispeaker.l06a': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false, supportsDlna: true },
  'xiaomi.wifispeaker.l07a': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false },
  'xiaomi.wifispeaker.l09a': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false, supportsDlna: true },
  'xiaomi.wifispeaker.l09g': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false, supportsDlna: true },
  'xiaomi.wifispeaker.l15a': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false, supportsDlna: true },
  'xiaomi.wifispeaker.l16a': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false, supportsDlna: true },
  'xiaomi.wifispeaker.l17a': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false, supportsDlna: true },
  'xiaomi.wifispeaker.s12': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false },
  'xiaomi.wifispeaker.s12a': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false },
  'xiaomi.wifispeaker.sound': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false, supportsDlna: true },
  'xiaomi.wifispeaker.soundpro': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false, supportsDlna: true },
  'xiaomi.wifispeaker.soundmove': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false, supportsDlna: true },
  'xiaomi.wifispeaker.m03a': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false },
  'xiaomi.wifispeaker.x08a': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: true, supportsDlna: true },
  'xiaomi.wifispeaker.x08c': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: true, supportsDlna: true },
  'xiaomi.wifispeaker.x10a': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: true, supportsDlna: true },
  'xiaomi.wifispeaker.art': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false, supportsDlna: true },
  'xiaomi.wifispeaker.play': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false },
  'xiaomi.wifispeaker.pro': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false, supportsDlna: true },
  'xiaomi.wifispeaker.oh2p': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false, supportsDlna: true },
  'xiaomi.wifispeaker.mdz28da': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false },
  'xiaomi.speaker.x08e': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: true, supportsDlna: true },
  'xiaomi.speaker.l07a': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false },
  'xiaomi.speaker.l05b': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false },
  'xiaomi.speaker.l05c': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: true },
  'xiaomi.speaker.play': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false },
  'xiaomi.speaker.pro': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false, supportsDlna: true },
  'wifispeaker': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false }
};

/**
 * MIoT Spec In-memory Cache to avoid redundant network queries
 */
const miotSpecCache = new Map<string, any>();

/**
 * XiaoAi Device Discovery & Resolution Engine
 * Implements the dual-track discovery and MIoT Spec filtering architecture:
 *
 *               Xiaomi Device Discovery
 *                         │
 *            ┌────────────┴────────────┐
 *            ▼                         ▼
 *       Xiaomi Cloud             LAN Discovery
 *            │                         │
 *            ▼                         ▼
 *        获取 DID                   miIO Hello
 *            │                         │
 *            ▼                         ▼
 *        获取 Model                 获取 DID
 *            │                         │
 *            └───────────┬─────────────┘
 *                        ▼
 *                  Device Resolver
 *                        │
 *                        ▼
 *                    MIoT Spec
 *                        │
 *                        ▼
 *                 判断是不是音箱
 *                        │
 *                ┌───────┴───────┐
 *                ▼               ▼
 *               是               否
 *                │               │
 *                ▼               ▼
 *            XiaoAi设备         忽略
 */
export interface CloudEndpointSnapshot {
  id: string;
  timestamp: string;
  url: string;
  service: 'mina' | 'mihome' | 'overseas';
  status: number;
  statusText: string;
  durationMs: number;
  rawResponse?: any;
  rawResponseText?: string;
  deviceCount: number;
  extractedDevices?: any[];
  error?: string;
}

export class XiaoAiResolverEngine {
  private cloudSnapshots: CloudEndpointSnapshot[] = [];

  public getCloudSnapshots(): CloudEndpointSnapshot[] {
    return [...this.cloudSnapshots];
  }

  public clearCloudSnapshots(): void {
    this.cloudSnapshots = [];
  }

  private recordSnapshot(snapshot: CloudEndpointSnapshot) {
    this.cloudSnapshots.unshift(snapshot);
    if (this.cloudSnapshots.length > 50) {
      this.cloudSnapshots.pop();
    }
  }
  /**
   * 1. LAN Discovery: Send miIO Hello packets via UDP 54321
   * Extracts: did, ip, online status
   */
  public async discoverLanDevices(subnetPrefix?: string, timeoutMs = 2000): Promise<LanDiscoveredItem[]> {
    const subnets = subnetPrefix ? [subnetPrefix] : this.getLocalSubnets();
    if (subnets.length === 0) {
      subnets.push('192.168.31');
    }

    const lanMap = new Map<string, LanDiscoveredItem>();
    const client = dgram.createSocket('udp4');
    const helloPacket = Buffer.from('21310020ffffffffffffffffffffffffffffffffffffffffffffffffffffffff', 'hex');

    return new Promise((resolve) => {
      const startTime = Date.now();

      client.on('message', (msg, rinfo) => {
        try {
          if (msg.length >= 32 && msg[0] === 0x21 && msg[1] === 0x31) {
            // miIO Header: bytes 8-11 contain 32-bit Device ID (DID)
            const didNum = msg.readUInt32BE(8);
            const didStr = String(didNum);
            const ip = rinfo.address;

            if (didStr && didStr !== '0' && !lanMap.has(didStr)) {
              lanMap.set(didStr, {
                did: didStr,
                ip,
                online: true,
                latency: Date.now() - startTime
              });
            }
          }
        } catch {}
      });

      client.on('error', () => {
        try { client.close(); } catch {}
        resolve(Array.from(lanMap.values()));
      });

      try {
        client.bind(() => {
          try {
            client.setBroadcast(true);
          } catch {}

          for (const sub of subnets) {
            // Broadcast packet
            try {
              client.send(helloPacket, 0, helloPacket.length, 54321, `${sub}.255`);
            } catch {}

            // Unicast probes to the subnet range
            for (let i = 1; i <= 254; i++) {
              try {
                client.send(helloPacket, 0, helloPacket.length, 54321, `${sub}.${i}`);
              } catch {}
            }
          }
        });
      } catch {
        resolve(Array.from(lanMap.values()));
        return;
      }

      setTimeout(() => {
        try { client.close(); } catch {}
        resolve(Array.from(lanMap.values()));
      }, timeoutMs);
    });
  }

  /**
   * 2. Xiaomi Cloud Discovery: Query Mina and MiHome device APIs
   * Extracts: did, model, name, mac, token, online
   */
  public async discoverCloudDevices(
    userId: string,
    serviceToken: string,
    options?: { xiaomiioServiceToken?: string; micoServiceToken?: string; ssecurity?: string }
  ): Promise<CloudDiscoveredItem[]> {
    if (!userId || (!serviceToken && !options?.micoServiceToken && !options?.xiaomiioServiceToken)) return [];

    const cleanUid = String(userId).replace(/^["']|["']$/g, '').replace(/^uid_/, '').replace(/;$/, '').trim();
    const cleanMicoToken = String(options?.micoServiceToken || serviceToken).replace(/^["']|["']$/g, '').replace(/;$/, '').trim();
    const cleanMiioToken = String(options?.xiaomiioServiceToken || serviceToken).replace(/^["']|["']$/g, '').replace(/;$/, '').trim();
    const cleanSsecurity = options?.ssecurity ? String(options.ssecurity).trim() : '';

    if (!cleanUid || cleanUid === 'undefined' || cleanUid === 'null') {
      return [];
    }

    const cloudMap = new Map<string, CloudDiscoveredItem>();
    const reqId = Date.now();

    // 2.1 Mina (XiaoAi SoundBox) Cloud Endpoints (GET)
    const minaEndpoints = [
      `https://api2.mina.mi.com/admin/v2/device_list?master=0&requestId=app_ios_${reqId}`,
      `https://api2.mina.mi.com/admin/v2/device_list?master=1&requestId=app_ios_${reqId}`,
      `https://user.app.mina.mi.com/v2/device_list?master=0`,
      `https://user.app.mina.mi.com/v2/device_list?master=1`,
      `https://api.mina.mi.com/admin/v2/device_list?master=0&requestId=app_ios_${reqId}`,
      `https://api.mina.mi.com/admin/v2/device_list?master=1&requestId=app_ios_${reqId}`,
      `https://api2.mina.mi.com/open/device/list`,
      `https://api2.mina.mi.com/admin/v2/device_list`,
      `https://api.mina.mi.com/admin/v2/device_list`,
      `https://api2.pv.mina.mi.com/admin/v2/device_list`
    ];

    const queryMinaEndpoint = async (ep: string) => {
      if (!cleanMicoToken || cleanMicoToken === 'undefined' || cleanMicoToken === 'null') {
        console.warn(`[Mina Discovery] ⚠️ 未提供有效的 micoServiceToken，跳过小爱官方 Mina 接口: ${ep}`);
        return;
      }
      const startT = Date.now();
      const clientDeviceId = `app_ios_${crypto.randomBytes(8).toString('hex')}`;
      console.log(`[Mina Discovery] 📡 发起小爱接口请求: ${ep}`);
      console.log(`[Mina Discovery] 🔑 userId=${cleanUid}, token=${cleanMicoToken.slice(0, 4)}••••, clientDeviceId=${clientDeviceId}`);

      try {
        const headers: Record<string, string> = {
          'User-Agent': 'MISoundBox/1.4.0 (iPhone; iOS 14.4; Scale/3.00)',
          'Cookie': `userId=${cleanUid}; serviceToken=${cleanMicoToken}; deviceId=${clientDeviceId}; channel=MI_APP_STORE; PassportDeviceId=${clientDeviceId}`,
          'Accept': 'application/json, text/plain, */*'
        };

        const res = await fetch(ep, { headers, signal: AbortSignal.timeout(4000) });
        const text = await res.text();
        const durationMs = Date.now() - startT;

        console.log(`[Mina Discovery] 📥 接口响应: HTTP ${res.status} ${res.statusText}, 耗时: ${durationMs}ms`);
        console.log(`[Mina Discovery] 📄 原始返回片段: ${text.slice(0, 300)}`);

        let minaData: any = null;
        try {
          minaData = JSON.parse(text);
        } catch (e: any) {
          console.warn(`[Mina Discovery Warning] ⚠️ 接口返回非 JSON 数据: ${text.slice(0, 200)}`);
        }

        if (!res.ok) {
          console.warn(`[Mina Discovery Warning] ⚠️ 小爱接口 HTTP ${res.status} 异常! 可能原因: 1) serviceToken 非 micoapi 域或已过期; 2) 小米网关限制`);
        } else if (minaData && minaData.code !== 0 && minaData.code !== 200) {
          console.warn(`[Mina Discovery Warning] ⚠️ 小爱接口返回业务错误: code=${minaData.code}, message=${minaData.message || minaData.msg || '未知错误'}`);
        }

        const list = extractDevicesFromMinaResponse(minaData || text);
        const extracted: any[] = [];

        if (Array.isArray(list) && list.length > 0) {
          console.log(`[Mina Discovery Success] ✅ 小爱接口成功获取到 ${list.length} 台设备数据:`, list.map((d: any) => ({
            name: d.name || d.alias || d.nick_name,
            miotDID: d.miotDID || d.did,
            deviceID: d.deviceID || d.hardwareDeviceId || d.device_id,
            model: d.model || d.hardware
          })));

          for (const item of list) {
            const rawMiotDid = item.miotDID || item.did || item.miot_did;
            const rawDeviceUuid = item.deviceID || item.hardwareDeviceId || item.device_id || item.uuid;
            // A genuine Xiaoai UUID is not identical to numeric miotDID
            const cleanDeviceUuid = (rawDeviceUuid && String(rawDeviceUuid) !== String(rawMiotDid)) ? String(rawDeviceUuid) : undefined;
            const did = String(
              rawMiotDid || 
              cleanDeviceUuid || 
              item.id || 
              item.serialNumber || 
              item.mac || 
              ''
            );
            if (!did) continue;

            const rawName = item.alias || item.name || item.device_name || item.nick_name || item.title || (item.hardware ? `小米智能音箱 (${item.hardware})` : '小米智能音箱');
            const cleanName = String(rawName).replace(/\s*[\(（]点击(右侧)?编辑[\)）]/g, '').trim() || '小米智能音箱';
            const hardware = item.hardware || item.model || 'XiaoAi';
            const model = item.model || (item.hardware ? `xiaomi.wifispeaker.${item.hardware.toLowerCase()}` : 'xiaomi.wifispeaker');

            const ip =
              item.currentIp ||
              item.device_ip ||
              item.ip ||
              item.device_address ||
              item.local_ip ||
              item.localip ||
              undefined;

            const cloudItem: CloudDiscoveredItem = {
              did,
              deviceID: cleanDeviceUuid,
              hardwareDeviceId: item.hardwareDeviceId ? String(item.hardwareDeviceId) : cleanDeviceUuid,
              cloudDid: rawMiotDid ? String(rawMiotDid) : undefined,
              model,
              name: cleanName,
              ip,
              mac: item.mac || item.mac_address || undefined,
              token: item.token || item.device_token || undefined,
              hardware,
              online: item.presence === 'online' || item.online === true || item.status === 1 || item.isOnline === true || (item.online !== false && item.presence !== 'offline'),
              raw: item
            };

            extracted.push(cloudItem);
            if (!cloudMap.has(did)) {
              cloudMap.set(did, cloudItem);
            }
            if (cleanDeviceUuid && !cloudMap.has(cleanDeviceUuid)) {
              cloudMap.set(cleanDeviceUuid, cloudItem);
            }
            if (rawMiotDid && !cloudMap.has(String(rawMiotDid))) {
              cloudMap.set(String(rawMiotDid), cloudItem);
            }
          }
        } else {
          console.warn(`[Mina Discovery Info] ℹ️ 小爱接口调用成功但返回设备列表为空 (0 devices). 可能原因: 1) 当前账号下未绑定小爱音箱; 2) serviceToken 无 mico 权限`);
        }

        this.recordSnapshot({
          id: `snap-mina-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: new Date().toLocaleTimeString(),
          url: ep,
          service: 'mina',
          status: res.status,
          statusText: res.statusText || (res.ok ? 'OK' : 'Error'),
          durationMs,
          rawResponse: minaData || text.slice(0, 500),
          rawResponseText: text.slice(0, 2000),
          deviceCount: extracted.length,
          extractedDevices: extracted
        });
      } catch (err: any) {
        console.error(`[Mina Discovery Error] ❌ 请求小爱接口异常: ${ep}`, err.message);
        this.recordSnapshot({
          id: `snap-mina-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: new Date().toLocaleTimeString(),
          url: ep,
          service: 'mina',
          status: 0,
          statusText: 'Network / Timeout Error',
          durationMs: Date.now() - startT,
          error: err.message,
          deviceCount: 0
        });
      }
    };

    // 2.2 MiHome Cloud Endpoints (POST with URL-encoded JSON payload or official HMAC-SHA256 signature)
    const mihomeEndpoints = [
      { url: 'https://api.io.mi.com/app/home/device_list', payload: { getVirtualModel: false, getHuamiDevices: 0 } },
      { url: 'https://api.io.mi.com/app/v2/home/device_list', payload: { getVirtualModel: false, getHuamiDevices: 0 } },
      { url: 'https://api.io.mi.com/app/home/device_list', payload: {} },
      { url: 'https://api.io.mi.com/app/v2/home/device_list', payload: { limit: 300 } },
      { url: 'https://api.io.mi.com/app/v2/home/get_interconnection_device_list', payload: {} }
    ];

    const queryMiHomeEndpoint = async (epItem: { url: string; payload: any }) => {
      const startT = Date.now();
      try {
        let bodyStr = `data=${encodeURIComponent(JSON.stringify(epItem.payload))}`;
        const headers: Record<string, string> = {
          'User-Agent': 'MiHome/6.0.0 (com.xiaomi.mihome; build:20210219; iOS 14.4.0)',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': `userId=${cleanUid}; serviceToken=${cleanMiioToken}; PassportDeviceId=${cleanUid}`,
          'Accept': 'application/json, text/plain, */*'
        };

        if (cleanSsecurity) {
          const rand8 = crypto.randomBytes(8);
          const timeBuf = Buffer.alloc(4);
          timeBuf.writeUInt32BE(Math.floor(Date.now() / 1000 / 60), 0);
          const nonce = Buffer.concat([rand8, timeBuf]).toString('base64');
          const hashNonce = crypto.createHash('sha256').update(Buffer.from(cleanSsecurity, 'base64')).update(Buffer.from(nonce, 'base64')).digest('base64');
          const dataStr = JSON.stringify(epItem.payload);
          const uri = new URL(epItem.url).pathname.replace(/^\/app/, '');
          const msg = `${uri}&${hashNonce}&${nonce}&data=${dataStr}`;
          const sign = crypto.createHmac('sha256', Buffer.from(hashNonce, 'base64')).update(msg).digest('base64');

          headers['User-Agent'] = 'iOS-14.4-6.0.103-iPhone12,3--D7744744F7AF32F0544445285880DD63E47D9BE9-8816080-84A3F44E137B71AE-iPhone';
          headers['x-xiaomi-protocal-flag-cli'] = 'PROTOCAL-HTTP2';
          bodyStr = new URLSearchParams({ _nonce: nonce, data: dataStr, signature: sign }).toString();
        }

        const res = await fetch(epItem.url, {
          method: 'POST',
          headers,
          body: bodyStr,
          signal: AbortSignal.timeout(4000)
        });
        const text = await res.text();
        const durationMs = Date.now() - startT;

        let miHomeData: any = null;
        try {
          miHomeData = JSON.parse(text);
        } catch {}

        const list = extractDevicesFromMinaResponse(miHomeData || text);
        const extracted: any[] = [];

        if (Array.isArray(list) && list.length > 0) {
          for (const item of list) {
            const did = String(
              item.did || 
              item.miotDID || 
              item.deviceID || 
              item.device_id || 
              item.id || 
              item.mac || 
              ''
            );
            if (!did) continue;

            const rawName = item.name || item.alias || item.device_name || item.nick_name || item.title || '小米智能音箱';
            const cleanName = String(rawName).replace(/\s*[\(（]点击(右侧)?编辑[\)）]/g, '').trim() || '小米智能音箱';
            const hardware = item.hardware || item.model || 'XiaoAi';
            const model = item.model || 'xiaomi.wifispeaker';

            const ip = item.localip || item.ip || item.device_ip || item.currentIp || undefined;

            const cloudItem: CloudDiscoveredItem = {
              did,
              deviceID: item.deviceID || item.hardwareDeviceId || item.device_id || did,
              hardwareDeviceId: item.hardwareDeviceId || item.deviceID,
              cloudDid: item.did || item.miotDID || did,
              model,
              name: cleanName,
              ip,
              mac: item.mac || item.mac_address || undefined,
              token: item.token || item.device_token || undefined,
              hardware,
              online: item.isOnline === true || item.online === true || item.presence === 'online',
              raw: item
            };

            extracted.push(cloudItem);
            if (!cloudMap.has(did)) {
              cloudMap.set(did, cloudItem);
            }
          }
        }

        this.recordSnapshot({
          id: `snap-mihome-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: new Date().toLocaleTimeString(),
          url: epItem.url,
          service: 'mihome',
          status: res.status,
          statusText: res.statusText || (res.ok ? 'OK' : 'Error'),
          durationMs,
          rawResponse: miHomeData || text.slice(0, 500),
          rawResponseText: text.slice(0, 2000),
          deviceCount: extracted.length,
          extractedDevices: extracted
        });
      } catch (err: any) {
        this.recordSnapshot({
          id: `snap-mihome-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: new Date().toLocaleTimeString(),
          url: epItem.url,
          service: 'mihome',
          status: 0,
          statusText: 'Network / Timeout Error',
          durationMs: Date.now() - startT,
          error: err.message,
          deviceCount: 0
        });
      }
    };

    // Run Mina and MiHome Cloud Queries in Parallel
    await Promise.allSettled([
      ...minaEndpoints.map(ep => queryMinaEndpoint(ep)),
      ...mihomeEndpoints.map(epItem => queryMiHomeEndpoint(epItem))
    ]);

    // Auto-detect overseas regions if China region returned 0 devices
    if (cloudMap.size === 0) {
      const overseasRegions = [
        { code: 'sg', name: '新加坡/东南亚', url: 'https://sg.api.io.mi.com/app/v2/home/device_list' },
        { code: 'us', name: '美国', url: 'https://us.api.io.mi.com/app/v2/home/device_list' },
        { code: 'de', name: '欧洲/德国', url: 'https://de.api.io.mi.com/app/v2/home/device_list' },
        { code: 'ru', name: '俄罗斯', url: 'https://ru.api.io.mi.com/app/v2/home/device_list' },
        { code: 'i2', name: '印度', url: 'https://i2.api.io.mi.com/app/v2/home/device_list' }
      ];

      for (const region of overseasRegions) {
        const startT = Date.now();
        try {
          const bodyStr = `data=${encodeURIComponent(JSON.stringify({ getVirtualModel: false, getHuamiDevices: 0 }))}`;
          const res = await fetch(region.url, {
            method: 'POST',
            headers: {
              'User-Agent': 'MiHome/6.0.0 (com.xiaomi.mihome; build:20210219; iOS 14.4.0)',
              'Content-Type': 'application/x-www-form-urlencoded',
              'Cookie': `userId=${cleanUid}; serviceToken=${cleanMiioToken}; PassportDeviceId=${cleanUid}`
            },
            body: bodyStr,
            signal: AbortSignal.timeout(2500)
          });
          const text = await res.text();
          const durationMs = Date.now() - startT;
          let data: any = null;
          try {
            data = JSON.parse(text);
          } catch {}

          const list = extractDevicesFromMinaResponse(data || text);
          const extracted: any[] = [];
          if (Array.isArray(list) && list.length > 0) {
            console.log(`[XiaoAi Resolver] Auto-detected ${list.length} devices in overseas region: ${region.name} (${region.code})`);
            for (const item of list) {
              const did = String(item.did || item.miotDID || item.deviceID || item.id || item.mac || '');
              if (!did) continue;
              const rawName = item.name || item.alias || item.device_name || '小米音箱';
              const cleanName = String(rawName).replace(/\s*[\(（]点击(右侧)?编辑[\)）]/g, '').trim();
              const hardware = item.hardware || item.model || 'XiaoAi';
              const model = item.model || (item.hardware ? `xiaomi.wifispeaker.${item.hardware.toLowerCase()}` : 'xiaomi.wifispeaker');
              const cloudItem: CloudDiscoveredItem = {
                did,
                model,
                name: `${cleanName} [${region.code.toUpperCase()}]`,
                ip: item.localip || item.currentIp || undefined,
                mac: item.mac || undefined,
                token: item.token || undefined,
                hardware,
                online: item.isOnline === true || item.presence === 'online',
                raw: item
              };
              extracted.push(cloudItem);
              if (!cloudMap.has(did)) {
                cloudMap.set(did, cloudItem);
              }
            }
          }

          this.recordSnapshot({
            id: `snap-overseas-${region.code}-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            url: region.url,
            service: 'overseas',
            status: res.status,
            statusText: `${res.statusText || 'OK'} (${region.name})`,
            durationMs,
            rawResponse: data || text.slice(0, 500),
            rawResponseText: text.slice(0, 2000),
            deviceCount: extracted.length,
            extractedDevices: extracted
          });

          if (extracted.length > 0) {
            break; // Matched region successfully
          }
        } catch (err: any) {
          this.recordSnapshot({
            id: `snap-overseas-${region.code}-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            url: region.url,
            service: 'overseas',
            status: 0,
            statusText: `Timeout (${region.name})`,
            durationMs: Date.now() - startT,
            error: err.message,
            deviceCount: 0
          });
        }
      }
    }

    return Array.from(cloudMap.values());
  }

  /**
   * 3. MIoT Spec Evaluation: 判断是不是音箱
   * Queries MIoT Spec or checks model capabilities against official schema.
   */
  public async evaluateMiotSpec(model: string, name?: string, hardware?: string): Promise<{ isSpeaker: boolean; capabilities: DeviceCapabilities; reason: string }> {
    const normalizedModel = (model || '').toLowerCase().trim();
    const normalizedName = (name || '').toLowerCase().trim();
    const normalizedHardware = (hardware || '').toLowerCase().trim();

    // 0. Quick speaker match by hardware or name
    if (
      normalizedName.includes('小爱') ||
      normalizedName.includes('音箱') ||
      normalizedName.includes('soundbox') ||
      normalizedName.includes('speaker') ||
      /^(lx|l05|l06|l07|l09|l15|l16|l17|s12|x08|x10|mdz)/i.test(normalizedHardware)
    ) {
      return {
        isSpeaker: true,
        reason: '设备名称或硬件特征匹配小爱音箱系列 (XiaoAi Hardware/Name Match)',
        capabilities: {
          hasPlayControl: true,
          hasTts: true,
          hasVolumeControl: true,
          hasClock: /clock|c01|x08|lx04|l05c/i.test(normalizedModel + normalizedHardware),
          supportsDlna: /lx06|pro|sound|l16a/i.test(normalizedModel + normalizedHardware),
          supportsLocalMiio: true
        }
      };
    }

    // 0. miIO UDP 54321 packet alone does NOT mean the device is an XiaoAi speaker!
    if (
      !normalizedModel ||
      normalizedModel === 'miio.device.unknown' ||
      normalizedModel === 'xiaomi.device.miot' ||
      normalizedModel === 'unknown'
    ) {
      return {
        isSpeaker: false,
        reason: '仅响应局域网 miIO UDP 54321 握手（型号未知）：miIO 协议为米家通用协议，净化器/扫地机/插座/网关等均会响应，未匹配到小爱音箱规范',
        capabilities: { hasPlayControl: false, hasTts: false, hasVolumeControl: false }
      };
    }

    // 1. Direct Known Model Spec
    if (KNOWN_XIAOAI_MODELS[normalizedModel]) {
      const knownCaps = KNOWN_XIAOAI_MODELS[normalizedModel];
      return {
        isSpeaker: true,
        reason: '匹配官方已知小爱音箱型号规范 (MIoT Known Instance)',
        capabilities: {
          hasPlayControl: knownCaps.hasPlayControl ?? true,
          hasTts: knownCaps.hasTts ?? true,
          hasVolumeControl: knownCaps.hasVolumeControl ?? true,
          hasClock: knownCaps.hasClock ?? false,
          supportsDlna: knownCaps.supportsDlna ?? false,
          supportsLocalMiio: true
        }
      };
    }

    // 2. Clear non-speaker models (quick rejection for obvious home IoT appliances)
    const nonSpeakerRegex = /(vacuum|light|lamp|bulb|switch|plug|outlet|purifier|curtain|camera|sensor|lock|fan|heater|conditioner|kettle|feeder|water|gateway)/i;
    if (nonSpeakerRegex.test(normalizedModel)) {
      return {
        isSpeaker: false,
        reason: `设备品类非音频设备 (${normalizedModel})`,
        capabilities: { hasPlayControl: false, hasTts: false, hasVolumeControl: false }
      };
    }

    // 3. Check model keywords for speaker/xiaoai
    if (/wifispeaker|speaker|xiaoai|soundbox|sound|mico|audioplayer|lx0|lx1|lx5|l05|l06|l07|l09|l15|l16|l17|s12|x08|x10|x6a/i.test(normalizedModel)) {
      return {
        isSpeaker: true,
        reason: '设备型号归属于小爱音频设备系列 (Xiaomi Speaker Family)',
        capabilities: {
          hasPlayControl: true,
          hasTts: true,
          hasVolumeControl: true,
          hasClock: /clock|c01|x08|lx04|l05c/i.test(normalizedModel),
          supportsDlna: /lx06|pro|sound|l16a/i.test(normalizedModel),
          supportsLocalMiio: true
        }
      };
    }

    // 4. Online MIoT Spec Schema Inspection
    try {
      let spec = miotSpecCache.get(normalizedModel);
      if (!spec) {
        const specUrl = `https://miot-spec.org/miot-spec-v2/instance?type=${encodeURIComponent(normalizedModel)}`;
        const res = await fetch(specUrl, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          spec = await res.json();
          miotSpecCache.set(normalizedModel, spec);
        }
      }

      if (spec && Array.isArray(spec.services)) {
        let hasPlayControl = false;
        let hasTts = false;
        let hasVolume = false;
        let hasClock = false;
        let isSpeakerServiceFound = false;

        for (const s of spec.services) {
          const typeStr = String(s.type || '').toLowerCase();
          if (typeStr.includes('service:play-control') || typeStr.includes('service:audio-player')) {
            hasPlayControl = true;
          }
          if (typeStr.includes('service:intelligent-speaker') || typeStr.includes('service:voice')) {
            hasTts = true;
            isSpeakerServiceFound = true;
          }
          if (typeStr.includes('service:speaker')) {
            hasVolume = true;
            isSpeakerServiceFound = true;
          }
          if (typeStr.includes('service:clock') || typeStr.includes('service:alarm')) {
            hasClock = true;
          }
        }

        if (isSpeakerServiceFound || (hasPlayControl && hasVolume)) {
          return {
            isSpeaker: true,
            reason: 'MIoT 规范中包含智能音箱/播放控制核心服务',
            capabilities: {
              hasPlayControl,
              hasTts,
              hasVolumeControl: hasVolume,
              hasClock,
              supportsDlna: false,
              supportsLocalMiio: true
            }
          };
        }
      }
    } catch {}

    // Not a speaker
    return {
      isSpeaker: false,
      reason: 'MIoT Spec 未检索到播放控制或智能音箱服务，判定为非音箱设备',
      capabilities: { hasPlayControl: false, hasTts: false, hasVolumeControl: false }
    };
  }

  /**
   * 4. Complete Device Resolver Pipeline
   * Resolves: Cloud List + LAN Discovery -> Merge on DID -> Filter by MIoT Spec -> XiaoAi Devices
   */
  public async resolveDevices(options: {
    userId?: string;
    serviceToken?: string;
    micoServiceToken?: string;
    xiaomiioServiceToken?: string;
    ssecurity?: string;
    subnetPrefix?: string;
    existingDevices?: any[];
    activeStreamIps?: string[];
  }): Promise<{
    xiaoAiDevices: XiaoAiDevice[];
    ignoredDevices: IgnoredDevice[];
    metrics: {
      cloudFound: number;
      lanFound: number;
      hybridMerged: number;
      speakerConfirmed: number;
      nonSpeakerIgnored: number;
    };
  }> {
    const { userId = '', serviceToken = '', micoServiceToken, xiaomiioServiceToken, ssecurity, subnetPrefix, existingDevices = [], activeStreamIps = [] } = options;

    // Run LAN Discovery and Cloud Discovery in parallel
    const [lanList, cloudList] = await Promise.all([
      this.discoverLanDevices(subnetPrefix, 2000),
      this.discoverCloudDevices(userId, serviceToken, { xiaomiioServiceToken, micoServiceToken, ssecurity })
    ]);

    const lanMap = new Map<string, LanDiscoveredItem>();
    for (const item of lanList) {
      lanMap.set(item.did, item);
    }

    const cloudMap = new Map<string, CloudDiscoveredItem>();
    for (const item of cloudList) {
      cloudMap.set(item.did, item);
    }

    // Merge Pool
    const mergedMap = new Map<string, {
      did: string;
      deviceID?: string;
      hardwareDeviceId?: string;
      cloudDid?: string;
      model: string;
      name: string;
      ip?: string;
      mac?: string;
      token?: string;
      source: DeviceSource;
      platform: DevicePlatform;
      online: boolean;
      hardware?: string;
      existingStatus?: any;
    }>();

    // Map existing devices status
    const existingMap = new Map<string, any>();
    for (const ex of existingDevices) {
      if (ex && ex.did) {
        existingMap.set(ex.did, ex);
      }
    }

    // Helper: Find existing matching device across multiple keys
    const findMatchingExisting = (target: { did: string; cloudDid?: string; deviceID?: string; mac?: string; ip?: string }) => {
      if (existingMap.has(target.did)) return existingMap.get(target.did);
      return Array.from(existingMap.values()).find(ex => 
        (target.cloudDid && (ex.did === target.cloudDid || ex.cloudDid === target.cloudDid)) ||
        (target.deviceID && (ex.did === target.deviceID || ex.deviceID === target.deviceID)) ||
        (ex.mac && target.mac && ex.mac.toLowerCase() === target.mac.toLowerCase()) ||
        (ex.ip && target.ip && ex.ip === target.ip)
      );
    };

    // 1. Process Cloud devices
    // Helper to verify if an ID is a genuine Xiaoai UUID (not a pure numeric MIoT DID or synthetic string)
    const isGenuineUuid = (id?: string) => {
      if (!id) return false;
      const s = String(id).trim();
      if (s.startsWith('did-') || s.startsWith('manual_')) return false;
      if (/^\d{6,16}$/.test(s)) return false; // Pure numeric digits is a MIoT DID or UserID, NOT a Xiaoai Hardware UUID
      return true;
    };

    for (const [did, cDev] of cloudMap.entries()) {
      // Find LAN match by DID, IP or MAC
      const lanMatch = lanMap.get(did) || Array.from(lanMap.values()).find(l => 
        (cDev.ip && l.ip === cDev.ip) || (cDev.mac && l.mac && l.mac.toLowerCase() === cDev.mac.toLowerCase())
      );
      const exDev = findMatchingExisting(cDev);

      const resolvedDeviceID = isGenuineUuid(cDev.deviceID)
        ? cDev.deviceID
        : (isGenuineUuid(exDev?.deviceID) ? exDev?.deviceID : undefined);

      const resolvedHardwareDeviceId = isGenuineUuid(cDev.hardwareDeviceId)
        ? cDev.hardwareDeviceId
        : (isGenuineUuid(exDev?.hardwareDeviceId) ? exDev?.hardwareDeviceId : resolvedDeviceID);

      const resolvedCloudDid = cDev.cloudDid || exDev?.cloudDid || (cDev.did !== resolvedDeviceID ? cDev.did : undefined);

      if (lanMatch) {
        // Hybrid: Exists in both Cloud and LAN
        mergedMap.set(did, {
          did,
          deviceID: resolvedDeviceID,
          hardwareDeviceId: resolvedHardwareDeviceId,
          cloudDid: resolvedCloudDid,
          model: (cDev.model && cDev.model !== 'xiaomi.wifispeaker') ? cDev.model : (exDev?.model || cDev.model),
          name: cDev.name || exDev?.name || '小米智能音箱',
          ip: lanMatch.ip || cDev.ip || exDev?.ip,
          mac: cDev.mac || exDev?.mac || lanMatch.mac,
          token: cDev.token || exDev?.token,
          source: 'hybrid',
          platform: (cDev.token || exDev?.token) ? 'miio' : 'mina',
          online: true,
          hardware: cDev.hardware || exDev?.hardware,
          existingStatus: exDev?.status
        });
      } else {
        // Cloud-only: LAN IP not discovered yet (unless available from Cloud API or verified existing IP)
        const resolvedIp = cDev.ip || exDev?.ip || undefined;
        mergedMap.set(did, {
          did,
          deviceID: resolvedDeviceID,
          hardwareDeviceId: resolvedHardwareDeviceId,
          cloudDid: resolvedCloudDid,
          model: (cDev.model && cDev.model !== 'xiaomi.wifispeaker') ? cDev.model : (exDev?.model || cDev.model),
          name: cDev.name || exDev?.name || '小米智能音箱',
          ip: resolvedIp,
          mac: cDev.mac || exDev?.mac,
          token: cDev.token || exDev?.token,
          source: resolvedIp ? 'hybrid' : 'cloud',
          platform: (cDev.token || exDev?.token && resolvedIp) ? 'miio' : 'mina',
          online: cDev.online || exDev?.online || true,
          hardware: cDev.hardware || exDev?.hardware,
          existingStatus: exDev?.status
        });
      }
    }

    // 2. Process LAN-only devices
    for (const [did, lDev] of lanMap.entries()) {
      if (!mergedMap.has(did)) {
        const exDev = existingMap.get(did) || Array.from(existingMap.values()).find(ex => ex.ip === lDev.ip);
        let model = exDev?.model;
        let name = exDev?.name;

        // If existing device has token, attempt to query miIO.info to get real model
        if (exDev?.token && (!model || model === 'miio.device.unknown')) {
          try {
            const probeInfo = await miotRpcEngine.executeLocalMiio(lDev.ip, exDev.token, 'miIO.info', [], 1000);
            if (probeInfo.code === 0 && probeInfo.result?.model) {
              model = probeInfo.result.model;
            }
          } catch {}
        }

        // If still no model, mark it as unknown miIO device
        if (!model) {
          model = 'miio.device.unknown';
          name = `局域网 miIO 设备 (${lDev.ip})`;
        }

        const resolvedLanDeviceID = isGenuineUuid(exDev?.deviceID) ? exDev.deviceID : undefined;
        const resolvedLanHardwareDeviceId = isGenuineUuid(exDev?.hardwareDeviceId) ? exDev.hardwareDeviceId : resolvedLanDeviceID;

        mergedMap.set(did, {
          did,
          deviceID: resolvedLanDeviceID,
          hardwareDeviceId: resolvedLanHardwareDeviceId,
          cloudDid: exDev?.cloudDid,
          model,
          name: name || `局域网 miIO 设备 (${lDev.ip})`,
          ip: lDev.ip,
          mac: exDev?.mac || lDev.mac,
          token: exDev?.token,
          source: 'lan',
          platform: 'miio',
          online: true,
          hardware: exDev?.hardware || 'miIO-Generic',
          existingStatus: exDev?.status
        });
      }
    }

    // 3. Keep manual / existing devices if they were not scanned this round and not already merged
    for (const [did, exDev] of existingMap.entries()) {
      const alreadyMerged = Array.from(mergedMap.values()).find(m => 
        m.did === did || 
        (m.cloudDid && m.cloudDid === did) ||
        (m.deviceID && m.deviceID === did) ||
        (m.mac && exDev.mac && m.mac.toLowerCase() === exDev.mac.toLowerCase()) ||
        (m.ip && exDev.ip && m.ip === exDev.ip)
      );
      if (!alreadyMerged) {
        const resolvedExDeviceID = isGenuineUuid(exDev.deviceID) ? exDev.deviceID : undefined;
        const resolvedExHardwareDeviceId = isGenuineUuid(exDev.hardwareDeviceId) ? exDev.hardwareDeviceId : resolvedExDeviceID;

        mergedMap.set(did, {
          did,
          deviceID: resolvedExDeviceID,
          hardwareDeviceId: resolvedExHardwareDeviceId,
          cloudDid: exDev.cloudDid,
          model: exDev.model || 'xiaomi.wifispeaker',
          name: exDev.name || '小米智能音箱',
          ip: exDev.ip,
          mac: exDev.mac,
          token: exDev.token,
          source: exDev.source || (exDev.ip ? 'lan' : 'cloud'),
          platform: exDev.platform || (exDev.token && exDev.ip ? 'miio' : 'mina'),
          online: exDev.isOnline ?? exDev.online ?? false,
          hardware: exDev.hardware || 'XiaoAi',
          existingStatus: exDev.status
        });
      }
    }

    // 4. Incorporate active stream IPs (e.g. speakers requesting audio streams like 192.168.50.120)
    for (const ip of activeStreamIps) {
      if (ip && ip !== '127.0.0.1' && ip !== 'localhost') {
        const cleanIp = ip.trim();
        const existingWithIp = Array.from(mergedMap.values()).find(d => d.ip === cleanIp);
        if (!existingWithIp) {
          const autoDid = `detected_${cleanIp.replace(/[^0-9]/g, '')}`;
          mergedMap.set(autoDid, {
            did: autoDid,
            model: 'xiaomi.wifispeaker.sound',
            name: `小爱音箱 (局域网 ${cleanIp})`,
            ip: cleanIp,
            source: 'lan',
            platform: 'miio',
            online: true,
            hardware: 'XiaoAi Smart Speaker',
            existingStatus: {
              playing: true,
              volume: 50,
              muted: false,
              updatedAt: new Date().toISOString()
            }
          });
        }
      }
    }

    // 5. Pass through MIoT Spec: 判断是不是音箱
    const xiaoAiDevices: XiaoAiDevice[] = [];
    const ignoredDevices: IgnoredDevice[] = [];

    for (const item of mergedMap.values()) {
      const evaluation = await this.evaluateMiotSpec(item.model, item.name, item.hardware);

      if (evaluation.isSpeaker) {
        // 是 -> XiaoAi 设备
        const tokenMasked = item.token
          ? `${item.token.slice(0, 4)}••••••••${item.token.slice(-4)}`
          : undefined;

        xiaoAiDevices.push({
          did: item.did,
          deviceID: item.deviceID,
          hardwareDeviceId: item.hardwareDeviceId,
          cloudDid: item.cloudDid,
          model: item.model,
          name: item.name,
          ip: item.ip,
          mac: item.mac,
          token: item.token,
          platform: item.platform,
          source: item.source,
          capabilities: evaluation.capabilities,
          online: item.online,
          isOnline: item.online,
          hardware: item.hardware,
          tokenMasked,
          hasToken: !!item.token,
          status: item.existingStatus || {
            playing: false,
            volume: 45,
            muted: false,
            updatedAt: new Date().toISOString()
          }
        });
      } else {
        // 否 -> 忽略
        ignoredDevices.push({
          did: item.did,
          name: item.name,
          model: item.model,
          reason: evaluation.reason,
          source: item.source,
          ip: item.ip,
          mac: item.mac
        });
      }
    }

    const hybridCount = xiaoAiDevices.filter(d => d.source === 'hybrid').length;

    return {
      xiaoAiDevices,
      ignoredDevices,
      metrics: {
        cloudFound: cloudList.length,
        lanFound: lanList.length,
        hybridMerged: hybridCount,
        speakerConfirmed: xiaoAiDevices.length,
        nonSpeakerIgnored: ignoredDevices.length
      }
    };
  }

  private getLocalSubnets(): string[] {
    const interfaces = os.networkInterfaces();
    const subnets: string[] = [];
    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name] || []) {
        if (net.family === 'IPv4' && !net.internal) {
          const parts = net.address.split('.');
          if (parts.length === 4) {
            subnets.push(`${parts[0]}.${parts[1]}.${parts[2]}`);
          }
        }
      }
    }
    return Array.from(new Set(subnets));
  }
}

export const xiaoaiResolverEngine = new XiaoAiResolverEngine();
