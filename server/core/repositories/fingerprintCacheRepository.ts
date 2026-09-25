import fs from 'fs';
import path from 'path';

export interface FingerprintCacheItem {
  songId: string;
  fingerprintHash?: string;
  acoustid?: string;
  musicbrainzId?: string;
  title?: string;
  artist?: string;
  album?: string;
  coverUrl?: string;
  genre?: string;
  year?: number;
  lyrics?: string;
  matchedAt: string;
}

export class FingerprintCacheRepository {
  private dataDir: string;
  private cacheFile: string;
  private cache: Map<string, FingerprintCacheItem> = new Map();
  private sqliteDb: any = null;

  constructor(dataDir: string = path.join(process.cwd(), 'data'), sqliteDb: any = null) {
    this.dataDir = dataDir;
    this.sqliteDb = sqliteDb;
    this.cacheFile = path.join(this.dataDir, 'audio_fingerprints.json');
    this.loadFromDisk();
  }

  public setSqliteDb(db: any) {
    this.sqliteDb = db;
    this.syncFromSqlite();
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const raw = fs.readFileSync(this.cacheFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach(item => this.cache.set(item.songId, item));
        }
      }
    } catch (err) {
      console.warn('[FingerprintCacheRepository] Failed to read audio_fingerprints.json:', err);
    }
  }

  private syncFromSqlite() {
    if (!this.sqliteDb) return;
    try {
      this.sqliteDb.all('SELECT * FROM audio_fingerprint_cache', (err: any, rows: any[]) => {
        if (!err && Array.isArray(rows) && rows.length > 0) {
          rows.forEach(r => {
            const item: FingerprintCacheItem = {
              songId: r.song_id,
              fingerprintHash: r.fingerprint_hash,
              acoustid: r.acoustid,
              musicbrainzId: r.musicbrainz_id,
              title: r.title,
              artist: r.artist,
              album: r.album,
              coverUrl: r.cover_url,
              genre: r.genre,
              year: r.year,
              lyrics: r.lyrics,
              matchedAt: r.matched_at
            };
            this.cache.set(item.songId, item);
          });
        }
      });
    } catch (e) {
      console.error('[FingerprintCacheRepository] Sync from SQLite error:', e);
    }
  }

  private persistAsync() {
    try {
      const arr = Array.from(this.cache.values());
      fs.writeFile(this.cacheFile, JSON.stringify(arr, null, 2), 'utf-8', (err) => {
        if (err) console.error('[FingerprintCacheRepository] JSON save error:', err);
      });
    } catch (e) {
      console.error('[FingerprintCacheRepository] Persist async error:', e);
    }
  }

  public getBySongId(songId: string): FingerprintCacheItem | undefined {
    return this.cache.get(songId);
  }

  public getAll(): FingerprintCacheItem[] {
    return Array.from(this.cache.values());
  }

  public upsert(item: FingerprintCacheItem): FingerprintCacheItem {
    const record: FingerprintCacheItem = {
      ...item,
      matchedAt: item.matchedAt || new Date().toISOString()
    };
    this.cache.set(record.songId, record);
    this.persistAsync();

    if (this.sqliteDb) {
      try {
        this.sqliteDb.run(`
          INSERT INTO audio_fingerprint_cache (
            song_id, fingerprint_hash, acoustid, musicbrainz_id, title,
            artist, album, cover_url, genre, year, lyrics, matched_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(song_id) DO UPDATE SET
            fingerprint_hash = excluded.fingerprint_hash,
            acoustid = excluded.acoustid,
            musicbrainz_id = excluded.musicbrainz_id,
            title = excluded.title,
            artist = excluded.artist,
            album = excluded.album,
            cover_url = excluded.cover_url,
            genre = excluded.genre,
            year = excluded.year,
            lyrics = excluded.lyrics,
            matched_at = excluded.matched_at
        `, [
          record.songId,
          record.fingerprintHash || null,
          record.acoustid || null,
          record.musicbrainzId || null,
          record.title || null,
          record.artist || null,
          record.album || null,
          record.coverUrl || null,
          record.genre || null,
          record.year || null,
          record.lyrics || null,
          record.matchedAt
        ]);
      } catch (e) {
        console.error('[FingerprintCacheRepository] SQLite upsert error:', e);
      }
    }

    return record;
  }
}

export const fingerprintCacheRepository = new FingerprintCacheRepository();
