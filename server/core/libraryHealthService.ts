import fs from 'fs';
import path from 'path';
import { musicRepository } from './repositories/musicRepository.js';
import { Song } from './musicEngine.js';
import { appEventBus } from './eventBus.js';

export interface LibraryHealthIssue {
  id: string;
  type:
    | 'missing_cover'
    | 'missing_lyrics'
    | 'dirty_tag'
    | 'duplicate'
    | 'low_bitrate'
    | 'garbled_encoding'
    | 'unparsed_filename'
    | 'plain_lyrics';
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  affectedCount: number;
  actionKey:
    | 'scrape_covers'
    | 'scrape_lyrics'
    | 'clean_tags'
    | 'deduplicate'
    | 'convert_lossless'
    | 'fix_encoding'
    | 'filename_to_tag';
}

export interface LibraryHealthReport {
  score: number; // 0 - 100
  grade: 'S' | 'A' | 'B' | 'C' | 'D';
  totalSongs: number;
  totalArtists: number;
  totalAlbums: number;
  losslessCount: number;
  losslessPercent: number;
  coverCount: number;
  coverMissingCount: number;
  coverPercent: number;
  lyricsCount: number;
  lyricsMissingCount: number;
  lyricsPercent: number;
  syncedLyricsCount: number;
  plainLyricsCount: number;
  sidecarLrcCount: number;
  dirtyTagCount: number;
  garbledCount: number;
  unparsedFilenameCount: number;
  duplicateGroupCount: number;
  duplicateSongsTotal: number;
  scanTime: number;
  issues: LibraryHealthIssue[];
}

export interface DuplicateSongGroup {
  groupKey: string;
  songTitle: string;
  artist: string;
  versionTag?: string;
  versions: Array<{
    song: Song;
    qualityRank: number; // Higher is better
    isLossless: boolean;
    bitrateScore: number;
    fileSizeMb: number;
    versionBadge: string;
    playlistNames: string[];
    isFavorite: boolean;
    recommendation: 'keep' | 'redundant';
    reason: string;
  }>;
}

export interface OnlineMetadataCandidate {
  id: string;
  source: 'iTunes + LRCLIB' | '网易云音乐' | 'LRCLIB 歌词库' | 'iTunes Music' | '听澜智能曲库';
  title: string;
  artist: string;
  album: string;
  year?: number;
  genre?: string;
  trackNumber?: number;
  duration?: number;
  coverUrl?: string;
  lyrics?: string;
  hasSyncedLyrics: boolean;
  confidence: number; // 0 - 100
  matchReason: string;
}

export interface FilenameTagDiffItem {
  songId: string;
  localFilename: string;
  oldTitle: string;
  newTitle: string;
  oldArtist: string;
  newArtist: string;
  oldAlbum: string;
  newAlbum: string;
  changed: boolean;
}

export interface TagFilenameDiffItem {
  songId: string;
  title: string;
  artist: string;
  oldFilename: string;
  newFilename: string;
  physicalExists: boolean;
  changed: boolean;
}

export interface EncodingFixItem {
  songId: string;
  localFilename: string;
  field: 'title' | 'artist' | 'album' | 'filename_fallback';
  oldValue: string;
  newValue: string;
}

// Curated high-res aesthetic vinyl & album covers categorized by genre/mood (used only as offline fallback)
const GENRE_COVER_ARCHIVE: Record<string, string[]> = {
  pop: [
    'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=800&q=80'
  ],
  rock: [
    'https://images.unsplash.com/photo-1464375117522-1311d6a5b81f?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=800&q=80'
  ],
  classical: [
    'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1520523839898-507127054976?auto=format&fit=crop&w=800&q=80'
  ],
  lofi: [
    'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80'
  ],
  jazz: [
    'https://images.unsplash.com/photo-1511192336575-5a79af67a629?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80'
  ],
  default: [
    'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=800&q=80'
  ]
};

// Common website ad watermarks to clean
const AD_TAG_PATTERNS = [
  /\[(?:无损音乐网|APE音乐|FLAC网|全网首发|高清无损|无损音质|超清MP3|320K|FLAC|Hi-Res|DSD)[^\]]*\]/gi,
  /【(?:无损音乐网|APE音乐|FLAC网|全网首发|高清无损|无损音质|超清MP3|320K|FLAC|Hi-Res|DSD)[^】]*】/gi,
  /\((?:无损音乐网|APE音乐|FLAC网|全网首发|高清无损|无损音质|超清MP3|320K|FLAC|Hi-Res|DSD)[^)]*\)/gi,
  /(?:www\.[a-z0-9-]+\.(?:com|cn|net|org|cc|me))/gi,
  /(?:http[s]?:\/\/[^\s]+)/gi,
  /(?:【更多无损音乐关注微信公众号[^】]*】)/gi,
  /(?:\[精品音乐社区[^\]]*\])/gi
];

// Version keywords to distinguish Live / Instrumental / Remix from plain Studio duplicates
const DISTINCT_VERSION_RULES: Array<{ key: string; label: string; regex: RegExp }> = [
  { key: 'live', label: 'Live 现场版', regex: /(?:^|[\s(\[（【\-_])(?:live|现场|演唱会|音乐会|unplugged)(?:$|[\s)\]）】\-_])/i },
  { key: 'inst', label: '伴奏 / 纯享版', regex: /(?:伴奏|纯音乐|instrumental|inst\.?|karaoke|卡拉OK|off\s*vocal)/i },
  { key: 'remix', label: 'Remix 混音版', regex: /(?:remix|混音|bootleg|mashup|vip\s*mix|club\s*mix)/i },
  { key: 'dj', label: 'DJ 舞曲版', regex: /(?:dj版|dj慢摇|dj加快|车载dj)/i },
  { key: 'acoustic', label: 'Acoustic 原声版', regex: /(?:acoustic|木吉他|不插电|钢琴版|piano\s*version)/i },
  { key: 'demo', label: 'Demo 小样', regex: /(?:^|[\s(\[（【\-_])(?:demo|小样)(?:$|[\s)\]）】\-_])/i },
  { key: 'cantonese', label: '粤语版', regex: /(?:粤语版|粤语)/i }
];

export class LibraryHealthService {
  private getMusicDir(): string {
    return path.resolve(process.cwd(), 'music');
  }

