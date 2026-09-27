import { EventEmitter } from 'events';
import path from 'path';
import { JsonStore } from '../storage/jsonStore.js';

export type LogCategory = 'cast' | 'audit' | 'automation' | 'system';
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  id: string;
  timestamp: number;
  timeFormatted: string;
  category: LogCategory;
  level: LogLevel;
  traceId?: string;
  title: string;
  message: string;
  details?: Record<string, any>;
  clientIp?: string;
  targetDid?: string;
  deviceName?: string;
  songId?: string;
}

export interface LogQueryFilter {
  category?: LogCategory | 'all';
  level?: LogLevel | 'all';
  search?: string;
  traceId?: string;
  limit?: number;
  offset?: number;
}

export class LogEngine extends EventEmitter {
  private logs: LogEntry[] = [];
  private maxLogs: number = 2500;
  private dbRetentionLimit: number = 10000;
  private writeCounter: number = 0;
  private filePath: string;
  private sqliteDb: any = null;

  constructor(dataDir?: string) {
    super();
    const resolvedDataDir = dataDir || process.env.DATA_DIR || path.join(process.cwd(), 'data');
    this.filePath = path.join(resolvedDataDir, 'logs_audit_diagnostics.json');
    this.loadPersistedLogs();
  }

  public setDataDir(dataDir: string) {
    this.filePath = path.join(dataDir, 'logs_audit_diagnostics.json');
    this.loadPersistedLogs();
  }

  public setSqliteDb(db: any) {
    this.sqliteDb = db;
    this.syncFromSqlite();
  }

  private syncFromSqlite() {
    if (!this.sqliteDb) return;
    try {
      this.sqliteDb.all(
        'SELECT * FROM system_logs ORDER BY timestamp DESC LIMIT ?',
        [this.maxLogs],
        (err: any, rows: any[]) => {
          if (!err && Array.isArray(rows) && rows.length > 0) {
            const mapped = rows.map(r => this.mapRowToEntry(r)).reverse();
            this.logs = mapped;
            console.log(`[LogEngine] Successfully synchronized ${mapped.length} logs from SQLite database.`);
          }
        }
      );
    } catch (err: any) {
      console.warn('[LogEngine] Failed to sync logs from SQLite:', err?.message);
    }
  }

  private mapRowToEntry(row: any): LogEntry {
    let details: any = undefined;
    if (row.details_json) {
      try {
        details = JSON.parse(row.details_json);
      } catch {}
    }
    return {
      id: row.id,
      timestamp: Number(row.timestamp),
      timeFormatted: row.time_formatted,
      category: row.category as LogCategory,
      level: row.level as LogLevel,
      traceId: row.trace_id || undefined,
      title: row.title,
      message: row.message,
      details,
      clientIp: row.client_ip || undefined,
      targetDid: row.target_did || undefined,
      deviceName: row.device_name || undefined,
      songId: row.song_id || undefined
    };
  }

  private loadPersistedLogs() {
    try {
      const saved = JsonStore.readJson<LogEntry[] | null>(this.filePath, null);
      if (Array.isArray(saved) && saved.length > 0) {
        this.logs = saved.slice(-this.maxLogs);
      }
    } catch (err: any) {
      console.warn('[LogEngine] Failed to load persisted logs from JSON backup:', err?.message);
    }
  }

  private persistLogs() {
    try {
      JsonStore.saveJson(this.filePath, this.logs.slice(-this.maxLogs));
    } catch (err: any) {
      console.warn('[LogEngine] Failed to persist logs to JSON backup:', err?.message);
    }
  }

  public log(
    category: LogCategory,
    level: LogLevel,
    title: string,
    message: string,
    options?: {
      traceId?: string;
      details?: Record<string, any>;
      clientIp?: string;
      targetDid?: string;
      deviceName?: string;
      songId?: string;
    }
  ): LogEntry {
    const now = new Date();
    const formattedTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;

    const entry: LogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: now.getTime(),
      timeFormatted: formattedTime,
      category,
      level,
      title,
      message,
      traceId: options?.traceId || `tr_${Math.random().toString(36).substring(2, 8)}`,
      details: options?.details,
      clientIp: options?.clientIp,
      targetDid: options?.targetDid,
      deviceName: options?.deviceName,
      songId: options?.songId
    };

