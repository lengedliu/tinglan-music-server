import { ICastStrategy, CastContext } from './castStrategy.js';
import { CastResult } from '../xiaomiAdapter.js';

export class MiioLanCastStrategy implements ICastStrategy {
  public name = 'miIO_LAN_UDP';
  public priority = 70;

  public canHandle(ctx: CastContext): boolean {
    return Boolean(ctx.targetDevice.token && ctx.targetDevice.ip && ctx.castMode !== 'xiaoai_directive');
  }

  private isMiioSuccess(res: any): boolean {
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
  }

  public async execute(ctx: CastContext): Promise<CastResult | null> {
    const { targetDevice, streamUrl, songTitle, steps, nowStr, verifyStreamConsumed, sendMiioCommandFn } = ctx;

    try {
      console.log(`[CastStrategy][miIO] Attempting Local miIO UDP on ${targetDevice.ip}...`);

      const setUrlRes = await sendMiioCommandFn(targetDevice.ip!, targetDevice.token!, 'set_play_url', [streamUrl], 1800);

      if (this.isMiioSuccess(setUrlRes)) {
        await new Promise((r) => setTimeout(r, 150));
        const playRes = await sendMiioCommandFn(targetDevice.ip!, targetDevice.token!, 'player_play_operation', [{ action: 'play' }], 1800);

        if (this.isMiioSuccess(playRes)) {
          const isConsumed = await verifyStreamConsumed('Tier 4 miIO set_play_url');
          if (isConsumed) {
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
      const localMiio = await sendMiioCommandFn(
        targetDevice.ip!,
        targetDevice.token!,
        'player_play_url',
        [{ url: streamUrl, type: 1, media: 'app_ios' }],
        1800
      );

      if (this.isMiioSuccess(localMiio)) {
        const isConsumed = await verifyStreamConsumed('Tier 4 miIO player_play_url');
        if (isConsumed) {
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
        message: '局域网 miIO 54321 未响应或未拉取音频流'
      });
    } catch (err: any) {
      console.warn('[CastStrategy][miIO] Exception:', err.message);
    }
    return null;
  }
}
