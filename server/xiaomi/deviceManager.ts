import fs from 'fs';
import path from 'path';

export interface XiaomiDevice {
  did: string;
  name: string;
  model: string;
  mac?: string;
  ip?: string;
  token?: string;
  online?: boolean;
  deviceType?: 'speaker' | 'touchscreen' | 'soundbar' | 'clock';
  currentVolume?: number;
  currentTrack?: string;
  isPlaying?: boolean;
  room?: string;
  customAlias?: string;
  lastSeen?: string;
  hardwareProfile?: {
    isTouchscreen: boolean;
    supportsMicoUbus: boolean;
    supportsDlna: boolean;
    requiresAppIos: boolean;
    optimalPlayType: 0 | 1;
  };
}

export const TOUCHSCREEN_MODELS = ['LX04', 'X08A', 'X08C', 'X08E', 'X10A', 'xiaomi.wifispeaker.lx04', 'xiaomi.wifispeaker.x08a'];
export const PRO_SOUND_MODELS = ['OH2P', 'L16A', 'LX06', 'Xiaomi Sound', 'xiaomi.wifispeaker.l16a', 'xiaomi.wifispeaker.lx06'];
export const PLAY_MODELS = ['LX05', 'L05B', 'L05C', 'L07A', 'xiaomi.wifispeaker.lx05', 'xiaomi.wifispeaker.l05c'];

export class DeviceManager {
  private dataDir: string;
  private devicesFile: string;
  private devices: XiaomiDevice[] = [];

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.devicesFile = path.join(dataDir, 'devices.json');
    this.loadDevices();
  }

  private loadDevices() {
    try {
      if (fs.existsSync(this.devicesFile)) {
        const raw = fs.readFileSync(this.devicesFile, 'utf-8');
        this.devices = JSON.parse(raw) as XiaomiDevice[];
        this.enrichHardwareProfiles();
      } else {
        this.devices = [
          {
            did: 'dev-001',
            name: '客厅 Xiaomi Sound Pro',
            model: 'xiaomi.wifispeaker.l16a',
            mac: '68:AB:12:34:56:78',
            ip: '192.168.31.50',
            online: true,
            deviceType: 'speaker',
            currentVolume: 45,
            room: '客厅'
          },
          {
            did: 'dev-002',
            name: '主卧 小爱触屏音箱 Pro 8',
            model: 'xiaomi.wifispeaker.x08a',
            mac: '68:AB:12:34:56:79',
            ip: '192.168.31.51',
            online: true,
            deviceType: 'touchscreen',
            currentVolume: 30,
            room: '主卧'
          }
        ];
        this.enrichHardwareProfiles();
        this.saveDevices();
      }
    } catch (err) {
      console.warn('[DeviceManager] Could not load devices.json:', err);
      this.devices = [];
    }
  }

  public enrichHardwareProfiles() {
    this.devices.forEach(d => {
      const modelUpper = (d.model || '').toUpperCase();
      const isTouch = TOUCHSCREEN_MODELS.some(m => modelUpper.includes(m.toUpperCase())) || d.deviceType === 'touchscreen';
      d.hardwareProfile = {
        isTouchscreen: isTouch,
        supportsMicoUbus: true,
        supportsDlna: true,
        requiresAppIos: true,
        optimalPlayType: isTouch ? 0 : 1
      };
    });
  }

  public saveDevices() {
    try {
      fs.writeFileSync(this.devicesFile, JSON.stringify(this.devices, null, 2), 'utf-8');
    } catch (err) {
      console.error('[DeviceManager] Failed to save devices.json:', err);
    }
  }

  public getAll(): XiaomiDevice[] {
    return this.devices;
  }

  public getByDid(did: string): XiaomiDevice | undefined {
    return this.devices.find(d => d.did === did);
  }

  public getByIp(ip: string): XiaomiDevice | undefined {
    if (!ip) return undefined;
    const cleanIp = ip.replace(/^::ffff:/, '');
    return this.devices.find(d => d.ip && cleanIp.includes(d.ip));
  }

  public setDevices(newDevices: XiaomiDevice[]) {
    this.devices = newDevices;
    this.enrichHardwareProfiles();
    this.saveDevices();
  }

  public updateDevice(did: string, updates: Partial<XiaomiDevice>): XiaomiDevice | null {
    const dev = this.devices.find(d => d.did === did);
    if (!dev) return null;
    Object.assign(dev, updates);
    this.enrichHardwareProfiles();
    this.saveDevices();
    return dev;
  }

  public updatePlaybackState(did: string, isPlaying: boolean, trackName?: string, volume?: number) {
    const dev = this.devices.find(d => d.did === did);
    if (dev) {
      dev.isPlaying = isPlaying;
      if (trackName !== undefined) dev.currentTrack = trackName;
      if (volume !== undefined) dev.currentVolume = volume;
      this.saveDevices();
    }
  }
}