  /**
   * Generates a comprehensive health diagnostic report of the entire music library
   */
  public auditLibraryHealth(): LibraryHealthReport {
    const songs = musicRepository.getAllSongs();
    const totalSongs = songs.length;

    if (totalSongs === 0) {
      return {
        score: 100,
        grade: 'S',
        totalSongs: 0,
        totalArtists: 0,
        totalAlbums: 0,
        losslessCount: 0,
        losslessPercent: 100,
        coverCount: 0,
        coverMissingCount: 0,
        coverPercent: 100,
        lyricsCount: 0,
        lyricsMissingCount: 0,
        lyricsPercent: 100,
        syncedLyricsCount: 0,
        plainLyricsCount: 0,
        sidecarLrcCount: 0,
        dirtyTagCount: 0,
        garbledCount: 0,
        unparsedFilenameCount: 0,
        duplicateGroupCount: 0,
        duplicateSongsTotal: 0,
        scanTime: Date.now(),
        issues: []
      };
    }

    const artistsSet = new Set<string>();
    const albumsSet = new Set<string>();
    let losslessCount = 0;
    let coverCount = 0;
    let lyricsCount = 0;
    let syncedLyricsCount = 0;
    let plainLyricsCount = 0;
    let sidecarLrcCount = 0;
    let dirtyTagCount = 0;
    let garbledCount = 0;
    let unparsedFilenameCount = 0;

    const musicDir = this.getMusicDir();

    for (const song of songs) {
      if (song.artist && song.artist !== '未知艺术家' && song.artist !== 'Unknown') {
        artistsSet.add(song.artist.trim());
      }
      if (song.album && song.album !== '未知专辑' && song.album !== 'Unknown') {
        albumsSet.add(song.album.trim());
      }

      // Check lossless
      if (this.isSongLossless(song)) {
        losslessCount++;
      }

      // Check cover
      if (song.coverUrl && !song.coverUrl.includes('placeholder') && song.coverUrl.trim().length > 0) {
        coverCount++;
      }

      // Check lyrics & LRC timestamp quality
      if (song.lyrics && song.lyrics.trim().length > 15) {
        lyricsCount++;
        if (/\[\d{2}:\d{2}(?:\.\d{1,3})?\]/.test(song.lyrics)) {
          syncedLyricsCount++;
        } else {
          plainLyricsCount++;
        }
      }

      // Check physical .lrc sidecar
      if (song.localFilename) {
        const lrcPath = this.getSidecarLrcPath(song.localFilename, musicDir);
        if (lrcPath && fs.existsSync(lrcPath)) {
          sidecarLrcCount++;
        }
      }

      // Check dirty tag
      if (this.hasAdTag(song) || (song.title && /^(?:track|audio)[\s_-]*\d+/i.test(song.title))) {
        dirtyTagCount++;
      }

      // Check garbled encoding (GBK/Latin-1 mojibake)
      if (
        this.isGarbledText(song.title) ||
        this.isGarbledText(song.artist) ||
        this.isGarbledText(song.album || '')
      ) {
        garbledCount++;
      }

      // Check unparsed filename (e.g. artist is Unknown or title still contains "Artist - Title" while filename is structured)
      const isArtistMissing =
        !song.artist || song.artist === '未知艺术家' || song.artist === 'Unknown' || song.artist === '未知歌手';
      const hasDashInTitle = Boolean(song.title && song.title.includes(' - '));
      const hasDashInFilename = Boolean(song.localFilename && song.localFilename.includes(' - '));
      if ((isArtistMissing && hasDashInFilename) || (isArtistMissing && hasDashInTitle)) {
        unparsedFilenameCount++;
      }
    }

    const duplicates = this.detectDuplicates();
    const duplicateGroupCount = duplicates.length;
    const duplicateSongsTotal = duplicates.reduce((acc, g) => acc + g.versions.length, 0);

    const coverMissingCount = totalSongs - coverCount;
    const lyricsMissingCount = totalSongs - lyricsCount;

    const losslessPercent = Math.round((losslessCount / totalSongs) * 100);
    const coverPercent = Math.round((coverCount / totalSongs) * 100);
    const lyricsPercent = Math.round((lyricsCount / totalSongs) * 100);

    // Weighted score calculation (0 - 100)
    const coverScore = (coverCount / totalSongs) * 30;
    const lyricsScore = (lyricsCount / totalSongs) * 30;
    const losslessScore = Math.min(15, (losslessCount / totalSongs) * 15 * 1.5);
    const penaltyCount = dirtyTagCount + garbledCount + unparsedFilenameCount;
    const tagScore = Math.max(0, (1 - penaltyCount / totalSongs) * 15);
    const duplicateScore = Math.max(0, (1 - duplicateGroupCount / Math.max(1, totalSongs * 0.2)) * 10);

    let score = Math.round(coverScore + lyricsScore + losslessScore + tagScore + duplicateScore);
    score = Math.max(10, Math.min(100, score));

    let grade: 'S' | 'A' | 'B' | 'C' | 'D' = 'D';
    if (score >= 90) grade = 'S';
    else if (score >= 80) grade = 'A';
    else if (score >= 70) grade = 'B';
    else if (score >= 60) grade = 'C';

    const issues: LibraryHealthIssue[] = [];

    if (coverMissingCount > 0) {
      issues.push({
        id: 'issue-missing-covers',
        type: 'missing_cover',
        severity: coverMissingCount > totalSongs * 0.3 ? 'high' : 'medium',
        title: '专辑封面缺失',
        description: `曲库中有 ${coverMissingCount} 首歌曲缺少高清专辑封面，支持从 iTunes / 网易云多源刮削 1000×1000 高清封面。`,
        affectedCount: coverMissingCount,
        actionKey: 'scrape_covers'
      });
    }

    if (lyricsMissingCount > 0) {
      issues.push({
        id: 'issue-missing-lyrics',
        type: 'missing_lyrics',
        severity: lyricsMissingCount > totalSongs * 0.3 ? 'high' : 'medium',
        title: '同步 LRC 歌词缺失',
        description: `曲库中有 ${lyricsMissingCount} 首歌曲缺少动态同步 LRC 歌词，支持从 LRCLIB / 网易云按时长精准匹配并落盘 .lrc 文件。`,
        affectedCount: lyricsMissingCount,
        actionKey: 'scrape_lyrics'
      });
    }

    if (garbledCount > 0) {
      issues.push({
        id: 'issue-garbled-encoding',
        type: 'garbled_encoding',
        severity: 'high',
        title: 'GBK / Latin-1 标签乱码',
        description: `检测到 ${garbledCount} 首早期音频文件的 ID3 标签存在中文编码乱码，可一键转码还原真实中文信息。`,
        affectedCount: garbledCount,
        actionKey: 'fix_encoding'
      });
    }

    if (unparsedFilenameCount > 0) {
      issues.push({
        id: 'issue-unparsed-filename',
        type: 'unparsed_filename',
        severity: 'medium',
        title: '文件名未拆分至标签',
        description: `发现 ${unparsedFilenameCount} 首歌曲歌手为“未知”但文件名包含“歌手 - 歌名”结构，可用【文件名转标签】工具批量提取。`,
        affectedCount: unparsedFilenameCount,
        actionKey: 'filename_to_tag'
      });
    }

    if (dirtyTagCount > 0) {
      issues.push({
        id: 'issue-dirty-tags',
        type: 'dirty_tag',
        severity: 'medium',
        title: '曲目广告水印与杂质标签',
        description: `发现 ${dirtyTagCount} 首歌曲包含【无损音乐网】或网址等广告牛皮癣字符，建议一键智能清洗。`,
        affectedCount: dirtyTagCount,
        actionKey: 'clean_tags'
      });
    }

    if (duplicateGroupCount > 0) {
      issues.push({
        id: 'issue-duplicates',
        type: 'duplicate',
        severity: 'low',
        title: '同名同版本重复曲目',
        description: `检测到 ${duplicateGroupCount} 组共 ${duplicateSongsTotal} 首同版本重复曲目（已自动保护 Live/伴奏/Remix 特殊版本），可安全去重并无损迁移歌单引用。`,
        affectedCount: duplicateGroupCount,
        actionKey: 'deduplicate'
      });
    }

    return {
      score,
      grade,
      totalSongs,
      totalArtists: artistsSet.size,
      totalAlbums: albumsSet.size,
      losslessCount,
      losslessPercent,
      coverCount,
      coverMissingCount,
      coverPercent,
      lyricsCount,
      lyricsMissingCount,
      lyricsPercent,
      syncedLyricsCount,
      plainLyricsCount,
      sidecarLrcCount,
      dirtyTagCount,
      garbledCount,
      unparsedFilenameCount,
      duplicateGroupCount,
      duplicateSongsTotal,
      scanTime: Date.now(),
      issues
    };
  }

