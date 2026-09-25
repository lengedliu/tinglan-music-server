import fs from 'fs';
import path from 'path';

export interface UserSongInteraction {
  userId: string;
  songId: string;
  isFavorite: boolean;
  rating?: number;
  playCount: number;
  lastPlayedAt?: string;
}

export interface PlayHistoryEntry {
  id: string;
  userId?: string;
  songId: string;
  songTitle: string;
  songArtist?: string;
  deviceDid?: string;
  deviceName?: string;
  durationSeconds?: number;
  playedSeconds?: number;
  playedAt: string;
}

export interface CastAuditLogEntry {
  id: string;
  timestamp: string;
  logType: string;
  deviceDid?: string;
  deviceName?: string;
  songTitle?: string;
  status: string;
  detail?: string;
  latencyMs?: number;
}

export interface DeviceEqPreset {
  id: string;
  deviceDid?: string;
  userId?: string;
  presetName: string;
  bands: { freq: number; gain: number }[];
  targetLufs: number;
  bassBoost?: boolean;
  spatialAudio?: boolean;
  updatedAt: string;
}

export interface CachedLyrics {
  songId: string;
  rawLrc?: string;
  translatedLrc?: string;
  timeOffsetMs: number;
  source?: string;
  updatedAt: string;
}

export class InteractionRepository {
  private dataDir: string;
  private sqliteDb: any = null;

  // In-memory caches for zero-latency lookups
  private interactions: Map<string, UserSongInteraction> = new Map(); // key: `${userId}:${songId}`
  private playHistory: PlayHistoryEntry[] = [];
  private castAuditLogs: CastAuditLogEntry[] = [];
  private eqPresets: Map<string, DeviceEqPreset> = new Map(); // key: id or `${deviceDid || 'global'}:${presetName}`
  private lyricsStore: Map<string, CachedLyrics> = new Map(); // key: songId

  private interactionsFile: string;
  private historyFile: string;
  private auditLogsFile: string;
  private eqPresetsFile: string;
  private lyricsFile: string;

  constructor(dataDir: string = path.join(process.cwd(), 'data'), sqliteDb: any = null) {
    this.dataDir = dataDir;
    this.sqliteDb = sqliteDb;

    this.interactionsFile = path.join(this.dataDir, 'interactions.json');
    this.historyFile = path.join(this.dataDir, 'play_history.json');
    this.auditLogsFile = path.join(this.dataDir, 'cast_audit_logs.json');
    this.eqPresetsFile = path.join(this.dataDir, 'eq_presets.json');
    this.lyricsFile = path.join(this.dataDir, 'lyrics_store.json');

    this.loadSnapshots();
  }

  public setSqliteDb(db: any) {
    this.sqliteDb = db;
    this.syncFromSqlite();
  }

  private loadSnapshots() {
    try {
      if (fs.existsSync(this.interactionsFile)) {
        const raw = JSON.parse(fs.readFileSync(this.interactionsFile, 'utf-8'));
        if (Array.isArray(raw)) {
          raw.forEach(item => this.interactions.set(`${item.userId}:${item.songId}`, item));
        }
      }
    } catch {}

    try {
      if (fs.existsSync(this.historyFile)) {
        const raw = JSON.parse(fs.readFileSync(this.historyFile, 'utf-8'));
        if (Array.isArray(raw)) {
          this.playHistory = raw.slice(0, 1000);
        }
      }
    } catch {}

    try {
      if (fs.existsSync(this.auditLogsFile)) {
        const raw = JSON.parse(fs.readFileSync(this.auditLogsFile, 'utf-8'));
        if (Array.isArray(raw)) {
          this.castAuditLogs = raw.slice(0, 500);
        }
      }
    } catch {}

    try {
      if (fs.existsSync(this.eqPresetsFile)) {
        const raw = JSON.parse(fs.readFileSync(this.eqPresetsFile, 'utf-8'));
        if (Array.isArray(raw)) {
          raw.forEach(preset => this.eqPresets.set(preset.id, preset));
        }
      }
    } catch {}

    try {
      if (fs.existsSync(this.lyricsFile)) {
        const raw = JSON.parse(fs.readFileSync(this.lyricsFile, 'utf-8'));
        if (Array.isArray(raw)) {
          raw.forEach(lrc => this.lyricsStore.set(lrc.songId, lrc));
        }
      }
    } catch {}
  }

  private syncFromSqlite() {
    if (!this.sqliteDb) return;
    try {
      this.sqliteDb.all('SELECT * FROM user_song_interactions', [], (err: any, rows: any[]) => {
        if (!err && Array.isArray(rows)) {
          rows.forEach(r => {
            const item: UserSongInteraction = {
              userId: r.user_id,
              songId: r.song_id,
              isFavorite: Boolean(r.is_favorite),
              rating: r.rating || 0,
              playCount: r.play_count || 0,
              lastPlayedAt: r.last_played_at
            };
            this.interactions.set(`${item.userId}:${item.songId}`, item);
          });
        }
      });

      this.sqliteDb.all('SELECT * FROM play_history ORDER BY played_at DESC LIMIT 500', [], (err: any, rows: any[]) => {
        if (!err && Array.isArray(rows)) {
          this.playHistory = rows.map(r => ({
            id: r.id,
            userId: r.user_id,
            songId: r.song_id,
            songTitle: r.song_title,
            songArtist: r.song_artist,
            deviceDid: r.device_did,
            deviceName: r.device_name,
            durationSeconds: r.duration_seconds,
            playedSeconds: r.played_seconds,
            playedAt: r.played_at
          }));
        }
      });
    } catch (e) {
      console.warn('[InteractionRepository] SQLite sync warning:', e);
    }
  }

