import { musicRepository } from './repositories/musicRepository.js';
import { Song } from './musicEngine.js';

export interface ParsedTrackItem {
  id: string; // unique item id in import session
  originalTitle: string;
  originalArtist: string;
  originalAlbum?: string;
  originalDuration?: number;
  // Match results
  status: 'matched' | 'fuzzy' | 'missing';
  matchScore: number; // 0 - 100
  matchedSong?: Song;
  candidateSongs?: Array<{ song: Song; score: number }>;
}

export interface ParsePlaylistResult {
  sourceType: 'netease' | 'qqmusic' | 'text' | 'm3u' | 'csv' | 'unknown';
  playlistName: string;
  description: string;
  coverUrl: string;
  totalTracks: number;
  matchedCount: number;
  fuzzyCount: number;
  missingCount: number;
  tracks: ParsedTrackItem[];
}

export class PlaylistImportService {
  /**
   * Main entry point to parse a raw string input (URL, text, or file content)
   */
  public async parseImportInput(input: string, customTitle?: string): Promise<ParsePlaylistResult> {
    const trimmed = (input || '').trim();
    if (!trimmed) {
      throw new Error('导入内容不能为空，请提供歌单链接、文本列表或 M3U 文件内容');
    }

    // 1. Check if it is a NetEase Cloud Music Link or ID
    if (this.isNetEaseInput(trimmed)) {
      return this.parseNetEasePlaylist(trimmed, customTitle);
    }

    // 2. Check if it is a QQ Music Link or ID
    if (this.isQQMusicInput(trimmed)) {
      return this.parseQQMusicPlaylist(trimmed, customTitle);
    }

    // 3. Check if it is M3U / M3U8 format
    if (trimmed.includes('#EXTM3U') || trimmed.includes('#EXTINF:')) {
      return this.parseM3UContent(trimmed, customTitle);
    }

    // 4. Check if CSV format (has comma/tab separated lines with title/artist header)
    if (this.isCSVContent(trimmed)) {
      return this.parseCSVContent(trimmed, customTitle);
    }

    // 5. Fallback: Parse as free text lines (e.g. "Title - Artist" or "1. Artist - Title")
    return this.parseFreeTextContent(trimmed, customTitle);
  }

  /**
   * Determine if input is a NetEase music URL / ID
   */
  private isNetEaseInput(input: string): boolean {
    return (
      input.includes('163.com') ||
      input.includes('163cn.tv') ||
      input.includes('music.163') ||
      /^netease:\d+$/i.test(input)
    );
  }

  /**
   * Determine if input is a QQ Music URL / ID
   */
  private isQQMusicInput(input: string): boolean {
    return (
      input.includes('qq.com') ||
      input.includes('y.qq.com') ||
      /^qq:\d+$/i.test(input)
    );
  }

  /**
   * Determine if input is CSV format
   */
  private isCSVContent(input: string): boolean {
    const firstLine = input.split('\n')[0].toLowerCase();
    return (
      (firstLine.includes('title') || firstLine.includes('track') || firstLine.includes('name') || firstLine.includes('歌名')) &&
      (firstLine.includes(',') || firstLine.includes('\t') || firstLine.includes(';'))
    );
  }

  /**
   * Extract playlist ID from NetEase URL
   */
  private extractNetEaseId(input: string): string | null {
    // e.g. https://music.163.com/#/playlist?id=123456 or https://music.163.com/playlist?id=123456
    const match = input.match(/[?&]id=(\d+)/i) || input.match(/playlist\/(\d+)/i) || input.match(/netease:(\d+)/i);
    if (match) return match[1];

    // If pure digits and length >= 6
    if (/^\d{6,14}$/.test(input.trim())) {
      return input.trim();
    }
    return null;
  }

  /**
   * Extract playlist ID from QQ Music URL
   */
  private extractQQMusicId(input: string): string | null {
    const match = input.match(/playlist\/(\d+)/i) ||
                  input.match(/playsquare\/(\d+)/i) ||
                  input.match(/id=(\d+)/i) ||
                  input.match(/disstid=(\d+)/i) ||
                  input.match(/qq:(\d+)/i);
    if (match) return match[1];
    if (/^\d{8,14}$/.test(input.trim())) {
      return input.trim();
    }
    return null;
  }

