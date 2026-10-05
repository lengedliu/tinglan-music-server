import fs from 'fs';
import path from 'path';

export interface CachedVoiceIntent {
  query: string;
  normalizedQuery: string;
  result: any;
  hitCount: number;
  createdAt: number;
  lastHitAt: number;
}

export interface CacheStats {
  totalEntries: number;
  totalHits: number;
  estimatedTokensSaved: number;
  topQueries: Array<{ query: string; hits: number; lastHit: number }>;
}

const CACHE_FILE = path.join(process.cwd(), 'data', 'ai-semantic-cache.json');
const MAX_CACHE_ENTRIES = 300;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class AiSemanticCache {
  private static instance: AiSemanticCache;
  private cache: Map<string, CachedVoiceIntent> = new Map();
  private totalHits = 0;
  private saveTimer: NodeJS.Timeout | null = null;

  private constructor() {
    this.loadCache();
  }

  public static getInstance(): AiSemanticCache {
    if (!AiSemanticCache.instance) {
      AiSemanticCache.instance = new AiSemanticCache();
    }
    return AiSemanticCache.instance;
  }

  /**
   * Normalize query text for maximum cache hit rate
   * e.g. "小爱同学，放几首轻松的歌" -> "轻松的歌"
   * e.g. "播放周杰伦的青花瓷。" -> "周杰伦青花瓷"
   */
  public normalizeQuery(raw: string): string {
    if (!raw) return '';
    let text = raw.toLowerCase().trim();
    // Strip common wake prefixes
    text = text.replace(/^(小爱同学|小爱|小艾|请|帮我|麻烦)/g, '').trim();
    // Strip common play action prefixes
    text = text.replace(/^(播放|放几首|放一首|放首|来几首|来一首|来首|听一下|想听|放点|来点|放|听)/g, '').trim();
    // Strip punctuation and extra spaces
    text = text.replace(/[\s\.,\/#!$%\^&\*;:{}=\-_`~()？?！!，。、“”]/g, '').trim();
    return text;
  }

  public get(rawQuery: string): any | null {
    const key = this.normalizeQuery(rawQuery);
    if (!key) return null;

    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
      this.cache.delete(key);
      this.scheduleSave();
      return null;
    }

    entry.hitCount += 1;
    entry.lastHitAt = Date.now();
    this.totalHits += 1;
    this.scheduleSave();

    return {
      ...entry.result,
      fromCache: true,
      cacheHits: entry.hitCount
    };
  }

  public set(rawQuery: string, result: any): void {
    const key = this.normalizeQuery(rawQuery);
    if (!key || !result || !result.matched) return;

    // Enforce max entries
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      // Evict least recently hit entry
      let oldestKey = '';
      let oldestTime = Infinity;
      for (const [k, v] of this.cache.entries()) {
        if (v.lastHitAt < oldestTime) {
          oldestTime = v.lastHitAt;
          oldestKey = k;
        }
      }
      if (oldestKey) this.cache.delete(oldestKey);
    }

    const cleanResult = { ...result };
    delete cleanResult.fromCache;

    this.cache.set(key, {
      query: rawQuery,
      normalizedQuery: key,
      result: cleanResult,
      hitCount: 1,
      createdAt: Date.now(),
      lastHitAt: Date.now()
    });

    this.scheduleSave();
  }

  public getStats(): CacheStats {
    const entries = Array.from(this.cache.values());
    const topQueries = entries
      .sort((a, b) => b.hitCount - a.hitCount)
      .slice(0, 10)
      .map(e => ({
        query: e.query,
        hits: e.hitCount,
        lastHit: e.lastHitAt
      }));

    return {
      totalEntries: this.cache.size,
      totalHits: this.totalHits,
      estimatedTokensSaved: this.totalHits * 250,
      topQueries
    };
  }

  public clear(): void {
    this.cache.clear();
    this.totalHits = 0;
    this.saveCacheImmediately();
  }

  private loadCache(): void {
    try {
      if (fs.existsSync(CACHE_FILE)) {
        const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
        const data = JSON.parse(raw);
        if (data.entries && Array.isArray(data.entries)) {
          for (const item of data.entries) {
            if (item.normalizedQuery && item.result) {
              this.cache.set(item.normalizedQuery, item);
            }
          }
        }
        this.totalHits = data.totalHits || 0;
      }
    } catch (e) {
      console.warn('[AiSemanticCache] Failed to load cache file:', e);
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveCacheImmediately();
    }, 3000);
  }

  private saveCacheImmediately(): void {
    try {
      const dir = path.dirname(CACHE_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const data = {
        totalHits: this.totalHits,
        savedAt: Date.now(),
        entries: Array.from(this.cache.values())
      };
      fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[AiSemanticCache] Failed to save cache file:', e);
    }
  }
}

export const aiSemanticCache = AiSemanticCache.getInstance();