  // --- 1. User Song Interactions (Favorites, Rating, Play Count) ---
  public getInteraction(userId: string, songId: string): UserSongInteraction | null {
    return this.interactions.get(`${userId}:${songId}`) || null;
  }

  public getUserInteractions(userId: string): UserSongInteraction[] {
    const list: UserSongInteraction[] = [];
    for (const item of this.interactions.values()) {
      if (item.userId === userId) {
        list.push(item);
      }
    }
    return list;
  }

  public setFavorite(userId: string, songId: string, isFavorite: boolean): UserSongInteraction {
    const key = `${userId}:${songId}`;
    const existing = this.interactions.get(key) || {
      userId,
      songId,
      isFavorite: false,
      playCount: 0
    };
    existing.isFavorite = isFavorite;
    this.interactions.set(key, existing);
    this.persistInteractions();

    if (this.sqliteDb) {
      this.sqliteDb.run(`
        INSERT INTO user_song_interactions (user_id, song_id, is_favorite, rating, play_count, last_played_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, song_id) DO UPDATE SET is_favorite = excluded.is_favorite
      `, [userId, songId, isFavorite ? 1 : 0, existing.rating || 0, existing.playCount, existing.lastPlayedAt || null]);
    }
    return existing;
  }

  public setRating(userId: string, songId: string, rating: number): UserSongInteraction {
    const key = `${userId}:${songId}`;
    const existing = this.interactions.get(key) || {
      userId,
      songId,
      isFavorite: false,
      playCount: 0
    };
    existing.rating = Math.max(0, Math.min(5, rating));
    this.interactions.set(key, existing);
    this.persistInteractions();

    if (this.sqliteDb) {
      this.sqliteDb.run(`
        INSERT INTO user_song_interactions (user_id, song_id, is_favorite, rating, play_count, last_played_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, song_id) DO UPDATE SET rating = excluded.rating
      `, [userId, songId, existing.isFavorite ? 1 : 0, existing.rating, existing.playCount, existing.lastPlayedAt || null]);
    }
    return existing;
  }

  public incrementPlayCount(userId: string, songId: string): UserSongInteraction {
    const key = `${userId}:${songId}`;
    const existing = this.interactions.get(key) || {
      userId,
      songId,
      isFavorite: false,
      playCount: 0
    };
    existing.playCount += 1;
    existing.lastPlayedAt = new Date().toISOString();
    this.interactions.set(key, existing);
    this.persistInteractions();

    if (this.sqliteDb) {
      this.sqliteDb.run(`
        INSERT INTO user_song_interactions (user_id, song_id, is_favorite, rating, play_count, last_played_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, song_id) DO UPDATE SET play_count = excluded.play_count, last_played_at = excluded.last_played_at
      `, [userId, songId, existing.isFavorite ? 1 : 0, existing.rating || 0, existing.playCount, existing.lastPlayedAt]);
    }
    return existing;
  }

