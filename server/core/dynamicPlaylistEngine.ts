import fs from 'fs';
import path from 'path';

export interface PlayHistoryItem {
  id: string;
  songId: string;
  songTitle: string;
  songArtist: string;
  timestamp: number;
  playDuration?: number;
  device?: string;
}

export interface PlayStatsData {
  playCounts: Record<string, number>;
  lastPlayedTimes: Record<string, number>;
  history: PlayHistoryItem[];
  updatedAt: string;
}

export interface SongLike {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  url?: string;
  coverUrl?: string;
  genre?: string;
  year?: number;
  bitrate?: string;
  fileSize?: string;
  isFavorite?: boolean;
  source?: string;
  format?: string;
  codec?: string;
  bitDepth?: string;
  sampleRate?: string;
  playCount?: number;
  lastPlayedAt?: number;
  [key: string]: any;
}

export class DynamicPlaylistEngine {
  private dataDir: string;
  private statsFile: string;
  private playCounts: Record<string, number> = {};
  private lastPlayedTimes: Record<string, number> = {};
  private history: PlayHistoryItem[] = [];

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.statsFile = path.join(dataDir, 'play_stats.json');
    this.loadStats();
  }

  private loadStats(): void {
    try {
      if (fs.existsSync(this.statsFile)) {
        const raw = fs.readFileSync(this.statsFile, 'utf-8');
        const data = JSON.parse(raw) as PlayStatsData;
        this.playCounts = data.playCounts || {};
        this.lastPlayedTimes = data.lastPlayedTimes || {};
        this.history = Array.isArray(data.history) ? data.history : [];
      } else {
        // Pre-seed initial realistic playback statistics for pre-seeded tracks
        this.preSeedInitialStats();
        this.saveStats();
      }
    } catch (err) {
      console.warn('[DynamicPlaylistEngine] Failed to load play_stats.json, initializing defaults:', err);
      this.preSeedInitialStats();
    }
  }

  private preSeedInitialStats(): void {
    const now = Date.now();
    const HOUR = 3600 * 1000;

    // Seed realistic counts & timestamps so dynamic playlists are vibrant out-of-the-box
    this.playCounts = {
      'song-1': 42,
      'song-2': 35,
      'song-6': 29,
      'song-4': 22,
      'song-3': 15,
      'song-5': 9
    };

    this.lastPlayedTimes = {
      'song-1': now - 15 * 60 * 1000,          // 15 minutes ago
      'song-2': now - 2 * HOUR,                 // 2 hours ago
      'song-6': now - 5 * HOUR,                 // 5 hours ago
      'song-4': now - 18 * HOUR,                // 18 hours ago
      'song-3': now - 36 * HOUR,                // 1.5 days ago
      'song-5': now - 72 * HOUR                 // 3 days ago
    };

    this.history = [
      {
        id: `hist-${now - 15 * 60 * 1000}`,
        songId: 'song-1',
        songTitle: '月半小夜曲 (Acoustic Night)',
        songArtist: '李克勤 / 弦乐室内乐团',
        timestamp: now - 15 * 60 * 1000,
        device: '客厅·小米Sound高保真音箱'
      },
      {
        id: `hist-${now - 2 * HOUR}`,
        songId: 'song-2',
        songTitle: '春江花月夜 (Moonlit Spring River)',
        songArtist: '中央民族乐团 / 古筝与箫',
        timestamp: now - 2 * HOUR,
        device: '网页高保真播放器'
      },
      {
        id: `hist-${now - 5 * HOUR}`,
        songId: 'song-6',
        songTitle: '加州旅馆 (Hotel California Acoustic Live)',
        songArtist: 'Eagles (发烧试音碟)',
        timestamp: now - 5 * HOUR,
        device: '书房·小爱音箱Pro'
      },
      {
        id: `hist-${now - 18 * HOUR}`,
        songId: 'song-4',
        songTitle: '海阔天空 (Boundless Oceans, Vast Skies)',
        songArtist: 'Beyond',
        timestamp: now - 18 * HOUR,
        device: '客厅·小米Sound高保真音箱'
      },
      {
        id: `hist-${now - 36 * HOUR}`,
        songId: 'song-3',
        songTitle: '夜的第七章 (Nocturne in Dim Light)',
        songArtist: '周杰伦 / 潘儿',
        timestamp: now - 36 * HOUR,
        device: '网页高保真播放器'
      },
      {
        id: `hist-${now - 72 * HOUR}`,
        songId: 'song-5',
        songTitle: 'Rainy Cafe (午后咖啡馆雨声)',
        songArtist: 'Lofi Coffee Roaster',
        timestamp: now - 72 * HOUR,
        device: '卧室·小爱触屏音箱'
      }
    ];
  }

  public saveStats(): void {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      const data: PlayStatsData = {
        playCounts: this.playCounts,
        lastPlayedTimes: this.lastPlayedTimes,
        history: this.history.slice(0, 300), // retain latest 300 logs
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.statsFile, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[DynamicPlaylistEngine] Failed to save play_stats.json:', err);
    }
  }

  /**
   * Record a song playback event (scrobble)
   */
  public recordPlay(
    songId: string, 
    details?: { title?: string; artist?: string; device?: string; duration?: number }
  ): { playCount: number; lastPlayedAt: number } {
    if (!songId) return { playCount: 0, lastPlayedAt: Date.now() };

    const cleanId = songId.replace(/\.(mp3|flac|wav|m4a|aac|ogg|opus|ape)$/i, '');
    const currentCount = this.playCounts[cleanId] || this.playCounts[songId] || 0;
    const newCount = currentCount + 1;
    const now = Date.now();

    this.playCounts[cleanId] = newCount;
    this.playCounts[songId] = newCount;
    this.lastPlayedTimes[cleanId] = now;
    this.lastPlayedTimes[songId] = now;

    // Append to listening history
    const historyItem: PlayHistoryItem = {
      id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      songId: cleanId,
      songTitle: details?.title || '未知曲目',
      songArtist: details?.artist || '未知艺术家',
      timestamp: now,
      playDuration: details?.duration,
      device: details?.device || '本地播放器'
    };

    this.history.unshift(historyItem);
    if (this.history.length > 500) {
      this.history = this.history.slice(0, 500);
    }

    this.saveStats();
    return { playCount: newCount, lastPlayedAt: now };
  }

  public getPlayCount(songId: string): number {
    const cleanId = songId.replace(/\.(mp3|flac|wav|m4a|aac|ogg|opus|ape)$/i, '');
    return this.playCounts[cleanId] || this.playCounts[songId] || 0;
  }

  public getLastPlayedAt(songId: string): number | undefined {
    const cleanId = songId.replace(/\.(mp3|flac|wav|m4a|aac|ogg|opus|ape)$/i, '');
    return this.lastPlayedTimes[cleanId] || this.lastPlayedTimes[songId];
  }

  /**
   * Enriches a list of songs with playCount and lastPlayedAt
   */
  public enrichSongs<T extends SongLike>(songs: T[]): T[] {
    return songs.map(s => {
      const pCount = this.getPlayCount(s.id);
      const lastPlayed = this.getLastPlayedAt(s.id);
      return {
        ...s,
        playCount: pCount,
        lastPlayedAt: lastPlayed
      };
    });
  }

  /**
   * Generates "常听榜" (Top Played Songs)
   * Ranked by playCount descending. Filters tracks that have been played at least once.
   */
  public getTopPlayedSongs<T extends SongLike>(songs: T[], limit = 100): T[] {
    const enriched = this.enrichSongs(songs);
    return enriched
      .filter(s => (s.playCount || 0) > 0)
      .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
      .slice(0, limit);
  }

  /**
   * Generates "最近播放" (Recently Played Songs)
   * Ordered by lastPlayedAt timestamp descending (deduplicated by songId)
   */
  public getRecentlyPlayedSongs<T extends SongLike>(songs: T[], limit = 100): T[] {
    const enriched = this.enrichSongs(songs);
    
    // First try using enriched.lastPlayedAt
    const playedSongs = enriched.filter(s => typeof s.lastPlayedAt === 'number' && s.lastPlayedAt > 0);
    if (playedSongs.length > 0) {
      return playedSongs
        .sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0))
        .slice(0, limit);
    }

    // Fallback: derive from history list
    const seenIds = new Set<string>();
    const result: T[] = [];

    for (const h of this.history) {
      if (seenIds.has(h.songId)) continue;
      const found = enriched.find(s => s.id === h.songId || s.id.replace(/\.[^.]+$/, '') === h.songId);
      if (found) {
        seenIds.add(h.songId);
        result.push(found);
        if (result.length >= limit) break;
      }
    }

    return result;
  }

  /**
   * Evaluates if a song qualifies as lossless / Hi-Res audiophile audio
   */
  public isLosslessSong(song: SongLike): boolean {
    const bitrate = (song.bitrate || '').toLowerCase();
    const format = (song.format || '').toLowerCase();
    const codec = (song.codec || '').toLowerCase();
    const bitDepth = (song.bitDepth || '').toLowerCase();
    const sampleRate = (song.sampleRate || '').toLowerCase();
    const url = (song.url || '').toLowerCase();
    const filePath = (song.filePath || song.localFilename || '').toLowerCase();

    // Check lossless extensions and formats
    const isLosslessExt = /\.(flac|wav|ape|dsf|dff|alac|aiff)(\?|$)/i.test(url) ||
      /\.(flac|wav|ape|dsf|dff|alac|aiff)$/i.test(filePath) ||
      ['flac', 'wav', 'ape', 'dsf', 'dff', 'alac'].includes(format);

    // Check bitrate and studio keywords
    const isLosslessKeywords = 
      bitrate.includes('flac') ||
      bitrate.includes('wav') ||
      bitrate.includes('ape') ||
      bitrate.includes('dsd') ||
      bitrate.includes('无损') ||
      bitrate.includes('lossless') ||
      bitrate.includes('24bit') ||
      bitrate.includes('96khz') ||
      bitrate.includes('192khz') ||
      codec.includes('flac') ||
      codec.includes('pcm') ||
      codec.includes('dsd') ||
      bitDepth.includes('24') ||
      bitDepth.includes('32') ||
      sampleRate.includes('96') ||
      sampleRate.includes('192');

    // Large audio file size heuristic (> 18 MB indicates lossless FLAC/WAV/DSD)
    const sizeNum = parseFloat(song.fileSize || '0');
    const isLargeFile = (song.fileSize || '').toLowerCase().includes('mb') && sizeNum >= 18;

    return Boolean(isLosslessExt || isLosslessKeywords || isLargeFile);
  }

  /**
   * Generates "无损精选" (Lossless Masterpieces)
   * Filters tracks with FLAC / WAV / APE / DSD / 24-bit / Hi-Res encoding
   */
  public getLosslessSelection<T extends SongLike>(songs: T[], limit = 100): T[] {
    const enriched = this.enrichSongs(songs);
    return enriched
      .filter(s => this.isLosslessSong(s))
      .sort((a, b) => {
        // Prioritize DSD & 24bit FLAC
        const aScore = this.getAudioQualityScore(a);
        const bScore = this.getAudioQualityScore(b);
        return bScore - aScore;
      })
      .slice(0, limit);
  }

  private getAudioQualityScore(song: SongLike): number {
    let score = 10;
    const text = `${song.bitrate || ''} ${song.codec || ''} ${song.bitDepth || ''} ${song.format || ''}`.toLowerCase();
    if (text.includes('dsd') || text.includes('dsf')) score += 50;
    if (text.includes('24bit') || text.includes('24-bit')) score += 30;
    if (text.includes('192khz')) score += 25;
    if (text.includes('96khz')) score += 20;
    if (text.includes('flac')) score += 15;
    if (text.includes('wav')) score += 10;
    return score;
  }

  /**
   * Clear playback history (Recently Played)
   */
  public clearHistory(): void {
    this.history = [];
    this.lastPlayedTimes = {};
    this.saveStats();
  }

  /**
   * Returns comprehensive statistics and definitions for the 3 dynamic playlists
   */
  public getDynamicPlaylistsOverview<T extends SongLike>(songs: T[]) {
    const topPlayed = this.getTopPlayedSongs(songs);
    const recentlyPlayed = this.getRecentlyPlayedSongs(songs);
    const lossless = this.getLosslessSelection(songs);

    return {
      success: true,
      updatedAt: new Date().toISOString(),
      playlists: [
        {
          id: 'dynamic:top_played',
          type: 'top_played',
          name: '常听榜',
          description: '根据综合播放频次 (PlayCount) 实时计算生成的个人高频热播榜单',
          badge: '实时热度排行',
          songIds: topPlayed.map(s => s.id),
          totalCount: topPlayed.length,
          icon: 'Flame'
        },
        {
          id: 'dynamic:recently_played',
          type: 'recently_played',
          name: '最近播放',
          description: '实时记录您在网页端与小米智能音箱上的听歌轨迹',
          badge: '听歌历史足迹',
          songIds: recentlyPlayed.map(s => s.id),
          totalCount: recentlyPlayed.length,
          icon: 'Clock'
        },
        {
          id: 'dynamic:lossless',
          type: 'lossless',
          name: '无损精选',
          description: '自动甄选 FLAC、DSD/DSF、APE、24bit/96kHz 高解析发烧原声音轨',
          badge: 'Hi-Res 发烧甄选',
          songIds: lossless.map(s => s.id),
          totalCount: lossless.length,
          icon: 'Sparkles'
        }
      ],
      stats: {
        totalRecordedPlays: Object.values(this.playCounts).reduce((a, b) => a + b, 0),
        historyCount: this.history.length,
        topPlayedCount: topPlayed.length,
        recentlyPlayedCount: recentlyPlayed.length,
        losslessCount: lossless.length
      }
    };
  }
}
