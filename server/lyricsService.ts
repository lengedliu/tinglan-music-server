import fs from 'fs';
import path from 'path';

export interface LyricsSearchResult {
  success: boolean;
  lyrics: string;
  source: 'library' | 'lrclib' | 'netease' | 'kugou' | 'generated';
  providerName: string;
  isSynced: boolean;
  title?: string;
  artist?: string;
}

/**
 * Clean track title and artist string for higher search match rate
 */
export function cleanSearchKeyword(title: string, artist?: string): { cleanTitle: string; cleanArtist: string; query: string } {
  let cleanTitle = String(title || '')
    .replace(/\.[a-zA-Z0-9]{2,5}$/, '') // Remove file extension (.mp3, .flac)
    .replace(/^\d+[\s._-]+/, '') // Remove leading track numbers ("01. ", "01 - ")
    .replace(/\[(FLAC|Hi-Res|320k|HQ|SQ|无损|官方版|重温版|24bit|DSD|WAV|APE)\]/gi, '')
    .replace(/\((Live|Remix|Remastered|Deluxe|Edition|Cover|伴奏|Live版|现场版)\)/gi, '')
    .replace(/【[^】]+】/g, '')
    .replace(/\[[^\]]+\]/g, '')
    .trim();

  let cleanArtist = String(artist || '')
    .replace(/\.[a-zA-Z0-9]{2,5}$/, '')
    .replace(/未知歌手|群星|Various Artists/gi, '')
    .split(/[,/&、;]|feat\.|ft\./i)[0] // Pick primary artist
    .trim();

  // If artist is part of title (e.g. "陈百强 - 偏偏喜欢你")
  if (cleanTitle.includes(' - ')) {
    const parts = cleanTitle.split(' - ');
    if (parts.length === 2) {
      if (!cleanArtist || cleanArtist === '未知歌手') {
        cleanArtist = parts[0].trim();
        cleanTitle = parts[1].trim();
      }
    }
  }

  const query = [cleanArtist, cleanTitle].filter(Boolean).join(' ').trim();
  return { cleanTitle, cleanArtist, query: query || cleanTitle };
}

/**
 * Verify if lyric string has standard LRC time tags [mm:ss.xx]
 */
export function hasValidLrcTimestamps(lrcText: string): boolean {
  if (!lrcText || typeof lrcText !== 'string') return false;
  return /\[\d{2}:\d{2}(\.\d{2,3})?\]/.test(lrcText);
}

/**
 * Lyrics Provider Engine (LRCLIB -> Netease -> Kugou -> Fallback)
 */
export class LyricsService {
  private cache: Map<string, LyricsSearchResult> = new Map();

  constructor() {}

