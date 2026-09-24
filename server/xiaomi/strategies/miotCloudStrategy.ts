import { ICastStrategy, CastContext } from './castStrategy.js';
import { CastResult } from '../xiaomiAdapter.js';
import { miotRpcEngine } from '../../miotRpc.js';

export class MiotCloudCastStrategy implements ICastStrategy {
  public name = 'MIoT_Cloud_Spec';
  public priority = 80;

  public canHandle(ctx: CastContext): boolean {
    if (ctx.castMode === 'xiaoai_directive') return false;
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
    const { targetDevice, streamUrl, songTitle, steps, nowStr, verifyStreamConsumed, miotConfig } = ctx;
    const activeIoToken = miotConfig?.miotServiceToken || miotConfig?.xiaomiioServiceToken || miotConfig?.serviceToken;
    const activeSsec = miotConfig?.ssecurity;

    try {
      console.log(`[CastStrategy][MIoT] Inspecting MIoT Spec for "${targetDevice.model || 'unknown'}"...`);
      const miotAuth = {
        userId: String(miotConfig.userId),
        serviceToken: activeIoToken,
        ssecurity: activeSsec
      };

      const specInfo = await miotRpcEngine.inspectDeviceMediaSpec(targetDevice.model || '');

      if (specInfo.hasValidUrlProperty && specInfo.urlProp) {
        const setPropRes = await miotRpcEngine.setProperty(targetDevice, specInfo.urlProp.siid, specInfo.urlProp.piid, streamUrl, miotAuth);
        const playSiid = specInfo.playAction?.siid || 3;
        const playAiid = specInfo.playAction?.aiid || 1;
        const playActionRes = await miotRpcEngine.executeAction(targetDevice, playSiid, playAiid, [], miotAuth);

        if (this.isMiotActionSuccess(playActionRes)) {
          const isConsumed = await verifyStreamConsumed('Tier 3 MIoT Spec');
          if (isConsumed) {
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
        const actRes = await miotRpcEngine.executeAction(targetDevice, specInfo.playUrlAction.siid, specInfo.playUrlAction.aiid, [streamUrl], miotAuth);
        if (this.isMiotActionSuccess(actRes)) {
          const isConsumed = await verifyStreamConsumed('Tier 3 MIoT Action');
          if (isConsumed) {
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
        steps.push({
          timestamp: nowStr(),
          step: 'MIOT_SPEC_ANALYSIS',
          status: 'PENDING',
          message: `设备 MIoT Spec 解析：siid=3 piid=1 为播放状态值 (非URL)，已自动跳过无效写入`
        });
      }
    } catch (err: any) {
      console.warn('[CastStrategy][MIoT] Exception:', err.message);
    }
    return null;
  }
}