  /**
   * Batch 1: Multi-source online metadata search (like music-tag-web)
   * Queries iTunes Search API (1000x1000 HD covers + album + year + genre)
   * + LRCLIB API (synchronized LRC lyrics with duration matching)
   * + NetEase Cloud Music API (Chinese metadata & LRC lyrics)
   */
  public async searchOnlineMetadataCandidates(
    query: string,
    options: {
      artist?: string;
      album?: string;
      duration?: number;
      source?: 'all' | 'itunes' | 'lrclib' | 'netease';
    } = {}
  ): Promise<OnlineMetadataCandidate[]> {
    const cleanTitle = this.cleanStringTags(query || '').trim();
    const cleanArtist =
      options.artist && options.artist !== '未知艺术家' && options.artist !== 'Unknown'
        ? this.cleanStringTags(options.artist).trim()
        : '';
    const searchTerm = [cleanTitle, cleanArtist].filter(Boolean).join(' ').trim() || query.trim();
    if (!searchTerm) return [];

    const sourceFilter = options.source || 'all';
    const targetDuration = options.duration && options.duration > 0 ? options.duration : undefined;

    const [itunesRes, lrclibRes, neteaseRes] = await Promise.allSettled([
      sourceFilter === 'all' || sourceFilter === 'itunes'
        ? this.fetchItunesCandidates(searchTerm, cleanTitle, cleanArtist)
        : Promise.resolve([]),
      sourceFilter === 'all' || sourceFilter === 'lrclib'
        ? this.fetchLrclibCandidates(searchTerm, cleanTitle, cleanArtist, targetDuration)
        : Promise.resolve([]),
      sourceFilter === 'all' || sourceFilter === 'netease'
        ? this.fetchNeteaseCandidates(searchTerm, cleanTitle, cleanArtist)
        : Promise.resolve([])
    ]);

    const itunesList = itunesRes.status === 'fulfilled' ? itunesRes.value : [];
    const lrclibList = lrclibRes.status === 'fulfilled' ? lrclibRes.value : [];
    const neteaseList = neteaseRes.status === 'fulfilled' ? neteaseRes.value : [];

    const mergedCandidates: OnlineMetadataCandidate[] = [];

    // 1. Cross-enrich iTunes HD covers/metadata with best matching LRCLIB / NetEase synced lyrics
    for (const itunesItem of itunesList) {
      let bestLyrics = itunesItem.lyrics || '';
      let hasSynced = false;
      let combinedSource: OnlineMetadataCandidate['source'] = 'iTunes Music';

      // Find matching LRCLIB entry
      const matchingLrc = lrclibList.find(
        (l) =>
          this.computeTextSimilarity(l.title, itunesItem.title) >= 0.65 &&
          (!itunesItem.artist || this.computeTextSimilarity(l.artist, itunesItem.artist) >= 0.5)
      );
      if (matchingLrc && matchingLrc.lyrics) {
        bestLyrics = matchingLrc.lyrics;
        hasSynced = matchingLrc.hasSyncedLyrics;
        combinedSource = 'iTunes + LRCLIB';
      } else {
        // Check NetEase lyrics if LRCLIB didn't have it
        const matchingNetease = neteaseList.find(
          (n) =>
            n.lyrics &&
            this.computeTextSimilarity(n.title, itunesItem.title) >= 0.65 &&
            (!itunesItem.artist || this.computeTextSimilarity(n.artist, itunesItem.artist) >= 0.5)
        );
        if (matchingNetease && matchingNetease.lyrics) {
          bestLyrics = matchingNetease.lyrics;
          hasSynced = matchingNetease.hasSyncedLyrics;
          combinedSource = 'iTunes + LRCLIB';
        }
      }

      const scored = this.scoreCandidate(
        {
          ...itunesItem,
          source: combinedSource,
          lyrics: bestLyrics,
          hasSyncedLyrics: hasSynced
        },
        cleanTitle || query,
        cleanArtist,
        targetDuration
      );
      mergedCandidates.push(scored);
    }

    // 2. Add NetEase candidates (which have Chinese covers, albums, and synced LRC)
    for (const neItem of neteaseList) {
      const scored = this.scoreCandidate(neItem, cleanTitle || query, cleanArtist, targetDuration);
      mergedCandidates.push(scored);
    }

    // 3. Add standalone LRCLIB candidates that weren't already merged or when user explicitly looks for lyrics
    for (const lrcItem of lrclibList) {
      // Find a cover from iTunes or NetEase if possible
      const coverDonor =
        itunesList.find((it) => this.computeTextSimilarity(it.title, lrcItem.title) >= 0.6) ||
        neteaseList.find((ne) => this.computeTextSimilarity(ne.title, lrcItem.title) >= 0.6);

      const scored = this.scoreCandidate(
        {
          ...lrcItem,
          coverUrl: lrcItem.coverUrl || coverDonor?.coverUrl,
          year: lrcItem.year || coverDonor?.year,
          genre: lrcItem.genre || coverDonor?.genre
        },
        cleanTitle || query,
        cleanArtist,
        targetDuration
      );
      mergedCandidates.push(scored);
    }

    // Deduplicate near-identical candidates by source + title + artist + album
    const seenKeys = new Set<string>();
    const uniqueCandidates: OnlineMetadataCandidate[] = [];
    for (const c of mergedCandidates.sort((a, b) => b.confidence - a.confidence)) {
      const key = `${c.source}:::${this.normalizeTrackString(c.title)}:::${this.normalizeTrackString(c.artist)}:::${this.normalizeTrackString(c.album)}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      uniqueCandidates.push(c);
    }

    // 4. Fallback candidate if offline / no external API reachable
    if (uniqueCandidates.length === 0) {
      const fallbackSong: Song = {
        id: 'fallback',
        title: cleanTitle || query,
        artist: cleanArtist || '群星',
        album: options.album || `${cleanTitle || query} · 精选特辑`,
        duration: targetDuration || 210,
        coverUrl: this.pickGenreCover('pop', cleanTitle + cleanArtist),
        genre: 'Pop / Hi-Fi Master',
        year: new Date().getFullYear()
      };
      uniqueCandidates.push({
        id: `fallback-${Date.now()}`,
        source: '听澜智能曲库',
        title: fallbackSong.title,
        artist: fallbackSong.artist,
        album: fallbackSong.album,
        year: fallbackSong.year,
        genre: fallbackSong.genre,
        duration: fallbackSong.duration,
        coverUrl: fallbackSong.coverUrl,
        lyrics: this.generateSynchronizedLrc(fallbackSong),
        hasSyncedLyrics: true,
        confidence: 68,
        matchReason: '本地智能兜底生成（含高清流派封面与标准时间轴 LRC）'
      });
    }

    return uniqueCandidates.slice(0, 12);
  }

  private async fetchItunesCandidates(
    searchTerm: string,
    cleanTitle: string,
    cleanArtist: string
  ): Promise<OnlineMetadataCandidate[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4200);
    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&media=music&entity=song&limit=6&country=CN`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'TinglanMusicTagWeb/2.0' }
      });
      if (!res.ok) return [];
      const data: any = await res.json();
      const results = Array.isArray(data?.results) ? data.results : [];

      return results.map((item: any, idx: number): OnlineMetadataCandidate => {
        const rawArt = String(item.artworkUrl100 || item.artworkUrl60 || '');
        const hdCover = rawArt
          ? rawArt.replace(/100x100bb/g, '1000x1000bb').replace(/60x60bb/g, '1000x1000bb')
          : undefined;
        const releaseYear = item.releaseDate ? new Date(item.releaseDate).getFullYear() : undefined;
        const durationSec = item.trackTimeMillis ? Math.round(item.trackTimeMillis / 1000) : undefined;

        return {
          id: `itunes-${item.trackId || idx}`,
          source: 'iTunes Music',
          title: item.trackName || cleanTitle,
          artist: item.artistName || cleanArtist,
          album: item.collectionName || '',
          year: releaseYear && !isNaN(releaseYear) ? releaseYear : undefined,
          genre: item.primaryGenreName || undefined,
          trackNumber: item.trackNumber || undefined,
          duration: durationSec,
          coverUrl: hdCover,
          lyrics: undefined,
          hasSyncedLyrics: false,
          confidence: 75,
          matchReason: 'Apple Music / iTunes 1000×1000 原盘封面与专辑元数据'
        };
      });
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchLrclibCandidates(
    searchTerm: string,
    cleanTitle: string,
    cleanArtist: string,
    targetDuration?: number
  ): Promise<OnlineMetadataCandidate[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4200);
    try {
      const params = new URLSearchParams({ q: searchTerm });
      const url = `https://lrclib.net/api/search?${params.toString()}`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'TinglanMusicServer/2.0 (https://github.com/tinglan)' }
      });
      if (!res.ok) return [];
      const data: any = await res.json();
      if (!Array.isArray(data)) return [];

      return data.slice(0, 6).map((item: any, idx: number): OnlineMetadataCandidate => {
        const synced = typeof item.syncedLyrics === 'string' && item.syncedLyrics.trim().length > 10;
        const plain = typeof item.plainLyrics === 'string' && item.plainLyrics.trim().length > 10;
        const durationSec = typeof item.duration === 'number' ? Math.round(item.duration) : undefined;

        return {
          id: `lrclib-${item.id || idx}`,
          source: 'LRCLIB 歌词库',
          title: item.trackName || item.name || cleanTitle,
          artist: item.artistName || cleanArtist,
          album: item.albumName || '',
          duration: durationSec,
          lyrics: synced ? item.syncedLyrics : plain ? item.plainLyrics : undefined,
          hasSyncedLyrics: synced,
          confidence: 75,
          matchReason: synced ? 'LRCLIB 逐行精确时间轴同步歌词' : 'LRCLIB 纯文本歌词'
        };
      });
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchNeteaseCandidates(
    searchTerm: string,
    cleanTitle: string,
    cleanArtist: string
  ): Promise<OnlineMetadataCandidate[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4200);
    try {
      const searchUrl = `https://music.163.com/api/search/get/web?s=${encodeURIComponent(searchTerm)}&type=1&offset=0&total=true&limit=4`;
      const res = await fetch(searchUrl, {
        signal: controller.signal,
        headers: {
          Referer: 'https://music.163.com',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });
      if (!res.ok) return [];
      const data: any = await res.json();
      const songs = data?.result?.songs;
      if (!Array.isArray(songs) || songs.length === 0) return [];

      const candidates = await Promise.all(
        songs.slice(0, 3).map(async (item: any): Promise<OnlineMetadataCandidate> => {
          const songId = item.id;
          const artistNames = Array.isArray(item.artists)
            ? item.artists.map((a: any) => a.name).filter(Boolean).join(' / ')
            : cleanArtist;
          const albumName = item.album?.name || '';
          const publishTime = item.album?.publishTime ? new Date(item.album.publishTime).getFullYear() : undefined;
          const durationSec = item.duration ? Math.round(item.duration / 1000) : undefined;

          // Fetch song detail (for HD album cover) and lyric in parallel
          let coverUrl: string | undefined = item.album?.picUrl
            ? `${item.album.picUrl}?param=800y800`
            : undefined;
          let lyrics: string | undefined;
          let hasSyncedLyrics = false;

          try {
            const [lyricRes, detailRes] = await Promise.allSettled([
              fetch(`https://music.163.com/api/song/lyric?os=pc&id=${songId}&lv=-1&kv=-1&tv=-1`, {
                signal: controller.signal,
                headers: { Referer: 'https://music.163.com' }
              }),
              !coverUrl
                ? fetch(`https://music.163.com/api/song/detail/?id=${songId}&ids=%5B${songId}%5D`, {
                    signal: controller.signal,
                    headers: { Referer: 'https://music.163.com' }
                  })
                : Promise.resolve(null)
            ]);

            if (lyricRes.status === 'fulfilled' && lyricRes.value.ok) {
              const lrcJson: any = await lyricRes.value.json();
              const rawLrc = lrcJson?.lrc?.lyric;
              if (typeof rawLrc === 'string' && rawLrc.trim().length > 15) {
                lyrics = rawLrc.trim();
                hasSyncedLyrics = /\[\d{2}:\d{2}/.test(lyrics);
              }
            }

            if (detailRes.status === 'fulfilled' && detailRes.value && detailRes.value.ok) {
              const detailJson: any = await detailRes.value.json();
              const picUrl = detailJson?.songs?.[0]?.album?.picUrl;
              if (picUrl) {
                coverUrl = `${picUrl}?param=800y800`;
              }
            }
          } catch {
            // Ignore secondary fetch errors
          }

          return {
            id: `netease-${songId}`,
            source: '网易云音乐',
            title: item.name || cleanTitle,
            artist: artistNames || cleanArtist,
            album: albumName,
            year: publishTime && !isNaN(publishTime) ? publishTime : undefined,
            duration: durationSec,
            coverUrl,
            lyrics,
            hasSyncedLyrics,
            confidence: 80,
            matchReason: '华语曲库高匹配度词曲与专辑信息'
          };
        })
      );

      return candidates;
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Calculates a 0-100 confidence score based on title similarity, artist similarity,
   * duration proximity (|local - remote| <= 3s), and metadata completeness.
   */
  private scoreCandidate(
    candidate: OnlineMetadataCandidate,
    targetTitle: string,
    targetArtist: string,
    targetDuration?: number
  ): OnlineMetadataCandidate {
    const titleSim = this.computeTextSimilarity(candidate.title, targetTitle);
    const artistSim = targetArtist
      ? this.computeTextSimilarity(candidate.artist, targetArtist)
      : 0.8;

    let score = titleSim * 45 + artistSim * 30;
    const reasons: string[] = [];

    if (titleSim >= 0.9) reasons.push('歌名精准匹配');
    else if (titleSim >= 0.65) reasons.push('歌名高度相似');

    if (targetArtist && artistSim >= 0.85) reasons.push('歌手匹配');

    // Duration proximity bonus (up to 15 pts)
    if (targetDuration && candidate.duration) {
      const diff = Math.abs(targetDuration - candidate.duration);
      if (diff <= 2) {
        score += 15;
        reasons.push(`时长误差 ${diff}s`);
      } else if (diff <= 5) {
        score += 11;
        reasons.push(`时长接近 (±${diff}s)`);
      } else if (diff <= 12) {
        score += 5;
      }
    } else {
      score += 8;
    }

    // Completeness bonus (up to 10 pts)
    if (candidate.coverUrl) {
      score += 5;
      reasons.push('含高清封面');
    }
    if (candidate.hasSyncedLyrics) {
      score += 5;
      reasons.push('含时间轴LRC');
    } else if (candidate.lyrics) {
      score += 2;
    }

    const finalConfidence = Math.max(15, Math.min(99, Math.round(score)));
    return {
      ...candidate,
      confidence: finalConfidence,
      matchReason: reasons.length > 0 ? reasons.join(' · ') : candidate.matchReason
    };
  }

  private computeTextSimilarity(a: string, b: string): number {
    const normA = this.normalizeTrackString(a || '');
    const normB = this.normalizeTrackString(b || '');
    if (!normA || !normB) return 0;
    if (normA === normB) return 1;
    if (normA.includes(normB) || normB.includes(normA)) {
      const ratio = Math.min(normA.length, normB.length) / Math.max(normA.length, normB.length);
      return Math.max(0.78, ratio);
    }
    // Character bigram overlap (Dice coefficient)
    const bigramsA = new Set<string>();
    for (let i = 0; i < normA.length - 1; i++) bigramsA.add(normA.slice(i, i + 2));
    const bigramsB = new Set<string>();
    for (let i = 0; i < normB.length - 1; i++) bigramsB.add(normB.slice(i, i + 2));
    if (bigramsA.size === 0 || bigramsB.size === 0) return 0;
    let intersect = 0;
    for (const bg of bigramsA) {
      if (bigramsB.has(bg)) intersect++;
    }
    return (2 * intersect) / (bigramsA.size + bigramsB.size);
  }

  /**
   * Batch 1 & Batch 3: Manual or candidate-driven metadata update for a single song,
   * with optional physical .lrc sidecar persistence in music/.
   */
  public updateSongMetadata(
    songId: string,
    payload: {
      title?: string;
      artist?: string;
      album?: string;
      year?: number;
      genre?: string;
      coverUrl?: string;
      lyrics?: string;
      writeSidecarLrc?: boolean;
    }
  ): { success: boolean; song?: Song; changes: string[]; sidecarWritten?: boolean } {
    const song = musicRepository.getSongById(songId);
    if (!song) {
      return { success: false, changes: [] };
    }

    const updated: Song = { ...song };
    const changes: string[] = [];

    if (typeof payload.title === 'string' && payload.title.trim() && payload.title.trim() !== song.title) {
      updated.title = payload.title.trim();
      changes.push(`标题: “${song.title}” ➔ “${updated.title}”`);
    }
    if (typeof payload.artist === 'string' && payload.artist.trim() && payload.artist.trim() !== song.artist) {
      updated.artist = payload.artist.trim();
      changes.push(`歌手: “${song.artist}” ➔ “${updated.artist}”`);
    }
    if (typeof payload.album === 'string' && payload.album.trim() !== (song.album || '')) {
      updated.album = payload.album.trim();
      changes.push(`专辑: “${song.album || '未设置'}” ➔ “${updated.album}”`);
    }
    if (typeof payload.year === 'number' && payload.year > 1900 && payload.year !== song.year) {
      updated.year = payload.year;
      changes.push(`年份: ${updated.year}`);
    }
    if (typeof payload.genre === 'string' && payload.genre.trim() !== (song.genre || '')) {
      updated.genre = payload.genre.trim();
      changes.push(`流派: ${updated.genre}`);
    }
    if (typeof payload.coverUrl === 'string' && payload.coverUrl.trim() && payload.coverUrl.trim() !== song.coverUrl) {
      updated.coverUrl = payload.coverUrl.trim();
      changes.push(`更新专辑封面图`);
    }
    if (typeof payload.lyrics === 'string' && payload.lyrics !== (song.lyrics || '')) {
      updated.lyrics = payload.lyrics;
      changes.push(`更新 LRC 歌词 (${payload.lyrics.split('\n').length} 行)`);
    }

    let sidecarWritten = false;
    if (payload.writeSidecarLrc !== false && updated.lyrics && updated.localFilename) {
      sidecarWritten = this.writeSidecarLrcForSong(updated);
      if (sidecarWritten && !changes.some((c) => c.includes('.lrc'))) {
        changes.push(`已同步写入物理同名 .lrc 歌词文件`);
      }
    }

    if (changes.length > 0) {
      musicRepository.addOrUpdateSong(updated, true);
      appEventBus.broadcast('library:updated', {
        action: 'manual_metadata_edit',
        songId: updated.id,
        changes
      });
    }

    return {
      success: true,
      song: updated,
      changes,
      sidecarWritten
    };
  }

  /**
   * Batch 3: Version-Aware Duplicate Detection
   * Distinguishes Live / Instrumental / Remix / DJ / Acoustic versions from Studio versions,
   * and attaches playlist membership & favorite status for safe deduplication.
   */
  public detectDuplicates(): DuplicateSongGroup[] {
    const songs = musicRepository.getAllSongs();
    const playlists = musicRepository.getAllPlaylists();

    // Map songId -> list of playlist names that reference it
    const songPlaylistsMap = new Map<string, string[]>();
    for (const pl of playlists) {
      if (!Array.isArray(pl.songIds)) continue;
      for (const sid of pl.songIds) {
        const list = songPlaylistsMap.get(sid) || [];
        list.push(pl.name);
        songPlaylistsMap.set(sid, list);
      }
    }

    const map = new Map<string, Song[]>();

    for (const song of songs) {
      const versionInfo = this.extractVersionTag(`${song.title || ''} ${song.album || ''} ${song.localFilename || ''}`);
      const baseTitle = this.normalizeBaseTitleForDedup(song.title || '');
      const cleanArtist = this.normalizeTrackString(song.artist || '');
      if (!baseTitle) continue;

      // Group by baseTitle + artist + versionKey so Live / Instrumental versions are NEVER mistaken as redundant duplicates of Studio tracks!
      const groupKey = `${baseTitle}:::${cleanArtist}:::${versionInfo.key}`;
      const existing = map.get(groupKey) || [];
      existing.push(song);
      map.set(groupKey, existing);
    }

    const duplicateGroups: DuplicateSongGroup[] = [];

    for (const [groupKey, groupSongs] of map.entries()) {
      if (groupSongs.length <= 1) continue;

      const [, , versionKey] = groupKey.split(':::');
      const groupVersionLabel =
        DISTINCT_VERSION_RULES.find((r) => r.key === versionKey)?.label || '录音室原版 (Studio)';

      // Rank versions by quality
      const rankedVersions = groupSongs.map((song) => {
        let qualityScore = 100;
        const b = (song.bitrate || '').toLowerCase();
        const f = ((song as any).format || '').toLowerCase();
        const fn = (song.localFilename || '').toLowerCase();

        let isLossless = false;
        if (b.includes('dsd') || fn.endsWith('.dsf') || fn.endsWith('.dff')) {
          qualityScore += 500;
          isLossless = true;
        } else if (b.includes('24bit') || b.includes('96khz') || b.includes('192khz')) {
          qualityScore += 450;
          isLossless = true;
        } else if (b.includes('flac') || f.includes('flac') || fn.endsWith('.flac')) {
          qualityScore += 400;
          isLossless = true;
        } else if (b.includes('ape') || f.includes('ape') || fn.endsWith('.ape')) {
          qualityScore += 380;
          isLossless = true;
        } else if (b.includes('wav') || fn.endsWith('.wav')) {
          qualityScore += 350;
          isLossless = true;
        } else if (b.includes('320')) {
          qualityScore += 200;
        } else if (b.includes('256')) {
          qualityScore += 150;
        } else if (b.includes('128')) {
          qualityScore += 80;
        }

        // Bonus for having lyrics, covers, favorites, and playlist references
        if (song.lyrics && song.lyrics.length > 20) qualityScore += 30;
        if (song.coverUrl && !song.coverUrl.includes('placeholder')) qualityScore += 20;
        if (song.isFavorite) qualityScore += 15;
        const playlistNames = songPlaylistsMap.get(song.id) || [];
        if (playlistNames.length > 0) qualityScore += playlistNames.length * 10;

        let fileSizeMb = 0;
        if (song.fileSize) {
          const m = song.fileSize.match(/([\d.]+)\s*MB/i);
          if (m) fileSizeMb = parseFloat(m[1]);
        }

        return {
          song,
          qualityRank: qualityScore,
          isLossless,
          bitrateScore: qualityScore,
          fileSizeMb,
          versionBadge: groupVersionLabel,
          playlistNames,
          isFavorite: Boolean(song.isFavorite),
          recommendation: 'redundant' as 'keep' | 'redundant',
          reason: ''
        };
      });

      // Sort descending by quality
      rankedVersions.sort((a, b) => b.qualityRank - a.qualityRank);

      // Best version gets marked as 'keep'
      rankedVersions[0].recommendation = 'keep';
      rankedVersions[0].reason = `最佳音质保留 (${rankedVersions[0].song.bitrate || (rankedVersions[0].song as any).format || '高码率'})`;

      for (let i = 1; i < rankedVersions.length; i++) {
        const refNote =
          rankedVersions[i].playlistNames.length > 0 || rankedVersions[i].isFavorite
            ? ' · 清理时自动迁移歌单/收藏至保留曲目'
            : '';
        rankedVersions[i].recommendation = 'redundant';
        rankedVersions[i].reason = `同版本低码率或冗余副本${refNote}`;
      }

      duplicateGroups.push({
        groupKey,
        songTitle: groupSongs[0].title,
        artist: groupSongs[0].artist,
        versionTag: groupVersionLabel,
        versions: rankedVersions
      });
    }

    return duplicateGroups;
  }

  /**
   * Batch 3: Safely deletes selected redundant duplicate songs AND migrates
   * playlist references (`playlist.songIds`), `isFavorite` status, and metadata to the kept version!
   */
  public deduplicateSongs(songIdsToRemove: string[]): {
    removedCount: number;
    migratedPlaylistRefs: number;
    migratedFavorites: number;
    remainingSongsTotal: number;
  } {
    if (!Array.isArray(songIdsToRemove) || songIdsToRemove.length === 0) {
      return {
        removedCount: 0,
        migratedPlaylistRefs: 0,
        migratedFavorites: 0,
        remainingSongsTotal: musicRepository.getAllSongs().length
      };
    }

    const removeSet = new Set(songIdsToRemove);
    const duplicateGroups = this.detectDuplicates();

    // Map removedSongId -> targetKeptSongId in the same duplicate group
    const replacementMap = new Map<string, string>();
    for (const group of duplicateGroups) {
      const keptVersion =
        group.versions.find((v) => !removeSet.has(v.song.id) && v.recommendation === 'keep') ||
        group.versions.find((v) => !removeSet.has(v.song.id));
      if (!keptVersion) continue;
      for (const ver of group.versions) {
        if (removeSet.has(ver.song.id) && ver.song.id !== keptVersion.song.id) {
          replacementMap.set(ver.song.id, keptVersion.song.id);
        }
      }
    }

    let migratedFavorites = 0;
    let migratedPlaylistRefs = 0;

    // 1. Migrate favorite status & missing lyrics/cover from redundant song to kept song
    for (const [removedId, keptId] of replacementMap.entries()) {
      const removedSong = musicRepository.getSongById(removedId);
      const keptSong = musicRepository.getSongById(keptId);
      if (!removedSong || !keptSong) continue;

      let keptChanged = false;
      if (removedSong.isFavorite && !keptSong.isFavorite) {
        keptSong.isFavorite = true;
        migratedFavorites++;
        keptChanged = true;
      }
      if ((!keptSong.lyrics || keptSong.lyrics.length < 20) && removedSong.lyrics && removedSong.lyrics.length >= 20) {
        keptSong.lyrics = removedSong.lyrics;
        keptChanged = true;
      }
      if (
        (!keptSong.coverUrl || keptSong.coverUrl.includes('placeholder')) &&
        removedSong.coverUrl &&
        !removedSong.coverUrl.includes('placeholder')
      ) {
        keptSong.coverUrl = removedSong.coverUrl;
        keptChanged = true;
      }
      if (keptChanged) {
        musicRepository.addOrUpdateSong(keptSong, false);
      }
    }

    // 2. Migrate playlist references so playlists never lose songs upon deduplication
    const playlists = musicRepository.getAllPlaylists();
    let playlistsModified = false;
    for (const pl of playlists) {
      if (!Array.isArray(pl.songIds) || pl.songIds.length === 0) continue;
      let plChanged = false;
      const nextSongIds: string[] = [];

      for (const sid of pl.songIds) {
        if (removeSet.has(sid)) {
          const replacementId = replacementMap.get(sid);
          if (replacementId) {
            if (!nextSongIds.includes(replacementId)) {
              nextSongIds.push(replacementId);
            }
            migratedPlaylistRefs++;
          }
          plChanged = true;
        } else {
          if (!nextSongIds.includes(sid)) {
            nextSongIds.push(sid);
          }
        }
      }

      if (plChanged) {
        pl.songIds = nextSongIds;
        pl.songCount = nextSongIds.length;
        playlistsModified = true;
      }
    }

    if (playlistsModified) {
      musicRepository.setPlaylists(playlists);
    }

    // 3. Delete redundant songs
    let removedCount = 0;
    for (const id of songIdsToRemove) {
      const ok = musicRepository.deleteSong(id);
      if (ok) removedCount++;
    }

    if (removedCount > 0) {
      musicRepository.schedulePersistSongs(50);
      appEventBus.broadcast('library:updated', {
        action: 'deduplicate',
        removedCount,
        migratedPlaylistRefs,
        migratedFavorites,
        remainingTotal: musicRepository.getAllSongs().length
      });
    }

    return {
      removedCount,
      migratedPlaylistRefs,
      migratedFavorites,
      remainingSongsTotal: musicRepository.getAllSongs().length
    };
  }

  /**
   * Cleans watermarks, adverts, and dirty tags from a song title / artist
   */
  public cleanStringTags(input: string): string {
    if (!input) return '';
    let result = input;
    for (const pattern of AD_TAG_PATTERNS) {
      result = result.replace(pattern, '');
    }
    result = result.replace(/^[-_\s\.]+|[-_\s\.]+$/g, '').trim();
    return result;
  }

  /**
   * Batch 1: Scrapes and enriches a single song using real online multi-source candidates first,
   * with intelligent confidence filtering and physical .lrc sidecar persistence.
   */
  public async scrapeAndEnrichSong(
    songId: string,
    options: {
      forceOverwrite?: boolean;
      useAi?: boolean;
      minConfidence?: number;
      writeSidecarLrc?: boolean;
    } = {}
  ): Promise<{ success: boolean; song?: Song; changes: string[]; matchedSource?: string; confidence?: number }> {
    const song = musicRepository.getSongById(songId);
    if (!song) {
      return { success: false, changes: [] };
    }

    const changes: string[] = [];
    const updated: Song = { ...song };

    // 0. If garbled encoding is detected, fix it first so online search uses clean Chinese keywords!
    if (this.isGarbledText(updated.title)) {
      const fixed = this.tryRecoverGarbledString(updated.title);
      if (fixed && fixed !== updated.title) {
        updated.title = fixed;
        changes.push(`修复标题乱码: “${song.title}” ➔ “${fixed}”`);
      }
    }
    if (this.isGarbledText(updated.artist)) {
      const fixed = this.tryRecoverGarbledString(updated.artist);
      if (fixed && fixed !== updated.artist) {
        updated.artist = fixed;
        changes.push(`修复歌手乱码: “${song.artist}” ➔ “${fixed}”`);
      }
    }

    // 1. Clean dirty title & artist
    const cleanedTitle = this.cleanStringTags(updated.title);
    if (cleanedTitle && cleanedTitle !== updated.title) {
      updated.title = cleanedTitle;
      changes.push(`清洗歌曲名水印: “${song.title}” ➔ “${cleanedTitle}”`);
    }

    const cleanedArtist = this.cleanStringTags(updated.artist);
    if (cleanedArtist && cleanedArtist !== updated.artist) {
      updated.artist = cleanedArtist;
      changes.push(`清洗艺术家名: “${song.artist}” ➔ “${cleanedArtist}”`);
    }

    // 2. If artist is "未知艺术家" and filename has "Artist - Title", extract from filename first
    if (
      (!updated.artist || updated.artist === '未知艺术家' || updated.artist === 'Unknown') &&
      updated.localFilename &&
      updated.localFilename.includes(' - ')
    ) {
      const parsed = this.parseFilenameWithPattern(updated.localFilename, '%artist% - %title%');
      if (parsed.artist && parsed.title) {
        updated.artist = parsed.artist;
        updated.title = parsed.title;
        changes.push(`从文件名智能提取歌手与歌名: ${parsed.artist} - ${parsed.title}`);
      }
    }

    const hasValidCover =
      updated.coverUrl && !updated.coverUrl.includes('placeholder') && updated.coverUrl.trim().length > 10;
    const hasSyncedLyrics =
      updated.lyrics && updated.lyrics.trim().length > 20 && /\[\d{2}:\d{2}/.test(updated.lyrics);
    const hasAlbum = updated.album && updated.album !== '未知专辑' && updated.album !== 'Unknown';

    let matchedSource = '';
    let matchedConfidence = 0;

    // 3. Query real online metadata candidates if any field is missing or forceOverwrite is set
    if (!hasValidCover || !hasSyncedLyrics || !hasAlbum || options.forceOverwrite) {
      const candidates = await this.searchOnlineMetadataCandidates(updated.title, {
        artist: updated.artist,
        album: updated.album,
        duration: updated.duration
      });

      const minConf = options.minConfidence ?? 55;
      const best = candidates.find((c) => c.confidence >= minConf) || candidates[0];

      if (best) {
        matchedSource = best.source;
        matchedConfidence = best.confidence;

        if ((!hasValidCover || options.forceOverwrite) && best.coverUrl) {
          updated.coverUrl = best.coverUrl;
          changes.push(`从 [${best.source}] 刮削高清专辑封面 (置信度 ${best.confidence}%)`);
        }

        if ((!hasSyncedLyrics || options.forceOverwrite) && best.lyrics) {
          updated.lyrics = best.lyrics;
          changes.push(
            `从 [${best.source}] 刮削${best.hasSyncedLyrics ? '逐行同步 LRC 歌词' : '歌词'}`
          );
        }

        if ((!hasAlbum || options.forceOverwrite) && best.album) {
          updated.album = best.album;
          changes.push(`补齐专辑名称: 《${best.album}》`);
        }

        if ((!updated.year || updated.year === 0 || options.forceOverwrite) && best.year) {
          updated.year = best.year;
          changes.push(`补齐发行年份: ${best.year}`);
        }

        if (
          (!updated.genre || updated.genre === '未知' || updated.genre === 'Unknown' || options.forceOverwrite) &&
          best.genre
        ) {
          updated.genre = best.genre;
          changes.push(`补齐音乐流派: ${best.genre}`);
        }
      }
    }

    // 4. Fallback if still missing cover or lyrics
    if (!updated.coverUrl || updated.coverUrl.includes('placeholder')) {
      updated.coverUrl = this.pickGenreCover(updated.genre || 'pop', updated.title + updated.artist);
      changes.push(`补齐流派高清封面图`);
    }
    if (!updated.lyrics || updated.lyrics.trim().length < 20) {
      updated.lyrics = this.generateSynchronizedLrc(updated);
      changes.push(`生成标准时间轴 LRC 滚动歌词`);
    }
    if (!updated.genre || updated.genre === '未知' || updated.genre === 'Unknown') {
      updated.genre = 'Pop / Hi-Fi Master';
      changes.push(`归类音乐流派为 Pop / Hi-Fi Master`);
    }
    if (!updated.year || updated.year === 0) {
      updated.year = new Date().getFullYear();
    }

    // 5. Write physical .lrc sidecar file if localFilename exists
    if (options.writeSidecarLrc !== false && updated.localFilename && updated.lyrics) {
      const wrote = this.writeSidecarLrcForSong(updated);
      if (wrote) {
        changes.push(`同步落盘同名 .lrc 歌词文件`);
      }
    }

    if (changes.length > 0) {
      musicRepository.addOrUpdateSong(updated, true);
      appEventBus.broadcast('library:updated', {
        action: 'enriched',
        songId: updated.id,
        changes
      });
    }

    return {
      success: true,
      song: updated,
      changes,
      matchedSource,
      confidence: matchedConfidence
    };
  }

  /**
   * Batch 1 & 2: Batch scrapes and enriches songs across the library with confidence threshold control
   */
  public async batchScrapeAndEnrich(
    options: {
      fixMissingCovers?: boolean;
      fixMissingLyrics?: boolean;
      cleanAdTags?: boolean;
      forceAll?: boolean;
      minConfidence?: number;
      writeSidecarLrc?: boolean;
      songIds?: string[];
    } = {}
  ): Promise<{
    totalProcessed: number;
    enrichedCount: number;
    logs: Array<{ songId: string; title: string; changes: string[]; confidence?: number; source?: string }>;
  }> {
    const allSongs = musicRepository.getAllSongs();
    const targetSet = options.songIds && options.songIds.length > 0 ? new Set(options.songIds) : null;
    const songs = targetSet ? allSongs.filter((s) => targetSet.has(s.id)) : allSongs;

    let enrichedCount = 0;
    const logs: Array<{ songId: string; title: string; changes: string[]; confidence?: number; source?: string }> = [];

    musicRepository.beginBatch();

    for (const song of songs) {
      let needsEnrichment = Boolean(options.forceAll);

      if (options.cleanAdTags && (this.hasAdTag(song) || this.isGarbledText(song.title) || this.isGarbledText(song.artist))) {
        needsEnrichment = true;
      }
      if (options.fixMissingCovers && (!song.coverUrl || song.coverUrl.includes('placeholder'))) {
        needsEnrichment = true;
      }
      if (options.fixMissingLyrics && (!song.lyrics || song.lyrics.trim().length < 20)) {
        needsEnrichment = true;
      }

      if (needsEnrichment) {
        const res = await this.scrapeAndEnrichSong(song.id, {
          forceOverwrite: options.forceAll,
          minConfidence: options.minConfidence ?? 60,
          writeSidecarLrc: options.writeSidecarLrc !== false
        });
        if (res.success && res.changes.length > 0) {
          enrichedCount++;
          logs.push({
            songId: song.id,
            title: res.song?.title || song.title,
            changes: res.changes,
            confidence: res.confidence,
            source: res.matchedSource
          });
        }
      }
    }

    await musicRepository.commitBatch();

    return {
      totalProcessed: songs.length,
      enrichedCount,
      logs
    };
  }

  /**
   * Batch 2: Filename ➔ Tag Extractor (like music-tag-web)
   * Supported patterns:
   * - '%artist% - %title%'
   * - '%track%. %artist% - %title%'
   * - '%artist% - %album% - %title%'
   * - '%title% - %artist%'
   * - '%track% - %title%'
   */
  public filenameToTag(options: {
    pattern: string;
    dryRun?: boolean;
    overwriteExisting?: boolean;
    songIds?: string[];
  }): {
    totalMatched: number;
    appliedCount: number;
    items: FilenameTagDiffItem[];
  } {
    const pattern = (options.pattern || '%artist% - %title%').trim();
    const dryRun = options.dryRun !== false;
    const overwrite = Boolean(options.overwriteExisting);
    const allSongs = musicRepository.getAllSongs();
    const filterSet = options.songIds && options.songIds.length > 0 ? new Set(options.songIds) : null;
    const songs = filterSet ? allSongs.filter((s) => filterSet.has(s.id)) : allSongs;

    const items: FilenameTagDiffItem[] = [];
    let appliedCount = 0;

    if (!dryRun) {
      musicRepository.beginBatch();
    }

    for (const song of songs) {
      const sourceName = song.localFilename || `${song.artist} - ${song.title}`;
      const parsed = this.parseFilenameWithPattern(sourceName, pattern);
      if (!parsed.title && !parsed.artist && !parsed.album) continue;

      const isArtistPlaceholder =
        !song.artist || song.artist === '未知艺术家' || song.artist === 'Unknown' || song.artist === '未知歌手';
      const isAlbumPlaceholder =
        !song.album || song.album === '未知专辑' || song.album === 'Unknown' || song.album === '本地导入曲库';

      const newTitle = parsed.title && (overwrite || song.title.includes(' - ')) ? parsed.title : song.title;
      const newArtist = parsed.artist && (overwrite || isArtistPlaceholder) ? parsed.artist : song.artist;
      const newAlbum = parsed.album && (overwrite || isAlbumPlaceholder) ? parsed.album : song.album || '';

      const changed =
        newTitle !== song.title || newArtist !== song.artist || (Boolean(parsed.album) && newAlbum !== (song.album || ''));

      if (changed) {
        items.push({
          songId: song.id,
          localFilename: sourceName,
          oldTitle: song.title,
          newTitle,
          oldArtist: song.artist,
          newArtist,
          oldAlbum: song.album || '',
          newAlbum,
          changed: true
        });

        if (!dryRun) {
          musicRepository.addOrUpdateSong(
            {
              ...song,
              title: newTitle,
              artist: newArtist,
              album: newAlbum || song.album
            },
            false
          );
          appliedCount++;
        }
      }
    }

    if (!dryRun) {
      musicRepository.commitBatch().catch(() => {});
      appEventBus.broadcast('library:updated', { action: 'filename_to_tag', appliedCount });
    }

    return {
      totalMatched: items.length,
      appliedCount,
      items
    };
  }

  /**
   * Batch 2: Tag ➔ Filename Organizer (renames physical audio & .lrc files in music/)
   */
  public tagToFilename(options: {
    pattern: string;
    dryRun?: boolean;
    songIds?: string[];
  }): {
    totalMatched: number;
    renamedCount: number;
    items: TagFilenameDiffItem[];
  } {
    const pattern = (options.pattern || '%artist% - %title%').trim();
    const dryRun = options.dryRun !== false;
    const allSongs = musicRepository.getAllSongs();
    const filterSet = options.songIds && options.songIds.length > 0 ? new Set(options.songIds) : null;
    const songs = filterSet ? allSongs.filter((s) => filterSet.has(s.id)) : allSongs;
    const musicDir = this.getMusicDir();

    const items: TagFilenameDiffItem[] = [];
    let renamedCount = 0;

    if (!dryRun) {
      musicRepository.beginBatch();
    }

    for (let idx = 0; idx < songs.length; idx++) {
      const song = songs[idx];
      const currentFilename = song.localFilename || '';
      if (!currentFilename) continue;

      const ext = path.extname(currentFilename) || '.mp3';
      const dirPart = path.dirname(currentFilename);
      const trackNum = String(idx + 1).padStart(2, '0');

      let formattedBase = pattern
        .replace(/%artist%/gi, this.sanitizeFilenameSegment(song.artist || '未知艺术家'))
        .replace(/%title%/gi, this.sanitizeFilenameSegment(song.title || '未知曲目'))
        .replace(/%album%/gi, this.sanitizeFilenameSegment(song.album || '未知专辑'))
        .replace(/%track%/gi, trackNum)
        .replace(/%year%/gi, String(song.year || ''))
        .trim();

      formattedBase = formattedBase.replace(/^[-_\s]+|[-_\s]+$/g, '');
      if (!formattedBase) continue;

      const newRelFilename =
        dirPart && dirPart !== '.' ? path.join(dirPart, `${formattedBase}${ext}`) : `${formattedBase}${ext}`;
      const oldFullPath = path.resolve(musicDir, currentFilename);
      const newFullPath = path.resolve(musicDir, newRelFilename);
      const physicalExists = fs.existsSync(oldFullPath);

      if (newRelFilename !== currentFilename) {
        items.push({
          songId: song.id,
          title: song.title,
          artist: song.artist,
          oldFilename: currentFilename,
          newFilename: newRelFilename,
          physicalExists,
          changed: true
        });

        if (!dryRun) {
          try {
            if (physicalExists && oldFullPath !== newFullPath && !fs.existsSync(newFullPath)) {
              fs.renameSync(oldFullPath, newFullPath);
              // Also rename accompanying .lrc sidecar if present
              const oldLrc = this.getSidecarLrcPath(currentFilename, musicDir);
              const newLrc = this.getSidecarLrcPath(newRelFilename, musicDir);
              if (oldLrc && newLrc && fs.existsSync(oldLrc) && !fs.existsSync(newLrc)) {
                fs.renameSync(oldLrc, newLrc);
              }
            }
            const updatedSong: Song = {
              ...song,
              localFilename: newRelFilename,
              audioUrl: `/music/${encodeURIComponent(newRelFilename)}`
            };
            musicRepository.addOrUpdateSong(updatedSong, false);
            renamedCount++;
          } catch (err) {
            console.warn('[LibraryHealthService] Failed to rename file:', err);
          }
        }
      }
    }

    if (!dryRun) {
      musicRepository.commitBatch().catch(() => {});
      appEventBus.broadcast('library:updated', { action: 'tag_to_filename', renamedCount });
    }

    return {
      totalMatched: items.length,
      renamedCount,
      items
    };
  }

  /**
   * Batch 2: GBK / Latin-1 Mojibake Detector & Fixer
   */
  public fixGarbledEncoding(options: { dryRun?: boolean; songIds?: string[] } = {}): {
    totalDetected: number;
    fixedCount: number;
    items: EncodingFixItem[];
  } {
    const dryRun = options.dryRun !== false;
    const allSongs = musicRepository.getAllSongs();
    const filterSet = options.songIds && options.songIds.length > 0 ? new Set(options.songIds) : null;
    const songs = filterSet ? allSongs.filter((s) => filterSet.has(s.id)) : allSongs;

    const items: EncodingFixItem[] = [];
    let fixedCount = 0;

    if (!dryRun) {
      musicRepository.beginBatch();
    }

    for (const song of songs) {
      let songChanged = false;
      const updated: Song = { ...song };

      const checkAndFix = (field: 'title' | 'artist' | 'album', val: string) => {
        if (!val || !this.isGarbledText(val)) return;
        const recovered = this.tryRecoverGarbledString(val);
        if (recovered && recovered !== val && !this.isGarbledText(recovered)) {
          items.push({
            songId: song.id,
            localFilename: song.localFilename || song.title,
            field,
            oldValue: val,
            newValue: recovered
          });
          (updated as any)[field] = recovered;
          songChanged = true;
        }
      };

      checkAndFix('title', song.title);
      checkAndFix('artist', song.artist);
      checkAndFix('album', song.album || '');

      // If still garbled and localFilename is clean UTF-8, recover from filename
      if ((this.isGarbledText(updated.title) || this.isGarbledText(updated.artist)) && song.localFilename) {
        const parsed = this.parseFilenameWithPattern(song.localFilename, '%artist% - %title%');
        if (parsed.title && !this.isGarbledText(parsed.title)) {
          items.push({
            songId: song.id,
            localFilename: song.localFilename,
            field: 'filename_fallback',
            oldValue: `${updated.artist} - ${updated.title}`,
            newValue: `${parsed.artist || updated.artist} - ${parsed.title}`
          });
          updated.title = parsed.title;
          if (parsed.artist) updated.artist = parsed.artist;
          songChanged = true;
        }
      }

      if (songChanged && !dryRun) {
        musicRepository.addOrUpdateSong(updated, false);
        fixedCount++;
      }
    }

    if (!dryRun) {
      musicRepository.commitBatch().catch(() => {});
      appEventBus.broadcast('library:updated', { action: 'fix_encoding', fixedCount });
    }

    return {
      totalDetected: items.length,
      fixedCount,
      items
    };
  }

  /**
   * Batch 3: Writes synchronized .lrc sidecar files into music/ for all songs that have lyrics
   */
  public batchWriteSidecarLrc(songIds?: string[]): { writtenCount: number; totalEligible: number } {
    const allSongs = musicRepository.getAllSongs();
    const filterSet = songIds && songIds.length > 0 ? new Set(songIds) : null;
    const songs = filterSet ? allSongs.filter((s) => filterSet.has(s.id)) : allSongs;

    let writtenCount = 0;
    let totalEligible = 0;

    for (const song of songs) {
      if (song.localFilename && song.lyrics && song.lyrics.trim().length > 15) {
        totalEligible++;
        if (this.writeSidecarLrcForSong(song)) {
          writtenCount++;
        }
      }
    }

    return { writtenCount, totalEligible };
  }

  public writeSidecarLrcForSong(song: Song): boolean {
    if (!song.localFilename || !song.lyrics || song.lyrics.trim().length < 10) return false;
    try {
      const musicDir = this.getMusicDir();
      if (!fs.existsSync(musicDir)) return false;
      const lrcPath = this.getSidecarLrcPath(song.localFilename, musicDir);
      if (!lrcPath) return false;

      const lrcDir = path.dirname(lrcPath);
      if (!fs.existsSync(lrcDir)) {
        fs.mkdirSync(lrcDir, { recursive: true });
      }
      fs.writeFileSync(lrcPath, song.lyrics, 'utf-8');
      return true;
    } catch (err) {
      console.warn('[LibraryHealthService] Could not write sidecar .lrc:', err);
      return false;
    }
  }

  private getSidecarLrcPath(localFilename: string, musicDir: string): string | null {
    if (!localFilename) return null;
    const parsed = path.parse(localFilename);
    const lrcRel = path.join(parsed.dir, `${parsed.name}.lrc`);
    const resolved = path.resolve(musicDir, lrcRel);
    if (!resolved.startsWith(musicDir)) return null;
    return resolved;
  }

  public isSongLossless(song: Song): boolean {
    const bitrateLower = (song.bitrate || '').toLowerCase();
    const formatLower = ((song as any).format || '').toLowerCase();
    const filenameLower = (song.localFilename || '').toLowerCase();
    return (
      bitrateLower.includes('flac') ||
      bitrateLower.includes('dsd') ||
      bitrateLower.includes('ape') ||
      bitrateLower.includes('wav') ||
      bitrateLower.includes('24bit') ||
      bitrateLower.includes('96khz') ||
      bitrateLower.includes('192khz') ||
      formatLower.includes('flac') ||
      formatLower.includes('ape') ||
      formatLower.includes('wav') ||
      formatLower.includes('dsd') ||
      filenameLower.endsWith('.flac') ||
      filenameLower.endsWith('.ape') ||
      filenameLower.endsWith('.wav') ||
      filenameLower.endsWith('.dsf') ||
      filenameLower.endsWith('.dff')
    );
  }

  public isGarbledText(str: string): boolean {
    if (!str) return false;
    if (str.includes('')) return true;
    // Detect sequences of 2+ Latin-1 high bytes (U+00C0 - U+00FF) which are classic GBK-as-Latin1 mojibake
    return /[\u00C0-\u00FF]{2,}/.test(str);
  }

  public tryRecoverGarbledString(str: string): string {
    if (!str) return str;
    try {
      const bytes = Buffer.from(str, 'latin1');
      // Try UTF-8 first
      const utf8Decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (utf8Decoded && !utf8Decoded.includes('')) {
        return utf8Decoded.trim();
      }
    } catch {
      // Fall through to GB18030 / GBK decoder
    }

    try {
      const bytes = Buffer.from(str, 'latin1');
      const gbkDecoded = new TextDecoder('gb18030', { fatal: false }).decode(bytes);
      if (gbkDecoded && !gbkDecoded.includes('') && /[\u4e00-\u9fa5]/.test(gbkDecoded)) {
        return gbkDecoded.trim();
      }
    } catch {
      // Ignore if gb18030 is unavailable
    }

    return str;
  }

  private parseFilenameWithPattern(
    filename: string,
    pattern: string
  ): { title?: string; artist?: string; album?: string; track?: string } {
    const baseName = this.cleanStringTags(
      path.basename(filename).replace(/\.(wav|mp3|flac|m4a|ogg|aac|opus|ape|dsf|dff)$/i, '')
    );

    if (pattern === '%track%. %artist% - %title%' || pattern === '%track% - %artist% - %title%') {
      const m = baseName.match(/^\s*(\d+)[\.\-\s]+(.+?)\s*-\s*(.+)$/);
      if (m) {
        return { track: m[1].trim(), artist: m[2].trim(), title: m[3].trim() };
      }
    }

    if (pattern === '%artist% - %album% - %title%') {
      const parts = baseName.split(/\s*-\s*/);
      if (parts.length >= 3) {
        return {
          artist: parts[0].trim(),
          album: parts[1].trim(),
          title: parts.slice(2).join(' - ').trim()
        };
      }
    }

    if (pattern === '%title% - %artist%') {
      const parts = baseName.split(/\s*-\s*/);
      if (parts.length >= 2) {
        return {
          title: parts[0].trim(),
          artist: parts.slice(1).join(' / ').trim()
        };
      }
    }

    if (pattern === '%track% - %title%') {
      const m = baseName.match(/^\s*(\d+)[\.\-\s]+(.+)$/);
      if (m) {
        return { track: m[1].trim(), title: m[2].trim() };
      }
    }

    // Default: '%artist% - %title%' (also strips leading track numbers like "01. ")
    const strippedTrack = baseName.replace(/^\s*\d{1,3}[\.\s_\-]+/, '');
    const parts = strippedTrack.split(/\s*-\s*/);
    if (parts.length >= 2) {
      return {
        artist: parts[0].trim(),
        title: parts.slice(1).join(' - ').trim()
      };
    }

    return { title: strippedTrack.trim() };
  }

  private sanitizeFilenameSegment(input: string): string {
    return (input || '')
      .replace(/[\/\\:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractVersionTag(text: string): { key: string; label: string } {
    for (const rule of DISTINCT_VERSION_RULES) {
      if (rule.regex.test(text)) {
        return { key: rule.key, label: rule.label };
      }
    }
    return { key: 'studio', label: '录音室原版' };
  }

  private normalizeBaseTitleForDedup(title: string): string {
    let cleaned = this.cleanStringTags(title || '');
    for (const rule of DISTINCT_VERSION_RULES) {
      cleaned = cleaned.replace(rule.regex, '');
    }
    return this.normalizeTrackString(cleaned);
  }

  private pickGenreCover(genre: string, seed: string): string {
    const genreLower = (genre || '').toLowerCase();
    let coverArchive = GENRE_COVER_ARCHIVE.default;

    if (genreLower.includes('pop') || genreLower.includes('流行')) coverArchive = GENRE_COVER_ARCHIVE.pop;
    else if (genreLower.includes('rock') || genreLower.includes('摇滚')) coverArchive = GENRE_COVER_ARCHIVE.rock;
    else if (
      genreLower.includes('classical') ||
      genreLower.includes('古典') ||
      genreLower.includes('古筝') ||
      genreLower.includes('国乐')
    ) {
      coverArchive = GENRE_COVER_ARCHIVE.classical;
    } else if (
      genreLower.includes('lofi') ||
      genreLower.includes('relax') ||
      genreLower.includes('轻音乐') ||
      genreLower.includes('助眠')
    ) {
      coverArchive = GENRE_COVER_ARCHIVE.lofi;
    } else if (genreLower.includes('jazz') || genreLower.includes('爵士')) {
      coverArchive = GENRE_COVER_ARCHIVE.jazz;
    }

    const pickIndex = Math.abs(this.hashString(seed)) % coverArchive.length;
    return coverArchive[pickIndex];
  }

  private hasAdTag(song: Song): boolean {
    for (const pattern of AD_TAG_PATTERNS) {
      if (pattern.test(song.title) || pattern.test(song.artist) || pattern.test(song.album || '')) {
        return true;
      }
    }
    return false;
  }

  private normalizeTrackString(str: string): string {
    return str
      .replace(AD_TAG_PATTERNS[0], '')
      .replace(/[\(\)（）\[\]【】\-_·\s\.,，。！!]/g, '')
      .toLowerCase()
      .trim();
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  /**
   * Generates a well-timed LRC lyric format for songs when offline or missing online LRC
   */
  private generateSynchronizedLrc(song: Song): string {
    const title = song.title || '精选单曲';
    const artist = song.artist || '听澜精选';
    const duration = song.duration || 210;

    const time0 = '00:00.00';
    const time1 = '00:05.00';
    const time2 = '00:15.00';
    const mid1 = this.formatLrcTime(Math.floor(duration * 0.25));
    const mid2 = this.formatLrcTime(Math.floor(duration * 0.5));
    const mid3 = this.formatLrcTime(Math.floor(duration * 0.75));
    const end = this.formatLrcTime(Math.max(1, duration - 10));

    return (
      `[${time0}]${title} - ${artist}\n` +
      `[${time1}]词曲创作 / 高保真母带发烧呈现\n` +
      `[${time2}]正在通过小爱音箱高保真串流播放\n` +
      `[${mid1}]前奏悠扬，沉浸在纯净的旋律世界中\n` +
      `[${mid2}]主旋律升华，音质饱满清澈，伴您享受美好时光\n` +
      `[${mid3}]每一个节拍都饱含情感与温度\n` +
      `[${end}]（尾奏渐隐·听澜音乐私享体验）`
    );
  }

  private formatLrcTime(sec: number): string {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.00`;
  }
}

export const libraryHealthService = new LibraryHealthService();
