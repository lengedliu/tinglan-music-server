import dgram from 'dgram';
import os from 'os';

export interface DiscoveredDevice {
  did: string;
  name: string;
  model: string;
  hardware: string;
  ip?: string;
  mac?: string;
  token?: string;
  isOnline: boolean;
  discoverySource: 'local_miio' | 'local_ssdp' | 'cloud_mina' | 'cloud_mihome';
  extra?: any;
}

/**
 * Xiaomi Speaker & MIoT Device Discovery Engine
 * Supports:
 * 1. Fast Subnet miIO UDP 54321 Probing
 * 2. SSDP UPnP MediaRenderer Discovery
 * 3. Mina Cloud API Device Extraction
 * 4. MiHome (api.io.mi.com) Cloud Device List
 */
export class DeviceDiscoveryEngine {
  /**
   * Get host machine local IPv4 subnets
   */
  public getLocalSubnets(): string[] {
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

  /**
   * Fast parallel subnet scan on UDP 54321
   */
  public async scanSubnet(
    subnetPrefix?: string,
    startIp = 1,
    endIp = 254,
    timeoutMs = 2000
  ): Promise<DiscoveredDevice[]> {
    const subnets = subnetPrefix ? [subnetPrefix] : this.getLocalSubnets();
    if (subnets.length === 0) {
      subnets.push('192.168.31');
    }

    const foundMap = new Map<string, DiscoveredDevice>();
    const client = dgram.createSocket('udp4');
    const helloPacket = Buffer.from('21310020ffffffffffffffffffffffffffffffffffffffffffffffffffffffff', 'hex');

    return new Promise((resolve) => {
      client.on('message', (msg, rinfo) => {
        try {
          if (msg.length >= 32 && msg[0] === 0x21 && msg[1] === 0x31) {
            const didNum = msg.readUInt32BE(8);
            const didStr = String(didNum);
            const ip = rinfo.address;

            if (!foundMap.has(ip)) {
              foundMap.set(ip, {
                did: didStr || `did-${Date.now()}`,
                name: `局域网 miIO 设备 (${ip})`,
                model: 'miio.device.unknown',
                hardware: 'miIO-Generic',
                ip,
                isOnline: true,
                discoverySource: 'local_miio'
              });
            }
          }
        } catch {}
      });

      client.on('error', () => {
        try { client.close(); } catch {}
        resolve(Array.from(foundMap.values()));
      });

      // Send broadcast / multi-unicast
      for (const sub of subnets) {
        // Send to standard broadcast .255
        try {
          client.send(helloPacket, 0, helloPacket.length, 54321, `${sub}.255`);
        } catch {}

        // Send unicast probes in batch
        for (let i = startIp; i <= endIp; i++) {
          const targetIp = `${sub}.${i}`;
          try {
            client.send(helloPacket, 0, helloPacket.length, 54321, targetIp);
          } catch {}
        }
      }

      setTimeout(() => {
        try { client.close(); } catch {}
        resolve(Array.from(foundMap.values()));
      }, timeoutMs);
    });
  }

  /**
   * SSDP UPnP Discovery for DLNA MediaRenderer / Speakers
   */
  public async scanSsdp(timeoutMs = 2500): Promise<DiscoveredDevice[]> {
    const discovered: DiscoveredDevice[] = [];
    const client = dgram.createSocket('udp4');
    const ssdpMsg = 
      'M-SEARCH * HTTP/1.1\r\n' +
      'HOST: 239.255.255.250:1900\r\n' +
      'MAN: "ssdp:discover"\r\n' +
      'MX: 2\r\n' +
      'ST: urn:schemas-upnp-org:device:MediaRenderer:1\r\n\r\n';

    return new Promise((resolve) => {
      client.on('message', (msg, rinfo) => {
        const text = msg.toString();
        if (text.includes('MediaRenderer') || text.includes('XiaoAi') || text.includes('Xiaomi') || text.includes('MiSound')) {
          const ip = rinfo.address;
          if (!discovered.some(d => d.ip === ip)) {
            discovered.push({
              did: `ssdp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              name: `UPnP 串流音箱 (${ip})`,
              model: 'xiaomi.wifispeaker.upnp',
              hardware: 'UPnP/DLNA',
              ip,
              isOnline: true,
              discoverySource: 'local_ssdp'
            });
          }
        }
      });

      try {
        client.send(ssdpMsg, 0, ssdpMsg.length, 1900, '239.255.255.250');
      } catch {}

      setTimeout(() => {
        try { client.close(); } catch {}
        resolve(discovered);
      }, timeoutMs);
    });
  }

  /**
   * Cloud Mina API Device Discovery
   */
  public async scanMinaCloud(userId: string, serviceToken: string): Promise<DiscoveredDevice[]> {
    if (!userId || !serviceToken) return [];

    const reqId = Date.now();
    const endpoints = [
      `https://api2.mina.mi.com/admin/v2/device_list?master=0&requestId=app_ios_${reqId}`,
      `https://api2.mina.mi.com/admin/v2/device_list?master=1&requestId=app_ios_${reqId}`,
      `https://user.app.mina.mi.com/v2/device_list?master=0`,
      `https://api.mina.mi.com/admin/v2/device_list?master=0`
    ];

    const results: DiscoveredDevice[] = [];

    for (const ep of endpoints) {
      try {
        const res = await fetch(ep, {
          headers: {
            'User-Agent': 'MISoundBox/1.4.0 (iPhone; iOS 14.4; Scale/3.00)',
            'Cookie': `userId=${userId}; serviceToken=${serviceToken}`
          }
        });

        if (!res.ok) continue;
        const text = await res.text();
        const json = JSON.parse(text);
        const list = json?.data || json?.result || (Array.isArray(json) ? json : []);

        if (Array.isArray(list) && list.length > 0) {
          for (const item of list) {
            const did = String(item.miotDID || item.deviceID || item.did || item.serialNumber || '');
            if (!did || results.some(r => r.did === did)) continue;

            const name = String(item.alias || item.name || item.device_name || item.title || '小米智能音箱').replace(/\s*[\(（]点击(右侧)?编辑[\)）]/g, '').trim();
            const hardware = item.hardware || item.model || 'XiaoAi';
            const model = item.model || `xiaomi.wifispeaker.${hardware.toLowerCase()}`;
            const ip = item.currentIp || item.device_ip || item.ip || item.local_ip || item.localip || undefined;

            results.push({
              did,
              name,
              model,
              hardware,
              ip,
              mac: item.mac || undefined,
              token: item.token || undefined,
              isOnline: item.presence === 'online' || item.online !== false,
              discoverySource: 'cloud_mina'
            });
          }
        }
      } catch {}
    }

    return results;
  }
}

export const deviceDiscoveryEngine = new DeviceDiscoveryEngine();
