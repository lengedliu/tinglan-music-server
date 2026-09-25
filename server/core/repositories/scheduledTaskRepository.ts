import fs from 'fs';
import path from 'path';

export interface ScheduledTask {
  id: string;
  userId?: string;
  title: string;
  type: 'sleep_timer' | 'alarm' | 'routine';
  cronExpr?: string; // e.g. "0 7 * * 1-5" or empty for one-off
  targetTime?: string; // "07:30" or ISO timestamp
  targetDid: string;
  targetDeviceName?: string;
  playlistId?: string;
  songId?: string;
  action: 'pause' | 'play_song' | 'play_playlist' | 'volume_fade' | 'tts_alarm';
  volume?: number;
  fadeDurationSeconds?: number;
  repeatDays?: number[]; // [0,1,2,3,4,5,6] (0 = Sunday)
  isEnabled: boolean;
  lastExecutedAt?: string;
  nextRunAt?: string;
  ttsText?: string;
  createdAt: string;
  updatedAt: string;
}

export class ScheduledTaskRepository {
  private dataDir: string;
  private tasksFile: string;
  private tasks: Map<string, ScheduledTask> = new Map();
  private sqliteDb: any = null;

  constructor(dataDir: string = path.join(process.cwd(), 'data'), sqliteDb: any = null) {
    this.dataDir = dataDir;
    this.sqliteDb = sqliteDb;
    this.tasksFile = path.join(this.dataDir, 'scheduled_tasks.json');
    this.loadFromDisk();
  }

  public setSqliteDb(db: any) {
    this.sqliteDb = db;
    this.syncFromSqlite();
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(this.tasksFile)) {
        const raw = fs.readFileSync(this.tasksFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach(t => this.tasks.set(t.id, t));
        }
      }
    } catch (err) {
      console.warn('[ScheduledTaskRepository] Failed to read scheduled_tasks.json:', err);
    }
  }

  private syncFromSqlite() {
    if (!this.sqliteDb) return;
    try {
      this.sqliteDb.all('SELECT * FROM scheduled_tasks', (err: any, rows: any[]) => {
        if (!err && Array.isArray(rows) && rows.length > 0) {
          rows.forEach(r => {
            const task: ScheduledTask = {
              id: r.id,
              userId: r.user_id,
              title: r.title,
              type: r.type,
              cronExpr: r.cron_expr,
              targetTime: r.target_time,
              targetDid: r.target_did,
              targetDeviceName: r.target_device_name,
              playlistId: r.playlist_id,
              songId: r.song_id,
              action: r.action,
              volume: r.volume,
              fadeDurationSeconds: r.fade_duration_seconds,
              repeatDays: r.repeat_days ? JSON.parse(r.repeat_days) : undefined,
              isEnabled: Boolean(r.is_enabled),
              lastExecutedAt: r.last_executed_at,
              nextRunAt: r.next_run_at,
              ttsText: r.tts_text,
              createdAt: r.created_at,
              updatedAt: r.updated_at
            };
            this.tasks.set(task.id, task);
          });
        }
      });
    } catch (e) {
      console.error('[ScheduledTaskRepository] Sync from SQLite error:', e);
    }
  }

  private persistAsync() {
    try {
      const arr = Array.from(this.tasks.values());
      fs.writeFile(this.tasksFile, JSON.stringify(arr, null, 2), 'utf-8', (err) => {
        if (err) console.error('[ScheduledTaskRepository] JSON save error:', err);
      });
    } catch (e) {
      console.error('[ScheduledTaskRepository] Persist async error:', e);
    }
  }

  public getAllTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values()).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  public getTaskById(id: string): ScheduledTask | undefined {
    return this.tasks.get(id);
  }

  public upsertTask(task: ScheduledTask): ScheduledTask {
    const record: ScheduledTask = {
      ...task,
      updatedAt: new Date().toISOString()
    };
    this.tasks.set(record.id, record);
    this.persistAsync();

    if (this.sqliteDb) {
      try {
        this.sqliteDb.run(`
          INSERT INTO scheduled_tasks (
            id, user_id, title, type, cron_expr, target_time, target_did, target_device_name,
            playlist_id, song_id, action, volume, fade_duration_seconds, repeat_days,
            is_enabled, last_executed_at, next_run_at, tts_text, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            user_id = excluded.user_id,
            title = excluded.title,
            type = excluded.type,
            cron_expr = excluded.cron_expr,
            target_time = excluded.target_time,
            target_did = excluded.target_did,
            target_device_name = excluded.target_device_name,
            playlist_id = excluded.playlist_id,
            song_id = excluded.song_id,
            action = excluded.action,
            volume = excluded.volume,
            fade_duration_seconds = excluded.fade_duration_seconds,
            repeat_days = excluded.repeat_days,
            is_enabled = excluded.is_enabled,
            last_executed_at = excluded.last_executed_at,
            next_run_at = excluded.next_run_at,
            tts_text = excluded.tts_text,
            updated_at = excluded.updated_at
        `, [
          record.id,
          record.userId || null,
          record.title,
          record.type,
          record.cronExpr || null,
          record.targetTime || null,
          record.targetDid,
          record.targetDeviceName || null,
          record.playlistId || null,
          record.songId || null,
          record.action,
          record.volume ?? null,
          record.fadeDurationSeconds || 0,
          record.repeatDays ? JSON.stringify(record.repeatDays) : null,
          record.isEnabled ? 1 : 0,
          record.lastExecutedAt || null,
          record.nextRunAt || null,
          record.ttsText || null,
          record.createdAt || new Date().toISOString(),
          record.updatedAt
        ]);
      } catch (e) {
        console.error('[ScheduledTaskRepository] SQLite upsert error:', e);
      }
    }

    return record;
  }

  public deleteTask(id: string): boolean {
    const existed = this.tasks.delete(id);
    if (existed) {
      this.persistAsync();
      if (this.sqliteDb) {
        try {
          this.sqliteDb.run('DELETE FROM scheduled_tasks WHERE id = ?', [id]);
        } catch (e) {
          console.error('[ScheduledTaskRepository] SQLite delete error:', e);
        }
      }
    }
    return existed;
  }
}

export const scheduledTaskRepository = new ScheduledTaskRepository();
