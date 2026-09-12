import { XiaomiDevice, DeviceManager } from './deviceManager.js';
import { dlnaEngine } from '../dlnaEngine.js';
import { miotRpcEngine } from '../miotRpc.js';

export interface CastOptions {
  songId: string;
  songTitle: string;
  songArtist?: string;
  streamUrl: string;
  duration?: number;
  castMode?: 'auto' | 'cdn_direct' | 'xiaoai_directive' | 'lan_stream';
}

export interface CastResult {
  success: boolean;
  message: string;
  protocol: string;
  streamUrl: string;
  errorCode?: string;
  warning?: string;
  details?: any;
}

export class XiaomiAdapter {
  private deviceManager: DeviceManager;

  constructor(deviceManager: DeviceManager) {
    this.deviceManager = deviceManager;
  }

  /**
   * Cast a stream URL to target XiaoAi speaker with automatic multi-tier fallback
   */
  public async playUrl(
    targetDevice: XiaomiDevice,
    streamUrl: string,
    songTitle: string,
    callMinaCloudApiFn: (path: string, method: string, message: any, deviceId?: string, retryCount?: number) => Promise<any>,
    sendMiioCommandFn: (ip: string, token: string, method: string, params: any, timeoutMs?: number) => Promise<any>,
    miotConfig: any
  ): Promise<CastResult> {
    const isTouchscreen = targetDevice.hardwareProfile?.isTouchscreen || false;
    let cloudResult: any = null;
    let localMiioResult: any = null;
    let dlnaResult: any = null;

    const activeMicoToken = miotConfig.micoServiceToken || miotConfig.serviceToken;
    const isXiaoaiAccountActive = Boolean(miotConfig.isLoggedIn && activeMicoToken && miotConfig.userId);

    // 1. Tier 1: Xiaomi Mina Cloud UBUS (micoapi) - Highest Reliability
    if (isXiaoaiAccountActive) {
      try {
        // Model-aware command sequencing:
        // Touchscreen models prefer type: 0
        // Standard & Pro / Sound models prefer type: 1, media: "app_ios"
        const primaryPlayType = isTouchscreen ? 0 : 1;
        
        cloudResult = await callMinaCloudApiFn(
          'mediaplayer',
          'player_play_url',
          { url: streamUrl, type: primaryPlayType, media: 'app_ios' },
          targetDevice.did
        );

        if (!cloudResult?.success) {
          // Fallback 1: flip playType
          const fallbackPlayType = isTouchscreen ? 1 : 0;
          cloudResult = await callMinaCloudApiFn(
            'mediaplayer',
            'player_play_url',
            { url: streamUrl, type: fallbackPlayType, media: 'app_ios' },
            targetDevice.did
          );
        }

        if (!cloudResult?.success) {
          // Fallback 2: player_play_music
          cloudResult = await callMinaCloudApiFn(
            'mediaplayer',
            'player_play_music',
            { url: streamUrl, media: 'app_ios' },
            targetDevice.did
          );
        }

        if (cloudResult?.success) {
          this.deviceManager.updatePlaybackState(targetDevice.did, true, songTitle);
          return {
            success: true,
            message: `已通过小米云端 (UBUS player_play_url) 成功投播到【${targetDevice.name}】`,
            protocol: 'MiService Mina Cloud UBUS',
            streamUrl,
            details: cloudResult
          };
        }
      } catch (cloudErr: any) {
        console.warn(`[XiaomiAdapter] Cloud UBUS cast failed for ${targetDevice.did}:`, cloudErr.message);
      }
    }

    // 2. Tier 2: MIoT Cloud Action RPC (siid=3, piid=1 or siid=2, piid=1)
    if (isXiaoaiAccountActive && miotConfig.ssecurity) {
      try {
        const rpcRes = await miotRpcEngine.executeAction(
          targetDevice,
          3, // siid: playControl
          1, // aiid: playUrl
          [streamUrl],
          {
            userId: String(miotConfig.userId),
            serviceToken: miotConfig.xiaomiioServiceToken || activeMicoToken,
            ssecurity: miotConfig.ssecurity
          }
        );
        if (rpcRes.code === 0 || rpcRes.result) {
          this.deviceManager.updatePlaybackState(targetDevice.did, true, songTitle);
          return {
            success: true,
            message: `已通过 MIoT 云端 Action 成功投播到【${targetDevice.name}】`,
            protocol: 'MIoT Cloud Action RPC',
            streamUrl,
            details: rpcRes
          };
        }
      } catch (rpcErr: any) {
        console.warn(`[XiaomiAdapter] MIoT Cloud Action failed:`, rpcErr.message);
      }
    }

    // 3. Tier 3: Local miIO UDP (Port 54321)
    if (targetDevice.ip && targetDevice.token) {
      try {
        localMiioResult = await sendMiioCommandFn(
          targetDevice.ip,
          targetDevice.token,
          'play_url',
          { url: streamUrl, media: 'app_ios' },
          2500
        );
        if (localMiioResult?.result === 'ok' || localMiioResult?.success) {
          this.deviceManager.updatePlaybackState(targetDevice.did, true, songTitle);
          return {
            success: true,
            message: `已通过局域网 miIO UDP (54321) 成功下发播放到【${targetDevice.name}】`,
            protocol: 'miIO UDP (54321)',
            streamUrl,
            details: localMiioResult
          };
        }
      } catch (localErr: any) {
        console.warn(`[XiaomiAdapter] Local miIO UDP failed:`, localErr.message);
      }
    }

    // 4. Tier 4: DLNA UPnP AVTransport
    if (targetDevice.ip) {
      try {
        dlnaResult = await dlnaEngine.castSong(targetDevice.ip, streamUrl, { title: songTitle });
        if (dlnaResult.success) {
          this.deviceManager.updatePlaybackState(targetDevice.did, true, songTitle);
          return {
            success: true,
            message: `已通过局域网 DLNA UPnP 成功推送到【${targetDevice.name}】`,
            protocol: 'DLNA / UPnP AVTransport',
            streamUrl,
            details: dlnaResult
          };
        }
      } catch (dlnaErr: any) {
        console.warn(`[XiaomiAdapter] DLNA fallback failed:`, dlnaErr.message);
      }
    }

    return {
      success: false,
      message: `投放指令发送失败：音箱未能响应 Cloud UBUS、MIoT Action、miIO 及 DLNA 协议。请检查网络连通性与小米账号登录态。`,
      protocol: 'Auto Fallback Exhausted',
      streamUrl,
      errorCode: 'ERR_ALL_PROTOCOLS_FAILED'
    };
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
    const activeMicoToken = miotConfig.micoServiceToken || miotConfig.serviceToken;
    const isXiaoaiAccountActive = Boolean(miotConfig.isLoggedIn && activeMicoToken && miotConfig.userId);

    if (isXiaoaiAccountActive) {
      try {
        const res = await callMinaCloudApiFn(
          'mediaplayer',
          'player_play_operation',
          { action: operation },
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
    const activeMicoToken = miotConfig.micoServiceToken || miotConfig.serviceToken;
    const isXiaoaiAccountActive = Boolean(miotConfig.isLoggedIn && activeMicoToken && miotConfig.userId);

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

    return {
      success: false,
      message: `音量设置指令发送失败`
    };
  }
}
