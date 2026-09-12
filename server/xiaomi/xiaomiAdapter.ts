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

    // =========================================================================
    // 2. TIER 2: Local miIO UDP 54321 (XiaoMusic LAN Media Engine)
    // When IP & Token are configured, run direct local playback protocols on LAN
    // =========================================================================
    if (targetDevice.token && targetDevice.ip && options.castMode !== 'xiaoai_directive') {
      try {
        console.log(`[XiaomiAdapter] [Tier 2] Trying Local miIO UDP on ${targetDevice.ip}...`);

        // Sub-tier 2A: The 2-step Sequence (1. set uri -> 2. play)
        // Step 1: Set Play URL / Resource
        let setUrlRes = await sendMiioCommandFn(
          targetDevice.ip,
          targetDevice.token,
          'set_play_url',
          [streamUrl],
          2000
        );
        if (!isMiioSuccess(setUrlRes)) {
          setUrlRes = await sendMiioCommandFn(
            targetDevice.ip,
            targetDevice.token,
            'set_play_url',
            [{ url: streamUrl }],
            2000
          );
        }
        if (!isMiioSuccess(setUrlRes)) {
          setUrlRes = await sendMiioCommandFn(
            targetDevice.ip,
            targetDevice.token,
            'set_uri',
            [streamUrl],
            2000
          );
        }

        console.log(`[XiaomiAdapter] [Tier 2 set_play_url] Result:`, JSON.stringify(setUrlRes));

        if (isMiioSuccess(setUrlRes)) {
          // Step 2: Trigger Playback
          await new Promise((r) => setTimeout(r, 150));
          let playRes = await sendMiioCommandFn(
            targetDevice.ip,
            targetDevice.token,
            'player_play_operation',
            [{ action: 'play' }],
            2000
          );
          if (!isMiioSuccess(playRes)) {
            playRes = await sendMiioCommandFn(
              targetDevice.ip,
              targetDevice.token,
              'set_play',
              [1],
              2000
            );
          }
          if (!isMiioSuccess(playRes)) {
            playRes = await sendMiioCommandFn(
              targetDevice.ip,
              targetDevice.token,
              'play',
              [],
              2000
            );
          }

          console.log(`[XiaomiAdapter] [Tier 2 play after set_url] Result:`, JSON.stringify(playRes));

          if (isMiioSuccess(playRes)) {
            steps.push({
              timestamp: nowStr(),
              step: 'LOCAL_MIIO_SET_URI_PLAY',
              status: 'OK',
              statusCode: 200,
              message: '局域网 miIO (set_play_url -> play) 成功'
            });
            this.deviceManager.updatePlaybackState(targetDevice.did, true, songTitle);
            return {
              success: true,
              message: `已通过局域网 miIO (设置URL -> 开始播放) 成功下发播放到【${targetDevice.name}】`,
              protocol: 'miIO UDP (set_play_url -> play)',
              streamUrl,
              details: { setUrlRes, playRes },
              steps
            };
          }
        }

        // Sub-tier 2B: player_play_url (Direct XiaoAi player command)
        let localMiio = await sendMiioCommandFn(
          targetDevice.ip,
          targetDevice.token,
          'player_play_url',
          [{ url: streamUrl, type: 1, media: 'app_ios' }],
          2000
        );
        console.log(`[XiaomiAdapter] [Tier 2 player_play_url type=1] Result:`, JSON.stringify(localMiio));

        if (isMiioSuccess(localMiio)) {
          steps.push({
            timestamp: nowStr(),
            step: 'LOCAL_MIIO_PLAYER_PLAY_URL',
            status: 'OK',
            statusCode: 200,
            message: '局域网 miIO (player_play_url type=1) 成功'
          });
          this.deviceManager.updatePlaybackState(targetDevice.did, true, songTitle);
          return {
            success: true,
            message: `已通过局域网 miIO (player_play_url) 成功下发播放到【${targetDevice.name}】`,
            protocol: 'miIO UDP (player_play_url)',
            streamUrl,
            details: localMiio,
            steps
          };
        }

        // Sub-tier 2C: player_play_url type=0 / play_specify_url
        localMiio = await sendMiioCommandFn(
          targetDevice.ip,
          targetDevice.token,
          'play_specify_url',
          [streamUrl, 1],
          2000
        );
        console.log(`[XiaomiAdapter] [Tier 2 play_specify_url] Result:`, JSON.stringify(localMiio));

        if (isMiioSuccess(localMiio)) {
          steps.push({
            timestamp: nowStr(),
            step: 'LOCAL_MIIO_SPECIFY_URL',
            status: 'OK',
            statusCode: 200,
            message: '局域网 miIO (play_specify_url) 成功'
          });
          this.deviceManager.updatePlaybackState(targetDevice.did, true, songTitle);
          return {
            success: true,
            message: `已通过局域网 miIO (play_specify_url) 成功下发播放到【${targetDevice.name}】`,
            protocol: 'miIO UDP (play_specify_url)',
            streamUrl,
            details: localMiio,
            steps
          };
        }

        steps.push({
          timestamp: nowStr(),
          step: 'LOCAL_MIIO',
          status: 'FAIL',
          message: '局域网 miIO 播放指令已下发但未获音箱确认为播放状态，进入 DLNA/MIoT 降级'
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
      console.log(`[XiaomiAdapter] [Tier 2] Skipped (ip: ${targetDevice.ip || 'none'}, token: ${targetDevice.token ? 'configured' : 'none'})`);
    }

    // =========================================================================
    // 3. TIER 3: DLNA UPnP AVTransport (Universal LAN Protocol for XiaoAi Pro/Sound)
    // DLNA is inherently: 1. SetAVTransportURI -> 2. Play
    // =========================================================================
    if (targetDevice.ip && options.castMode !== 'xiaoai_directive') {
      try {
        console.log(`[XiaomiAdapter] [Tier 3] Trying DLNA UPnP on ${targetDevice.ip}...`);
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
            message: '局域网 DLNA UPnP (SetAVTransportURI -> Play) 成功'
          });
          this.deviceManager.updatePlaybackState(targetDevice.did, true, songTitle);
          return {
            success: true,
            message: `已通过局域网 DLNA UPnP (SetURI -> Play) 成功推送到【${targetDevice.name}】`,
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
    // 4. TIER 4: MIoT Spec Action RPC (Set URI / Resource -> Play-Control Play)
    // =========================================================================
    const activeIoToken = miotConfig?.xiaomiioServiceToken || activeMicoToken;
    const activeSsec = miotConfig?.ssecurity;

    if (miotConfig?.isLoggedIn && miotConfig?.userId && (activeIoToken || activeSsec) && options.castMode !== 'xiaoai_directive') {
      try {
        console.log(`[XiaomiAdapter] [Tier 4] Trying MIoT Spec Media Action for ${targetDevice.did}...`);
        const miotAuth = {
          userId: String(miotConfig.userId),
          serviceToken: activeIoToken,
          ssecurity: activeSsec
        };

        // Step 1: Set Play URL resource via MIoT property or action if available
        let setMiotUrlRes = await miotRpcEngine.setProperty(targetDevice, 3, 1, streamUrl, miotAuth);
        console.log(`[XiaomiAdapter] [Tier 4 MIoT setProperty siid=3, piid=1] Result:`, JSON.stringify(setMiotUrlRes));

        // Step 2: Play-Control Play (siid=3, aiid=1 or aiid=2 with empty params [])
        let playActionRes = await miotRpcEngine.executeAction(targetDevice, 3, 1, [], miotAuth);
        console.log(`[XiaomiAdapter] [Tier 4 MIoT Play (siid=3, aiid=1, in=[])] Result:`, JSON.stringify(playActionRes));

        if (!isMiotActionSuccess(playActionRes)) {
          playActionRes = await miotRpcEngine.executeAction(targetDevice, 3, 2, [], miotAuth);
          console.log(`[XiaomiAdapter] [Tier 4 MIoT Play alt (siid=3, aiid=2, in=[])] Result:`, JSON.stringify(playActionRes));
        }

        if (isMiotActionSuccess(playActionRes)) {
          steps.push({
            timestamp: nowStr(),
            step: 'MIOT_ACTION_PLAY',
            status: 'OK',
            statusCode: 200,
            message: 'MIoT Play-Control (siid=3 play) 成功'
          });
          this.deviceManager.updatePlaybackState(targetDevice.did, true, songTitle);
          return {
            success: true,
            message: `已通过 MIoT Play-Control (siid=3) 成功下发播放到【${targetDevice.name}】`,
            protocol: 'MIoT Play-Control (siid=3)',
            streamUrl,
            details: { setMiotUrlRes, playActionRes },
            steps
          };
        }

        steps.push({
          timestamp: nowStr(),
          step: 'MIOT_ACTION',
          status: 'FAIL',
          statusCode: playActionRes?.code || 400,
          message: `MIoT Media Action 返回未成功响应: code=${playActionRes?.code || -1}`
        });
      } catch (miotErr: any) {
        console.warn(`[XiaomiAdapter] MIoT Spec Action failed:`, miotErr.message);
        steps.push({
          timestamp: nowStr(),
          step: 'MIOT_ACTION_EXCEPTION',
          status: 'FAIL',
          statusCode: 500,
          message: `MIoT Action 异常: ${miotErr.message}`
        });
      }
    }

    // =========================================================================
    // 5. TIER 5: Voice Directive Fallback (Only when explicit or all stream channels failed)
    // =========================================================================
    if (miotConfig?.isLoggedIn && miotConfig?.userId && (activeIoToken || activeSsec)) {
      const songQuery = options.songArtist ? `${options.songArtist} 的 ${songTitle}` : (songTitle || '音乐');
      const miotAuth = {
        userId: String(miotConfig.userId),
        serviceToken: activeIoToken,
        ssecurity: activeSsec
      };

      try {
        console.log(`[XiaomiAdapter] [Tier 5] Trying Voice Directive (siid=7, aiid=4) for ${targetDevice.did}: "播放 ${songQuery}"`);
        const textDirectiveRes = await miotRpcEngine.executeAction(targetDevice, 7, 4, [`播放 ${songQuery}`, false], miotAuth);
        console.log(`[XiaomiAdapter] [Tier 5 Voice Directive] Result:`, JSON.stringify(textDirectiveRes));

        if (isMiotActionSuccess(textDirectiveRes)) {
          steps.push({
            timestamp: nowStr(),
            step: 'MIOT_VOICE_DIRECTIVE',
            status: 'OK',
            statusCode: 200,
            message: `已降级为小爱云端语音指令 (siid=7, aiid=4: 播放 ${songQuery})`
          });
          this.deviceManager.updatePlaybackState(targetDevice.did, true, songTitle);
          return {
            success: true,
            message: `本地串流通道未获音箱直连接收，已自动切换为小爱语音指令播放【${songQuery}】`,
            protocol: 'XiaoAi Cloud Voice Directive (siid=7, aiid=4)',
            streamUrl,
            details: textDirectiveRes,
            steps
          };
        }
      } catch (dirErr: any) {
        console.warn(`[XiaomiAdapter] Voice directive failed:`, dirErr.message);
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
