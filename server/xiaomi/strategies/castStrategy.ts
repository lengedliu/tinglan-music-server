import { XiaomiDevice } from '../deviceManager.js';
import { CastResult, CastStep } from '../xiaomiAdapter.js';

export interface CastContext {
  targetDevice: XiaomiDevice;
  streamUrl: string;
  songTitle: string;
  songArtist?: string;
  duration?: number;
  castMode?: 'auto' | 'cdn_direct' | 'xiaoai_directive' | 'lan_stream';
  miotConfig: any;
  callMinaCloudApiFn: (path: string, method: string, message: any, deviceId?: string, retryCount?: number) => Promise<any>;
  sendMiioCommandFn: (ip: string, token: string, method: string, params: any, timeoutMs?: number) => Promise<any>;
  verifyStreamConsumed: (tierName: string) => Promise<boolean>;
  steps: CastStep[];
  nowStr: () => string;
}

export interface ICastStrategy {
  name: string;
  priority: number;
  canHandle(ctx: CastContext): boolean;
  execute(ctx: CastContext): Promise<CastResult | null>;
}
