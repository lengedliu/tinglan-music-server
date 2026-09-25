import fs from 'fs';
import path from 'path';
import { ICastStrategy, CastContext } from './castStrategy.js';
import { CastResult } from '../xiaomiAdapter.js';
import { DlnaCastStrategy } from './dlnaStrategy.js';
import { MinaCloudCastStrategy } from './minaCloudStrategy.js';
import { MiotCloudCastStrategy } from './miotCloudStrategy.js';
import { MiioLanCastStrategy } from './miioLanStrategy.js';
import { VoiceDirectiveCastStrategy } from './voiceDirectiveStrategy.js';
import { JsonStore } from '../../storage/jsonStore.js';
import { deviceStrategyRepository, DeviceStrategyProfile as RepoProfile } from '../../core/repositories/deviceStrategyRepository.js';

export interface DeviceStrategyProfile {
  deviceId: string;
  deviceName?: string;
  model?: string;
  preferredStrategy: string;
  lastSuccessTime: number;
  failStreak: number;
  totalCalls: number;
  successCount: number;
  failCount: number;
  lastLatencyMs?: number;
  avgLatencyMs?: number;
  healthScore: number;
  lastError?: string;
  degradedUntil?: number;
}

export class CastPipelineManager {
  private strategies: ICastStrategy[] = [];
  private profilesFile: string;
  private deviceProfiles: Map<string, DeviceStrategyProfile> = new Map();

  constructor(dataDir?: string) {
    this.strategies = [
      new DlnaCastStrategy(),
      new MinaCloudCastStrategy(),
      new MiotCloudCastStrategy(),
      new MiioLanCastStrategy(),
      new VoiceDirectiveCastStrategy()
    ].sort((a, b) => b.priority - a.priority);

    const baseDir = dataDir || process.env.DATA_DIR || path.join(process.cwd(), 'data');
    this.profilesFile = path.join(baseDir, 'device_strategy_cache.json');
    this.loadProfiles();
  }

  public setDataDir(dataDir: string) {
    this.profilesFile = path.join(dataDir, 'device_strategy_cache.json');
    this.loadProfiles();
  }

  private loadProfiles() {
    try {
      // First load from repo
      const repoProfiles = deviceStrategyRepository.getAllProfiles();
      if (repoProfiles.length > 0) {
        for (const rp of repoProfiles) {
          this.deviceProfiles.set(rp.deviceDid, {
            deviceId: rp.deviceDid,
            deviceName: rp.deviceName,
            model: rp.deviceModel,
            preferredStrategy: rp.preferredProtocol,
            lastSuccessTime: rp.lastSuccessAt ? new Date(rp.lastSuccessAt).getTime() : Date.now(),
            failStreak: 0,
            totalCalls: rp.totalCalls || 0,
            successCount: rp.successCount || 0,
            failCount: rp.failCount || 0,
            lastLatencyMs: rp.lastLatencyMs,
            avgLatencyMs: rp.avgLatencyMs,
            healthScore: rp.healthScore ?? 100,
            lastError: rp.lastError
          });
        }
      }

      const list = JsonStore.readJson<DeviceStrategyProfile[]>(this.profilesFile, []);
      if (Array.isArray(list)) {
        for (const item of list) {
          if (item && item.deviceId && !this.deviceProfiles.has(item.deviceId)) {
            this.deviceProfiles.set(item.deviceId, {
              totalCalls: item.totalCalls || 0,
              successCount: item.successCount || (item.lastSuccessTime ? 1 : 0),
              failCount: item.failCount || item.failStreak || 0,
              healthScore: item.healthScore ?? 100,
              ...item
            });
          }
        }
      }
      console.log(`[CastPipelineManager] 📊 已成功装载 ${this.deviceProfiles.size} 个音箱投播自愈策略画像.`);
    } catch (err: any) {
      console.warn('[CastPipelineManager] Could not load device_strategy_cache:', err?.message);
    }
  }

  private persistProfiles() {
    try {
      const arr = Array.from(this.deviceProfiles.values());
      JsonStore.saveJson(this.profilesFile, arr);
    } catch (err: any) {
      console.warn('[CastPipelineManager] Failed to persist device strategy cache:', err?.message);
    }
  }

  public getProfile(deviceId: string): DeviceStrategyProfile | undefined {
    return this.deviceProfiles.get(deviceId);
  }

  public getProfilesReport(): DeviceStrategyProfile[] {
    return Array.from(this.deviceProfiles.values());
  }