  /**
   * Parse NetEase Playlist
   */
  private async parseNetEasePlaylist(input: string, customTitle?: string): Promise<ParsePlaylistResult> {
    let rawTrackList: Array<{ title: string; artist: string; album?: string; duration?: number }> = [];
    let playlistName = customTitle || '网易云音乐精选歌单';
    let description = '通过网易云音乐链接导入';
    let coverUrl = 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80';

    let id = this.extractNetEaseId(input);

    // If short link e.g. 163cn.tv, resolve redirect
    if (!id && input.includes('163cn.tv')) {
      try {
        const res = await fetch(input, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' } });
        id = this.extractNetEaseId(res.url);
      } catch (e) {
        console.warn('[PlaylistImport] Failed to resolve 163cn.tv redirect:', e);
      }
    }

    if (id) {
      try {
        const apiUrl = `https://music.163.com/api/v6/playlist/detail?id=${id}`;
        const resp = await fetch(apiUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://music.163.com/'
          }
        });

        if (resp.ok) {
          const data: any = await resp.json();
          if (data && data.playlist) {
            const pl = data.playlist;
            playlistName = customTitle || pl.name || playlistName;
            description = pl.description || `网易云歌单 (ID: ${id})，共包含 ${pl.trackCount || (pl.tracks && pl.tracks.length) || 0} 首曲目`;
            coverUrl = pl.coverImgUrl || coverUrl;

            const tracks = pl.tracks || [];
            rawTrackList = tracks.map((t: any) => {
              const artists = (t.ar || t.artists || []).map((a: any) => a.name).filter(Boolean).join(' / ') || '未知艺术家';
              const albumName = (t.al || t.album || {}).name || '';
              return {
                title: t.name || '未知曲目',
                artist: artists,
                album: albumName,
                duration: t.dt ? Math.round(t.dt / 1000) : undefined
              };
            });
          }
        }
      } catch (e) {
        console.warn('[PlaylistImport] NetEase API fetch error, fallback to mock/text parsing:', e);
      }
    }

    // Fallback if API was blocked or didn't return tracks: try scraping free text from input
    if (rawTrackList.length === 0) {
      return this.parseFreeTextContent(input, playlistName);
    }

