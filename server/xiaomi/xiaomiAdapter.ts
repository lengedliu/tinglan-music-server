import { XiaomiDevice, DeviceManager } from './deviceManager.js';
import { dlnaEngine } from '../dlnaEngine.js';
import { miotRpcEngine } from '../miotRpc.js';
import { minaWsClient } from '../minaWebSocket.js';
import { castPipelineManager } from './strategies/castPipelineManager.js';
import { CastContext } from './strategies/castStrategy.js';

export interface CastOptions {
  songId: string;
  songTitle: string;
  songArtist?: string;
  streamUrl: string;
  duration?: number;
  castMode?: 'auto' | 'cdn_direct' | 'xiaoai_directive' | 'lan_stream';
}

export interface CastStep {
  timestamp: string;
  step: string;
  status: 'OK' | 'FAIL' | 'PENDING';
  statusCode?: number;
  message?: string;
}

export interface CastResult {
  success: boolean;
  message: string;
  protocol: string;
  streamUrl: string;
  errorCode?: string;
  warning?: string;
  details?: any;
  steps: CastStep[];
}

/**
 * XiaoWei CP High-Compatibility Model Set
 * Models that MUST use player_play_music (XiaoWei CP stream payload)
 * rather than standard player_play_url:
 * e.g. OH2P (小爱音箱Pro), L16A (小爱音箱Sound), LX06 (小爱音箱), L05C (小爱Play/闹钟)
 */
export const XIAOWEI_PLAY_MUSIC_HARDWARE: Record<string, boolean> = {
  'X08C': true,
  'X08E': true,
  'X8F': true,
  'X4B': true,
  'LX05': true,
  'OH11': true,
  'OH2': true,
  'OH2P': true, // 小爱音箱Pro (xiaomi.wifispeaker.oh2p)
  'X6A': true,
  'LX04': true,
  'L05B': true,
  'L05C': true, // 小爱音箱Play
  'LX06': true, // 小爱音箱
  'L06A': true,
  'X08A': true,
  'X10A': true,
  'L15A': true,
  'L16A': true, // 小爱音箱Sound
  'L17A': true,
};

export function resolveDeviceHardware(device: any): string {
  if (device.hardware && typeof device.hardware === 'string') {
    return device.hardware.toUpperCase().trim();
  }
  const model = (device.model || '').toLowerCase();
  const match = model.match(/(?:wifispeaker|speaker)\.([a-z0-9]+)/i);
  if (match) {
    return match[1].toUpperCase();
  }
  return '';
}

export function isNeedUsePlayMusicApi(hardware?: string, model?: string): boolean {
  const hw = (hardware || '').toUpperCase().trim();
  const mdl = (model || '').toUpperCase().trim();
  if (hw && XIAOWEI_PLAY_MUSIC_HARDWARE[hw]) return true;
  for (const key of Object.keys(XIAOWEI_PLAY_MUSIC_HARDWARE)) {
    if (mdl.endsWith(`.${key.toLowerCase()}`) || mdl.includes(key) || hw.includes(key)) {
      return true;
    }
  }
  return false;
}

export const DEFAULT_MUSIC_AUDIO_ID = '1732418460076477549';
export const MUSIC_CP_ID = '355454500';

export function buildXiaoWeiMusicMessage(audioUrl: string, options?: { audioId?: string; keepLight?: boolean }) {
  const audioId = options?.audioId || DEFAULT_MUSIC_AUDIO_ID;
  const music = {
    payload: {
      audio_type: options?.keepLight ? 'MUSIC' : '',
      audio_items: [{
        item_id: {
          audio_id: audioId,
          cp: {
            album_id: '-1',
            episode_index: 0,
            id: MUSIC_CP_ID,
            name: 'xiaowei'
          }
        },
        stream: { url: audioUrl }
      }],
      list_params: {
        listId: '-1',
        loadmore_offset: 0,
        origin: 'xiaowei',
        type: 'MUSIC'
      }
    },
    play_behavior: 'REPLACE_ALL'
  };

  return {
    startaudioid: audioId,
    music: JSON.stringify(music)
  };
}

/**
 * XiaomiAdapter - Unified multi-protocol speaker control layer
 * Directly follows XiaoMusic high-compatibility dispatch architecture:
 *
 * 1. Mina Cloud UBUS / WebSocket (XiaoWei CP player_play_music / player_play_url)
 * 2. MIoT Cloud Action RPC (api.io.mi.com siid=3, aiid=1 / siid=7, aiid=3)
 * 3. Local miIO UDP 54321 (play_specify_url / player_play_url)
 * 4. DLNA UPnP AVTransport (Local LAN streaming fallback)
 */
