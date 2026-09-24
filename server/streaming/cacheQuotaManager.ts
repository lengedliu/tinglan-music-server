import fs from 'fs';
import path from 'path';
import { JsonStore } from '../storage/jsonStore.js';

export interface CacheEntryMeta {
  songId: string;
  fileName: string;
  filePath: string;
  sizeBytes: number;
  format: string;
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
  sourcePath?: string;
  sourceMtimeMs?: number;
}

export interface CacheQuotaConfig {
  maxQuotaBytes: number;     // e.g. 2 * 1024 * 1024 * 1024 (2GB)
  pruneTargetBytes: number;  // e.g. 1.6 * 1024 * 1024 * 1024 (80% of max quota)
  maxTtlMs: number;          // e.g. 7 * 24 * 60 * 60 * 1000 (7 days)
  autoPruneIntervalMs: number; // e.g. 10 * 60 * 1000 (10 minutes)
}

export interface CacheManagerStats {
  count: number;
  totalSizeBytes: number;
  totalSizeMb: string;
  quotaBytes: number;
  quotaMb: string;
  usageRatio: number;
  pruneTargetMb: string;
  maxTtlDays: number;
  evictionCountTotal: number;
  lastPruneTime?: number;
  lastPruneFreedBytes?: number;
  topFiles: Array<{
    fileName: string;
    songId: string;
    sizeMb: string;
    accessCount: number;
    lastAccessedStr: string;
  }>;
}

const DEFAULT_CONFIG: CacheQuotaConfig = {
  maxQuotaBytes: 2 * 1024 * 1024 * 1024,      // 2 GB default quota
  pruneTargetBytes: 1.6 * 1024 * 1024 * 1024, // 1.6 GB (80% target)
  maxTtlMs: 7 * 24 * 60 * 60 * 1000,          // 7 days default TTL
  autoPruneIntervalMs: 10 * 60 * 1000         // 10 minutes periodic check
};

/**
 * Intelligent Audio Transcode Cache Lifecycle & LRU Quota Manager
 * 
 * Capabilities:
 * 1. Disk & I/O quota bounding: Enforces a strict upper bound (e.g. 2GB max) with 80% watermark pruning.
 * 2. Frequency & Recency Aware (LFU + LRU Hybrid Score):
 *    Evicts least recently used and lowest played temporary audio files first.
 * 3. TTL Expiration: Automatically purges files unplayed for more than maxTtlMs (7 days).
 * 4. Thread-Safe Atomic Metadata Persistence:
 *    Maintains cache_metadata.json with lastAccessedAt, accessCount, and file size.
 * 5. Instant Orphan Sweep: Automatically detects and purges unfinalized .part / .tmp files.
 */
export class CacheQuotaManager {
  private cacheDir: string;
  private metaFilePath: string;
  private config: CacheQuotaConfig;
  private metadataMap: Map<string, CacheEntryMeta> = new Map();
  private pruneTimer: NodeJS.Timeout | null = null;
  private evictionCountTotal: number = 0;
  private lastPruneTime: number = 0;
  private lastPruneFreedBytes: number = 0;

  constructor(cacheDir: string, dataDir?: string, userConfig?: Partial<CacheQuotaConfig>) {
    this.cacheDir = cacheDir;
    const metaDir = dataDir || path.dirname(cacheDir);
    this.metaFilePath = path.join(metaDir, 'cache_quota_metadata.json');
    this.config = { ...DEFAULT_CONFIG, ...userConfig };

    this.ensureDirectory(this.cacheDir);
    this.loadMetadata();
    this.reconcileWithDisk();

    // Start background auto-prune timer
    this.startAutoPrune();
  }