    return this.matchTracksWithLocalLibrary(rawTrackList, 'netease', playlistName, description, coverUrl);
  }

  /**
   * Parse QQ Music Playlist
   */
  private async parseQQMusicPlaylist(input: string, customTitle?: string): Promise<ParsePlaylistResult> {
    let rawTrackList: Array<{ title: string; artist: string; album?: string; duration?: number }> = [];
    let playlistName = customTitle || 'QQ 音乐精选歌单';
    let description = '通过 QQ 音乐链接导入';
    let coverUrl = 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?auto=format&fit=crop&w=600&q=80';

    const id = this.extractQQMusicId(input);
    if (id) {
      try {
        const apiUrl = `https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&disstid=${id}&format=json`;
        const resp = await fetch(apiUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://y.qq.com/'
          }
        });

        if (resp.ok) {
          const data: any = await resp.json();
          if (data && data.cdlist && data.cdlist.length > 0) {
            const cd = data.cdlist[0];
            playlistName = customTitle || cd.dissname || playlistName;
            description = cd.desc || `QQ 音乐歌单 (ID: ${id})，共包含 ${cd.songnum || 0} 首曲目`;
            coverUrl = cd.logo || coverUrl;

            const songlist = cd.songlist || [];
            rawTrackList = songlist.map((s: any) => {
              const artists = (s.singer || []).map((sing: any) => sing.name).filter(Boolean).join(' / ') || '未知艺术家';
              return {
                title: s.songname || s.songtitle || '未知曲目',
                artist: artists,
                album: s.albumname || '',
                duration: s.interval || undefined
              };
            });
          }
        }
      } catch (e) {
        console.warn('[PlaylistImport] QQ Music API fetch error:', e);
      }
    }

    if (rawTrackList.length === 0) {
      return this.parseFreeTextContent(input, playlistName);
    }

    return this.matchTracksWithLocalLibrary(rawTrackList, 'qqmusic', playlistName, description, coverUrl);
  }

  /**
   * Parse M3U / M3U8 content
   */
  private parseM3UContent(content: string, customTitle?: string): ParsePlaylistResult {
    const lines = content.split(/\r?\n/);
    const rawTrackList: Array<{ title: string; artist: string; album?: string; duration?: number }> = [];

    let currentDuration: number | undefined;
    let currentTitle: string = '';
    let currentArtist: string = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith('#EXTINF:')) {
        // Format: #EXTINF:123,Artist - Title or #EXTINF:123,Title
        const match = line.match(/^#EXTINF:(-?\d+),(.*)$/);
        if (match) {
          const sec = parseInt(match[1], 10);
          currentDuration = sec > 0 ? sec : undefined;
          const info = match[2].trim();

          if (info.includes(' - ')) {
            const parts = info.split(' - ');
            currentArtist = parts[0].trim();
            currentTitle = parts.slice(1).join(' - ').trim();
          } else {
            currentTitle = info;
            currentArtist = '未知艺术家';
          }
        }
      } else if (!line.startsWith('#')) {
        // Path or filename line
        if (!currentTitle) {
          const filename = line.split(/[/\\]/).pop() || '';
          const cleanName = filename.replace(/\.(mp3|flac|wav|ape|m4a|aac|ogg|dsf|dff)$/i, '');
          if (cleanName.includes(' - ')) {
            const parts = cleanName.split(' - ');
            currentArtist = parts[0].trim();
            currentTitle = parts.slice(1).join(' - ').trim();
          } else {
            currentTitle = cleanName;
            currentArtist = '未知艺术家';
          }
        }

        if (currentTitle) {
          rawTrackList.push({
            title: currentTitle,
            artist: currentArtist || '未知艺术家',
            duration: currentDuration
          });
        }

        // Reset for next track
        currentDuration = undefined;
        currentTitle = '';
        currentArtist = '';
      }
    }

    const playlistName = customTitle || 'M3U 导入歌单';
    const description = `从 M3U 歌单文件导入，包含 ${rawTrackList.length} 首曲目`;
    const coverUrl = 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=600&q=80';

    return this.matchTracksWithLocalLibrary(rawTrackList, 'm3u', playlistName, description, coverUrl);
  }

  /**
   * Parse CSV content
   */
  private parseCSVContent(content: string, customTitle?: string): ParsePlaylistResult {
    const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      return this.matchTracksWithLocalLibrary([], 'csv', customTitle || 'CSV 导入歌单', '', '');
    }

    const delimiter = lines[0].includes('\t') ? '\t' : (lines[0].includes(';') ? ';' : ',');
    const header = lines[0].split(delimiter).map(h => h.trim().toLowerCase().replace(/^["']|["']$/g, ''));

    let titleIdx = header.findIndex(h => h === 'title' || h === 'track' || h === 'name' || h === '歌名' || h === '歌曲');
    let artistIdx = header.findIndex(h => h === 'artist' || h === 'singer' || h === '歌手' || h === '艺术家');
    let albumIdx = header.findIndex(h => h === 'album' || h === '专辑');

    if (titleIdx === -1) titleIdx = 0;
    if (artistIdx === -1) artistIdx = 1;

    const rawTrackList: Array<{ title: string; artist: string; album?: string }> = [];

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(delimiter).map(p => p.trim().replace(/^["']|["']$/g, ''));
      const title = parts[titleIdx] || '';
      const artist = (artistIdx >= 0 && parts[artistIdx]) ? parts[artistIdx] : '未知艺术家';
      const album = (albumIdx >= 0 && parts[albumIdx]) ? parts[albumIdx] : undefined;

      if (title) {
        rawTrackList.push({ title, artist, album });
      }
    }

    const playlistName = customTitle || 'CSV 导入歌单';
    const description = `从 CSV 文件导入，包含 ${rawTrackList.length} 首曲目`;
    const coverUrl = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80';

    return this.matchTracksWithLocalLibrary(rawTrackList, 'csv', playlistName, description, coverUrl);
  }

  /**
   * Parse Free Text Lines (e.g. "周杰伦 - 晴天" or "1. 稻香 - 周杰伦")
   */
  private parseFreeTextContent(content: string, customTitle?: string): ParsePlaylistResult {
    const lines = content.split(/\r?\n/);
    const rawTrackList: Array<{ title: string; artist: string }> = [];

    for (const rawLine of lines) {
      let line = rawLine.trim();
      if (!line) continue;

      // Ignore common comment lines or URL prefixes
      if (line.startsWith('#') || line.startsWith('//')) continue;

      // Strip leading track numbers like "1. ", "01 - ", "[1] "
      line = line.replace(/^\[?\d+[\].)\-:、\s]+/g, '').trim();
      if (!line) continue;

      let title = '';
      let artist = '未知艺术家';

      if (line.includes(' - ')) {
        const parts = line.split(' - ');
        if (parts.length >= 2) {
          // Check heuristic: is part 0 or part 1 more likely artist?
          // Usually "Singer - Title" or "Title - Singer"
          const p0 = parts[0].trim();
          const p1 = parts.slice(1).join(' - ').trim();
          artist = p0;
          title = p1;
        }
      } else if (line.includes(' / ')) {
        const parts = line.split(' / ');
        artist = parts[0].trim();
        title = parts.slice(1).join(' / ').trim();
      } else if (line.includes('《') && line.includes('》')) {
        const match = line.match(/^(.*?)\s*《(.*?)》/);
        if (match) {
          artist = match[1].trim() || '未知艺术家';
          title = match[2].trim();
        } else {
          title = line.replace(/[《》]/g, '').trim();
        }
      } else {
        title = line;
      }

      if (title) {
        rawTrackList.push({ title, artist });
      }
    }

    const playlistName = customTitle || '自定义文本歌单';
    const description = `从文本列表导入，共解析到 ${rawTrackList.length} 首曲目`;
    const coverUrl = 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=600&q=80';

    return this.matchTracksWithLocalLibrary(rawTrackList, 'text', playlistName, description, coverUrl);
  }

  /**
   * Smart Fuzzy Matching Engine
   * Compares raw parsed tracks against local library tracks in MusicRepository
   */
  private matchTracksWithLocalLibrary(
    rawTracks: Array<{ title: string; artist: string; album?: string; duration?: number }>,
    sourceType: ParsePlaylistResult['sourceType'],
    playlistName: string,
    description: string,
    coverUrl: string
  ): ParsePlaylistResult {
    const allLocalSongs = musicRepository.getAllSongs();

    // Pre-build normalized index of local songs
    const indexedLocalSongs = allLocalSongs.map(s => ({
      song: s,
      normTitle: this.normalizeString(s.title),
      normArtist: this.normalizeString(s.artist),
      cleanTitle: this.cleanSongTitle(s.title)
    }));

    let matchedCount = 0;
    let fuzzyCount = 0;
    let missingCount = 0;

    const parsedTracks: ParsedTrackItem[] = rawTracks.map((raw, idx) => {
      const rawNormTitle = this.normalizeString(raw.title);
      const rawCleanTitle = this.cleanSongTitle(raw.title);
      const rawNormArtist = this.normalizeString(raw.artist);

      const scoredCandidates: Array<{ song: Song; score: number }> = [];

      for (const local of indexedLocalSongs) {
        // Calculate title score
        let titleScore = 0;
        if (local.normTitle === rawNormTitle || local.cleanTitle === rawCleanTitle) {
          titleScore = 1.0;
        } else if (local.cleanTitle.includes(rawCleanTitle) || rawCleanTitle.includes(local.cleanTitle)) {
          titleScore = 0.85;
        } else {
          titleScore = this.calculateLevenshteinSimilarity(local.cleanTitle, rawCleanTitle);
        }

        // Calculate artist score
        let artistScore = 0.5; // Neutral if artist unknown
        if (rawNormArtist && rawNormArtist !== '未知艺术家' && rawNormArtist !== 'unknown') {
          if (local.normArtist === rawNormArtist) {
            artistScore = 1.0;
          } else if (local.normArtist.includes(rawNormArtist) || rawNormArtist.includes(local.normArtist)) {
            artistScore = 0.85;
          } else {
            artistScore = this.calculateLevenshteinSimilarity(local.normArtist, rawNormArtist);
          }
        }

        // Also check if swapped (Singer - Title vs Title - Singer)
        let swappedScore = 0;
        if (rawNormArtist && rawNormArtist !== '未知艺术家') {
          const swapTitleScore = this.calculateLevenshteinSimilarity(local.cleanTitle, rawNormArtist);
          const swapArtistScore = this.calculateLevenshteinSimilarity(local.normArtist, rawCleanTitle);
          swappedScore = swapTitleScore * 0.7 + swapArtistScore * 0.3;
        }

        const standardScore = titleScore * 0.7 + artistScore * 0.3;
        const totalScore = Math.max(standardScore, swappedScore);

        if (totalScore >= 0.55) {
          scoredCandidates.push({
            song: local.song,
            score: Math.round(totalScore * 100)
          });
        }
      }

      // Sort candidates descending by match score
      scoredCandidates.sort((a, b) => b.score - a.score);

      let status: 'matched' | 'fuzzy' | 'missing' = 'missing';
      let bestMatch: Song | undefined = undefined;
      let topScore = 0;

      if (scoredCandidates.length > 0) {
        topScore = scoredCandidates[0].score;
        if (topScore >= 80) {
          status = 'matched';
          bestMatch = scoredCandidates[0].song;
          matchedCount++;
        } else if (topScore >= 55) {
          status = 'fuzzy';
          bestMatch = scoredCandidates[0].song;
          fuzzyCount++;
        } else {
          status = 'missing';
          missingCount++;
        }
      } else {
        missingCount++;
      }

      return {
        id: `import-track-${idx + 1}`,
        originalTitle: raw.title,
        originalArtist: raw.artist,
        originalAlbum: raw.album,
        originalDuration: raw.duration,
        status,
        matchScore: topScore,
        matchedSong: bestMatch,
        candidateSongs: scoredCandidates.slice(0, 4)
      };
    });

    return {
      sourceType,
      playlistName,
      description,
      coverUrl,
      totalTracks: rawTracks.length,
      matchedCount,
      fuzzyCount,
      missingCount,
      tracks: parsedTracks
    };
  }

  /**
   * Helper: Normalize string by stripping punctuation, brackets, case, and extra whitespaces
   */
  private normalizeString(str: string): string {
    if (!str) return '';
    return str
      .toLowerCase()
      .replace(/[\s\-_.,/\\()（）[\]【】「」《》"'`~!@#$%^&*+=|:;]+/g, '')
      .trim();
  }

  /**
   * Helper: Clean song title from noise like "(Live)", "(Remaster)", "[无损]"
   */
  private cleanSongTitle(str: string): string {
    if (!str) return '';
    return str
      .toLowerCase()
      .replace(/\(live.*?\)|\[live.*?\]|（live.*?）/gi, '')
      .replace(/\(remaster.*?\)|\[remaster.*?\]/gi, '')
      .replace(/\(feat.*?\)|\[feat.*?\]/gi, '')
      .replace(/\(hq.*?\)|\[hq.*?\]|\(flac\)|\[无损\]/gi, '')
      .replace(/\(acoustic.*?\)|（现场版）|（伴奏）|\(instrumental\)/gi, '')
      .replace(/[\s\-_.,/\\()（）[\]【】「」《》"'`~!@#$%^&*+=|:;]+/g, '')
      .trim();
  }

  /**
   * Helper: Levenshtein similarity (0.0 to 1.0)
   */
  private calculateLevenshteinSimilarity(s1: string, s2: string): number {
    if (s1 === s2) return 1.0;
    if (!s1 || !s2) return 0.0;

    const len1 = s1.length;
    const len2 = s2.length;
    const matrix: number[][] = [];

    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    const dist = matrix[len1][len2];
    const maxLen = Math.max(len1, len2);
    return maxLen === 0 ? 1.0 : (1.0 - dist / maxLen);
  }
}

export const playlistImportService = new PlaylistImportService();
