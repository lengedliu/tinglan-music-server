import fs from 'fs';
import path from 'path';

export interface DeviceStrategyProfile {
  deviceDid: string;
  deviceName?: string;
  deviceModel: string;
  preferredProtocol: string;
  directStreamSupported: boolean;
  bestMimeType: string;
  transcodeProfile?: string;
  avgLatencyMs: number;
  lastLatencyMs: number;
  successRatePercent: number;
  totalCalls: number;
  successCount: number;
  failCount: number;
  fallbackCount: number;
  healthScore: number;
  lastError?: string;
  lastSuccessAt?: string;
  updatedAt: string;
  degradedUntil?: number;
}

export class DeviceStrategyRepository {
  private dataDir: string;
  private profileFile: string;
  private profiles: Map<string, DeviceStrategyProfile> = new Map();
  private sqliteDb: any = null;

  constructor(dataDir: string = path.join(process.cwd(), 'data'), sqliteDb: any = null) {
    this.dataDir = dataDir;
    this.sqliteDb = sqliteDb;
    this.profileFile = path.join(this.dataDir, 'device_strategy_profiles.json');
    this.loadFromDisk();
  }

  public setSqliteDb(db: any) {
    this.sqliteDb = db;
    this.syncFromSqlite();
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(this.profileFile)) {
        const raw = fs.readFileSync(this.profileFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach(item => {
            if (item && item.deviceDid) {
              this.profiles.set(item.deviceDid, item);
            }
          });
        }
      }
    } catch (err) {
      console.warn('[DeviceStrategyRepository] Failed to read device_strategy_profiles.json:', err);
    }
  }

  private syncFromSqlite() {
    if (!this.sqliteDb) return;
    try {
      this.sqliteDb.all('SELECT * FROM device_strategy_profiles ORDER BY updated_at DESC', (err: any, rows: any[]) => {
        if (!err && Array.isArray(rows) && rows.length > 0) {
          rows.forEach(r => {
            const item: DeviceStrategyProfile = {
              deviceDid: r.device_did,
              deviceName: r.device_name,
              deviceModel: r.device_model || 'unknown',
              preferredProtocol: r.preferred_protocol || 'mina',
              directStreamSupported: Boolean(r.direct_stream_supported),
              bestMimeType: r.best_mime_type || 'audio/mp3',
              transcodeProfile: r.transcode_profile,
              avgLatencyMs: Number(r.avg_latency_ms || 0),
              lastLatencyMs: Number(r.last_latency_ms || 0),
              successRatePercent: Number(r.success_rate_percent || 100),
              totalCalls: Number(r.total_calls || 0),
              successCount: Number(r.success_count || 0),
              failCount: Number(r.fail_count || 0),
              fallbackCount: Number(r.fallback_count || 0),
              healthScore: Number(r.health_score || 100),
              lastError: r.last_error,
              lastSuccessAt: r.last_success_at,
              updatedAt: r.updated_at
            };
            this.profiles.set(item.deviceDid, item);
          });
          console.log(`[DeviceStrategyRepository] 🔄 从 SQLite 成功载入 ${this.profiles.size} 个音箱自学习策略画像.`);
        }
      });
    } catch (e) {
      console.error('[DeviceStrategyRepository] Sync from SQLite error:', e);
    }
  }

  private persistAsync() {
    try {
      const arr = Array.from(this.profiles.values());
      fs.writeFile(this.profileFile, JSON.stringify(arr, null, 2), 'utf-8', (err) => {
        if (err) console.error('[DeviceStrategyRepository] JSON save error:', err);
      });
    } catch (e) {
      console.error('[DeviceStrategyRepository] Persist async error:', e);
    }
  }

  public getAllProfiles(): DeviceStrategyProfile[] {
    return Array.from(this.profiles.values());
  }

  public getProfile(deviceDid: string): DeviceStrategyProfile | undefined {
    return this.profiles.get(deviceDid);
  }

  public saveProfile(profile: DeviceStrategyProfile): DeviceStrategyProfile {
    this.profiles.set(profile.deviceDid, profile);
    this.persistAsync();

    if (this.sqliteDb) {
      try {
        this.sqliteDb.run(`
          INSERT INTO device_strategy_profiles (
            device_did, device_name, device_model, preferred_protocol,
            direct_stream_supported, best_mime_type, transcode_profile,
            avg_latency_ms, last_latency_ms, success_rate_percent,
            total_calls, success_count, fail_count, fallback_count,
            health_score, last_error, last_success_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(device_did) DO UPDATE SET
            device_name = excluded.device_name,
            device_model = excluded.device_model,
            preferred_protocol = excluded.preferred_protocol,
            direct_stream_supported = excluded.direct_stream_supported,
            best_mime_type = excluded.best_mime_type,
            transcode_profile = excluded.transcode_profile,
            avg_latency_ms = excluded.avg_latency_ms,
            last_latency_ms = excluded.last_latency_ms,
            success_rate_percent = excluded.success_rate_percent,
            total_calls = excluded.total_calls,
            success_count = excluded.success_count,
            fail_count = excluded.fail_count,
            fallback_count = excluded.fallback_count,
            health_score = excluded.health_score,
            last_error = excluded.last_error,
            last_success_at = excluded.last_success_at,
            updated_at = excluded.updated_at
        `, [
          profile.deviceDid,
          profile.deviceName || null,
          profile.deviceModel,
          profile.preferredProtocol,
          profile.directStreamSupported ? 1 : 0,
          profile.bestMimeType,
          profile.transcodeProfile || null,
          profile.avgLatencyMs,
          profile.lastLatencyMs,
          profile.successRatePercent,
          profile.totalCalls,
          profile.successCount,
          profile.failCount,
          profile.fallbackCount,
          profile.healthScore,
          profile.lastError || null,
          profile.lastSuccessAt || null,
          profile.updatedAt
        ]);
      } catch (e) {
        console.error('[DeviceStrategyRepository] SQLite upsert error:', e);
      }
    }

    return profile;
  }

  public recordSuccess(params: {
    deviceDid: string;
    deviceName?: string;
    deviceModel?: string;
    protocol: string;
    latencyMs?: number;
    mimeType?: string;
    directStream?: boolean;
  }): DeviceStrategyProfile {
    const existing = this.profiles.get(params.deviceDid) || {
      deviceDid: params.deviceDid,
      deviceName: params.deviceName,
      deviceModel: params.deviceModel || 'unknown',
      preferredProtocol: params.protocol,
      directStreamSupported: Boolean(params.directStream),
      bestMimeType: params.mimeType || 'audio/mp3',
      avgLatencyMs: params.latencyMs || 0,
      lastLatencyMs: params.latencyMs || 0,
      successRatePercent: 100,
      totalCalls: 0,
      successCount: 0,
      failCount: 0,
      fallbackCount: 0,
      healthScore: 100,
      updatedAt: new Date().toISOString()
    };

    existing.totalCalls += 1;
    existing.successCount += 1;
    existing.preferredProtocol = params.protocol;
    existing.lastSuccessAt = new Date().toISOString();
    existing.updatedAt = new Date().toISOString();
    existing.degradedUntil = undefined;
    if (params.deviceName) existing.deviceName = params.deviceName;
    if (params.deviceModel) existing.deviceModel = params.deviceModel;
    if (params.directStream !== undefined) existing.directStreamSupported = params.directStream;
    if (params.mimeType) existing.bestMimeType = params.mimeType;

    if (params.latencyMs !== undefined) {
      existing.lastLatencyMs = params.latencyMs;
      existing.avgLatencyMs = existing.avgLatencyMs > 0
        ? Math.round(existing.avgLatencyMs * 0.7 + params.latencyMs * 0.3)
        : params.latencyMs;
    }

    existing.successRatePercent = Math.round((existing.successCount / existing.totalCalls) * 1000) / 10;
    existing.healthScore = Math.min(100, Math.max(10, Math.round(existing.successRatePercent)));

    return this.saveProfile(existing);
  }

  public recordFailure(params: {
    deviceDid: string;
    deviceName?: string;
    deviceModel?: string;
    protocol: string;
    errorMsg?: string;
    isFallback?: boolean;
  }): DeviceStrategyProfile | undefined {
    let existing = this.profiles.get(params.deviceDid);
    if (!existing) {
      existing = {
        deviceDid: params.deviceDid,
        deviceName: params.deviceName,
        deviceModel: params.deviceModel || 'unknown',
        preferredProtocol: params.protocol,
        directStreamSupported: false,
        bestMimeType: 'audio/mp3',
        avgLatencyMs: 0,
        lastLatencyMs: 0,
        successRatePercent: 50,
        totalCalls: 0,
        successCount: 0,
        failCount: 0,
        fallbackCount: 0,
        healthScore: 50,
        updatedAt: new Date().toISOString()
      };
    }

    existing.totalCalls += 1;
    existing.failCount += 1;
    if (params.isFallback) existing.fallbackCount += 1;
    existing.lastError = params.errorMsg || 'Casting failed';
    existing.updatedAt = new Date().toISOString();

    existing.successRatePercent = Math.round((existing.successCount / existing.totalCalls) * 1000) / 10;
    existing.healthScore = Math.min(100, Math.max(5, Math.round(existing.successRatePercent - 15)));

    return this.saveProfile(existing);
  }

  public resetProfile(deviceDid: string) {
    if (this.profiles.delete(deviceDid)) {
      this.persistAsync();
      if (this.sqliteDb) {
        try {
          this.sqliteDb.run('DELETE FROM device_strategy_profiles WHERE device_did = ?', [deviceDid]);
        } catch (e) {
          console.error('[DeviceStrategyRepository] SQLite delete error:', e);
        }
      }
    }
  }

  public clearAll() {
    this.profiles.clear();
    this.persistAsync();
    if (this.sqliteDb) {
      try {
        this.sqliteDb.run('DELETE FROM device_strategy_profiles');
      } catch (e) {
        console.error('[DeviceStrategyRepository] SQLite clear error:', e);
      }
    }
  }
}

export const deviceStrategyRepository = new DeviceStrategyRepository();
