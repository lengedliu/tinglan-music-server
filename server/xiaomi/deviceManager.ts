import { deviceRepository, XiaomiDeviceEntity } from '../core/repositories/deviceRepository.js';

export interface XiaomiDevice extends XiaomiDeviceEntity {
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

  constructor(dataDir?: string) {
    this.dataDir = dataDir || process.cwd();
  }

  public enrichHardwareProfiles() {
    const devs = deviceRepository.getAllDevices();
    devs.forEach((d: any) => {
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
    deviceRepository.persistDevices();
  }

  public getAll(): XiaomiDevice[] {
    this.enrichHardwareProfiles();
    return deviceRepository.getAllDevices() as XiaomiDevice[];
  }

  public reload(): void {
    // Reloaded from deviceRepository
    this.enrichHardwareProfiles();
  }

  public getByDid(did: string): XiaomiDevice | undefined {
    return deviceRepository.getDeviceByDid(did) as XiaomiDevice | undefined;
  }

  public getByIp(ip: string): XiaomiDevice | undefined {
    if (!ip) return undefined;
    const cleanIp = ip.replace(/^::ffff:/, '');
    return deviceRepository.getDeviceByIp(cleanIp) as XiaomiDevice | undefined;
  }

  public setDevices(newDevices: XiaomiDevice[]) {
    deviceRepository.setDevices(newDevices as any[]);
    this.enrichHardwareProfiles();
  }

  public updateDevice(did: string, updates: Partial<XiaomiDevice>): XiaomiDevice | null {
    const dev = deviceRepository.getDeviceByDid(did);
    if (!dev) return null;
    const merged = { ...dev, ...updates };
    deviceRepository.addOrUpdateDevice(merged as any);
    this.enrichHardwareProfiles();
    return deviceRepository.getDeviceByDid(did) as XiaomiDevice;
  }

  public updatePlaybackState(did: string, isPlaying: boolean, trackName?: string, volume?: number) {
    const dev = deviceRepository.getDeviceByDid(did);
    if (dev) {
      const updates: any = { isPlaying };
      if (trackName !== undefined) updates.currentTrack = trackName;
      if (volume !== undefined) updates.currentVolume = volume;
      deviceRepository.addOrUpdateDevice({ ...dev, ...updates } as any);
    }
  }
}

export const deviceManager = new DeviceManager();