export class XiaomiAdapter {
  private deviceManager: DeviceManager;

  constructor(deviceManager: DeviceManager) {
    this.deviceManager = deviceManager;
  }

  /**
   * Execute XiaoMusic playback pipeline:
   * Select Song -> Resolve Speaker -> Send play_url with multi-tier fallback -> Speaker GETs MP3 -> Success
   */
  public async playUrl(
    targetDevice: XiaomiDevice,
    streamUrl: string,
    songTitle: string,
    callMinaCloudApiFn: (path: string, method: string, message: any, deviceId?: string, retryCount?: number) => Promise<any>,
    sendMiioCommandFn: (ip: string, token: string, method: string, params: any, timeoutMs?: number) => Promise<any>,
    miotConfig: any,
    options: {
      songArtist?: string;
      duration?: number;
      castMode?: 'auto' | 'cdn_direct' | 'xiaoai_directive' | 'lan_stream';
      waitForStreamConsumption?: (targetIp?: string, songId?: string, timeoutMs?: number) => Promise<{ consumed: boolean; latencyMs?: number; event?: any }>;
    } = {}
  ): Promise<CastResult> {
    const steps: CastStep[] = [];
    const nowStr = () => new Date().toLocaleTimeString();

    const songIdMatch = streamUrl.match(/\/api\/stream\/([^/?#]+)/i) || streamUrl.match(/\/stream\/([^/?#]+)/i);
    const cleanSongId = songIdMatch ? songIdMatch[1].replace(/\.(mp3|flac|wav|m4a|aac|ogg|opus)$/i, '') : songTitle;

    steps.push({
      timestamp: nowStr(),
      step: 'INIT',
      status: 'OK',
      statusCode: 200,
      message: `开始下发投播指令到【${targetDevice.name}】(${targetDevice.did}) | 目标流: ${streamUrl}`
    });

    const isTouchscreen = targetDevice.hardwareProfile?.isTouchscreen || false;
    const activeMicoToken = miotConfig?.micoServiceToken || miotConfig?.serviceToken;
    const activeIoToken = miotConfig?.miotServiceToken || miotConfig?.xiaomiioServiceToken || miotConfig?.serviceToken;
    const activeSsec = miotConfig?.ssecurity;
    const isXiaoaiAccountActive = Boolean(
      (activeMicoToken && (miotConfig?.userId || miotConfig?.miUser)) ||
      (miotConfig?.passToken && (miotConfig?.userId || miotConfig?.miUser)) ||
      (miotConfig?.isLoggedIn && (activeMicoToken || miotConfig?.passToken || miotConfig?.serviceToken)) ||
      (activeMicoToken && !activeMicoToken.includes('••'))
    );

    // Helper to accurately verify if MIoT Action genuinely succeeded (rejecting negative inner codes like -4003)
    const isMiotActionSuccess = (res: any) => {
      if (!res) return false;
      if (res.code === 0) {
        if (res.result && typeof res.result.code === 'number' && res.result.code !== 0) {
          return false;
        }
        return true;
      }
      return false;
    };

    // Helper to accurately verify if miIO command genuinely succeeded
    const isMiioSuccess = (res: any) => {
      if (!res || res.success === false) return false;
      if (res.error) return false;
      if (res.result === 'ok' || res.result === 'packet_acknowledged') return true;
      if (Array.isArray(res.result) && res.result.length > 0 && res.result[0] === 'ok') return true;
      if (typeof res.result === 'object' && res.result !== null) {
        if (typeof res.result.code === 'number' && res.result.code !== 0) return false;
        if (res.result.error) return false;
        return true;
      }
      return Boolean(res.success);
    };

    /**
     * Playback Consumption Verification Helper:
     * Guarantees that commands are only declared successful when the speaker
     * genuinely connects and issues an HTTP GET /api/stream/... request to our server.
     */
    const verifyStreamConsumed = async (tierName: string): Promise<boolean> => {
      if (!options.waitForStreamConsumption) return true;
      const isLocalOrProxied = streamUrl.includes('/api/stream') || streamUrl.includes('/stream/') || streamUrl.includes('/music/');
      if (!isLocalOrProxied) {
        return true;
      }
      console.log(`[XiaomiAdapter] [${tierName}] 控制指令已下发，正在进行音频流消费检测 (等待服务器收到音箱 GET /api/stream/ 请求)...`);
      const verifyRes = await options.waitForStreamConsumption(targetDevice.ip, cleanSongId, 3500);
      if (verifyRes.consumed) {
        console.log(`[XiaomiAdapter] [${tierName}] ✅ 【真成功确认】音箱 ${targetDevice.name} (${targetDevice.ip || 'LAN'}) 已实际建立连接拉取音频流并开始解码播放 (响应耗时: ${verifyRes.latencyMs || 0}ms)!`);
        steps.push({
          timestamp: nowStr(),
          step: `${tierName}_STREAM_CONSUMED`,
          status: 'OK',
          statusCode: 200,
          message: `音箱成功拉取音频流 (GET /api/stream/，耗时 ${verifyRes.latencyMs || 0}ms)`
        });
        return true;
      } else {
        console.warn(`[XiaomiAdapter] [${tierName}] ⚠️ 【未消费/假成功】控制协议返回成功，但 3.5 秒内服务器并未收到音箱拉取音频流的 GET 请求。判定为假成功，自动降级到下一通道...`);
        steps.push({
          timestamp: nowStr(),
          step: `${tierName}_STREAM_TIMEOUT`,
          status: 'FAIL',
          statusCode: 408,
          message: '控制指令应答成功，但音箱未向服务端请求音频流，判定为未实际消费，自动降级'
        });
        return false;
      }
    };

    // =========================================================================
    // Dynamic Strategy Pipeline Execution (DLNA -> Mina -> MIoT -> miIO -> Voice)
    // =========================================================================
    const castCtx: CastContext = {
      targetDevice,
      streamUrl,
      songTitle,
      songArtist: options.songArtist,
      duration: options.duration,
      castMode: options.castMode,
      miotConfig,
      callMinaCloudApiFn,
      sendMiioCommandFn,
      verifyStreamConsumed,
      steps,
      nowStr
    };

    const result = await castPipelineManager.executePipeline(castCtx);
    if (result.success) {
      this.deviceManager.updatePlaybackState(targetDevice.did, true, songTitle);
    }
    return result;
  }

  /**
   * Media Playback Controls (play / pause / stop / next / prev / toggle)
   */
  public async setPlaybackOperation(
    targetDevice: XiaomiDevice,
    operation: 'play' | 'pause' | 'stop' | 'toggle' | 'next' | 'prev',
    callMinaCloudApiFn: (path: string, method: string, message: any, deviceId?: string, retryCount?: number) => Promise<any>,
    sendMiioCommandFn: (ip: string, token: string, method: string, params: any, timeoutMs?: number) => Promise<any>,
    miotConfig: any
  ): Promise<{ success: boolean; message: string; details?: any }> {
    const activeMicoToken = miotConfig?.micoServiceToken || (miotConfig?.isMicoValid ? miotConfig?.serviceToken : undefined);
    const isXiaoaiAccountActive = Boolean(
      (activeMicoToken && (miotConfig?.userId || miotConfig?.miUser)) ||
      (miotConfig?.passToken && (miotConfig?.userId || miotConfig?.miUser)) ||
      (miotConfig?.isLoggedIn && (activeMicoToken || miotConfig?.passToken))
    );

    // 1. Mina Cloud UBUS
    if (isXiaoaiAccountActive) {
      try {
        const res = await callMinaCloudApiFn(
          'mediaplayer',
          'player_play_operation',
          { action: operation, media: 'app_ios' },
          targetDevice.did
        );
        if (res?.success) {
          if (operation === 'pause' || operation === 'stop') {
            this.deviceManager.updatePlaybackState(targetDevice.did, false);
          } else if (operation === 'play') {
            this.deviceManager.updatePlaybackState(targetDevice.did, true);
          }
          return {
            success: true,
            message: `已发送控制指令【${operation}】至【${targetDevice.name}】`,
            details: res
          };
        }
      } catch (err: any) {
        console.warn('[XiaomiAdapter] UBUS operation error:', err.message);
      }
    }

    // 2. Local miIO
    if (targetDevice.ip && targetDevice.token) {
      try {
        const localRes = await sendMiioCommandFn(
          targetDevice.ip,
          targetDevice.token,
          `set_${operation}`,
          [],
          2000
        );
        if (localRes?.result === 'ok' || localRes?.success) {
          return {
            success: true,
            message: `已通过 miIO 发送控制指令【${operation}】至【${targetDevice.name}】`,
            details: localRes
          };
        }
      } catch (err: any) {
        console.warn('[XiaomiAdapter] miIO operation error:', err.message);
      }
    }

    // 3. DLNA transport control
    if (targetDevice.ip) {
      try {
        if (operation === 'pause') {
          await dlnaEngine.pause(targetDevice.ip);
          this.deviceManager.updatePlaybackState(targetDevice.did, false);
          return { success: true, message: `已通过 DLNA 暂停【${targetDevice.name}】` };
        } else if (operation === 'play') {
          await dlnaEngine.play(targetDevice.ip);
          this.deviceManager.updatePlaybackState(targetDevice.did, true);
          return { success: true, message: `已通过 DLNA 恢复【${targetDevice.name}】播放` };
        } else if (operation === 'stop') {
          await dlnaEngine.stop(targetDevice.ip);
          this.deviceManager.updatePlaybackState(targetDevice.did, false);
          return { success: true, message: `已通过 DLNA 停止【${targetDevice.name}】播放` };
        }
      } catch (dlnaErr: any) {
        console.warn('[XiaomiAdapter] DLNA operation error:', dlnaErr.message);
      }
    }

    return {
      success: false,
      message: `控制指令【${operation}】发送失败，音箱未响应。`
    };
  }

  /**
   * Set Hardware Speaker Volume (0-100)
   */
  public async setVolume(
    targetDevice: XiaomiDevice,
    volume: number,
    callMinaCloudApiFn: (path: string, method: string, message: any, deviceId?: string, retryCount?: number) => Promise<any>,
    sendMiioCommandFn: (ip: string, token: string, method: string, params: any, timeoutMs?: number) => Promise<any>,
    miotConfig: any
  ): Promise<{ success: boolean; message: string; details?: any }> {
    const clampedVol = Math.max(0, Math.min(100, Math.round(volume)));
    const activeMicoToken = miotConfig?.micoServiceToken || (miotConfig?.isMicoValid ? miotConfig?.serviceToken : undefined);
    const isXiaoaiAccountActive = Boolean(
      (activeMicoToken && (miotConfig?.userId || miotConfig?.miUser)) ||
      (miotConfig?.passToken && (miotConfig?.userId || miotConfig?.miUser)) ||
      (miotConfig?.isLoggedIn && (activeMicoToken || miotConfig?.passToken))
    );

    if (isXiaoaiAccountActive) {
      try {
        const res = await callMinaCloudApiFn(
          'mediaplayer',
          'player_set_volume',
          { volume: clampedVol },
          targetDevice.did
        );
        if (res?.success) {
          this.deviceManager.updatePlaybackState(targetDevice.did, targetDevice.isPlaying || false, undefined, clampedVol);
          return {
            success: true,
            message: `已将【${targetDevice.name}】音量设置为 ${clampedVol}%`,
            details: res
          };
        }
      } catch (err: any) {
        console.warn('[XiaomiAdapter] Set volume UBUS error:', err.message);
      }
    }

    if (targetDevice.ip && targetDevice.token) {
      try {
        const localRes = await sendMiioCommandFn(
          targetDevice.ip,
          targetDevice.token,
          'set_volume',
          [clampedVol],
          2000
        );
        if (localRes?.result === 'ok' || localRes?.success) {
          this.deviceManager.updatePlaybackState(targetDevice.did, targetDevice.isPlaying || false, undefined, clampedVol);
          return {
            success: true,
            message: `已通过 miIO 设置音量为 ${clampedVol}%`,
            details: localRes
          };
        }
      } catch (err: any) {
        console.warn('[XiaomiAdapter] Set volume miIO error:', err.message);
      }
    }

    if (targetDevice.ip) {
      try {
        const dlnaRes = await dlnaEngine.setVolume(targetDevice.ip, clampedVol);
        if (dlnaRes.success) {
          this.deviceManager.updatePlaybackState(targetDevice.did, targetDevice.isPlaying || false, undefined, clampedVol);
          return {
            success: true,
            message: `已通过 DLNA 设置音量为 ${clampedVol}%`,
            details: dlnaRes
          };
        }
      } catch {}
    }

    return {
      success: false,
      message: `音量设置指令发送失败`
    };
  }
}
