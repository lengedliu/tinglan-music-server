import dgram from 'dgram';
import os from 'os';
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
}

export interface LanDiscoveredItem {
  did: string;
  ip: string;
  online: boolean;
  latency?: number;
}

export interface CloudDiscoveredItem {
  did: string;
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
  'xiaomi.wifispeaker.lx06': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false, supportsDlna: true },
  'xiaomi.wifispeaker.lx04': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: true, supportsDlna: true },
  'xiaomi.wifispeaker.lx01': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false },
  'xiaomi.wifispeaker.l06a': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false, supportsDlna: true },
  'xiaomi.wifispeaker.l15a': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false, supportsDlna: true },
  'xiaomi.wifispeaker.l16a': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false, supportsDlna: true },
  'xiaomi.wifispeaker.s12': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false },
  'xiaomi.wifispeaker.s12a': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false },
  'xiaomi.wifispeaker.sound': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false, supportsDlna: true },
  'xiaomi.wifispeaker.soundpro': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false, supportsDlna: true },
  'xiaomi.wifispeaker.m03a': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false },
  'xiaomi.wifispeaker.x08a': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: true, supportsDlna: true },
  'xiaomi.wifispeaker.x08c': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: true, supportsDlna: true },
  'xiaomi.wifispeaker.x10a': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: true, supportsDlna: true },
  'xiaomi.speaker.x08e': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: true, supportsDlna: true },
  'xiaomi.speaker.l07a': { hasPlayControl: true, hasTts: true, hasVolumeControl: true, hasClock: false }
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
export class XiaoAiResolverEngine {
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
  public async discoverCloudDevices(userId: string, serviceToken: string): Promise<CloudDiscoveredItem[]> {
    if (!userId || !serviceToken) return [];

    const cleanUid = String(userId).replace(/^["']|["']$/g, '').replace(/;$/, '').trim();
    const cleanToken = String(serviceToken).replace(/^["']|["']$/g, '').replace(/;$/, '').trim();

    if (!cleanUid || cleanUid === 'undefined' || cleanUid === 'null' || !cleanToken || cleanToken === 'undefined' || cleanToken === 'null') {
      return [];
    }

    const cloudMap = new Map<string, CloudDiscoveredItem>();
    const reqId = Date.now();
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
      `https://api2.pv.mina.mi.com/admin/v2/device_list`,
      `https://api.io.mi.com/app/v2/home/device_list`
    ];

    // Query Mina & MiHome Cloud APIs (China Region first)
    for (const ep of minaEndpoints) {
      try {
        const isMiot = ep.includes('io.mi.com');
        const headers: Record<string, string> = {
          'User-Agent': isMiot 
            ? 'MiHome/6.0.0 (com.xiaomi.mihome; build:20210219; iOS 14.4.0)'
            : 'MISoundBox/1.4.0 (iPhone; iOS 14.4; Scale/3.00)',
          'Cookie': `userId=${cleanUid}; serviceToken=${cleanToken}`
        };

        const res = await fetch(ep, { headers });
        if (!res.ok) continue;

        const text = await res.text();
        let minaData: any;
        try {
          minaData = JSON.parse(text);
        } catch {
          continue;
        }

        const list = extractDevicesFromMinaResponse(minaData);

        if (Array.isArray(list) && list.length > 0) {
          for (const item of list) {
            const did = String(
              item.miotDID || 
              item.deviceID || 
              item.device_id || 
              item.did || 
              item.id || 
              item.serialNumber || 
              item.mac || 
              ''
            );
            if (!did || cloudMap.has(did)) continue;

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

            cloudMap.set(did, {
              did,
              model,
              name: cleanName,
              ip,
              mac: item.mac || item.mac_address || undefined,
              token: item.token || item.device_token || undefined,
              hardware,
              online: item.presence === 'online' || item.online === true || item.status === 1 || item.isOnline === true || (item.online !== false && item.presence !== 'offline'),
              raw: item
            });
          }
        }
      } catch (err: any) {
        console.warn(`[XiaoAi Resolver] Cloud query error (${ep}):`, err.message);
      }
    }

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
        try {
          const res = await fetch(region.url, {
            headers: {
              'User-Agent': 'MiHome/6.0.0 (com.xiaomi.mihome; build:20210219; iOS 14.4.0)',
              'Cookie': `userId=${cleanUid}; serviceToken=${cleanToken}`
            },
            signal: AbortSignal.timeout(2500)
          });
          if (!res.ok) continue;
          const text = await res.text();
          let data: any;
          try {
            data = JSON.parse(text);
          } catch {
            continue;
          }
          const list = extractDevicesFromMinaResponse(data);
          if (Array.isArray(list) && list.length > 0) {
            console.log(`[XiaoAi Resolver] Auto-detected ${list.length} devices in overseas region: ${region.name} (${region.code})`);
            for (const item of list) {
              const did = String(item.miotDID || item.deviceID || item.did || item.id || item.mac || '');
              if (!did || cloudMap.has(did)) continue;
              const rawName = item.alias || item.name || item.device_name || '小米音箱';
              const cleanName = String(rawName).replace(/\s*[\(（]点击(右侧)?编辑[\)）]/g, '').trim();
              const hardware = item.hardware || item.model || 'XiaoAi';
              const model = item.model || (item.hardware ? `xiaomi.wifispeaker.${item.hardware.toLowerCase()}` : 'xiaomi.wifispeaker');
              cloudMap.set(did, {
                did,
                model,
                name: `${cleanName} [${region.code.toUpperCase()}]`,
                ip: item.currentIp || item.localip || undefined,
                mac: item.mac || undefined,
                token: item.token || undefined,
                hardware,
                online: item.isOnline === true || item.presence === 'online',
                raw: item
              });
            }
            break; // Matched region successfully
          }
        } catch {}
      }
    }

    return Array.from(cloudMap.values());
  }

  /**
   * 3. MIoT Spec Evaluation: 判断是不是音箱
   * Queries MIoT Spec or checks model capabilities against official schema.
   */
  public async evaluateMiotSpec(model: string): Promise<{ isSpeaker: boolean; capabilities: DeviceCapabilities; reason: string }> {
    const normalizedModel = (model || '').toLowerCase().trim();

    // 0. miIO UDP 54321 packet alone does NOT mean the device is an XiaoAi speaker!
    // Many Xiaomi IoT devices (air purifiers, vacuum robots, smart plugs, light bulbs, gateways, cameras)
    // respond to miIO UDP 54321. Without cloud model resolution or token-based miIO.info, model is unknown.
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
    if (/wifispeaker|speaker|xiaoai|soundbox|sound/i.test(normalizedModel)) {
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
    subnetPrefix?: string;
    existingDevices?: any[];
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
    const { userId = '', serviceToken = '', subnetPrefix, existingDevices = [] } = options;

    // Run LAN Discovery and Cloud Discovery in parallel
    const [lanList, cloudList] = await Promise.all([
      this.discoverLanDevices(subnetPrefix, 2000),
      this.discoverCloudDevices(userId, serviceToken)
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

    // 1. Process Cloud devices
    for (const [did, cDev] of cloudMap.entries()) {
      const lanMatch = lanMap.get(did);
      const exDev = existingMap.get(did);

      if (lanMatch) {
        // Hybrid: Exists in both Cloud and LAN
        mergedMap.set(did, {
          did,
          model: cDev.model,
          name: cDev.name,
          ip: lanMatch.ip,
          mac: cDev.mac || exDev?.mac,
          token: cDev.token || exDev?.token,
          source: 'hybrid',
          platform: (cDev.token || exDev?.token) ? 'miio' : 'mina',
          online: true,
          hardware: cDev.hardware,
          existingStatus: exDev?.status
        });
      } else {
        // Cloud-only: LAN IP not discovered yet (unless available from Cloud API or verified existing IP)
        const resolvedIp = cDev.ip || exDev?.ip || undefined;
        mergedMap.set(did, {
          did,
          model: cDev.model,
          name: cDev.name,
          ip: resolvedIp,
          mac: cDev.mac || exDev?.mac,
          token: cDev.token || exDev?.token,
          source: resolvedIp ? 'hybrid' : 'cloud',
          platform: 'mina',
          online: cDev.online,
          hardware: cDev.hardware,
          existingStatus: exDev?.status
        });
      }
    }

    // 2. Process LAN-only devices
    // IMPORTANT: miIO UDP 54321 response alone only indicates a miIO device exists on the LAN.
    // It could be an air purifier, vacuum robot, light bulb, smart plug, gateway, etc.
    // It is NEVER automatically assumed to be an XiaoAi speaker!
    for (const [did, lDev] of lanMap.entries()) {
      if (!mergedMap.has(did)) {
        const exDev = existingMap.get(did);
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

        // If still no model, mark it as unknown miIO device (DO NOT fake or assume it is a speaker!)
        if (!model) {
          model = 'miio.device.unknown';
          name = `局域网 miIO 设备 (${lDev.ip})`;
        }

        mergedMap.set(did, {
          did,
          model,
          name: name || `局域网 miIO 设备 (${lDev.ip})`,
          ip: lDev.ip,
          mac: exDev?.mac,
          token: exDev?.token,
          source: 'lan',
          platform: 'miio',
          online: true,
          hardware: exDev?.hardware || 'miIO-Generic',
          existingStatus: exDev?.status
        });
      }
    }

    // 3. Keep manual / existing devices if they were not scanned this round
    for (const [did, exDev] of existingMap.entries()) {
      if (!mergedMap.has(did)) {
        mergedMap.set(did, {
          did,
          model: exDev.model || 'miio.device.unknown',
          name: exDev.name || '小米智能设备',
          ip: exDev.ip,
          mac: exDev.mac,
          token: exDev.token,
          source: exDev.source || (exDev.ip ? 'lan' : 'cloud'),
          platform: exDev.platform || (exDev.token && exDev.ip ? 'miio' : 'mina'),
          online: exDev.isOnline ?? exDev.online ?? false,
          hardware: exDev.hardware,
          existingStatus: exDev.status
        });
      }
    }

    // 4. Pass through MIoT Spec: 判断是不是音箱
    const xiaoAiDevices: XiaoAiDevice[] = [];
    const ignoredDevices: IgnoredDevice[] = [];

    for (const item of mergedMap.values()) {
      const evaluation = await this.evaluateMiotSpec(item.model);

      if (evaluation.isSpeaker) {
        // 是 -> XiaoAi 设备
        const tokenMasked = item.token
          ? `${item.token.slice(0, 4)}••••••••${item.token.slice(-4)}`
          : undefined;

        xiaoAiDevices.push({
          did: item.did,
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
          source: item.source
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
