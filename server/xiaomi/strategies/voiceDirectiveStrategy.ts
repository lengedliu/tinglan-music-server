import { ICastStrategy, CastContext } from './castStrategy.js';
import { CastResult } from '../xiaomiAdapter.js';
import { miotRpcEngine } from '../../miotRpc.js';

export class VoiceDirectiveCastStrategy implements ICastStrategy {
  public name = 'Voice_Directive_Fallback';
  public priority = 10;

  public canHandle(ctx: CastContext): boolean {
    const activeIoToken = ctx.miotConfig?.miotServiceToken || ctx.miotConfig?.xiaomiioServiceToken || ctx.miotConfig?.serviceToken;
    const activeSsec = ctx.miotConfig?.ssecurity;
    return Boolean(ctx.miotConfig?.isLoggedIn && ctx.miotConfig?.userId && (activeIoToken || activeSsec));
  }

  private isMiotActionSuccess(res: any): boolean {
    if (!res) return false;
    if (res.code === 0) {
      if (res.result && typeof res.result.code === 'number' && res.result.code !== 0) {
        return false;
      }
      return true;
    }
    return false;
  }

  public async execute(ctx: CastContext): Promise<CastResult | null> {
    const { targetDevice, streamUrl, songTitle, songArtist, steps, nowStr, miotConfig } = ctx;
    const activeIoToken = miotConfig?.miotServiceToken || miotConfig?.xiaomiioServiceToken || miotConfig?.serviceToken;
    const activeSsec = miotConfig?.ssecurity;

    const songQuery = songArtist ? `${songArtist} 的 ${songTitle}` : (songTitle || '音乐');
    const miotAuth = {
      userId: String(miotConfig.userId),
      serviceToken: activeIoToken,
      ssecurity: activeSsec
    };

    try {
      console.log(`[CastStrategy][Voice] Sending Cloud Voice Directive (siid=7, aiid=4): "播放 ${songQuery}"`);
      let textDirectiveRes = await miotRpcEngine.executeAction(targetDevice, 7, 4, [`播放 ${songQuery}`], miotAuth);

      if (!this.isMiotActionSuccess(textDirectiveRes) && (textDirectiveRes.code === -704083036 || textDirectiveRes.code !== 0)) {
        const retryRes = await miotRpcEngine.executeAction(targetDevice, 7, 4, [songQuery], miotAuth);
        if (this.isMiotActionSuccess(retryRes)) {
          textDirectiveRes = retryRes;
        }
      }

      if (!this.isMiotActionSuccess(textDirectiveRes)) {
        const ttsRes = await miotRpcEngine.executeAction(targetDevice, 7, 3, [`为您播放：${songQuery}`], miotAuth);
        if (this.isMiotActionSuccess(ttsRes)) {
          textDirectiveRes = ttsRes;
        }
      }

      if (this.isMiotActionSuccess(textDirectiveRes)) {
        steps.push({
          timestamp: nowStr(),
          step: 'MIOT_VOICE_DIRECTIVE',
          status: 'OK',
          statusCode: 200,
          message: `已自动降级为小爱云端语音指令 (siid=7, aiid=4: 播放 ${songQuery})`
        });
        return {
          success: true,
          message: `局域网推流未被音箱解码消费（请在小爱音箱App确认开启DLNA），已自动切换为小爱语音指令播放【${songQuery}】`,
          protocol: 'XiaoAi Cloud Voice Directive (siid=7, aiid=4 Fallback)',
          streamUrl,
          details: textDirectiveRes,
          steps
        };
      }
    } catch (err: any) {
      console.warn('[CastStrategy][Voice] Exception:', err.message);
    }
    return null;
  }
}