  public setPreferredStrategy(deviceId: string, strategyName: string, deviceName?: string, model?: string, latencyMs?: number) {
    const existing = this.deviceProfiles.get(deviceId) || {
      deviceId,
      deviceName,
      model,
      preferredStrategy: strategyName,
      lastSuccessTime: Date.now(),
      failStreak: 0,
      totalCalls: 0,
      successCount: 0,
      failCount: 0,
      healthScore: 100
    };
    existing.preferredStrategy = strategyName;
    existing.lastSuccessTime = Date.now();
    existing.failStreak = 0;
    existing.degradedUntil = undefined;
    existing.totalCalls = (existing.totalCalls || 0) + 1;
    existing.successCount = (existing.successCount || 0) + 1;
    if (latencyMs !== undefined) {
      existing.lastLatencyMs = latencyMs;
      existing.avgLatencyMs = existing.avgLatencyMs ? Math.round((existing.avgLatencyMs * 0.7) + (latencyMs * 0.3)) : latencyMs;
    }
    const ratio = existing.totalCalls > 0 ? (existing.successCount / existing.totalCalls) : 1;
    existing.healthScore = Math.min(100, Math.max(10, Math.round(ratio * 100)));

    if (deviceName) existing.deviceName = deviceName;
    if (model) existing.model = model;
    this.deviceProfiles.set(deviceId, existing);
    this.persistProfiles();

    // Sync with enterprise Repository
    deviceStrategyRepository.recordSuccess({
      deviceDid: deviceId,
      deviceName: existing.deviceName,
      deviceModel: existing.model,
      protocol: strategyName,
      latencyMs
    });
  }

  public recordStrategyFailure(deviceId: string, strategyName: string, errorMsg?: string) {
    const profile = this.deviceProfiles.get(deviceId);
    if (!profile) return;
    profile.totalCalls = (profile.totalCalls || 0) + 1;
    profile.failCount = (profile.failCount || 0) + 1;
    profile.failStreak = (profile.failStreak || 0) + 1;
    profile.lastError = errorMsg || 'Strategy execution failed';
    if (profile.failStreak >= 2) {
      profile.degradedUntil = Date.now() + 5 * 60 * 1000;
      console.warn(`[CastPipelineManager] ⚠️ Device [${deviceId}] fast-path [${strategyName}] degraded for 5m due to ${profile.failStreak} consecutive failures.`);
    }
    const ratio = profile.totalCalls > 0 ? (profile.successCount / profile.totalCalls) : 0.5;
    profile.healthScore = Math.min(100, Math.max(5, Math.round(ratio * 100 - profile.failStreak * 12)));
    this.persistProfiles();

    // Sync with enterprise Repository
    deviceStrategyRepository.recordFailure({
      deviceDid: deviceId,
      deviceName: profile.deviceName,
      deviceModel: profile.model,
      protocol: strategyName,
      errorMsg,
      isFallback: true
    });
  }

  public clearProfile(deviceId: string) {
    if (this.deviceProfiles.delete(deviceId)) {
      this.persistProfiles();
      deviceStrategyRepository.resetProfile(deviceId);
    }
  }

  public resetAllProfiles() {
    this.deviceProfiles.clear();
    this.persistProfiles();
    deviceStrategyRepository.clearAll();
  }

  public async executePipeline(ctx: CastContext): Promise<CastResult> {
    const devId = ctx.targetDevice.did || ctx.targetDevice.ip || 'unknown';
    const profile = this.deviceProfiles.get(devId);
    let applicable = this.strategies.filter((s) => s.canHandle(ctx));

    // Phase 3 Self-Healing check: If degradation cooldown has expired, reset failStreak to auto-probe fast-path
    if (profile && profile.degradedUntil && Date.now() > profile.degradedUntil) {
      console.log(`[CastPipelineManager] 🩺 Self-Healing: Degradation cooldown expired for "${ctx.targetDevice.name}" (${devId}). Re-probing fast-path [${profile.preferredStrategy}].`);
      profile.degradedUntil = undefined;
      profile.failStreak = 0;
      this.persistProfiles();
    }

    const isDegraded = Boolean(profile?.degradedUntil && Date.now() <= profile.degradedUntil);

    // Fast-Path Heuristic 1: Verified historical preferred strategy
    if (profile && profile.preferredStrategy && !isDegraded && profile.failStreak < 2) {
      const preferredIdx = applicable.findIndex((s) => s.name === profile.preferredStrategy);
      if (preferredIdx > 0) {
        const [preferred] = applicable.splice(preferredIdx, 1);
        applicable.unshift(preferred);
        console.log(
          `⚡ [CastPipelineManager] Fast-Path Activated: Prioritizing verified strategy [${preferred.name}] for "${ctx.targetDevice.name}" (${ctx.targetDevice.did}) (Health: ${profile.healthScore}%)`
        );
        ctx.steps.push({
          timestamp: ctx.nowStr(),
          step: 'FAST_PATH_ROUTING',
          status: 'OK',
          statusCode: 200,
          message: `自适应策略引擎已激活: 优先直连经过验证的快速通道 [${preferred.name}] (健康度: ${profile.healthScore}%)`
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
      const strategyStartTime = Date.now();
      try {
        const res = await strategy.execute(ctx);
        const elapsedMs = Date.now() - strategyStartTime;
        if (res && res.success) {
          console.log(`[CastPipelineManager] ✅ Pipeline succeeded via [${strategy.name}] for "${ctx.targetDevice.name}" in ${elapsedMs}ms`);

          // Record and remember successful strategy for fast-path next time with telemetry
          this.setPreferredStrategy(devId, strategy.name, ctx.targetDevice.name, ctx.targetDevice.model, elapsedMs);

          return res;
        } else {
          // Record failure telemetry
          this.recordStrategyFailure(devId, strategy.name, 'Strategy reported unsuccessful result');
        }
      } catch (err: any) {
        console.warn(`[CastPipelineManager] Strategy [${strategy.name}] failed:`, err.message);
        this.recordStrategyFailure(devId, strategy.name, err.message);
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
