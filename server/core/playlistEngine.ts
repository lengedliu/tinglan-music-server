import { musicRepository } from './repositories/musicRepository.js';

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

  constructor(dataDir?: string) {
    this.dataDir = dataDir || '';
  }

  public savePlaylists() {
    musicRepository.schedulePersistPlaylists(200);
  }

  public getAll(): Playlist[] {
    return musicRepository.getAllPlaylists();
  }

  public setPlaylists(playlists: Playlist[]): void {
    musicRepository.setPlaylists(playlists);
  }

  public reload(): void {
    // Relies on musicRepository as canonical source of truth
    musicRepository.schedulePersistPlaylists(100);
  }

  public getById(id: string): Playlist | undefined {
    return musicRepository.getPlaylistById(id);
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
    musicRepository.addOrUpdatePlaylist(newPl);
    return newPl;
  }

  public updatePlaylist(id: string, updates: Partial<Playlist>): Playlist | null {
    const pl = musicRepository.getPlaylistById(id);
    if (!pl) return null;
    const updated: Playlist = {
      ...pl,
      ...(updates.name !== undefined ? { name: updates.name.trim() } : {}),
      ...(updates.description !== undefined ? { description: updates.description.trim() } : {}),
      ...(Array.isArray(updates.songIds) ? { songIds: updates.songIds } : {}),
      ...(updates.coverUrl ? { coverUrl: updates.coverUrl } : {})
    };
    musicRepository.addOrUpdatePlaylist(updated);
    return updated;
  }

  public deletePlaylist(id: string): boolean {
    return musicRepository.deletePlaylist(id);
  }

  public addSongsToPlaylist(id: string, songIds: string[]): { success: boolean; addedCount: number } {
    const pl = musicRepository.getPlaylistById(id);
    if (!pl) return { success: false, addedCount: 0 };
    let addedCount = 0;
    const currentSongIds = [...pl.songIds];
    songIds.forEach(sId => {
      if (!currentSongIds.includes(sId)) {
        currentSongIds.push(sId);
        addedCount++;
      }
    });
    musicRepository.addOrUpdatePlaylist({ ...pl, songIds: currentSongIds });
    return { success: true, addedCount };
  }

  public removeSongFromPlaylist(id: string, songId: string): boolean {
    const pl = musicRepository.getPlaylistById(id);
    if (!pl) return false;
    const initialLen = pl.songIds.length;
    const nextSongIds = pl.songIds.filter(s => s !== songId);
    if (nextSongIds.length < initialLen) {
      musicRepository.addOrUpdatePlaylist({ ...pl, songIds: nextSongIds });
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
