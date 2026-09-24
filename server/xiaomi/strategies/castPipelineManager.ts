import { ICastStrategy, CastContext } from './castStrategy.js';
import { CastResult } from '../xiaomiAdapter.js';
import { DlnaCastStrategy } from './dlnaStrategy.js';
import { MinaCloudCastStrategy } from './minaCloudStrategy.js';
import { MiotCloudCastStrategy } from './miotCloudStrategy.js';
import { MiioLanCastStrategy } from './miioLanStrategy.js';
import { VoiceDirectiveCastStrategy } from './voiceDirectiveStrategy.js';

export class CastPipelineManager {
  private strategies: ICastStrategy[] = [];

  constructor() {
    this.strategies = [
      new DlnaCastStrategy(),
      new MinaCloudCastStrategy(),
      new MiotCloudCastStrategy(),
      new MiioLanCastStrategy(),
      new VoiceDirectiveCastStrategy()
    ].sort((a, b) => b.priority - a.priority);
  }

  public async executePipeline(ctx: CastContext): Promise<CastResult> {
    const applicable = this.strategies.filter((s) => s.canHandle(ctx));
    console.log(
      `[CastPipelineManager] Starting playback pipeline for "${ctx.targetDevice.name}" (${ctx.targetDevice.did}). Active strategies: [${applicable.map((s) => s.name).join(' ➔ ')}]`
    );

    for (const strategy of applicable) {
      try {
        const res = await strategy.execute(ctx);
        if (res && res.success) {
          console.log(`[CastPipelineManager] ✅ Pipeline succeeded via [${strategy.name}] for "${ctx.targetDevice.name}"`);
          return res;
        }
      } catch (err: any) {
        console.warn(`[CastPipelineManager] Strategy [${strategy.name}] failed:`, err.message);
      }
    }

    ctx.steps.push({
      timestamp: ctx.nowStr(),
      step: 'ALL_PROTOCOLS_EXHAUSTED',
      status: 'FAIL',
      statusCode: 500,
      message: 'DLNA、Mina UBUS、MIoT Spec、miIO 54321 全部降级尝试均未成功'
    });

    return {
      success: false,
      message: `未能成功向音箱【${ctx.targetDevice.name}】下发播放指令：所有投播通道均未响应或未实际拉取音频流。请检查音箱网络连通性、DLNA开关或小米账号登录状态。`,
      protocol: 'All Protocols Fallback Exhausted',
      streamUrl: ctx.streamUrl,
      steps: ctx.steps
    };
  }
}

export const castPipelineManager = new CastPipelineManager();
