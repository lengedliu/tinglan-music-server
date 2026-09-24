import fs from 'fs';
import path from 'path';

export interface DeviceCapabilities {
  hasPlayControl: boolean;
  hasTts: boolean;
  hasVolumeControl: boolean;
  hasClock?: boolean;
  supportsDlna?: boolean;
  supportsLocalMiio?: boolean;
}

export interface XiaomiDeviceEntity {
  did: string;
  name: string;
  model: string;
  ip?: string;
  token?: string;
  mac?: string;
  platform?: 'mina' | 'miio';
  source?: 'cloud' | 'lan' | 'hybrid';
  online?: boolean;
  isOnline?: boolean;
  capabilities?: DeviceCapabilities;
  hardware?: string;
}

export class DeviceRepository {
  private dataDir: string;
  private devicesFile: string;
  private devices: XiaomiDeviceEntity[] = [];

  constructor(dataDir: string = path.join(process.cwd(), 'data')) {
    this.dataDir = dataDir;
    this.devicesFile = path.join(this.dataDir, 'devices.json');

    this.ensureDirectory();
    this.loadDevices();
  }

  private ensureDirectory() {
    if (!fs.existsSync(this.dataDir)) {
      try {
        fs.mkdirSync(this.dataDir, { recursive: true });
      } catch (err) {
        console.error('[DeviceRepository] Failed to create data dir:', err);
      }
    }
  }

  private loadDevices() {
    try {
      if (fs.existsSync(this.devicesFile)) {
        const raw = fs.readFileSync(this.devicesFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.devices = parsed.map((d: any) => this.normalizeDevice(d));
          console.log(`[DeviceRepository] Loaded ${this.devices.length} devices from disk.`);
          return;
        }
      }
    } catch (err) {
      console.warn('[DeviceRepository] Could not parse devices.json:', err);
    }
    this.devices = [];
  }

  private normalizeDevice(d: any): XiaomiDeviceEntity {
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
      isOnline: d.online ?? d.isOnline ?? false
    };
  }

  public persistDevices() {
    try {
      fs.writeFileSync(this.devicesFile, JSON.stringify(this.devices, null, 2), 'utf-8');
    } catch (err) {
      console.error('[DeviceRepository] Failed to persist devices.json:', err);
    }
  }

  public getAllDevices(): XiaomiDeviceEntity[] {
    return this.devices;
  }

  public getDeviceByDid(did: string): XiaomiDeviceEntity | undefined {
    return this.devices.find((d) => d.did === did);
  }

  public getDeviceByIp(ip: string): XiaomiDeviceEntity | undefined {
    if (!ip) return undefined;
    return this.devices.find((d) => d.ip && ip.includes(d.ip));
  }

  public setDevices(devices: XiaomiDeviceEntity[]): void {
    this.devices = devices.map((d) => this.normalizeDevice(d));
    this.persistDevices();
  }

  public addOrUpdateDevice(device: XiaomiDeviceEntity): void {
    const normalized = this.normalizeDevice(device);
    const idx = this.devices.findIndex((d) => d.did === normalized.did);
    if (idx >= 0) {
      this.devices[idx] = { ...this.devices[idx], ...normalized };
    } else {
      this.devices.push(normalized);
    }
    this.persistDevices();
  }

  public removeDevice(did: string): boolean {
    const idx = this.devices.findIndex((d) => d.did === did);
    if (idx >= 0) {
      this.devices.splice(idx, 1);
      this.persistDevices();
      return true;
    }
    return false;
  }
}

export const deviceRepository = new DeviceRepository();