  /**
   * Search LRCLIB (Open-Source Free Lyrics Provider)
   * https://lrclib.net
   */
  private async searchLrclib(cleanTitle: string, cleanArtist: string, duration?: number): Promise<LyricsSearchResult | null> {
    try {
      const headers = {
        'User-Agent': 'TinglanMusicServer/2.5.0 (https://github.com/lengedliu/tinglan-music-server)'
      };

      // 1. Exact match attempt with duration
      if (cleanTitle && cleanArtist) {
        let exactUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTitle)}&artist_name=${encodeURIComponent(cleanArtist)}`;
        if (duration && duration > 10) {
          exactUrl += `&duration=${Math.round(duration)}`;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(exactUrl, { headers, signal: controller.signal });
        clearTimeout(timeout);

        if (res.ok) {
          const data: any = await res.json();
          const lyrics = data.syncedLyrics || data.plainLyrics;
          if (lyrics && lyrics.trim().length > 10) {
            return {
              success: true,
              lyrics: lyrics.trim(),
              source: 'lrclib',
              providerName: 'LRCLIB 开源歌词库 (精准匹配)',
              isSynced: Boolean(data.syncedLyrics && hasValidLrcTimestamps(data.syncedLyrics)),
              title: data.trackName || cleanTitle,
              artist: data.artistName || cleanArtist
            };
          }
        }
      }

      // 2. Fuzzy search fallback on LRCLIB
      const query = [cleanArtist, cleanTitle].filter(Boolean).join(' ');
      const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
      const searchController = new AbortController();
      const searchTimeout = setTimeout(() => searchController.abort(), 4000);
      const searchRes = await fetch(searchUrl, { headers, signal: searchController.signal });
      clearTimeout(searchTimeout);

      if (searchRes.ok) {
        const list: any[] = await searchRes.json();
        if (Array.isArray(list) && list.length > 0) {
          // Prefer synced lyrics first
          const match = list.find(item => item.syncedLyrics) || list[0];
          const lyrics = match?.syncedLyrics || match?.plainLyrics;
          if (lyrics && lyrics.trim().length > 10) {
            return {
              success: true,
              lyrics: lyrics.trim(),
              source: 'lrclib',
              providerName: 'LRCLIB 开源歌词库 (模糊匹配)',
              isSynced: Boolean(match.syncedLyrics && hasValidLrcTimestamps(match.syncedLyrics)),
              title: match.trackName || cleanTitle,
              artist: match.artistName || cleanArtist
            };
          }
        }
      }
    } catch (e: any) {
      console.warn(`[LyricsService] LRCLIB search error:`, e.message);
    }
    return null;
  }

  /**
   * Search Netease Cloud Music Public API
   * High hit rate for Chinese / Asian pop music
   */
  private async searchNetease(query: string): Promise<LyricsSearchResult | null> {
    try {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://music.163.com/'
      };

      // Step 1: Search song ID
      const searchUrl = `https://music.163.com/api/search/get/web?csrf_token=&hlpretag=&hlposttag=&s=${encodeURIComponent(query)}&type=1&offset=0&total=true&limit=3`;
      const controller1 = new AbortController();
      const timeout1 = setTimeout(() => controller1.abort(), 4000);
      const searchRes = await fetch(searchUrl, { headers, signal: controller1.signal });
      clearTimeout(timeout1);

      if (!searchRes.ok) return null;
      const searchData: any = await searchRes.json();
      const songs = searchData?.result?.songs;
      if (!Array.isArray(songs) || songs.length === 0) return null;

      const topSong = songs[0];
      const songId = topSong.id;
      if (!songId) return null;

      // Step 2: Fetch lyric
      const lyricUrl = `https://music.163.com/api/song/lyric?os=pc&id=${songId}&lv=-1&kv=-1&tv=-1`;
      const controller2 = new AbortController();
      const timeout2 = setTimeout(() => controller2.abort(), 4000);
      const lyricRes = await fetch(lyricUrl, { headers, signal: controller2.signal });
      clearTimeout(timeout2);

      if (!lyricRes.ok) return null;
      const lyricData: any = await lyricRes.json();
      const rawLrc = lyricData?.lrc?.lyric;

      if (rawLrc && typeof rawLrc === 'string' && rawLrc.trim().length > 10) {
        return {
          success: true,
          lyrics: rawLrc.trim(),
          source: 'netease',
          providerName: '网易云音乐公开歌词源',
          isSynced: hasValidLrcTimestamps(rawLrc),
          title: topSong.name,
          artist: topSong.artists?.[0]?.name
        };
      }
    } catch (e: any) {
      console.warn(`[LyricsService] Netease search error:`, e.message);
    }
    return null;
  }

  /**
   * Search Kugou Music Public API
   * Great fallback for Chinese classic songs & older tracks
   */
  private async searchKugou(cleanTitle: string, cleanArtist: string, duration?: number): Promise<LyricsSearchResult | null> {
    try {
      const query = [cleanArtist, cleanTitle].filter(Boolean).join(' ');
      const searchUrl = `http://mobilecdn.kugou.com/api/v3/search/song?format=json&keyword=${encodeURIComponent(query)}&page=1&pagesize=3`;
      
      const controller1 = new AbortController();
      const timeout1 = setTimeout(() => controller1.abort(), 4000);
      const searchRes = await fetch(searchUrl, { signal: controller1.signal });
      clearTimeout(timeout1);

      if (!searchRes.ok) return null;
      const searchData: any = await searchRes.json();
      const songList = searchData?.data?.info;
      if (!Array.isArray(songList) || songList.length === 0) return null;

      const topItem = songList[0];
      const hash = topItem.hash;
      if (!hash) return null;

      // Search lyric candidate
      const durMs = (duration && duration > 10) ? Math.round(duration * 1000) : (topItem.duration ? topItem.duration * 1000 : 0);
      const candUrl = `http://krcs.kugou.com/search?ver=1&man=yes&client=mobi&keyword=${encodeURIComponent(cleanTitle)}&duration=${durMs}&hash=${hash}`;
      
      const controller2 = new AbortController();
      const timeout2 = setTimeout(() => controller2.abort(), 4000);
      const candRes = await fetch(candUrl, { signal: controller2.signal });
      clearTimeout(timeout2);

      if (!candRes.ok) return null;
      const candData: any = await candRes.json();
      const candidate = candData?.candidates?.[0];
      if (!candidate?.id || !candidate?.accesskey) return null;

      // Download lyric
      const dlUrl = `http://krcs.kugou.com/download?ver=1&client=man&id=${candidate.id}&accesskey=${candidate.accesskey}&fmt=lrc&charset=utf8`;
      const controller3 = new AbortController();
      const timeout3 = setTimeout(() => controller3.abort(), 4000);
      const dlRes = await fetch(dlUrl, { signal: controller3.signal });
      clearTimeout(timeout3);

      if (!dlRes.ok) return null;
      const dlData: any = await dlRes.json();
      if (dlData?.content) {
        const decoded = Buffer.from(dlData.content, 'base64').toString('utf-8');
        if (decoded && decoded.trim().length > 10) {
          return {
            success: true,
            lyrics: decoded.trim(),
            source: 'kugou',
            providerName: '酷狗音乐公开歌词源',
            isSynced: hasValidLrcTimestamps(decoded),
            title: topItem.songname || cleanTitle,
            artist: topItem.singername || cleanArtist
          };
        }
      }
    } catch (e: any) {
      console.warn(`[LyricsService] Kugou search error:`, e.message);
    }
    return null;
  }

  /**
   * Main Search Pipeline with Multi-source Fallback & Cache
   */
  public async searchLyricsAsync(options: {
    title: string;
    artist?: string;
    duration?: number;
    forceOnline?: boolean;
    existingLyrics?: string;
  }): Promise<LyricsSearchResult> {
    const { cleanTitle, cleanArtist, query } = cleanSearchKeyword(options.title, options.artist);
    const cacheKey = `${cleanArtist}_${cleanTitle}`.toLowerCase();

    // 1. Check local cache (if not forcing online refresh)
    if (!options.forceOnline && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      return cached;
    }

    // 2. Check if existing lyrics is already valid synced LRC
    if (!options.forceOnline && options.existingLyrics && options.existingLyrics.trim().length > 30) {
      const isSynced = hasValidLrcTimestamps(options.existingLyrics);
      if (isSynced && !options.existingLyrics.includes('听蓝高保真音乐库')) {
        const res: LyricsSearchResult = {
          success: true,
          lyrics: options.existingLyrics.trim(),
          source: 'library',
          providerName: '曲库内嵌/本地歌词',
          isSynced: true,
          title: cleanTitle,
          artist: cleanArtist
        };
        this.cache.set(cacheKey, res);
        return res;
      }
    }

    console.log(`🎵 [LyricsService] 正在全网检索歌词: “${cleanTitle}” - “${cleanArtist}” (关键词: ${query})...`);

    // 3. Provider 1: LRCLIB (Open-Source Primary)
    const lrclibRes = await this.searchLrclib(cleanTitle, cleanArtist, options.duration);
    if (lrclibRes && lrclibRes.isSynced) {
      console.log(`[LyricsService] ✅ LRCLIB 命中精准时间轴歌词: “${cleanTitle}”`);
      this.cache.set(cacheKey, lrclibRes);
      return lrclibRes;
    }

    // 4. Provider 2: Netease Cloud Music (Chinese Pop Fallback)
    const neteaseRes = await this.searchNetease(query);
    if (neteaseRes && neteaseRes.isSynced) {
      console.log(`[LyricsService] ✅ 网易云音乐命中时间轴歌词: “${cleanTitle}”`);
      this.cache.set(cacheKey, neteaseRes);
      return neteaseRes;
    }

    // 5. Provider 3: Kugou Music (Classic Fallback)
    const kugouRes = await this.searchKugou(cleanTitle, cleanArtist, options.duration);
    if (kugouRes && kugouRes.isSynced) {
      console.log(`[LyricsService] ✅ 酷狗音乐命中时间轴歌词: “${cleanTitle}”`);
      this.cache.set(cacheKey, kugouRes);
      return kugouRes;
    }

    // 6. Any plain lyrics from LRCLIB/Netease if synced wasn't found
    if (lrclibRes) {
      this.cache.set(cacheKey, lrclibRes);
      return lrclibRes;
    }
    if (neteaseRes) {
      this.cache.set(cacheKey, neteaseRes);
      return neteaseRes;
    }

    // 7. Fallback generated dynamic synced LRC
    const fallbackLrc = `[00:00.00] ${cleanTitle || '音乐曲目'} - ${cleanArtist || '听蓝音乐'}
[00:03.00] 暂未匹配到外网歌词，正在播放高品质音频流
[00:08.00] 微风拂过宁静的夜 旋律在空气中漫延
[00:15.50] 音符跳跃在指尖 带来无与伦比的惬意
[00:22.00] 伴随智能音箱 聆听高保真震撼音质
[00:29.80] 让音乐充满房间的每一个角落
[00:36.20] 倾听内心深处的共鸣 沉浸在纯粹的听觉盛宴
[00:43.00] 听蓝音乐 · 享受属于你的专属时刻
[00:52.00] (音乐间奏 - 沉浸播放中)
[01:10.00] 无论身在何方 音乐始终相伴
[01:18.50] 听蓝音乐服务已开启 高品质流媒体同步中`;

    const fallbackRes: LyricsSearchResult = {
      success: true,
      lyrics: fallbackLrc,
      source: 'generated',
      providerName: '动态高保真歌词生成器',
      isSynced: true,
      title: cleanTitle,
      artist: cleanArtist
    };

    return fallbackRes;
  }
}

export const lyricsService = new LyricsService();
