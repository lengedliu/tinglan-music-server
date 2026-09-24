import { ICastStrategy, CastContext } from './castStrategy.js';
import { CastResult, resolveDeviceHardware, isNeedUsePlayMusicApi, buildXiaoWeiMusicMessage } from '../xiaomiAdapter.js';

export class MinaCloudCastStrategy implements ICastStrategy {
  public name = 'Mina_Cloud_UBUS';
  public priority = 90;

  public canHandle(ctx: CastContext): boolean {
    if (ctx.castMode === 'xiaoai_directive') return false;
    const activeMicoToken = ctx.miotConfig?.micoServiceToken || ctx.miotConfig?.serviceToken;
    return Boolean(
      (activeMicoToken && (ctx.miotConfig?.userId || ctx.miotConfig?.miUser)) ||
      (ctx.miotConfig?.passToken && (ctx.miotConfig?.userId || ctx.miotConfig?.miUser)) ||
      (ctx.miotConfig?.isLoggedIn && (activeMicoToken || ctx.miotConfig?.passToken || ctx.miotConfig?.serviceToken)) ||
      (activeMicoToken && !activeMicoToken.includes('••'))
    );
  }

  public async execute(ctx: CastContext): Promise<CastResult | null> {
    const { targetDevice, streamUrl, songTitle, steps, nowStr, verifyStreamConsumed, callMinaCloudApiFn } = ctx;
    const isTouchscreen = targetDevice.hardwareProfile?.isTouchscreen || false;
    const resolvedHw = resolveDeviceHardware(targetDevice);
    const needsPlayMusic = isNeedUsePlayMusicApi(resolvedHw, targetDevice.model);

    try {
      console.log(`[CastStrategy][Mina] Dispatching to "${targetDevice.model || ''}" (${resolvedHw}), mode: ${needsPlayMusic ? 'XiaoWei CP' : 'player_play_url'}...`);

      if (needsPlayMusic) {
        // XiaoWei CP Method: player_play_music
        const musicMsg = buildXiaoWeiMusicMessage(streamUrl, { keepLight: true });
        let ubusRes = await callMinaCloudApiFn('mediaplayer', 'player_play_music', musicMsg, targetDevice.did);

        if (ubusRes?.success) {
          steps.push({
            timestamp: nowStr(),
            step: 'MINA_UBUS_PLAY_MUSIC_XIAOWEI',
            status: 'OK',
            statusCode: 200,
            message: `XiaoWei CP 协议 player_play_music 下发成功`
          });
          verifyStreamConsumed('Tier 2 XiaoWei player_play_music').catch(() => {});
          return {
            success: true,
            message: `已通过小米云端 (XiaoWei player_play_music) 成功下发播放到【${targetDevice.name}】`,
            protocol: 'Mina Cloud UBUS (XiaoWei CP)',
            streamUrl,
            details: ubusRes,
            steps
          };
        }

        // Sub-fallback: player_play_url type 1
        ubusRes = await callMinaCloudApiFn('mediaplayer', 'player_play_url', { url: streamUrl, type: 1, media: 'app_ios' }, targetDevice.did);
        if (ubusRes?.success) {
          steps.push({
            timestamp: nowStr(),
            step: 'MINA_UBUS_PLAY_URL_TYPE1',
            status: 'OK',
            statusCode: 200,
            message: `Mina UBUS player_play_url(type=1, media=app_ios) 下发成功`
          });
          verifyStreamConsumed('Tier 2 Mina UBUS type=1').catch(() => {});
          return {
            success: true,
            message: `已通过小米云端 (UBUS player_play_url type=1) 成功下发播放到【${targetDevice.name}】`,
            protocol: 'Mina Cloud UBUS (type=1)',
            streamUrl,
            details: ubusRes,
            steps
          };
        }
      } else {
        // Standard Method: player_play_url
        const primaryPlayType = isTouchscreen ? 0 : 1;
        let ubusRes = await callMinaCloudApiFn('mediaplayer', 'player_play_url', { url: streamUrl, type: primaryPlayType, media: 'app_ios' }, targetDevice.did);

        if (ubusRes?.success) {
          steps.push({
            timestamp: nowStr(),
            step: 'MINA_UBUS_PRIMARY',
            status: 'OK',
            statusCode: 200,
            message: `Mina UBUS player_play_url(type=${primaryPlayType}, media=app_ios) 下发成功`
          });
          verifyStreamConsumed('Tier 2 Mina UBUS').catch(() => {});
          return {
            success: true,
            message: `已通过小米云端 (UBUS player_play_url) 成功下发播放到【${targetDevice.name}】`,
            protocol: 'MiService Mina Cloud UBUS',
            streamUrl,
            details: ubusRes,
            steps
          };
        }

        // Sub-fallback: type 2
        ubusRes = await callMinaCloudApiFn('mediaplayer', 'player_play_url', { url: streamUrl, type: 2, media: 'app_ios' }, targetDevice.did);
        if (ubusRes?.success) {
          steps.push({
            timestamp: nowStr(),
            step: 'MINA_UBUS_PLAY_URL_TYPE2',
            status: 'OK',
            statusCode: 200,
            message: `Mina UBUS player_play_url(type=2, media=app_ios) 下发成功`
          });
          verifyStreamConsumed('Tier 2 Mina UBUS type=2').catch(() => {});
          return {
            success: true,
            message: `已通过小米云端 (UBUS player_play_url type=2) 成功下发播放到【${targetDevice.name}】`,
            protocol: 'MiService Mina Cloud UBUS (type=2)',
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
        message: 'Mina UBUS 响应未确认或未拉取音频流'
      });
    } catch (err: any) {
      console.warn('[CastStrategy][Mina] Exception:', err.message);
      steps.push({
        timestamp: nowStr(),
        step: 'MINA_UBUS_EXCEPTION',
        status: 'FAIL',
        statusCode: 500,
        message: `Mina UBUS 异常: ${err.message}`
      });
    }
    return null;
  }
}
