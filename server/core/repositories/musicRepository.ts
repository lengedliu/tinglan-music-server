import fs from 'fs';
import path from 'path';
import { Song } from '../musicEngine.js';
import { Playlist } from '../playlistEngine.js';
import { musicSearchIndex, SearchOptions } from '../searchIndex.js';
import { DEFAULT_SONGS, DEFAULT_PLAYLISTS } from '../defaultData.js';

export { DEFAULT_SONGS, DEFAULT_PLAYLISTS };

/**
 * MusicRepository (Single Source of Truth for Catalog & Playlists)
 * Unifies In-Memory Fast Access, Disk Persistence, and Inverted Search Index
 * Eliminates split-brain state inconsistencies across routes and background tasks.
 */
export class MusicRepository {
  private dataDir: string;
  private songsFile: string;
  private playlistsFile: string;
  private songs: Song[] = [];
  private songsMap: Map<string, Song> = new Map();
  private playlists: Playlist[] = [];

  private isBatchMode: boolean = false;
  private songsPersistTimer: NodeJS.Timeout | null = null;
  private playlistsPersistTimer: NodeJS.Timeout | null = null;
  private isPersistingSongs: boolean = false;
  private isPersistingPlaylists: boolean = false;

  constructor(dataDir: string = path.join(process.cwd(), 'data')) {
    this.dataDir = dataDir;
    this.songsFile = path.join(this.dataDir, 'songs.json');
    this.playlistsFile = path.join(this.dataDir, 'playlists.json');

    this.ensureDirectory();
    this.loadSongs();
    this.loadPlaylists();
  }

  private ensureDirectory() {
    if (!fs.existsSync(this.dataDir)) {
      try {
        fs.mkdirSync(this.dataDir, { recursive: true });
      } catch (err) {
        console.error('[MusicRepository] Failed to create data dir:', err);
      }
    }
  }

  private loadSongs() {
    try {
      if (fs.existsSync(this.songsFile)) {
        const raw = fs.readFileSync(this.songsFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.setSongs(parsed, false);
          console.log(`[MusicRepository] Loaded ${this.songs.length} tracks from disk & indexed.`);
          return;
        }
      }
    } catch (err) {
      console.warn('[MusicRepository] Could not parse songs.json, falling back to defaults:', err);
    }
    // Pre-populate with default tracks on clean startup
    this.setSongs(DEFAULT_SONGS, true);
    console.log(`[MusicRepository] Initialized catalog with ${this.songs.length} default high-fidelity tracks.`);
  }

  private loadPlaylists() {
    try {
      if (fs.existsSync(this.playlistsFile)) {
        const raw = fs.readFileSync(this.playlistsFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.playlists = parsed;
          return;
        }
      }
    } catch (err) {
      console.warn('[MusicRepository] Could not parse playlists.json, falling back to defaults:', err);
    }
    this.playlists = [...DEFAULT_PLAYLISTS];
    this.schedulePersistPlaylists(300);
  }

  /**
   * Schedule debounced asynchronous atomic persistence to avoid event-loop blocking
   */
  public schedulePersistSongs(delayMs = 800): void {
    if (this.isBatchMode) return;
    if (this.songsPersistTimer) clearTimeout(this.songsPersistTimer);
    this.songsPersistTimer = setTimeout(() => {
      this.persistSongsAsync().catch((err) => {
        console.error('[MusicRepository] Scheduled persistSongsAsync failed:', err);
      });
    }, delayMs);
  }

  public schedulePersistPlaylists(delayMs = 800): void {
    if (this.playlistsPersistTimer) clearTimeout(this.playlistsPersistTimer);
    this.playlistsPersistTimer = setTimeout(() => {
      this.persistPlaylistsAsync().catch((err) => {
        console.error('[MusicRepository] Scheduled persistPlaylistsAsync failed:', err);
      });
    }, delayMs);
  }

  /**
   * Atomic asynchronous persistence using temporary file and rename
   */
  public async persistSongsAsync(): Promise<void> {
    if (this.isPersistingSongs) return;
    this.isPersistingSongs = true;
    const tmpFile = `${this.songsFile}.tmp.${Date.now()}`;
    try {
      const data = JSON.stringify(this.songs, null, 2);
      await fs.promises.writeFile(tmpFile, data, 'utf-8');
      await fs.promises.rename(tmpFile, this.songsFile);
    } catch (err) {
      console.error('[MusicRepository] Async persistSongs failed:', err);
      try {
        if (fs.existsSync(tmpFile)) await fs.promises.unlink(tmpFile);
      } catch {}
    } finally {
      this.isPersistingSongs = false;
    }
  }

