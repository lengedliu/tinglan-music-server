import fs from 'fs';
import path from 'path';
import { Song } from '../musicEngine.js';
import { Playlist } from '../playlistEngine.js';
import { musicSearchIndex, SearchOptions } from '../searchIndex.js';

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
        if (Array.isArray(parsed)) {
          this.setSongs(parsed);
          console.log(`[MusicRepository] Loaded ${this.songs.length} tracks from disk & indexed.`);
          return;
        }
      }
    } catch (err) {
      console.warn('[MusicRepository] Could not parse songs.json, starting with empty catalog:', err);
    }
    this.songs = [];
    this.songsMap.clear();
    musicSearchIndex.buildIndex([]);
  }

  private loadPlaylists() {
    try {
      if (fs.existsSync(this.playlistsFile)) {
        const raw = fs.readFileSync(this.playlistsFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.playlists = parsed;
          return;
        }
      }
    } catch (err) {
      console.warn('[MusicRepository] Could not parse playlists.json:', err);
    }
    this.playlists = [];
  }

  private persistSongs() {
    try {
      fs.writeFileSync(this.songsFile, JSON.stringify(this.songs, null, 2), 'utf-8');
    } catch (err) {
      console.error('[MusicRepository] Failed to persist songs.json:', err);
    }
  }

  private persistPlaylists() {
    try {
      fs.writeFileSync(this.playlistsFile, JSON.stringify(this.playlists, null, 2), 'utf-8');
    } catch (err) {
      console.error('[MusicRepository] Failed to persist playlists.json:', err);
    }
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

  public setSongs(songs: Song[]): void {
    this.songs = songs;
    this.songsMap.clear();
    for (const s of songs) {
      if (s.id) this.songsMap.set(s.id, s);
    }
    musicSearchIndex.buildIndex(this.songs);
    this.persistSongs();
  }

  public addOrUpdateSong(song: Song): void {
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
    this.persistSongs();
  }

  public deleteSong(id: string): boolean {
    const idx = this.songs.findIndex((s) => s.id === id);
    if (idx >= 0) {
      this.songs.splice(idx, 1);
      this.songsMap.delete(id);
      musicSearchIndex.removeSong(id);
      this.persistSongs();
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
      this.persistSongs();
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
    this.persistPlaylists();
  }

  public addOrUpdatePlaylist(playlist: Playlist): void {
    const idx = this.playlists.findIndex((p) => p.id === playlist.id);
    if (idx >= 0) {
      this.playlists[idx] = playlist;
    } else {
      this.playlists.push(playlist);
    }
    this.persistPlaylists();
  }

  public deletePlaylist(id: string): boolean {
    const idx = this.playlists.findIndex((p) => p.id === id);
    if (idx >= 0) {
      this.playlists.splice(idx, 1);
      this.persistPlaylists();
      return true;
    }
    return false;
  }
}

export const musicRepository = new MusicRepository();
