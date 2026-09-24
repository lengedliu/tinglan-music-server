import { ICastStrategy, CastContext } from './castStrategy.js';
import { CastResult } from '../xiaomiAdapter.js';
import { dlnaEngine } from '../../dlnaEngine.js';

export class DlnaCastStrategy implements ICastStrategy {
  public name = 'DLNA_UPnP';
  public priority = 100;

  public canHandle(ctx: CastContext): boolean {
    return Boolean(ctx.targetDevice.ip && ctx.castMode !== 'xiaoai_directive');
  }

  public async execute(ctx: CastContext): Promise<CastResult | null> {
    const { targetDevice, streamUrl, songTitle, options = {}, steps, nowStr, verifyStreamConsumed } = ctx as any;
    try {
      console.log(`[CastStrategy][DLNA] Attempting DLNA UPnP on ${targetDevice.ip}...`);
      const dlnaRes = await dlnaEngine.castSong(targetDevice.ip, streamUrl, {
        title: songTitle,
        artist: ctx.songArtist,
        duration: ctx.duration
      });

      if (dlnaRes.success) {
        steps.push({
          timestamp: nowStr(),
          step: 'DLNA_AVTRANSPORT',
          status: 'OK',
          statusCode: 200,
          message: '局域网 DLNA UPnP (SetAVTransportURI -> Play) 指令下发成功'
        });

        const isConsumed = await verifyStreamConsumed('Tier 1 DLNA');
        if (isConsumed) {
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
          message: `局域网 DLNA 未命中 (${dlnaRes.error || '端口未响应'})，已自动无缝降级`
        });
      }
    } catch (err: any) {
      console.warn('[CastStrategy][DLNA] Exception:', err.message);
      steps.push({
        timestamp: nowStr(),
        step: 'DLNA_EXCEPTION',
        status: 'FAIL',
        message: `DLNA 异常: ${err.message}`
      });
    }
    return null;
  }
}
