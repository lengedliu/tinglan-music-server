import { XiaomiDevice, DeviceManager } from './deviceManager.js';
import { dlnaEngine } from '../dlnaEngine.js';
import { miotRpcEngine } from '../miotRpc.js';
import { minaWsClient } from '../minaWebSocket.js';

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
 * XiaomiAdapter - Unified multi-protocol speaker control layer
 * Directly follows XiaoMusic's reliable 4-tier dispatch architecture:
 *
 * 1. Mina Cloud UBUS / WebSocket (player_play_url + media: app_ios)
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
    } = {}
  ): Promise<CastResult> {
    const steps: CastStep[] = [];
    const nowStr = () => new Date().toLocaleTimeString();

    steps.push({
      timestamp: nowStr(),
      step: 'INIT',
      status: 'OK',
      statusCode: 200,
      message: `开始下发投播指令到【${targetDevice.name}】(${targetDevice.did}) | 目标流: ${streamUrl}`
    });

    const isTouchscreen = targetDevice.hardwareProfile?.isTouchscreen || false;
    const activeMicoToken = miotConfig?.micoServiceToken || miotConfig?.serviceToken;
    const isXiaoaiAccountActive = Boolean(miotConfig?.isLoggedIn && activeMicoToken && miotConfig?.userId);

    // =========================================================================
    // 1. TIER 1: Mina WebSocket & Mina Cloud UBUS (micoapi) - XiaoMusic Gold Standard
    // =========================================================================
    if (isXiaoaiAccountActive) {
      try {
        console.log(`[XiaomiAdapter] [Tier 1] Trying Mina UBUS for ${targetDevice.did}...`);

        // XiaoAi Pro / Sound / Play / Touchscreen standard command sequencing:
        // Try with media: 'app_ios' & appropriate type first
        const primaryPlayType = isTouchscreen ? 0 : 1;
        
        let ubusRes = await callMinaCloudApiFn(
          'mediaplayer',
          'player_play_url',
          { url: streamUrl, type: primaryPlayType, media: 'app_ios' },
          targetDevice.did
        );

        if (ubusRes?.success) {
          steps.push({
            timestamp: nowStr(),
            step: 'MINA_UBUS_PRIMARY',
            status: 'OK',
            statusCode: 200,
            message: `Mina UBUS player_play_url(type=${primaryPlayType}, media=app_ios) 下发成功`
          });
          this.deviceManager.updatePlaybackState(targetDevice.did, true, songTitle);
          return {
            success: true,
            message: `已通过小米云端 (UBUS player_play_url) 成功下发播放到【${targetDevice.name}】`,
            protocol: 'MiService Mina Cloud UBUS (type=' + primaryPlayType + ')',
            streamUrl,
            details: ubusRes,
            steps
          };
        }

        // Sub-fallback A: invert playType
        const altPlayType = isTouchscreen ? 1 : 0;
        ubusRes = await callMinaCloudApiFn(
          'mediaplayer',
          'player_play_url',
          { url: streamUrl, type: altPlayType, media: 'app_ios' },
          targetDevice.did
        );

        if (ubusRes?.success) {
          steps.push({
            timestamp: nowStr(),
            step: 'MINA_UBUS_ALT_TYPE',
            status: 'OK',
            statusCode: 200,
            message: `Mina UBUS player_play_url(type=${altPlayType}, media=app_ios) 备用模式成功`
          });
          this.deviceManager.updatePlaybackState(targetDevice.did, true, songTitle);
          return {
            success: true,
            message: `已通过小米云端 (UBUS player_play_url 备用模式) 成功下发播放到【${targetDevice.name}】`,
            protocol: 'MiService Mina Cloud UBUS (type=' + altPlayType + ')',
            streamUrl,
            details: ubusRes,
            steps
          };
        }

        // Sub-fallback B: player_play_music
        ubusRes = await callMinaCloudApiFn(
          'mediaplayer',
          'player_play_music',
          { music: streamUrl, startOffset: 0, media: 'app_ios' },
          targetDevice.did
        );

        if (ubusRes?.success) {
          steps.push({
            timestamp: nowStr(),
            step: 'MINA_UBUS_PLAY_MUSIC',
            status: 'OK',
            statusCode: 200,
            message: 'Mina UBUS player_play_music(media=app_ios) 成功'
          });
          this.deviceManager.updatePlaybackState(targetDevice.did, true, songTitle);
          return {
            success: true,
            message: `已通过小米云端 (UBUS player_play_music) 成功下发播放到【${targetDevice.name}】`,
            protocol: 'MiService Mina Cloud UBUS (player_play_music)',
            streamUrl,
            details: ubusRes,
            steps
          };
        }

        steps.push({
          timestamp: nowStr(),
          step: 'MINA_UBUS',
          status: 'FAIL',
          statusCode: 400,
          message: `Mina UBUS 响应未确认: ${ubusRes?.error || '返回错误码'}`
        });
      } catch (ubusErr: any) {
        console.warn(`[XiaomiAdapter] Mina UBUS failed:`, ubusErr.message);
        steps.push({
          timestamp: nowStr(),
          step: 'MINA_UBUS_EXCEPTION',
          status: 'FAIL',
          statusCode: 500,
          message: `Mina UBUS 异常: ${ubusErr.message}`
        });
      }
    } else {
      steps.push({
        timestamp: nowStr(),
        step: 'MINA_UBUS_SKIPPED',
        status: 'PENDING',
        message: '未登录小米账号，跳过 Mina UBUS 通道'
      });
    }

    // =========================================================================
    // 2. TIER 2: MIoT Cloud Action RPC (api.io.mi.com)
    // =========================================================================
    const activeIoToken = miotConfig?.xiaomiioServiceToken || activeMicoToken;
    const activeSsec = miotConfig?.ssecurity;

    if (miotConfig?.isLoggedIn && miotConfig?.userId && (activeIoToken || activeSsec)) {
      try {
        console.log(`[XiaomiAdapter] [Tier 2] Trying MIoT Cloud Action for ${targetDevice.did}...`);
        const miotAuth = {
          userId: String(miotConfig.userId),
          serviceToken: activeIoToken,
          ssecurity: activeSsec
        };

        // Helper to accurately verify if MIoT Action genuinely succeeded
        const isMiotActionSuccess = (res: any) => {
          if (!res) return false;
          if (res.code === 0) {
            // Check if nested result contains an error code (e.g., { code: 0, result: { code: -704042011 } })
            if (res.result && typeof res.result.code === 'number' && res.result.code !== 0) {
              return false;
            }
            return true;
          }
          return false;
        };

        // Action 1: Play-Control (siid=3, aiid=1 play-url: [streamUrl])
        let rpcRes = await miotRpcEngine.executeAction(targetDevice, 3, 1, [streamUrl], miotAuth);
        console.log(`[XiaomiAdapter] [Tier 2 Action 1 (siid=3, aiid=1)] Result:`, JSON.stringify(rpcRes));
        
        if (isMiotActionSuccess(rpcRes)) {
          steps.push({
            timestamp: nowStr(),
            step: 'MIOT_ACTION_SIID3',
            status: 'OK',
            statusCode: 200,
            message: 'MIoT Cloud Action (siid=3, aiid=1 play-url) 成功'
          });
          this.deviceManager.updatePlaybackState(targetDevice.did, true, songTitle);
          return {
            success: true,
            message: `已通过 MIoT 云端 Action (siid=3, aiid=1) 成功下发播放到【${targetDevice.name}】`,
            protocol: 'MIoT Cloud Action (siid=3, aiid=1)',
            streamUrl,
            details: rpcRes,
            steps
          };
        }

        // Action 2: Intelligent Speaker (siid=7, aiid=3 play-url: [streamUrl])
        rpcRes = await miotRpcEngine.executeAction(targetDevice, 7, 3, [streamUrl], miotAuth);
        console.log(`[XiaomiAdapter] [Tier 2 Action 2 (siid=7, aiid=3)] Result:`, JSON.stringify(rpcRes));

        if (isMiotActionSuccess(rpcRes)) {
          steps.push({
            timestamp: nowStr(),
            step: 'MIOT_ACTION_SIID7',
            status: 'OK',
            statusCode: 200,
            message: 'MIoT Cloud Action (siid=7, aiid=3 play-url) 成功'
          });
          this.deviceManager.updatePlaybackState(targetDevice.did, true, songTitle);
          return {
            success: true,
            message: `已通过 MIoT 云端 Action (siid=7, aiid=3) 成功下发播放到【${targetDevice.name}】`,
            protocol: 'MIoT Cloud Action (siid=7, aiid=3)',
            streamUrl,
            details: rpcRes,
            steps
          };
        }

        // Action 3: Text conversation directive fallback (siid=7, aiid=4)
        const songQuery = options.songArtist ? `${options.songArtist} 的 ${songTitle}` : (songTitle || '音乐');
        const textDirectiveRes = await miotRpcEngine.executeAction(targetDevice, 7, 4, [`播放 ${songQuery}`, false], miotAuth);
        console.log(`[XiaomiAdapter] [Tier 2 Action 3 (siid=7, aiid=4 directive)] Result:`, JSON.stringify(textDirectiveRes));

        if (isMiotActionSuccess(textDirectiveRes)) {
          steps.push({
            timestamp: nowStr(),
            step: 'MIOT_ACTION_DIRECTIVE',
            status: 'OK',
            statusCode: 200,
            message: `MIoT Cloud Action (siid=7, aiid=4 指令: 播放 ${songQuery}) 成功`
          });
          this.deviceManager.updatePlaybackState(targetDevice.did, true, songTitle);
          return {
            success: true,
            message: `已通过 MIoT 云端指令成功下发播放到【${targetDevice.name}】`,
            protocol: 'MIoT Cloud Directive (siid=7, aiid=4)',
            streamUrl,
            details: textDirectiveRes,
            steps
          };
        }

        steps.push({
          timestamp: nowStr(),
          step: 'MIOT_ACTION',
          status: 'FAIL',
          statusCode: rpcRes?.code || 400,
          message: `MIoT Cloud Action 返回未成功响应: code=${rpcRes?.code}`
        });
      } catch (miotErr: any) {
        console.warn(`[XiaomiAdapter] MIoT Cloud Action failed:`, miotErr.message);
        steps.push({
          timestamp: nowStr(),
          step: 'MIOT_ACTION_EXCEPTION',
          status: 'FAIL',
          statusCode: 500,
          message: `MIoT Cloud Action 异常: ${miotErr.message}`
        });
      }
    } else {
      console.log(`[XiaomiAdapter] [Tier 2] Skipped (isLoggedIn: ${miotConfig?.isLoggedIn}, hasIoToken: ${Boolean(activeIoToken)})`);
      steps.push({
        timestamp: nowStr(),
        step: 'MIOT_ACTION_SKIPPED',
        status: 'PENDING',
        message: '未获取到有效 xiaomiio 凭证，跳过 MIoT Action 通道'
      });
    }

    // =========================================================================
    // 3. TIER 3: Local miIO UDP 54321
    // =========================================================================
    if (targetDevice.token && targetDevice.ip) {
      try {
        console.log(`[XiaomiAdapter] [Tier 3] Trying Local miIO UDP on ${targetDevice.ip}...`);
        
        let localMiio = await sendMiioCommandFn(
          targetDevice.ip,
          targetDevice.token,
          'play_specify_url',
          [streamUrl, 1],
          2000
        );
        console.log(`[XiaomiAdapter] [Tier 3 play_specify_url] Result:`, JSON.stringify(localMiio));

        if (localMiio?.result === 'ok' || localMiio?.success) {
          steps.push({
            timestamp: nowStr(),
            step: 'LOCAL_MIIO_UDP',
            status: 'OK',
            statusCode: 200,
            message: `局域网 miIO UDP (54321 play_specify_url) 成功`
          });
          this.deviceManager.updatePlaybackState(targetDevice.did, true, songTitle);
          return {
            success: true,
            message: `已通过局域网 miIO UDP (54321) 成功下发播放到【${targetDevice.name}】`,
            protocol: 'miIO UDP (54321)',
            streamUrl,
            details: localMiio,
            steps
          };
        }

        // Sub-fallback: player_play_url
        localMiio = await sendMiioCommandFn(
          targetDevice.ip,
          targetDevice.token,
          'player_play_url',
          [{ url: streamUrl, type: 1, media: 'app_ios' }],
          1800
        );
        console.log(`[XiaomiAdapter] [Tier 3 player_play_url] Result:`, JSON.stringify(localMiio));

        if (localMiio?.result === 'ok' || localMiio?.success) {
          steps.push({
            timestamp: nowStr(),
            step: 'LOCAL_MIIO_UDP_ALT',
            status: 'OK',
            statusCode: 200,
            message: `局域网 miIO UDP player_play_url 成功`
          });
          this.deviceManager.updatePlaybackState(targetDevice.did, true, songTitle);
          return {
            success: true,
            message: `已通过局域网 miIO UDP (player_play_url) 成功下发播放到【${targetDevice.name}】`,
            protocol: 'miIO UDP (player_play_url)',
            streamUrl,
            details: localMiio,
            steps
          };
        }

        steps.push({
          timestamp: nowStr(),
          step: 'LOCAL_MIIO',
          status: 'FAIL',
          message: '局域网 miIO 54321 握手或指令超时'
        });
      } catch (miioErr: any) {
        console.warn(`[XiaomiAdapter] Local miIO failed:`, miioErr.message);
        steps.push({
          timestamp: nowStr(),
          step: 'LOCAL_MIIO_EXCEPTION',
          status: 'FAIL',
          message: `miIO 异常: ${miioErr.message}`
        });
      }
    } else {
      console.log(`[XiaomiAdapter] [Tier 3] Skipped (ip: ${targetDevice.ip || 'none'}, token: ${targetDevice.token ? 'configured' : 'none'})`);
    }

    // =========================================================================
    // 4. TIER 4: DLNA UPnP AVTransport
    // =========================================================================
    if (targetDevice.ip && options.castMode !== 'xiaoai_directive') {
      try {
        console.log(`[XiaomiAdapter] [Tier 4] Trying DLNA UPnP on ${targetDevice.ip}...`);
        const dlnaRes = await dlnaEngine.castSong(targetDevice.ip, streamUrl, {
          title: songTitle,
          artist: options.songArtist,
          duration: options.duration
        });

        if (dlnaRes.success) {
          steps.push({
            timestamp: nowStr(),
            step: 'DLNA_AVTRANSPORT',
            status: 'OK',
            statusCode: 200,
            message: `局域网 DLNA UPnP AVTransport 推送成功`
          });
          this.deviceManager.updatePlaybackState(targetDevice.did, true, songTitle);
          return {
            success: true,
            message: `已通过局域网 DLNA UPnP 成功推送到【${targetDevice.name}】`,
            protocol: 'DLNA / UPnP AVTransport',
            streamUrl,
            details: dlnaRes,
            steps
          };
        }

        steps.push({
          timestamp: nowStr(),
          step: 'DLNA',
          status: 'FAIL',
          message: `DLNA 响应失败: ${dlnaRes.error || '端口未响应'}`
        });
      } catch (dlnaErr: any) {
        console.warn(`[XiaomiAdapter] DLNA failed:`, dlnaErr.message);
        steps.push({
          timestamp: nowStr(),
          step: 'DLNA_EXCEPTION',
          status: 'FAIL',
          message: `DLNA 异常: ${dlnaErr.message}`
        });
      }
    }

    // =========================================================================
    // ALL TIERS FAILED
    // =========================================================================
    steps.push({
      timestamp: nowStr(),
      step: 'ALL_PROTOCOLS_EXHAUSTED',
      status: 'FAIL',
      statusCode: 500,
      message: 'Mina UBUS、MIoT Action、miIO 54321、DLNA 全部降级尝试均未成功'
    });

    return {
      success: false,
      message: `未能成功向音箱【${targetDevice.name}】下发播放指令：所有投播通道均未响应。请检查音箱网络连通性或小米账号登录状态。`,
      protocol: 'Fallback Chain Exhausted',
      streamUrl,
      errorCode: 'ERR_ALL_PROTOCOLS_FAILED',
      steps
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
    const activeMicoToken = miotConfig?.micoServiceToken || miotConfig?.serviceToken;
    const isXiaoaiAccountActive = Boolean(miotConfig?.isLoggedIn && activeMicoToken && miotConfig?.userId);

    // 1. Mina Cloud UBUS
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
    const activeMicoToken = miotConfig?.micoServiceToken || miotConfig?.serviceToken;
    const isXiaoaiAccountActive = Boolean(miotConfig?.isLoggedIn && activeMicoToken && miotConfig?.userId);

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
