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
  private filePath: string;
  private idCounter: number = Date.now();

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

  private loadPersistedLogs() {
    try {
      const saved = JsonStore.readJson<LogEntry[] | null>(this.filePath, null);
      if (Array.isArray(saved) && saved.length > 0) {
        this.logs = saved.slice(-this.maxLogs);
      }
    } catch (err: any) {
      console.warn('[LogEngine] Failed to load persisted logs:', err?.message);
    }
  }

  private persistLogs() {
    try {
      JsonStore.saveJson(this.filePath, this.logs.slice(-this.maxLogs));
    } catch (err: any) {
      console.warn('[LogEngine] Failed to persist logs:', err?.message);
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

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    this.emit('log', entry);
    this.persistLogs();
    return entry;
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

  public query(filter: LogQueryFilter = {}): { total: number; logs: LogEntry[] } {
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

    // Sort newest first
    result.reverse();

    const total = result.length;
    const offset = filter.offset || 0;
    const limit = filter.limit || 200;

    return {
      total,
      logs: result.slice(offset, offset + limit)
    };
  }

  public clear(): void {
    this.logs = [];
    this.persistLogs();
    this.emit('cleared');
  }

  public getStats() {
    const stats = {
      total: this.logs.length,
      cast: 0,
      audit: 0,
      automation: 0,
      system: 0,
      info: 0,
      warn: 0,
      error: 0
    };

    for (const l of this.logs) {
      if (stats[l.category] !== undefined) stats[l.category]++;
      if (stats[l.level] !== undefined) stats[l.level]++;
    }

    return stats;
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
      stats: this.getStats(),
      logs: this.logs.slice(-500)
    };
  }
}

export const logEngine = new LogEngine();
