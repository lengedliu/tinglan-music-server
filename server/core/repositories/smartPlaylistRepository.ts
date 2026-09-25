import fs from 'fs';
import path from 'path';
import { Song } from '../musicEngine.js';

export interface SmartPlaylistCondition {
  field: 'genre' | 'artist' | 'rating' | 'playCount' | 'year' | 'title' | 'duration';
  operator: 'equals' | 'contains' | 'greaterThan' | 'lessThan' | 'in';
  value: any;
}

export interface SmartPlaylistRule {
  id: string;
  playlistId: string;
  ruleName: string;
  conditions: SmartPlaylistCondition[];
  matchType: 'all' | 'any'; // 'all' (AND), 'any' (OR)
  sortBy: 'recently_added' | 'rating' | 'play_count' | 'title' | 'artist' | 'random';
  limitCount: number;
  autoRefresh: boolean;
  lastComputedAt?: string;
  updatedAt: string;
}

export class SmartPlaylistRepository {
  private dataDir: string;
  private rulesFile: string;
  private rules: Map<string, SmartPlaylistRule> = new Map();
  private sqliteDb: any = null;

  constructor(dataDir: string = path.join(process.cwd(), 'data'), sqliteDb: any = null) {
    this.dataDir = dataDir;
    this.sqliteDb = sqliteDb;
    this.rulesFile = path.join(this.dataDir, 'smart_playlist_rules.json');
    this.loadFromDisk();
  }

  public setSqliteDb(db: any) {
    this.sqliteDb = db;
    this.syncFromSqlite();
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(this.rulesFile)) {
        const raw = fs.readFileSync(this.rulesFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach(r => this.rules.set(r.id, r));
        }
      }
    } catch (err) {
      console.warn('[SmartPlaylistRepository] Failed to read smart_playlist_rules.json:', err);
    }
  }

  private syncFromSqlite() {
    if (!this.sqliteDb) return;
    try {
      this.sqliteDb.all('SELECT * FROM smart_playlist_rules', (err: any, rows: any[]) => {
        if (!err && Array.isArray(rows) && rows.length > 0) {
          rows.forEach(r => {
            const rule: SmartPlaylistRule = {
              id: r.id,
              playlistId: r.playlist_id,
              ruleName: r.rule_name,
              conditions: r.conditions_json ? JSON.parse(r.conditions_json) : [],
              matchType: r.match_type || 'all',
              sortBy: r.sort_by || 'recently_added',
              limitCount: r.limit_count || 50,
              autoRefresh: Boolean(r.auto_refresh),
              lastComputedAt: r.last_computed_at,
              updatedAt: r.updated_at
            };
            this.rules.set(rule.id, rule);
          });
        }
      });
    } catch (e) {
      console.error('[SmartPlaylistRepository] Sync from SQLite error:', e);
    }
  }

  private persistAsync() {
    try {
      const arr = Array.from(this.rules.values());
      fs.writeFile(this.rulesFile, JSON.stringify(arr, null, 2), 'utf-8', (err) => {
        if (err) console.error('[SmartPlaylistRepository] JSON save error:', err);
      });
    } catch (e) {
      console.error('[SmartPlaylistRepository] Persist async error:', e);
    }
  }

  public getAllRules(): SmartPlaylistRule[] {
    return Array.from(this.rules.values());
  }

  public getRuleByPlaylistId(playlistId: string): SmartPlaylistRule | undefined {
    return Array.from(this.rules.values()).find(r => r.playlistId === playlistId);
  }

  public getRuleById(id: string): SmartPlaylistRule | undefined {
    return this.rules.get(id);
  }

  public upsertRule(rule: SmartPlaylistRule): SmartPlaylistRule {
    const record: SmartPlaylistRule = {
      ...rule,
      updatedAt: new Date().toISOString()
    };
    this.rules.set(record.id, record);
    this.persistAsync();

    if (this.sqliteDb) {
      try {
        this.sqliteDb.run(`
          INSERT INTO smart_playlist_rules (
            id, playlist_id, rule_name, conditions_json, match_type, sort_by,
            limit_count, auto_refresh, last_computed_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            playlist_id = excluded.playlist_id,
            rule_name = excluded.rule_name,
            conditions_json = excluded.conditions_json,
            match_type = excluded.match_type,
            sort_by = excluded.sort_by,
            limit_count = excluded.limit_count,
            auto_refresh = excluded.auto_refresh,
            last_computed_at = excluded.last_computed_at,
            updated_at = excluded.updated_at
        `, [
          record.id,
          record.playlistId,
          record.ruleName,
          JSON.stringify(record.conditions || []),
          record.matchType,
          record.sortBy,
          record.limitCount,
          record.autoRefresh ? 1 : 0,
          record.lastComputedAt || null,
          record.updatedAt
        ]);
      } catch (e) {
        console.error('[SmartPlaylistRepository] SQLite upsert error:', e);
      }
    }

    return record;
  }

  public deleteRule(id: string): boolean {
    const existed = this.rules.delete(id);
    if (existed) {
      this.persistAsync();
      if (this.sqliteDb) {
        try {
          this.sqliteDb.run('DELETE FROM smart_playlist_rules WHERE id = ?', [id]);
        } catch (e) {
          console.error('[SmartPlaylistRepository] SQLite delete error:', e);
        }
      }
    }
    return existed;
  }

  /**
   * Evaluate conditions on an array of songs
   */
  public evaluateRules(songs: Song[], rule: SmartPlaylistRule, interactions?: Map<string, any>): Song[] {
    const matched = songs.filter(song => {
      if (!rule.conditions || rule.conditions.length === 0) return true;

      const evalCondition = (cond: SmartPlaylistCondition): boolean => {
        let actualVal: any = undefined;
        if (cond.field === 'title') actualVal = song.title;
        else if (cond.field === 'artist') actualVal = song.artist;
        else if (cond.field === 'genre') actualVal = song.genre;
        else if (cond.field === 'year') actualVal = song.year;
        else if (cond.field === 'duration') actualVal = song.duration;
        else if (cond.field === 'rating' && interactions) {
          actualVal = interactions.get(song.id)?.rating || 0;
        } else if (cond.field === 'playCount' && interactions) {
          actualVal = interactions.get(song.id)?.playCount || 0;
        }

        if (actualVal === undefined || actualVal === null) return false;

        switch (cond.operator) {
          case 'equals':
            return String(actualVal).toLowerCase() === String(cond.value).toLowerCase();
          case 'contains':
            return String(actualVal).toLowerCase().includes(String(cond.value).toLowerCase());
          case 'greaterThan':
            return Number(actualVal) > Number(cond.value);
          case 'lessThan':
            return Number(actualVal) < Number(cond.value);
          case 'in':
            if (Array.isArray(cond.value)) {
              return cond.value.some((v: any) => String(actualVal).toLowerCase().includes(String(v).toLowerCase()));
            }
            return false;
          default:
            return true;
        }
      };

      if (rule.matchType === 'any') {
        return rule.conditions.some(cond => evalCondition(cond));
      } else {
        return rule.conditions.every(cond => evalCondition(cond));
      }
    });

    // Sorting
    if (rule.sortBy === 'random') {
      matched.sort(() => Math.random() - 0.5);
    } else if (rule.sortBy === 'title') {
      matched.sort((a, b) => a.title.localeCompare(b.title));
    } else if (rule.sortBy === 'artist') {
      matched.sort((a, b) => (a.artist || '').localeCompare(b.artist || ''));
    }

    // Limit
    return matched.slice(0, rule.limitCount || 50);
  }
}

export const smartPlaylistRepository = new SmartPlaylistRepository();