  private ensureDirectory(dir: string): void {
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (err: any) {
        console.error(`[CacheQuotaManager] Failed to create directory ${dir}:`, err?.message);
      }
    }
  }

  private loadMetadata(): void {
    try {
      const saved = JsonStore.readJson<Record<string, CacheEntryMeta>>(this.metaFilePath, {});
      if (saved && typeof saved === 'object') {
        for (const [key, val] of Object.entries(saved)) {
          if (val && val.fileName) {
            this.metadataMap.set(key, val);
          }
        }
      }
    } catch (err: any) {
      console.warn('[CacheQuotaManager] Warning loading cache metadata:', err?.message);
    }
  }

  private persistMetadata(): void {
    try {
      const record: Record<string, CacheEntryMeta> = {};
      for (const [key, val] of this.metadataMap.entries()) {
        record[key] = val;
      }
      JsonStore.saveJson(this.metaFilePath, record);
    } catch (err: any) {
      console.warn('[CacheQuotaManager] Failed to persist cache metadata:', err?.message);
    }
  }

  /**
   * Synchronizes metadata with real files on disk:
   * 1. Removes stale metadata entries whose file no longer exists.
   * 2. Discovers untracked cache files on disk and adds them.
   * 3. Cleans orphaned .part or .tmp files.
   */
  public reconcileWithDisk(): void {
    try {
      if (!fs.existsSync(this.cacheDir)) return;
      const fileNames = fs.readdirSync(this.cacheDir);
      const diskFileSet = new Set<string>();

      let orphanPartsCount = 0;
      for (const name of fileNames) {
        const fullPath = path.join(this.cacheDir, name);
        // Orphan temp / part file cleaner
        if (name.includes('.part.') || name.includes('.tmp.') || name.endsWith('.part')) {
          try {
            fs.unlinkSync(fullPath);
            orphanPartsCount++;
          } catch {}
          continue;
        }

        try {
          const stat = fs.statSync(fullPath);
          if (stat.isFile()) {
            diskFileSet.add(name);
            const existing = this.metadataMap.get(name);
            if (existing) {
              existing.sizeBytes = stat.size;
            } else {
              // Untracked cache file found
              const songId = name.replace(/_standard\.(mp3|wav|flac|aac)$/i, '');
              this.metadataMap.set(name, {
                songId,
                fileName: name,
                filePath: fullPath,
                sizeBytes: stat.size,
                format: path.extname(name).toLowerCase(),
                createdAt: stat.birthtimeMs || stat.mtimeMs,
                lastAccessedAt: stat.atimeMs || stat.mtimeMs,
                accessCount: 1
              });
            }
          }
        } catch {}
      }

      // Purge metadata for removed files
      for (const key of Array.from(this.metadataMap.keys())) {
        if (!diskFileSet.has(key)) {
          this.metadataMap.delete(key);
        }
      }

      if (orphanPartsCount > 0) {
        console.log(`[CacheQuotaManager] 🧹 Swept ${orphanPartsCount} orphaned partial transcode files.`);
      }

      this.persistMetadata();
    } catch (err: any) {
      console.warn('[CacheQuotaManager] Error reconciling disk cache:', err?.message);
    }
  }

  /**
   * Records or updates cache item access (LRU timestamp + LFU hit count)
   */
  public touchCache(fileNameOrSongId: string, filePath?: string, sourcePath?: string): void {
    const fileName = fileNameOrSongId.endsWith('.mp3')
      ? path.basename(fileNameOrSongId)
      : `${fileNameOrSongId.replace(/[^a-zA-Z0-9_-]/g, '_')}_standard.mp3`;

    const fullPath = filePath || path.join(this.cacheDir, fileName);
    let entry = this.metadataMap.get(fileName);

    const now = Date.now();
    if (!entry) {
      let sizeBytes = 0;
      try {
        if (fs.existsSync(fullPath)) {
          sizeBytes = fs.statSync(fullPath).size;
        }
      } catch {}
      entry = {
        songId: fileName.replace(/_standard\.mp3$/i, ''),
        fileName,
        filePath: fullPath,
        sizeBytes,
        format: '.mp3',
        createdAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        sourcePath
      };
      this.metadataMap.set(fileName, entry);
    } else {
      entry.lastAccessedAt = now;
      entry.accessCount = (entry.accessCount || 0) + 1;
      if (sourcePath) entry.sourcePath = sourcePath;
      if (!entry.sizeBytes && fs.existsSync(fullPath)) {
        try {
          entry.sizeBytes = fs.statSync(fullPath).size;
        } catch {}
      }
    }

    this.persistMetadata();
  }

  /**
   * Registers a newly finalized cache file
   */
  public registerNewCache(
    fileName: string,
    songId: string,
    sizeBytes: number,
    sourcePath?: string,
    sourceMtimeMs?: number
  ): void {
    const fullPath = path.join(this.cacheDir, fileName);
    const now = Date.now();
    this.metadataMap.set(fileName, {
      songId,
      fileName,
      filePath: fullPath,
      sizeBytes,
      format: path.extname(fileName).toLowerCase(),
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 1,
      sourcePath,
      sourceMtimeMs
    });
    this.persistMetadata();

    // Trigger non-blocking quota eviction check
    setImmediate(() => {
      this.enforceQuota();
    });
  }

  /**
   * Core Quota & LRU/LFU Eviction Engine
   * Calculates hybrid eviction score:
   * Score = (now - lastAccessedAt) / 1000 - (accessCount * 3600)
   * Higher score means older and less played -> evict first.
   */
  public enforceQuota(customMaxBytes?: number, customTargetBytes?: number): {
    evictedCount: number;
    freedBytes: number;
    freedMb: string;
    totalSizeBytes: number;
  } {
    const maxQuota = customMaxBytes ?? this.config.maxQuotaBytes;
    const targetQuota = customTargetBytes ?? this.config.pruneTargetBytes;
    const now = Date.now();

    let evictedCount = 0;
    let freedBytes = 0;

    try {
      this.reconcileWithDisk();

      const entries = Array.from(this.metadataMap.values());
      let totalBytes = entries.reduce((sum, e) => sum + (e.sizeBytes || 0), 0);

      // Phase 1: Evict TTL expired items (> maxTtlMs, default 7 days)
      for (const entry of entries) {
        const ageMs = now - (entry.lastAccessedAt || entry.createdAt);
        if (ageMs > this.config.maxTtlMs) {
          try {
            if (fs.existsSync(entry.filePath)) {
              fs.unlinkSync(entry.filePath);
            }
            freedBytes += entry.sizeBytes;
            totalBytes -= entry.sizeBytes;
            this.metadataMap.delete(entry.fileName);
            evictedCount++;
          } catch (delErr: any) {
            console.warn(`[CacheQuotaManager] Failed to unlink TTL expired ${entry.fileName}:`, delErr?.message);
          }
        }
      }

      // Phase 2: If still exceeding maxQuota, evict lowest score first until targetQuota
      if (totalBytes > maxQuota) {
        console.log(
          `[CacheQuotaManager] 🚨 Transcode cache usage (${(totalBytes / (1024 * 1024)).toFixed(1)} MB) exceeded quota (${(maxQuota / (1024 * 1024)).toFixed(0)} MB). Triggering LRU/LFU eviction...`
        );

        // Sort descending by eviction priority score (higher score = older + less accessed)
        const remainingEntries = Array.from(this.metadataMap.values()).sort((a, b) => {
          // Weight: age in hours minus frequency bonus (each play gives 24 hours immunity)
          const ageHoursA = (now - (a.lastAccessedAt || a.createdAt)) / 3600000;
          const ageHoursB = (now - (b.lastAccessedAt || b.createdAt)) / 3600000;
          const scoreA = ageHoursA - ((a.accessCount || 1) * 24);
          const scoreB = ageHoursB - ((b.accessCount || 1) * 24);
          return scoreB - scoreA;
        });

        for (const entry of remainingEntries) {
          try {
            if (fs.existsSync(entry.filePath)) {
              fs.unlinkSync(entry.filePath);
            }
            freedBytes += entry.sizeBytes;
            totalBytes -= entry.sizeBytes;
            this.metadataMap.delete(entry.fileName);
            evictedCount++;
            if (totalBytes <= targetQuota) {
              break;
            }
          } catch (delErr: any) {
            console.warn(`[CacheQuotaManager] Failed to unlink ${entry.fileName}:`, delErr?.message);
          }
        }

        console.log(
          `[CacheQuotaManager] ✅ Quota enforced: Evicted ${evictedCount} files, freed ${(freedBytes / (1024 * 1024)).toFixed(1)} MB. Current usage: ${(totalBytes / (1024 * 1024)).toFixed(1)} MB / ${(maxQuota / (1024 * 1024)).toFixed(0)} MB.`
        );
      }

      this.evictionCountTotal += evictedCount;
      if (evictedCount > 0) {
        this.lastPruneTime = now;
        this.lastPruneFreedBytes = freedBytes;
        this.persistMetadata();
      }

      return {
        evictedCount,
        freedBytes,
        freedMb: `${(freedBytes / (1024 * 1024)).toFixed(1)} MB`,
        totalSizeBytes: totalBytes
      };
    } catch (err: any) {
      console.warn('[CacheQuotaManager] Quota enforcement error:', err?.message);
      return {
        evictedCount: 0,
        freedBytes: 0,
        freedMb: '0.0 MB',
        totalSizeBytes: 0
      };
    }
  }

  /**
   * Manually sets the quota upper bound (in MB or GB)
   */
  public setMaxQuotaBytes(maxBytes: number): void {
    if (maxBytes >= 100 * 1024 * 1024 && maxBytes <= 100 * 1024 * 1024 * 1024) {
      this.config.maxQuotaBytes = maxBytes;
      this.config.pruneTargetBytes = Math.round(maxBytes * 0.8);
      console.log(
        `[CacheQuotaManager] Quota updated: Max ${(maxBytes / (1024 * 1024)).toFixed(0)} MB, Prune Target ${(this.config.pruneTargetBytes / (1024 * 1024)).toFixed(0)} MB.`
      );
      this.enforceQuota();
    }
  }

  /**
   * Clears the entire cache directory and resets metadata
   */
  public clearAll(): { clearedCount: number; freedBytes: number; freedMb: string } {
    let clearedCount = 0;
    let freedBytes = 0;
    try {
      if (fs.existsSync(this.cacheDir)) {
        const fileNames = fs.readdirSync(this.cacheDir);
        for (const name of fileNames) {
          const fullPath = path.join(this.cacheDir, name);
          try {
            const stat = fs.statSync(fullPath);
            freedBytes += stat.size;
            fs.unlinkSync(fullPath);
            clearedCount++;
          } catch {}
        }
      }
      this.metadataMap.clear();
      this.persistMetadata();
    } catch (err: any) {
      console.error('[CacheQuotaManager] Error clearing cache:', err?.message);
    }
    return {
      clearedCount,
      freedBytes,
      freedMb: `${(freedBytes / (1024 * 1024)).toFixed(1)} MB`
    };
  }

  /**
   * Returns rich telemetry and storage quota analytics for admin dashboard
   */
  public getStats(): CacheManagerStats {
    let totalBytes = 0;
    for (const val of this.metadataMap.values()) {
      totalBytes += val.sizeBytes || 0;
    }

    const usageRatio = this.config.maxQuotaBytes > 0
      ? Math.min(1, totalBytes / this.config.maxQuotaBytes)
      : 0;

    // Top 8 files by size / popularity
    const sorted = Array.from(this.metadataMap.values())
      .sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0))
      .slice(0, 8)
      .map(item => ({
        fileName: item.fileName,
        songId: item.songId,
        sizeMb: `${((item.sizeBytes || 0) / (1024 * 1024)).toFixed(1)} MB`,
        accessCount: item.accessCount || 1,
        lastAccessedStr: new Date(item.lastAccessedAt || item.createdAt).toLocaleString()
      }));

    return {
      count: this.metadataMap.size,
      totalSizeBytes: totalBytes,
      totalSizeMb: `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`,
      quotaBytes: this.config.maxQuotaBytes,
      quotaMb: `${(this.config.maxQuotaBytes / (1024 * 1024)).toFixed(0)} MB`,
      usageRatio: Math.round(usageRatio * 100) / 100,
      pruneTargetMb: `${(this.config.pruneTargetBytes / (1024 * 1024)).toFixed(0)} MB`,
      maxTtlDays: Math.round(this.config.maxTtlMs / (24 * 3600000)),
      evictionCountTotal: this.evictionCountTotal,
      lastPruneTime: this.lastPruneTime || undefined,
      lastPruneFreedBytes: this.lastPruneFreedBytes || undefined,
      topFiles: sorted
    };
  }

  private startAutoPrune(): void {
    if (this.pruneTimer) clearInterval(this.pruneTimer);
    this.pruneTimer = setInterval(() => {
      this.enforceQuota();
    }, this.config.autoPruneIntervalMs);
  }

  public destroy(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
  }
}
