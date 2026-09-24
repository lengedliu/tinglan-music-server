import fs from 'fs';
import path from 'path';
import { ICastStrategy, CastContext } from './castStrategy.js';
import { CastResult } from '../xiaomiAdapter.js';
import { DlnaCastStrategy } from './dlnaStrategy.js';
import { MinaCloudCastStrategy } from './minaCloudStrategy.js';
import { MiotCloudCastStrategy } from './miotCloudStrategy.js';
import { MiioLanCastStrategy } from './miioLanStrategy.js';
import { VoiceDirectiveCastStrategy } from './voiceDirectiveStrategy.js';

export interface DeviceStrategyProfile {
  deviceId: string;
  deviceName?: string;
  model?: string;
  preferredStrategy: string;
  lastSuccessTime: number;
  failStreak: number;
}

export class CastPipelineManager {
  private strategies: ICastStrategy[] = [];
  private profilesFile: string;
  private deviceProfiles: Map<string, DeviceStrategyProfile> = new Map();

  constructor() {
    this.strategies = [
      new DlnaCastStrategy(),
      new MinaCloudCastStrategy(),
      new MiotCloudCastStrategy(),
      new MiioLanCastStrategy(),
      new VoiceDirectiveCastStrategy()
    ].sort((a, b) => b.priority - a.priority);

    this.profilesFile = path.join(process.cwd(), 'data', 'device_strategy_cache.json');
    this.loadProfiles();
  }

  private loadProfiles() {
    try {
      if (fs.existsSync(this.profilesFile)) {
        const raw = fs.readFileSync(this.profilesFile, 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          for (const item of list) {
            if (item.deviceId) {
              this.deviceProfiles.set(item.deviceId, item);
            }
          }
          console.log(`[CastPipelineManager] Loaded ${this.deviceProfiles.size} device strategy profiles.`);
        }
      }
    } catch (err) {
      console.warn('[CastPipelineManager] Could not parse device_strategy_cache.json:', err);
    }
  }

  private persistProfiles() {
    try {
      const dataDir = path.dirname(this.profilesFile);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const arr = Array.from(this.deviceProfiles.values());
      fs.writeFileSync(this.profilesFile, JSON.stringify(arr, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[CastPipelineManager] Failed to persist device strategy cache:', err);
    }
  }

  public getProfile(deviceId: string): DeviceStrategyProfile | undefined {
    return this.deviceProfiles.get(deviceId);
  }

  public setPreferredStrategy(deviceId: string, strategyName: string, deviceName?: string, model?: string) {
    const existing = this.deviceProfiles.get(deviceId) || {
      deviceId,
      deviceName,
      model,
      preferredStrategy: strategyName,
      lastSuccessTime: Date.now(),
      failStreak: 0
    };
    existing.preferredStrategy = strategyName;
    existing.lastSuccessTime = Date.now();
    existing.failStreak = 0;
    if (deviceName) existing.deviceName = deviceName;
    if (model) existing.model = model;
    this.deviceProfiles.set(deviceId, existing);
    this.persistProfiles();
  }

  public clearProfile(deviceId: string) {
    if (this.deviceProfiles.delete(deviceId)) {
      this.persistProfiles();
    }
  }

  public async executePipeline(ctx: CastContext): Promise<CastResult> {
    const devId = ctx.targetDevice.did || ctx.targetDevice.ip || 'unknown';
    const profile = this.deviceProfiles.get(devId);
    let applicable = this.strategies.filter((s) => s.canHandle(ctx));

    // Fast-Path Heuristic 1: Verified historical preferred strategy
    if (profile && profile.preferredStrategy && profile.failStreak < 2) {
      const preferredIdx = applicable.findIndex((s) => s.name === profile.preferredStrategy);
      if (preferredIdx > 0) {
        const [preferred] = applicable.splice(preferredIdx, 1);
        applicable.unshift(preferred);
        console.log(
          `⚡ [CastPipelineManager] Fast-Path Activated: Prioritizing verified strategy [${preferred.name}] for "${ctx.targetDevice.name}" (${ctx.targetDevice.did})`
        );
        ctx.steps.push({
          timestamp: ctx.nowStr(),
          step: 'FAST_PATH_ROUTING',
          status: 'OK',
          statusCode: 200,
          message: `自适应策略引擎已激活: 优先直连经过验证的快速通道 [${preferred.name}]`
        });
      }
    } else {
      // Fast-Path Heuristic 2: Known XiaoAi hardware model defaults when Mina Cloud is active
      const modelLower = (ctx.targetDevice.model || '').toLowerCase();
      const isKnownXiaoAiWithoutDlna =
        modelLower.includes('lx06') ||
        modelLower.includes('l05b') ||
        modelLower.includes('l05c') ||
        modelLower.includes('x08c') ||
        modelLower.includes('l06a') ||
        modelLower.includes('l09a') ||
        modelLower.includes('l15a') ||
        modelLower.includes('l16a');

      if (isKnownXiaoAiWithoutDlna && ctx.miotConfig?.micoServiceToken) {
        const minaIdx = applicable.findIndex((s) => s.name === 'Mina_Cloud_UBUS');
        if (minaIdx > 0) {
          const [mina] = applicable.splice(minaIdx, 1);
          applicable.unshift(mina);
          console.log(
            `⚡ [CastPipelineManager] Hardware Profile: Detected XiaoAi model (${modelLower}), prioritizing [Mina_Cloud_UBUS]`
          );
        }
      }
    }

    console.log(
      `[CastPipelineManager] Starting playback pipeline for "${ctx.targetDevice.name}" (${ctx.targetDevice.did}). Strategy sequence: [${applicable.map((s) => s.name).join(' ➔ ')}]`
    );

    for (const strategy of applicable) {
      try {
        const res = await strategy.execute(ctx);
        if (res && res.success) {
          console.log(`[CastPipelineManager] ✅ Pipeline succeeded via [${strategy.name}] for "${ctx.targetDevice.name}"`);

          // Record and remember successful strategy for fast-path next time
          this.setPreferredStrategy(devId, strategy.name, ctx.targetDevice.name, ctx.targetDevice.model);

          return res;
        } else {
          // If this was the cached preferred strategy and it failed, record failure
          if (profile && profile.preferredStrategy === strategy.name) {
            profile.failStreak = (profile.failStreak || 0) + 1;
            console.warn(
              `[CastPipelineManager] Cached preferred strategy [${strategy.name}] failed for "${ctx.targetDevice.name}" (failStreak=${profile.failStreak})`
            );
            this.persistProfiles();
          }
        }
      } catch (err: any) {
        console.warn(`[CastPipelineManager] Strategy [${strategy.name}] failed:`, err.message);
        if (profile && profile.preferredStrategy === strategy.name) {
          profile.failStreak = (profile.failStreak || 0) + 1;
          this.persistProfiles();
        }
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