    // 1. In-memory ring buffer (fast SSE streaming)
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // 2. Persist to SQLite Database
    if (this.sqliteDb) {
      try {
        this.sqliteDb.run(`
          INSERT INTO system_logs (
            id, timestamp, time_formatted, category, level, trace_id, title, message, details_json, client_ip, target_did, device_name, song_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          entry.id,
          entry.timestamp,
          entry.timeFormatted,
          entry.category,
          entry.level,
          entry.traceId || null,
          entry.title,
          entry.message,
          entry.details ? JSON.stringify(entry.details) : null,
          entry.clientIp || null,
          entry.targetDid || null,
          entry.deviceName || null,
          entry.songId || null
        ]);

        this.writeCounter++;
        if (this.writeCounter >= 100) {
          this.writeCounter = 0;
          this.pruneSqliteDatabase();
        }
      } catch (err: any) {
        console.warn('[LogEngine] Failed to write log to SQLite:', err?.message);
      }
    }

    // 3. Emit real-time event & JSON backup
    this.emit('log', entry);
    this.persistLogs();
    return entry;
  }

  public pruneSqliteDatabase(keepCount: number = this.dbRetentionLimit) {
    if (!this.sqliteDb) return;
    try {
      this.sqliteDb.run(`
        DELETE FROM system_logs WHERE id NOT IN (
          SELECT id FROM system_logs ORDER BY timestamp DESC LIMIT ?
        )
      `, [keepCount]);
    } catch (err: any) {
      console.warn('[LogEngine] Failed to prune SQLite logs:', err?.message);
    }
  }

  public info(category: LogCategory, title: string, message: string, options?: any) {
    return this.log(category, 'info', title, message, options);
  }

  public warn(category: LogCategory, title: string, message: string, options?: any) {
    return this.log(category, 'warn', title, message, options);
  }

  public error(category: LogCategory, title: string, message: string, options?: any) {
    return this.log(category, 'error', title, message, options);
  }

  public debug(category: LogCategory, title: string, message: string, options?: any) {
    return this.log(category, 'debug', title, message, options);
  }

  public query(filter: LogQueryFilter = {}): { total: number; logs: LogEntry[]; storageEngine: string } {
    const limit = filter.limit || 200;
    const offset = filter.offset || 0;

    // 1. If SQLite is available, perform indexed SQL query
    if (this.sqliteDb) {
      try {
        let whereClauses: string[] = ['1=1'];
        const params: any[] = [];

        if (filter.category && filter.category !== 'all') {
          whereClauses.push('category = ?');
          params.push(filter.category);
        }

        if (filter.level && filter.level !== 'all') {
          whereClauses.push('level = ?');
          params.push(filter.level);
        }

        if (filter.traceId) {
          whereClauses.push('trace_id = ?');
          params.push(filter.traceId);
        }

        if (filter.search && filter.search.trim()) {
          const q = `%${filter.search.trim()}%`;
          whereClauses.push('(title LIKE ? OR message LIKE ? OR trace_id LIKE ? OR device_name LIKE ? OR client_ip LIKE ? OR song_id LIKE ?)');
          params.push(q, q, q, q, q, q);
        }

        const whereSql = whereClauses.join(' AND ');

        // Count total
        let total = 0;
        const countRow = this.sqliteDb.get(`SELECT COUNT(*) as count FROM system_logs WHERE ${whereSql}`, params);
        if (countRow && typeof countRow.count === 'number') {
          total = countRow.count;
        }

        // Paged items
        const queryParams = [...params, limit, offset];
        const rows = this.sqliteDb.all(`SELECT * FROM system_logs WHERE ${whereSql} ORDER BY timestamp DESC LIMIT ? OFFSET ?`, queryParams);

        if (Array.isArray(rows)) {
          return {
            total,
            logs: rows.map(r => this.mapRowToEntry(r)),
            storageEngine: 'sqlite'
          };
        }
      } catch (err: any) {
        console.warn('[LogEngine] SQLite query failed, falling back to memory ring-buffer:', err?.message);
      }
    }

    // 2. Fallback: In-memory query
    let result = [...this.logs];

    if (filter.category && filter.category !== 'all') {
      result = result.filter(l => l.category === filter.category);
    }

    if (filter.level && filter.level !== 'all') {
      result = result.filter(l => l.level === filter.level);
    }

    if (filter.traceId) {
      result = result.filter(l => l.traceId === filter.traceId);
    }

    if (filter.search) {
      const q = filter.search.toLowerCase().trim();
      result = result.filter(l =>
        l.title.toLowerCase().includes(q) ||
        l.message.toLowerCase().includes(q) ||
        (l.traceId && l.traceId.toLowerCase().includes(q)) ||
        (l.deviceName && l.deviceName.toLowerCase().includes(q)) ||
        (l.clientIp && l.clientIp.toLowerCase().includes(q)) ||
        (l.songId && l.songId.toLowerCase().includes(q))
      );
    }

    result.reverse();

    const total = result.length;
    return {
      total,
      logs: result.slice(offset, offset + limit),
      storageEngine: 'memory_fallback'
    };
  }

  public clear(): void {
    this.logs = [];
    if (this.sqliteDb) {
      try {
        this.sqliteDb.run('DELETE FROM system_logs');
      } catch (err: any) {
        console.warn('[LogEngine] Failed to clear SQLite system_logs:', err?.message);
      }
    }
    this.persistLogs();
    this.emit('cleared');
  }

  public getStats() {
    let totalInDb = this.logs.length;
    let counts: Record<string, number> = {
      total: this.logs.length,
      cast: 0,
      audit: 0,
      automation: 0,
      system: 0,
      info: 0,
      warn: 0,
      error: 0
    };

    if (this.sqliteDb) {
      try {
        const totalRow = this.sqliteDb.get('SELECT COUNT(*) as count FROM system_logs');
        if (totalRow && typeof totalRow.count === 'number') {
          totalInDb = totalRow.count;
          counts.total = totalInDb;
        }

        const catRows = this.sqliteDb.all('SELECT category, COUNT(*) as count FROM system_logs GROUP BY category');
        if (Array.isArray(catRows)) {
          for (const r of catRows) {
            if (counts[r.category] !== undefined) counts[r.category] = Number(r.count);
          }
        }

        const levelRows = this.sqliteDb.all('SELECT level, COUNT(*) as count FROM system_logs GROUP BY level');
        if (Array.isArray(levelRows)) {
          for (const r of levelRows) {
            if (counts[r.level] !== undefined) counts[r.level] = Number(r.count);
          }
        }
      } catch {
        // compute from in-memory array on fallback
        for (const l of this.logs) {
          if (counts[l.category] !== undefined) counts[l.category]++;
          if (counts[l.level] !== undefined) counts[l.level]++;
        }
      }
    } else {
      for (const l of this.logs) {
        if (counts[l.category] !== undefined) counts[l.category]++;
        if (counts[l.level] !== undefined) counts[l.level]++;
      }
    }

    return {
      ...counts,
      storageEngine: this.sqliteDb ? 'sqlite' : 'json_file',
      dbAvailable: Boolean(this.sqliteDb),
      retentionLimit: this.dbRetentionLimit,
      totalPersisted: totalInDb
    };
  }

  public exportDiagnostics() {
    return {
      systemInfo: {
        nodeVersion: process.version,
        platform: process.platform,
        uptimeSeconds: Math.floor(process.uptime()),
        memoryUsage: process.memoryUsage(),
        generatedAt: new Date().toISOString()
      },
      storage: {
        engine: this.sqliteDb ? 'SQLite 3 (WASM Indexed Database)' : 'JSON File Store',
        backupFile: this.filePath
      },
      stats: this.getStats(),
      logs: this.logs.slice(-500)
    };
  }
}

export const logEngine = new LogEngine();
