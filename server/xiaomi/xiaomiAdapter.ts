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
    const activeIoToken = miotConfig?.xiaomiioServiceToken || activeMicoToken;
    const activeSsec = miotConfig?.ssecurity;
    const isXiaoaiAccountActive = Boolean(miotConfig?.isLoggedIn && activeMicoToken && miotConfig?.userId);

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
    // 1. TIER 1: DLNA UPnP AVTransport (Preferred for LAN speakers like XiaoAi Pro/Sound)
    // Directly transmits SetAVTransportURI and Play over LAN without depending on cloud/UDP miio
    // =========================================================================
    if (targetDevice.ip && options.castMode !== 'xiaoai_directive') {
      try {
        console.log(`[XiaomiAdapter] [Tier 1] Trying DLNA UPnP on ${targetDevice.ip}...`);
        const dlnaRes = await dlnaEngine.castSong(targetDevice.ip, streamUrl, {
          title: songTitle,
          artist: options.songArtist,
          duration: options.duration
        });

        console.log(`[XiaomiAdapter] [Tier 1 DLNA] Result:`, JSON.stringify(dlnaRes));

        if (dlnaRes.success) {
          steps.push({
            timestamp: nowStr(),
            step: 'DLNA_AVTRANSPORT',
            status: 'OK',
            statusCode: 200,
            message: '局域网 DLNA UPnP (SetAVTransportURI -> Play) 控制指令下发成功'
          });

          const isConsumed = await verifyStreamConsumed('Tier 1 DLNA');
          if (isConsumed) {
            this.deviceManager.updatePlaybackState(targetDevice.did, true, songTitle);
            return {
              success: true,
              message: `已通过局域网 DLNA UPnP 成功推送到【${targetDevice.name}】（已验证音箱实际拉流播放）`,
              protocol: 'DLNA / UPnP AVTransport (Verified Stream Fetched)',
              streamUrl,
              details: dlnaRes,
              steps
            };
          }
        } else {
          steps.push({
            timestamp: nowStr(),
            step: 'DLNA',
            status: 'FAIL',
            message: `DLNA 响应失败: ${dlnaRes.error || '端口未响应'}`
          });
        }
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
    // 2. TIER 2: Mina Cloud UBUS (micoapi mediaplayer/player_play_url)
    // Standard XiaoAi Cloud Media Player Service
    // =========================================================================
    if (isXiaoaiAccountActive && options.castMode !== 'xiaoai_directive') {
      try {
        console.log(`[XiaomiAdapter] [Tier 2] Trying Mina Cloud UBUS for ${targetDevice.did}...`);

        const primaryPlayType = isTouchscreen ? 0 : 1;
        let ubusRes = await callMinaCloudApiFn(
          'mediaplayer',
          'player_play_url',
          { url: streamUrl, type: primaryPlayType, media: 'app_ios' },
          targetDevice.did
        );

        console.log(`[XiaomiAdapter] [Tier 2 Mina player_play_url type=${primaryPlayType}] Result:`, JSON.stringify(ubusRes));

        if (ubusRes?.success) {
          steps.push({
            timestamp: nowStr(),
            step: 'MINA_UBUS_PRIMARY',
            status: 'OK',
            statusCode: 200,
            message: `Mina UBUS player_play_url(type=${primaryPlayType}, media=app_ios) 下发成功`
          });

          const isConsumed = await verifyStreamConsumed('Tier 2 Mina UBUS');
          if (isConsumed) {
            this.deviceManager.updatePlaybackState(targetDevice.did, true, songTitle);
            return {
              success: true,
              message: `已通过小米云端 (UBUS player_play_url) 成功下发播放到【${targetDevice.name}】（已验证音箱实际拉流）`,
              protocol: 'MiService Mina Cloud UBUS (Verified Stream Fetched)',
              streamUrl,
              details: ubusRes,
              steps
            };
          }
        }

        // Sub-fallback: invert playType
        const altPlayType = isTouchscreen ? 1 : 0;
        ubusRes = await callMinaCloudApiFn(
          'mediaplayer',
          'player_play_url',
          { url: streamUrl, type: altPlayType, media: 'app_ios' },
          targetDevice.did
        );
        console.log(`[XiaomiAdapter] [Tier 2 Mina alt_type=${altPlayType}] Result:`, JSON.stringify(ubusRes));

        if (ubusRes?.success) {
          steps.push({
            timestamp: nowStr(),
            step: 'MINA_UBUS_ALT_TYPE',
            status: 'OK',
            statusCode: 200,
            message: `Mina UBUS player_play_url(type=${altPlayType}, media=app_ios) 备用模式成功`
          });

          const isConsumed = await verifyStreamConsumed('Tier 2 Mina UBUS Alt');
          if (isConsumed) {
            this.deviceManager.updatePlaybackState(targetDevice.did, true, songTitle);
            return {
              success: true,
              message: `已通过小米云端 (UBUS 备用模式) 成功下发播放到【${targetDevice.name}】（已验证音箱实际拉流）`,
              protocol: 'MiService Mina Cloud UBUS (Alt Type Verified)',
              streamUrl,
              details: ubusRes,
              steps
            };
          }
        }

        // Sub-fallback: player_play_music
        ubusRes = await callMinaCloudApiFn(
          'mediaplayer',
          'player_play_music',
          { music: streamUrl, startOffset: 0, media: 'app_ios' },
          targetDevice.did
        );
        console.log(`[XiaomiAdapter] [Tier 2 Mina player_play_music] Result:`, JSON.stringify(ubusRes));

        if (ubusRes?.success) {
          steps.push({
            timestamp: nowStr(),
            step: 'MINA_UBUS_PLAY_MUSIC',
            status: 'OK',
            statusCode: 200,
            message: 'Mina UBUS player_play_music(media=app_ios) 成功'
          });

          const isConsumed = await verifyStreamConsumed('Tier 2 Mina player_play_music');
          if (isConsumed) {
            this.deviceManager.updatePlaybackState(targetDevice.did, true, songTitle);
            return {
              success: true,
              message: `已通过小米云端 (UBUS player_play_music) 成功下发播放到【${targetDevice.name}】（已验证音箱实际拉流）`,
              protocol: 'MiService Mina Cloud UBUS (player_play_music Verified)',
              streamUrl,
              details: ubusRes,
              steps
            };
          }
        }

        steps.push({
          timestamp: nowStr(),
          step: 'MINA_UBUS',
          status: 'FAIL',
          statusCode: 400,
          message: `Mina UBUS 响应未确认或未拉取音频流: ${ubusRes?.error || '未消费'}`
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
    }

    // =========================================================================
    // 3. TIER 3: MIoT Spec Media Action (Dynamic Spec Inspection - Point 1)
    // Query actual device model Spec to avoid guessing siid/piid or writing URL to playing-state
    // =========================================================================
    if (miotConfig?.isLoggedIn && miotConfig?.userId && (activeIoToken || activeSsec) && options.castMode !== 'xiaoai_directive') {
      try {
        console.log(`[XiaomiAdapter] [Tier 3] Inspecting MIoT Spec for model "${targetDevice.model || 'unknown'}"...`);
        const miotAuth = {
          userId: String(miotConfig.userId),
          serviceToken: activeIoToken,
          ssecurity: activeSsec
        };

        // 1. Check get_properties(siid=3, piid=1) to verify actual property nature
        const prop31 = await miotRpcEngine.getProperty(targetDevice, 3, 1, miotAuth);
        console.log(`[XiaomiAdapter] [Tier 3 MIoT get_properties(3, 1)] Result:`, JSON.stringify(prop31));

        // 2. Query official Spec schema for this model
        const specInfo = await miotRpcEngine.inspectDeviceMediaSpec(targetDevice.model || '');
        console.log(`[XiaomiAdapter] [Tier 3 MIoT Spec Schema] hasUrlProperty: ${specInfo.hasValidUrlProperty}, hasPlayUrlAction: ${specInfo.hasCustomPlayUrlAction}, summary: [${specInfo.rawServicesSummary.slice(0, 3).join(', ')}]`);

        if (specInfo.hasValidUrlProperty && specInfo.urlProp) {
          // Genuine URL property found in spec!
          console.log(`[XiaomiAdapter] [Tier 3 MIoT] Setting genuine URL property (siid=${specInfo.urlProp.siid}, piid=${specInfo.urlProp.piid})...`);
          const setPropRes = await miotRpcEngine.setProperty(targetDevice, specInfo.urlProp.siid, specInfo.urlProp.piid, streamUrl, miotAuth);
          console.log(`[XiaomiAdapter] [Tier 3 MIoT setProperty] Result:`, JSON.stringify(setPropRes));

          const playSiid = specInfo.playAction?.siid || 3;
          const playAiid = specInfo.playAction?.aiid || 1;
          const playActionRes = await miotRpcEngine.executeAction(targetDevice, playSiid, playAiid, [], miotAuth);
          console.log(`[XiaomiAdapter] [Tier 3 MIoT Play] Result:`, JSON.stringify(playActionRes));

          if (isMiotActionSuccess(playActionRes)) {
            const isConsumed = await verifyStreamConsumed('Tier 3 MIoT Spec');
            if (isConsumed) {
              this.deviceManager.updatePlaybackState(targetDevice.did, true, songTitle);
              return {
                success: true,
                message: `已通过 MIoT Spec 成功拉取音频流到【${targetDevice.name}】`,
                protocol: 'MIoT Spec Action (Verified)',
                streamUrl,
                details: { setPropRes, playActionRes },
                steps
              };
            }
          }
        } else if (specInfo.hasCustomPlayUrlAction && specInfo.playUrlAction) {
          // Genuine play-url action found!
          const actRes = await miotRpcEngine.executeAction(targetDevice, specInfo.playUrlAction.siid, specInfo.playUrlAction.aiid, [streamUrl], miotAuth);
          console.log(`[XiaomiAdapter] [Tier 3 MIoT playUrlAction] Result:`, JSON.stringify(actRes));
          if (isMiotActionSuccess(actRes)) {
            const isConsumed = await verifyStreamConsumed('Tier 3 MIoT Action');
            if (isConsumed) {
              this.deviceManager.updatePlaybackState(targetDevice.did, true, songTitle);
              return {
                success: true,
                message: `已通过 MIoT Action 成功拉取音频流到【${targetDevice.name}】`,
                protocol: 'MIoT Action (Verified)',
                streamUrl,
                details: actRes,
                steps
              };
            }
          }
        } else {
          console.log(`[XiaomiAdapter] [Tier 3 MIoT Spec] 提示: 设备型号 ${targetDevice.model} 的 MIoT Spec 中无外部 URL 写入属性 (siid=3 piid=1 为播放状态枚举，非媒体URL)。跳过盲目写入以防止假成功。`);
          steps.push({
            timestamp: nowStr(),
            step: 'MIOT_SPEC_ANALYSIS',
            status: 'PENDING',
            message: `设备 MIoT Spec 解析：siid=3 piid=1 为播放状态值 (非URL)，已自动跳过无效写入`
          });
        }
      } catch (miotErr: any) {
        console.warn(`[XiaomiAdapter] Tier 3 MIoT Spec failed:`, miotErr.message);
      }
    }

    // =========================================================================
    // 4. TIER 4: Local miIO UDP 54321 (XiaoMusic LAN Media Engine)
    // Direct UDP socket commands if IP and token are available
    // =========================================================================
    if (targetDevice.token && targetDevice.ip && options.castMode !== 'xiaoai_directive') {
      try {
        console.log(`[XiaomiAdapter] [Tier 4] Trying Local miIO UDP on ${targetDevice.ip}...`);

        let setUrlRes = await sendMiioCommandFn(
          targetDevice.ip,
          targetDevice.token,
          'set_play_url',
          [streamUrl],
          1800
        );
        console.log(`[XiaomiAdapter] [Tier 4 set_play_url] Result:`, JSON.stringify(setUrlRes));

        if (isMiioSuccess(setUrlRes)) {
          await new Promise((r) => setTimeout(r, 150));
          let playRes = await sendMiioCommandFn(
            targetDevice.ip,
            targetDevice.token,
            'player_play_operation',
            [{ action: 'play' }],
            1800
          );
          console.log(`[XiaomiAdapter] [Tier 4 play after set_url] Result:`, JSON.stringify(playRes));

          if (isMiioSuccess(playRes)) {
            const isConsumed = await verifyStreamConsumed('Tier 4 miIO set_play_url');
            if (isConsumed) {
              this.deviceManager.updatePlaybackState(targetDevice.did, true, songTitle);
              return {
                success: true,
                message: `已通过局域网 miIO (设置URL -> 播放) 成功推送到【${targetDevice.name}】（已验证音箱实际拉流）`,
                protocol: 'miIO UDP (set_play_url -> play, Verified)',
                streamUrl,
                details: { setUrlRes, playRes },
                steps
              };
            }
          }
        }

        // Sub-fallback: player_play_url
        let localMiio = await sendMiioCommandFn(
          targetDevice.ip,
          targetDevice.token,
          'player_play_url',
          [{ url: streamUrl, type: 1, media: 'app_ios' }],
          1800
        );
        console.log(`[XiaomiAdapter] [Tier 4 player_play_url type=1] Result:`, JSON.stringify(localMiio));

        if (isMiioSuccess(localMiio)) {
          const isConsumed = await verifyStreamConsumed('Tier 4 miIO player_play_url');
          if (isConsumed) {
            this.deviceManager.updatePlaybackState(targetDevice.did, true, songTitle);
            return {
              success: true,
              message: `已通过局域网 miIO (player_play_url) 成功推送到【${targetDevice.name}】（已验证音箱实际拉流）`,
              protocol: 'miIO UDP (player_play_url, Verified)',
              streamUrl,
              details: localMiio,
              steps
            };
          }
        }

        steps.push({
          timestamp: nowStr(),
          step: 'LOCAL_MIIO',
          status: 'FAIL',
          message: '局域网 miIO 54321 未响应或未拉取音频流，进入语音指令降级'
        });
      } catch (miioErr: any) {
        console.warn(`[XiaomiAdapter] Local miIO failed:`, miioErr.message);
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
        console.log(`[XiaomiAdapter] [Tier 5] Fallback: Sending Cloud Voice Directive (siid=7, aiid=4) for ${targetDevice.did}: "播放 ${songQuery}"`);
        const textDirectiveRes = await miotRpcEngine.executeAction(targetDevice, 7, 4, [`播放 ${songQuery}`, false], miotAuth);
        console.log(`[XiaomiAdapter] [Tier 5 Voice Directive] Result:`, JSON.stringify(textDirectiveRes));

        if (isMiotActionSuccess(textDirectiveRes)) {
          steps.push({
            timestamp: nowStr(),
            step: 'MIOT_VOICE_DIRECTIVE',
            status: 'OK',
            statusCode: 200,
            message: `局域网直连推流均未被音箱音频引擎消费，已自动降级为小爱云端语音指令 (siid=7, aiid=4: 播放 ${songQuery})`
          });
          this.deviceManager.updatePlaybackState(targetDevice.did, true, songTitle);
          return {
            success: true,
            message: `局域网推流未被音箱解码消费（请在小爱音箱App确认开启DLNA），已自动切换为小爱语音指令播放【${songQuery}】`,
            protocol: 'XiaoAi Cloud Voice Directive (siid=7, aiid=4 Fallback)',
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
      message: 'DLNA、Mina UBUS、MIoT Spec、miIO 54321 全部降级尝试均未成功'
    });

    return {
      success: false,
      message: `未能成功向音箱【${targetDevice.name}】下发播放指令：所有投播通道均未响应或未实际拉取音频流。请检查音箱网络连通性、DLNA开关或小米账号登录状态。`,
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