  // --- 2. Play History Records ---
  public recordPlayHistory(entry: Omit<PlayHistoryEntry, 'id' | 'playedAt'> & { playedAt?: string }): PlayHistoryEntry {
    const item: PlayHistoryEntry = {
      id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      playedAt: entry.playedAt || new Date().toISOString(),
      ...entry
    };

    this.playHistory.unshift(item);
    if (this.playHistory.length > 1000) {
      this.playHistory.pop();
    }
    this.persistPlayHistory();

    if (entry.userId && entry.songId) {
      this.incrementPlayCount(entry.userId, entry.songId);
    }

    if (this.sqliteDb) {
      this.sqliteDb.run(`
        INSERT INTO play_history (id, user_id, song_id, song_title, song_artist, device_did, device_name, duration_seconds, played_seconds, played_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        item.id,
        item.userId || null,
        item.songId,
        item.songTitle,
        item.songArtist || null,
        item.deviceDid || null,
        item.deviceName || null,
        item.durationSeconds || 0,
        item.playedSeconds || 0,
        item.playedAt
      ]);
    }
    return item;
  }

  public getRecentHistory(userId?: string, limit: number = 50): PlayHistoryEntry[] {
    if (!userId) {
      return this.playHistory.slice(0, limit);
    }
    return this.playHistory.filter(h => !h.userId || h.userId === userId).slice(0, limit);
  }

  // --- 3. Cast Audit Logs ---
  public logCastAudit(log: Omit<CastAuditLogEntry, 'id'> & { id?: string }): CastAuditLogEntry {
    const item: CastAuditLogEntry = {
      id: log.id || `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ...log
    };
    this.castAuditLogs.unshift(item);
    if (this.castAuditLogs.length > 500) {
      this.castAuditLogs.pop();
    }
    this.persistAuditLogs();

    if (this.sqliteDb) {
      this.sqliteDb.run(`
        INSERT INTO cast_audit_logs (id, timestamp, log_type, device_did, device_name, song_title, status, detail, latency_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        item.id,
        item.timestamp,
        item.logType,
        item.deviceDid || null,
        item.deviceName || null,
        item.songTitle || null,
        item.status,
        item.detail || null,
        item.latencyMs || null
      ]);
    }
    return item;
  }

  public getCastAuditLogs(limit: number = 100): CastAuditLogEntry[] {
    return this.castAuditLogs.slice(0, limit);
  }

  // --- 4. EQ & Room Presets ---
  public saveEqPreset(preset: Omit<DeviceEqPreset, 'id' | 'updatedAt'> & { id?: string }): DeviceEqPreset {
    const id = preset.id || `eq-${preset.deviceDid || 'global'}-${Date.now()}`;
    const item: DeviceEqPreset = {
      ...preset,
      id,
      updatedAt: new Date().toISOString()
    };
    this.eqPresets.set(id, item);
    this.persistEqPresets();

    if (this.sqliteDb) {
      this.sqliteDb.run(`
        INSERT INTO device_eq_presets (id, device_did, user_id, preset_name, bands_json, target_lufs, bass_boost, spatial_audio, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          preset_name = excluded.preset_name,
          bands_json = excluded.bands_json,
          target_lufs = excluded.target_lufs,
          bass_boost = excluded.bass_boost,
          spatial_audio = excluded.spatial_audio,
          updated_at = excluded.updated_at
      `, [
        item.id,
        item.deviceDid || null,
        item.userId || null,
        item.presetName,
        JSON.stringify(item.bands),
        item.targetLufs,
        item.bassBoost ? 1 : 0,
        item.spatialAudio ? 1 : 0,
        item.updatedAt
      ]);
    }
    return item;
  }

  public getEqPresets(deviceDid?: string, userId?: string): DeviceEqPreset[] {
    const list: DeviceEqPreset[] = [];
    for (const preset of this.eqPresets.values()) {
      if (!deviceDid || preset.deviceDid === deviceDid || !preset.deviceDid) {
        if (!userId || preset.userId === userId || !preset.userId) {
          list.push(preset);
        }
      }
    }
    return list;
  }

  // --- 5. Lyrics Cache & Offset Store ---
  public saveLyricsOffset(songId: string, offsetMs: number, rawLrc?: string, translatedLrc?: string): CachedLyrics {
    const existing = this.lyricsStore.get(songId) || {
      songId,
      timeOffsetMs: 0,
      updatedAt: new Date().toISOString()
    };
    existing.timeOffsetMs = offsetMs;
    if (rawLrc) existing.rawLrc = rawLrc;
    if (translatedLrc) existing.translatedLrc = translatedLrc;
    existing.updatedAt = new Date().toISOString();
    this.lyricsStore.set(songId, existing);
    this.persistLyricsStore();

    if (this.sqliteDb) {
      this.sqliteDb.run(`
        INSERT INTO lyrics_store (song_id, raw_lrc, translated_lrc, time_offset_ms, source, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(song_id) DO UPDATE SET
          time_offset_ms = excluded.time_offset_ms,
          raw_lrc = COALESCE(excluded.raw_lrc, lyrics_store.raw_lrc),
          translated_lrc = COALESCE(excluded.translated_lrc, lyrics_store.translated_lrc),
          updated_at = excluded.updated_at
      `, [songId, existing.rawLrc || null, existing.translatedLrc || null, offsetMs, existing.source || 'local', existing.updatedAt]);
    }
    return existing;
  }

  public getCachedLyrics(songId: string): CachedLyrics | null {
    return this.lyricsStore.get(songId) || null;
  }

  // --- Snapshot Persistence ---
  private persistInteractions() {
    try {
      const data = Array.from(this.interactions.values());
      fs.writeFileSync(this.interactionsFile, JSON.stringify(data, null, 2), 'utf-8');
    } catch {}
  }

  private persistPlayHistory() {
    try {
      fs.writeFileSync(this.historyFile, JSON.stringify(this.playHistory.slice(0, 500), null, 2), 'utf-8');
    } catch {}
  }

  private persistAuditLogs() {
    try {
      fs.writeFileSync(this.auditLogsFile, JSON.stringify(this.castAuditLogs.slice(0, 200), null, 2), 'utf-8');
    } catch {}
  }

  private persistEqPresets() {
    try {
      const data = Array.from(this.eqPresets.values());
      fs.writeFileSync(this.eqPresetsFile, JSON.stringify(data, null, 2), 'utf-8');
    } catch {}
  }

  private persistLyricsStore() {
    try {
      const data = Array.from(this.lyricsStore.values());
      fs.writeFileSync(this.lyricsFile, JSON.stringify(data, null, 2), 'utf-8');
    } catch {}
  }
}

export const interactionRepository = new InteractionRepository();
