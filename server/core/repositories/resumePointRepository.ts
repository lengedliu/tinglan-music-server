import fs from 'fs';
import path from 'path';

export interface PlaybackResumePoint {
  id: string; // `${userId || 'anon'}_${songId}`
  userId: string;
  songId: string;
  songTitle?: string;
  songArtist?: string;
  songCoverUrl?: string;
  deviceDid?: string;
  deviceName?: string;
  resumePositionSeconds: number;
  durationSeconds: number;
  progressPercent: number; // 0.0 ~ 100.0
  isCompleted: boolean; // true if progress >= 90%
  queueContext?: {
    playlistId?: string;
    queueSongIds?: string[];
    currentIndex?: number;
    loopMode?: string;
  };
  updatedAt: string;
}

export class ResumePointRepository {
  private dataDir: string;
  private resumeFile: string;
  private points: Map<string, PlaybackResumePoint> = new Map();
  private sqliteDb: any = null;

  constructor(dataDir: string = path.join(process.cwd(), 'data'), sqliteDb: any = null) {
    this.dataDir = dataDir;
    this.sqliteDb = sqliteDb;
    this.resumeFile = path.join(this.dataDir, 'playback_resume_points.json');
    this.loadFromDisk();
  }

  public setSqliteDb(db: any) {
    this.sqliteDb = db;
    this.syncFromSqlite();
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(this.resumeFile)) {
        const raw = fs.readFileSync(this.resumeFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach(item => {
            if (item && item.id) {
              this.points.set(item.id, item);
            }
          });
        }
      }
    } catch (err) {
      console.warn('[ResumePointRepository] Failed to read playback_resume_points.json:', err);
    }
  }

  private syncFromSqlite() {
    if (!this.sqliteDb) return;
    try {
      this.sqliteDb.all('SELECT * FROM playback_resume_points ORDER BY updated_at DESC', (err: any, rows: any[]) => {
        if (!err && Array.isArray(rows) && rows.length > 0) {
          rows.forEach(r => {
            const item: PlaybackResumePoint = {
              id: r.id,
              userId: r.user_id || 'anon',
              songId: r.song_id,
              songTitle: r.song_title,
              songArtist: r.song_artist,
              songCoverUrl: r.song_cover_url,
              deviceDid: r.device_did,
              deviceName: r.device_name,
              resumePositionSeconds: Number(r.resume_position_seconds || 0),
              durationSeconds: Number(r.duration_seconds || 0),
              progressPercent: Number(r.progress_percent || 0),
              isCompleted: Boolean(r.is_completed),
              queueContext: r.queue_context_json ? JSON.parse(r.queue_context_json) : undefined,
              updatedAt: r.updated_at
            };
            this.points.set(item.id, item);
          });
          console.log(`[ResumePointRepository] 🔄 从 SQLite 成功载入 ${this.points.size} 条长音频断点续播记录.`);
        }
      });
    } catch (e) {
      console.error('[ResumePointRepository] Sync from SQLite error:', e);
    }
  }

  private persistAsync() {
    try {
      const arr = Array.from(this.points.values());
      fs.writeFile(this.resumeFile, JSON.stringify(arr, null, 2), 'utf-8', (err) => {
        if (err) console.error('[ResumePointRepository] JSON save error:', err);
      });
    } catch (e) {
      console.error('[ResumePointRepository] Persist async error:', e);
    }
  }

  public getResumePoints(userId?: string, limit: number = 20, includeCompleted: boolean = false): PlaybackResumePoint[] {
    const list = Array.from(this.points.values()).filter(p => {
      if (userId && p.userId !== userId && p.userId !== 'anon') return false;
      if (!includeCompleted && p.isCompleted) return false;
      // Filter out micro-plays (< 5 seconds)
      if (p.resumePositionSeconds < 5) return false;
      return true;
    });

    list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return list.slice(0, limit);
  }

  public getResumePoint(songId: string, userId?: string): PlaybackResumePoint | undefined {
    const targetUserId = userId || 'anon';
    const specificKey = `${targetUserId}_${songId}`;
    if (this.points.has(specificKey)) {
      return this.points.get(specificKey);
    }
    // Fallback search
    for (const p of this.points.values()) {
      if (p.songId === songId) return p;
    }
    return undefined;
  }

  public saveResumePoint(data: {
    userId?: string;
    songId: string;
    songTitle?: string;
    songArtist?: string;
    songCoverUrl?: string;
    deviceDid?: string;
    deviceName?: string;
    resumePositionSeconds: number;
    durationSeconds: number;
    queueContext?: any;
    isCompleted?: boolean;
  }): PlaybackResumePoint {
    const uid = data.userId || 'anon';
    const key = `${uid}_${data.songId}`;
    const duration = Math.max(0, data.durationSeconds || 0);
    const position = Math.max(0, data.resumePositionSeconds || 0);
    const progressPercent = duration > 0 ? Math.min(100, Math.round((position / duration) * 1000) / 10) : 0;
    
    // Auto-mark completed if listened > 90%
    const isCompleted = data.isCompleted !== undefined ? data.isCompleted : (progressPercent >= 90);

    const record: PlaybackResumePoint = {
      id: key,
      userId: uid,
      songId: data.songId,
      songTitle: data.songTitle,
      songArtist: data.songArtist,
      songCoverUrl: data.songCoverUrl,
      deviceDid: data.deviceDid,
      deviceName: data.deviceName,
      resumePositionSeconds: position,
      durationSeconds: duration,
      progressPercent,
      isCompleted,
      queueContext: data.queueContext,
      updatedAt: new Date().toISOString()
    };

    this.points.set(key, record);
    this.persistAsync();

    if (this.sqliteDb) {
      try {
        this.sqliteDb.run(`
          INSERT INTO playback_resume_points (
            id, user_id, song_id, song_title, song_artist, song_cover_url,
            device_did, device_name, resume_position_seconds, duration_seconds,
            progress_percent, is_completed, queue_context_json, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            user_id = excluded.user_id,
            song_id = excluded.song_id,
            song_title = excluded.song_title,
            song_artist = excluded.song_artist,
            song_cover_url = excluded.song_cover_url,
            device_did = excluded.device_did,
            device_name = excluded.device_name,
            resume_position_seconds = excluded.resume_position_seconds,
            duration_seconds = excluded.duration_seconds,
            progress_percent = excluded.progress_percent,
            is_completed = excluded.is_completed,
            queue_context_json = excluded.queue_context_json,
            updated_at = excluded.updated_at
        `, [
          record.id,
          record.userId,
          record.songId,
          record.songTitle || null,
          record.songArtist || null,
          record.songCoverUrl || null,
          record.deviceDid || null,
          record.deviceName || null,
          record.resumePositionSeconds,
          record.durationSeconds,
          record.progressPercent,
          record.isCompleted ? 1 : 0,
          record.queueContext ? JSON.stringify(record.queueContext) : null,
          record.updatedAt
        ]);
      } catch (e) {
        console.error('[ResumePointRepository] SQLite upsert error:', e);
      }
    }

    return record;
  }

  public deleteResumePoint(songId: string, userId?: string): boolean {
    const uid = userId || 'anon';
    const key = `${uid}_${songId}`;
    let deleted = this.points.delete(key);
    
    // Also delete any matching songId if found
    for (const [k, p] of this.points.entries()) {
      if (p.songId === songId && (!userId || p.userId === userId)) {
        this.points.delete(k);
        deleted = true;
      }
    }

    if (deleted) {
      this.persistAsync();
      if (this.sqliteDb) {
        try {
          this.sqliteDb.run('DELETE FROM playback_resume_points WHERE song_id = ? AND (user_id = ? OR user_id = "anon")', [songId, uid]);
        } catch (e) {
          console.error('[ResumePointRepository] SQLite delete error:', e);
        }
      }
    }
    return deleted;
  }
}

export const resumePointRepository = new ResumePointRepository();