  public async persistPlaylistsAsync(): Promise<void> {
    if (this.isPersistingPlaylists) return;
    this.isPersistingPlaylists = true;
    const tmpFile = `${this.playlistsFile}.tmp.${Date.now()}`;
    try {
      const data = JSON.stringify(this.playlists, null, 2);
      await fs.promises.writeFile(tmpFile, data, 'utf-8');
      await fs.promises.rename(tmpFile, this.playlistsFile);
    } catch (err) {
      console.error('[MusicRepository] Async persistPlaylists failed:', err);
      try {
        if (fs.existsSync(tmpFile)) await fs.promises.unlink(tmpFile);
      } catch {}
    } finally {
      this.isPersistingPlaylists = false;
    }
  }

  /**
   * Synchronous fallback for process exit or immediate blocking flush
   */
  private persistSongs() {
    this.schedulePersistSongs(100);
  }

  private persistPlaylists() {
    this.schedulePersistPlaylists(100);
  }

  /**
   * Batch mode control for bulk operations (like directory scanning)
   */
  public beginBatch(): void {
    this.isBatchMode = true;
    if (this.songsPersistTimer) {
      clearTimeout(this.songsPersistTimer);
      this.songsPersistTimer = null;
    }
  }

  public async commitBatch(): Promise<void> {
    this.isBatchMode = false;
    musicSearchIndex.buildIndex(this.songs);
    await this.persistSongsAsync();
  }

  public getAllSongs(): Song[] {
    return this.songs;
  }

  public getSongById(id: string): Song | undefined {
    if (!id) return undefined;
    const direct = this.songsMap.get(id);
    if (direct) return direct;

    const decoded = decodeURIComponent(id);
    const clean = id.replace(/\.(wav|mp3|flac|m4a|ogg|aac|opus|ape|dsf|dff)$/i, '');
    const decodedClean = decoded.replace(/\.(wav|mp3|flac|m4a|ogg|aac|opus|ape|dsf|dff)$/i, '');

    return (
      this.songsMap.get(decoded) ||
      this.songsMap.get(clean) ||
      this.songsMap.get(decodedClean) ||
      this.songs.find(
        (s) => s.id === id || s.id === decoded || s.id === clean || s.id === decodedClean
      )
    );
  }

  public setSongs(songs: Song[], autoPersist: boolean = true): void {
    this.songs = songs;
    this.songsMap.clear();
    for (const s of songs) {
      if (s.id) this.songsMap.set(s.id, s);
    }
    musicSearchIndex.buildIndex(this.songs);
    if (autoPersist) {
      this.schedulePersistSongs(200);
    }
  }

  public addOrUpdateSong(song: Song, autoPersist: boolean = true): void {
    const idx = this.songs.findIndex((s) => s.id === song.id);
    if (idx >= 0) {
      this.songs[idx] = { ...this.songs[idx], ...song };
      this.songsMap.set(song.id, this.songs[idx]);
      musicSearchIndex.indexSong(this.songs[idx]);
    } else {
      this.songs.push(song);
      this.songsMap.set(song.id, song);
      musicSearchIndex.indexSong(song);
    }
    if (autoPersist && !this.isBatchMode) {
      this.schedulePersistSongs(800);
    }
  }

  public deleteSong(id: string): boolean {
    const idx = this.songs.findIndex((s) => s.id === id);
    if (idx >= 0) {
      this.songs.splice(idx, 1);
      this.songsMap.delete(id);
      musicSearchIndex.removeSong(id);
      this.schedulePersistSongs(300);
      return true;
    }
    return false;
  }

  public searchSongs(query: string, options?: SearchOptions): { total: number; results: Song[] } {
    return musicSearchIndex.search(query, options);
  }

  public toggleFavorite(id: string): boolean {
    const song = this.getSongById(id);
    if (song) {
      song.isFavorite = !song.isFavorite;
      this.schedulePersistSongs(300);
      return song.isFavorite;
    }
    return false;
  }

  public getAllPlaylists(): Playlist[] {
    return this.playlists;
  }

  public getPlaylistById(id: string): Playlist | undefined {
    return this.playlists.find((p) => p.id === id);
  }

  public setPlaylists(playlists: Playlist[]): void {
    this.playlists = playlists;
    this.schedulePersistPlaylists(300);
  }

  public addOrUpdatePlaylist(playlist: Playlist): void {
    const idx = this.playlists.findIndex((p) => p.id === playlist.id);
    if (idx >= 0) {
      this.playlists[idx] = playlist;
    } else {
      this.playlists.push(playlist);
    }
    this.schedulePersistPlaylists(500);
  }

  public deletePlaylist(id: string): boolean {
    const idx = this.playlists.findIndex((p) => p.id === id);
    if (idx >= 0) {
      this.playlists.splice(idx, 1);
      this.schedulePersistPlaylists(300);
      return true;
    }
    return false;
  }
}

export const musicRepository = new MusicRepository();
