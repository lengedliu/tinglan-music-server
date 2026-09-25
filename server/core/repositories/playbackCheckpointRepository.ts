import fs from 'fs';
import path from 'path';

export interface PlaybackCheckpoint {
  id: string; // `${deviceDid || 'global'}:${userId || 'anon'}`
  deviceDid?: string;
  userId?: string;
  songId: string;
  positionSeconds: number;
  durationSeconds: number;
  queueContext?: {
    queueSongIds?: string[];
    currentIndex?: number;
    loopMode?: string;
  };
  updatedAt: string;
}

export class PlaybackCheckpointRepository {
  private dataDir: string;
  private checkpointFile: string;
  private checkpoints: Map<string, PlaybackCheckpoint> = new Map();
  private sqliteDb: any = null;

  constructor(dataDir: string = path.join(process.cwd(), 'data'), sqliteDb: any = null) {
    this.dataDir = dataDir;
    this.sqliteDb = sqliteDb;
    this.checkpointFile = path.join(this.dataDir, 'playback_checkpoints.json');
    this.loadFromDisk();
  }

  public setSqliteDb(db: any) {
    this.sqliteDb = db;
    this.syncFromSqlite();
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(this.checkpointFile)) {
        const raw = fs.readFileSync(this.checkpointFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach(item => this.checkpoints.set(item.id, item));
        }
      }
    } catch (err) {
      console.warn('[PlaybackCheckpointRepository] Failed to read playback_checkpoints.json:', err);
    }
  }

  private syncFromSqlite() {
    if (!this.sqliteDb) return;
    try {
      this.sqliteDb.all('SELECT * FROM playback_checkpoints', (err: any, rows: any[]) => {
        if (!err && Array.isArray(rows) && rows.length > 0) {
          rows.forEach(r => {
            const item: PlaybackCheckpoint = {
              id: r.id,
              deviceDid: r.device_did,
              userId: r.user_id,
              songId: r.song_id,
              positionSeconds: r.position_seconds || 0,
              durationSeconds: r.duration_seconds || 0,
              queueContext: r.queue_context_json ? JSON.parse(r.queue_context_json) : undefined,
              updatedAt: r.updated_at
            };
            this.checkpoints.set(item.id, item);
          });
        }
      });
    } catch (e) {
      console.error('[PlaybackCheckpointRepository] Sync from SQLite error:', e);
    }
  }

  private persistAsync() {
    try {
      const arr = Array.from(this.checkpoints.values());
      fs.writeFile(this.checkpointFile, JSON.stringify(arr, null, 2), 'utf-8', (err) => {
        if (err) console.error('[PlaybackCheckpointRepository] JSON save error:', err);
      });
    } catch (e) {
      console.error('[PlaybackCheckpointRepository] Persist async error:', e);
    }
  }

  public getCheckpoint(deviceDid?: string, userId?: string): PlaybackCheckpoint | undefined {
    const key = `${deviceDid || 'global'}:${userId || 'anon'}`;
    return this.checkpoints.get(key) || this.checkpoints.get(`global:${userId || 'anon'}`) || this.checkpoints.get('global:anon');
  }

  public saveCheckpoint(data: {
    deviceDid?: string;
    userId?: string;
    songId: string;
    positionSeconds: number;
    durationSeconds: number;
    queueContext?: any;
  }): PlaybackCheckpoint {
    const key = `${data.deviceDid || 'global'}:${data.userId || 'anon'}`;
    const record: PlaybackCheckpoint = {
      id: key,
      deviceDid: data.deviceDid,
      userId: data.userId,
      songId: data.songId,
      positionSeconds: data.positionSeconds,
      durationSeconds: data.durationSeconds,
      queueContext: data.queueContext,
      updatedAt: new Date().toISOString()
    };
    this.checkpoints.set(key, record);
    this.persistAsync();

    if (this.sqliteDb) {
      try {
        this.sqliteDb.run(`
          INSERT INTO playback_checkpoints (
            id, device_did, user_id, song_id, position_seconds,
            duration_seconds, queue_context_json, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            device_did = excluded.device_did,
            user_id = excluded.user_id,
            song_id = excluded.song_id,
            position_seconds = excluded.position_seconds,
            duration_seconds = excluded.duration_seconds,
            queue_context_json = excluded.queue_context_json,
            updated_at = excluded.updated_at
        `, [
          record.id,
          record.deviceDid || null,
          record.userId || null,
          record.songId,
          record.positionSeconds,
          record.durationSeconds,
          record.queueContext ? JSON.stringify(record.queueContext) : null,
          record.updatedAt
        ]);
      } catch (e) {
        console.error('[PlaybackCheckpointRepository] SQLite upsert error:', e);
      }
    }

    return record;
  }
}

export const playbackCheckpointRepository = new PlaybackCheckpointRepository();
