import fs from 'fs';
import path from 'path';
import { loadJson, saveJson, getDevicesFilePath } from '../../storage/jsonStorage.js';

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
  platform?: 'mina' | 'miio' | 'miot' | 'dlna' | string;
  source?: 'cloud' | 'lan' | 'hybrid' | string;
  online?: boolean;
  isOnline?: boolean;
  capabilities?: DeviceCapabilities;
  hardware?: string;
  [key: string]: any;
}

export class DeviceRepository {
  private dataDir: string;
  private devices: XiaomiDeviceEntity[] = [];
  private loaded = false;

  constructor(dataDir?: string) {
    // [Fix B2] Empty by default: the real path is resolved lazily. Constructing
    // eagerly at module-import time used to freeze `cwd/data/devices.json`
    // BEFORE server.ts got a chance to apply the DATA_DIR env override —
    // meaning reads landed in one place and (plaintext) writes in another.
    this.dataDir = dataDir || '';
  }

  private get targetDir(): string {
    return this.dataDir || path.dirname(getDevicesFilePath());
  }

  private get devicesFilePath(): string {
    return this.dataDir ? path.join(this.dataDir, 'devices.json') : getDevicesFilePath();
  }

  /**
   * [Fix B2] Load (or re-load) from disk. MUST be invoked after configureStoragePaths
   * so encryption paths are consistent. server.ts calls it after startup wiring.
   */
  public reload(): void {
    this.targetEnsureDirectory();
    this.loadDevices();
  }

  private targetEnsureDirectory() {
    if (!fs.existsSync(this.targetDir)) {
      try {
        fs.mkdirSync(this.targetDir, { recursive: true });
      } catch (err) {
        console.error('[DeviceRepository] Failed to create data dir:', err);
      }
    }
  }

  private loadDevices() {
    // [Fix B2] Route through jsonStorage: transparent token decryption
    // (restoreDevicesFromDisk), atomic read and .bak self-healing are all shared
    // with the rest of the persistence layer.
    const devices = loadJson<XiaomiDeviceEntity[]>(this.devicesFilePath, []);
    if (Array.isArray(devices) && devices.length > 0) {
      this.devices = devices.map((d: any) => this.normalizeDevice(d));
      console.log(`[DeviceRepository] Loaded ${this.devices.length} devices from ${this.devicesFilePath}.`);
    } else {
      this.devices = [];
    }
    this.loaded = true;
  }

  private ensureDevicesLoaded() {
    if (!this.loaded) {
      this.targetEnsureDirectory();
      this.loadDevices();
    }
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
    // [Fix B2] Atomic temp-file write with .bak rotation and at-rest token
    // encryption (prepareDevicesForDisk). immediate=true keeps the previous
    // synchronous-persist semantics of this method.
    this.targetEnsureDirectory();
    saveJson(this.devicesFilePath, this.devices, true);
  }

  public getAllDevices(): XiaomiDeviceEntity[] {
    this.ensureDevicesLoaded();
    return this.devices;
  }

  public getDeviceByDid(did: string): XiaomiDeviceEntity | undefined {
    this.ensureDevicesLoaded();
    return this.devices.find((d) => d.did === did);
  }

  public getDeviceByIp(ip: string): XiaomiDeviceEntity | undefined {
    this.ensureDevicesLoaded();
    if (!ip) return undefined;
    return this.devices.find((d) => d.ip && ip.includes(d.ip));
  }

  public setDevices(devices: XiaomiDeviceEntity[]): void {
    this.ensureDevicesLoaded();
    this.devices = devices.map((d) => this.normalizeDevice(d));
    this.persistDevices();
    this.loaded = true;
  }

  public addOrUpdateDevice(device: XiaomiDeviceEntity): void {
    this.ensureDevicesLoaded();
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
    this.ensureDevicesLoaded();
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
