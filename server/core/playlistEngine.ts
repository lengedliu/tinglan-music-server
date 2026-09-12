import fs from 'fs';
import path from 'path';

export interface Playlist {
  id: string;
  name: string;
  description: string;
  coverUrl: string;
  songIds: string[];
  createdAt: string;
}

export type PlayMode = 'sequence' | 'loop' | 'single' | 'shuffle';

export class PlaylistEngine {
  private dataDir: string;
  private playlistsFile: string;
  private playlists: Playlist[] = [];

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.playlistsFile = path.join(dataDir, 'playlists.json');
    this.loadPlaylists();
  }

  private loadPlaylists() {
    try {
      if (fs.existsSync(this.playlistsFile)) {
        const raw = fs.readFileSync(this.playlistsFile, 'utf-8');
        this.playlists = JSON.parse(raw) as Playlist[];
      } else {
        this.playlists = [
          {
            id: 'pl-default-1',
            name: '我喜欢的音乐',
            description: '默认红心收藏歌单',
            coverUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80',
            songIds: ['song-1', 'song-2'],
            createdAt: new Date().toISOString().split('T')[0]
          },
          {
            id: 'pl-default-2',
            name: '清晨唤醒·舒缓原声',
            description: '适合在客厅小爱音箱上定时播放的晨间轻音乐',
            coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
            songIds: ['song-3', 'song-4'],
            createdAt: new Date().toISOString().split('T')[0]
          }
        ];
        this.savePlaylists();
      }
    } catch (err) {
      console.warn('[PlaylistEngine] Could not load playlists.json:', err);
      this.playlists = [];
    }
  }

  public savePlaylists() {
    try {
      fs.writeFileSync(this.playlistsFile, JSON.stringify(this.playlists, null, 2), 'utf-8');
    } catch (err) {
      console.error('[PlaylistEngine] Failed to save playlists.json:', err);
    }
  }

  public getAll(): Playlist[] {
    return this.playlists;
  }

  public getById(id: string): Playlist | undefined {
    return this.playlists.find(p => p.id === id);
  }

  public createPlaylist(name: string, description: string = '', songIds: string[] = []): Playlist {
    const newPl: Playlist = {
      id: `pl-${Date.now()}`,
      name: name || '新建歌单',
      description: description || '',
      coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
      songIds: Array.isArray(songIds) ? songIds : [],
      createdAt: new Date().toISOString().split('T')[0]
    };
    this.playlists.push(newPl);
    this.savePlaylists();
    return newPl;
  }

  public updatePlaylist(id: string, updates: Partial<Playlist>): Playlist | null {
    const pl = this.playlists.find(p => p.id === id);
    if (!pl) return null;
    if (updates.name !== undefined) pl.name = updates.name.trim();
    if (updates.description !== undefined) pl.description = updates.description.trim();
    if (Array.isArray(updates.songIds)) pl.songIds = updates.songIds;
    if (updates.coverUrl) pl.coverUrl = updates.coverUrl;
    this.savePlaylists();
    return pl;
  }

  public deletePlaylist(id: string): boolean {
    const initialLen = this.playlists.length;
    this.playlists = this.playlists.filter(p => p.id !== id);
    if (this.playlists.length < initialLen) {
      this.savePlaylists();
      return true;
    }
    return false;
  }

  public addSongsToPlaylist(id: string, songIds: string[]): { success: boolean; addedCount: number } {
    const pl = this.playlists.find(p => p.id === id);
    if (!pl) return { success: false, addedCount: 0 };
    let addedCount = 0;
    songIds.forEach(sId => {
      if (!pl.songIds.includes(sId)) {
        pl.songIds.push(sId);
        addedCount++;
      }
    });
    this.savePlaylists();
    return { success: true, addedCount };
  }

  public removeSongFromPlaylist(id: string, songId: string): boolean {
    const pl = this.playlists.find(p => p.id === id);
    if (!pl) return false;
    const initialLen = pl.songIds.length;
    pl.songIds = pl.songIds.filter(s => s !== songId);
    if (pl.songIds.length < initialLen) {
      this.savePlaylists();
      return true;
    }
    return false;
  }

  /**
   * Resolves next track ID according to play mode
   */
  public getNextSongId(currentSongId: string, songIdList: string[], mode: PlayMode = 'sequence'): string | null {
    if (!songIdList || songIdList.length === 0) return null;
    const currentIndex = songIdList.indexOf(currentSongId);

    if (mode === 'single') {
      return currentSongId;
    }
    if (mode === 'shuffle') {
      const candidates = songIdList.filter(id => id !== currentSongId);
      if (candidates.length === 0) return currentSongId;
      const randIdx = Math.floor(Math.random() * candidates.length);
      return candidates[randIdx];
    }
    if (mode === 'loop' || mode === 'sequence') {
      if (currentIndex === -1) return songIdList[0];
      const nextIdx = (currentIndex + 1) % songIdList.length;
      return songIdList[nextIdx];
    }
    return null;
  }
}
