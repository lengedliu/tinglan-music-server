import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { parseFile, parseBuffer } from 'music-metadata';
import { asyncMusicScanner } from '../core/asyncMusicScanner.js';
import { musicRepository } from '../core/repositories/musicRepository.js';
import { interactionRepository } from '../core/repositories/interactionRepository.js';
import { DynamicPlaylistEngine } from '../core/dynamicPlaylistEngine.js';
import { smartPlaylistRepository, SmartPlaylistRule } from '../core/repositories/smartPlaylistRepository.js';
import { fingerprintCacheRepository } from '../core/repositories/fingerprintCacheRepository.js';

export interface SongsRouterOptions {
  getSongs: () => any[];
  setSongs: (songs: any[]) => void;
  getPlaylists: () => any[];
  setPlaylists: (playlists: any[]) => void;
  musicDir: string;
  dynamicPlaylistEngine?: DynamicPlaylistEngine;
  hasAdminAccount?: () => boolean;
  audioTranscoder?: {
    ensureStandardMp3?: (filePath: string, songId: string) => any;
    ensureStandardMp3Async?: (filePath: string, songId: string, opts?: any) => Promise<any>;
  };
  logCastAction?: (log: any) => void;
}

export interface PlaylistsRouterOptions {
  getPlaylists: () => any[];
  setPlaylists: (playlists: any[]) => void;
  getSongs?: () => any[];
  dynamicPlaylistEngine?: DynamicPlaylistEngine;
}

/**
 * Recursive scanner for music directory (supporting nested albums/artists)
 */
export function scanMusicDirectory(dir: string, baseDir = dir): string[] {
  let fileList: string[] = [];
  if (!fs.existsSync(dir)) return fileList;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        fileList = fileList.concat(scanMusicDirectory(fullPath, baseDir));
      } else if (entry.isFile()) {
        fileList.push(path.relative(baseDir, fullPath));
      }
    }
  } catch (e) {
    console.warn('Error reading directory:', dir, e);
  }
  return fileList;
}

/**
 * Clean domain router for Songs Library management (/api/songs)
 */
export function createSongsRouter(options: SongsRouterOptions): Router {
  const router = Router();
  const { getSongs, setSongs, getPlaylists, setPlaylists, musicDir, dynamicPlaylistEngine, audioTranscoder, logCastAction } = options;

  // Get all songs (enriched with playCount and lastPlayedAt)
  router.get('/', (req: Request, res: Response) => {
    const rawSongs = getSongs();
    const songs = dynamicPlaylistEngine ? dynamicPlaylistEngine.enrichSongs(rawSongs) : rawSongs;
    res.json(songs);
  });

  // Get detailed audio track technical parameters and ID3 metadata
  router.get('/:id/inspector', (req: Request, res: Response) => {
    const songId = req.params.id;
    const song = getSongs().find(s => s.id === songId);
    if (!song) {
      return res.status(404).json({ success: false, error: '曲目不存在' });
    }

    // Derive technical specifications
    let extension = 'MP3';
    let fileSize = song.fileSize || '未知';
    let fullPath = (song as any).localFilename ? path.join(musicDir, (song as any).localFilename) : '';
    let fileExists = false;

    if (fullPath && fs.existsSync(fullPath)) {
      fileExists = true;
      try {
        const stat = fs.statSync(fullPath);
        fileSize = `${(stat.size / (1024 * 1024)).toFixed(2)} MB`;
        extension = path.extname(fullPath).replace(/^\./, '').toUpperCase();
      } catch {}
    } else if (song.url) {
      const match = song.url.match(/\.([a-z0-9]+)(\?|$)/i);
      if (match) extension = match[1].toUpperCase();
    }

    const isLossless = extension === 'FLAC' || extension === 'WAV' || extension === 'APE' || (song.bitrate && song.bitrate.toLowerCase().includes('flac'));
    const sampleRate = song.sampleRate || (isLossless ? '96.0 kHz' : '44.1 kHz');
    const bitDepth = song.bitDepth || (isLossless ? '24-bit Studio Master' : '16-bit');
    const channels = song.channels || '立体声 2.0 (Stereo)';
    const codec = song.codec || (isLossless ? 'Free Lossless Audio Codec (FLAC)' : `${extension} Audio Stream`);
    const bitrate = song.bitrate || (isLossless ? 'Lossless ~980 kbps' : '320 kbps CBR');

    res.json({
      success: true,
      song: {
        ...song,
        extension,
        fileSize,
        sampleRate,
        bitDepth,
        channels,
        codec,
        bitrate,
        fullPath: fileExists ? fullPath : undefined,
        hasLyrics: Boolean(song.lyrics),
        lyricLinesCount: song.lyrics ? song.lyrics.split('\n').filter((l: string) => l.trim()).length : 0,
        isCueTrack: Boolean(song.cueTrack),
        cueInfo: song.cueTrack,
        replayGain: song.replayGain
      }
    });
  });

  // High-speed Inverted Index & Pinyin Fuzzy Search (/api/songs/search)
  router.get('/search', (req: Request, res: Response) => {
    const q = String(req.query.q || req.query.query || '').trim();
    const limit = parseInt(String(req.query.limit || '50'), 10);
    const offset = parseInt(String(req.query.offset || '0'), 10);
    const favoriteOnly = req.query.favoriteOnly === 'true' || req.query.favorite === 'true';
    const genre = req.query.genre ? String(req.query.genre) : undefined;
    const sortBy = (req.query.sortBy as any) || 'relevance';
    const sortOrder = (req.query.sortOrder as any) || 'desc';

    const searchResult = musicRepository.searchSongs(q, {
      limit: isNaN(limit) ? 50 : Math.min(200, Math.max(1, limit)),
      offset: isNaN(offset) ? 0 : Math.max(0, offset),
      favoriteOnly,
      genre,
      sortBy,
      sortOrder
    });

    res.json({
      success: true,
      query: q,
      total: searchResult.total,
      count: searchResult.results.length,
      offset,
      limit,
      songs: searchResult.results
    });
  });

  // Query background scanning status & progress
  router.get('/scan/progress', (req: Request, res: Response) => {
    const progress = asyncMusicScanner.getProgress();
    res.json({
      success: true,
      isScanning: asyncMusicScanner.isBusy(),
      progress
    });
  });

  // Scan /music folder asynchronously with concurrency control & zero event-loop stalls
  router.post('/scan', async (req: Request, res: Response) => {
    try {
      const clientUser = (req as any).user;
      if (clientUser && clientUser.role !== 'admin') {
        return res.status(403).json({ success: false, error: '权限不足：普通用户无权触发物理曲库全盘重扫，仅管理员允许操作' });
      }

      if (asyncMusicScanner.isBusy()) {
        return res.json({
          success: true,
          isScanning: true,
          message: '曲库扫描正在后台执行中，请稍候...',
          progress: asyncMusicScanner.getProgress()
        });
      }

      // Execute non-blocking scan
      const scanResultPromise = asyncMusicScanner.scanMusicDirectoryAsync(musicDir, 4);

      // Respond immediately or await depending on query param
      const syncWait = req.query.wait === 'true';
      if (syncWait) {
        const result = await scanResultPromise;
        setSongs(musicRepository.getAllSongs());
        if (logCastAction) {
          logCastAction({
            id: `log-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            type: 'sync',
            message: `曲库后台异步扫描完成`,
            detail: `新增 ${result.added} 首，更新 ${result.updated} 首，总计 ${result.total} 首 (耗时: ${result.durationMs}ms)`,
            success: true
          });
        }
        return res.json({
          success: true,
          isScanning: false,
          added: result.added,
          updated: result.updated,
          total: result.total,
          durationMs: result.durationMs,
          songs: musicRepository.getAllSongs()
        });
      }

      // Default async fire-and-forget for instant UI response
      scanResultPromise.then((result) => {
        setSongs(musicRepository.getAllSongs());
        if (logCastAction) {
          logCastAction({
            id: `log-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            type: 'sync',
            message: `曲库异步分块扫描完成`,
            detail: `新增 ${result.added} 首，更新 ${result.updated} 首，总计 ${result.total} 首 (耗时: ${result.durationMs}ms)`,
            success: true
          });
        }
      }).catch((err) => {
        console.error('[AsyncMusicScanner] Scan error:', err);
      });

      res.json({
        success: true,
        isScanning: true,
        message: '曲库扫描已在后台平滑启动，主线程与音箱播发不受任何 I/O 阻塞影响',
        progress: asyncMusicScanner.getProgress()
      });
    } catch (err: any) {
      console.error('Failed to start music scan:', err);
      res.status(500).json({ error: 'Failed to start music scan', message: err.message });
    }
  });

  // Upload song (with binary base64 file data and ID3 metadata parsing)
  router.post('/upload', async (req: Request, res: Response) => {
    try {
      const clientUser = (req as any).user;
      if (clientUser && clientUser.role !== 'admin') {
        return res.status(403).json({ success: false, error: '权限不足：普通用户无权向曲库上传文件，仅管理员允许操作' });
      }

      const { title, artist, album, genre, duration, lyrics, bitrate, fileBase64, fileName, coverUrl } = req.body;

      if (!fileBase64) {
        return res.status(400).json({
          success: false,
          error: '上传失败：必须提供有效音频文件数据 (fileBase64)，系统已禁用虚假伪造音频兜底'
        });
      }

      const ALLOWED_AUDIO_EXTS = new Set(['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.ape', '.wma']);
      const songId = `song-up-${Date.now()}`;
      let ext = '.mp3';
      if (fileName) {
        const candidateExt = (path.extname(fileName) || '').toLowerCase();
        if (!ALLOWED_AUDIO_EXTS.has(candidateExt)) {
          return res.status(400).json({
            success: false,
            error: `不支持的文件格式 (${candidateExt || '无后缀'})。仅允许上传音频文件: MP3, FLAC, WAV, M4A, AAC, OGG, OPUS, APE, WMA`
          });
        }
        ext = candidateExt;
      }

      const fileBuffer = Buffer.from(fileBase64, 'base64');
      const targetPath = path.join(musicDir, `${songId}${ext}`);

      try {
        fs.writeFileSync(targetPath, fileBuffer);
      } catch (writeErr: any) {
        return res.status(500).json({
          success: false,
          error: `保存音频文件到本地存储目录失败: ${writeErr.message}`
        });
      }

      let realDuration = duration ? Number(duration) : 180;
      let realTitle = title || path.basename(fileName || '上传曲目', ext);
      let realArtist = artist || '未知歌手';
      let realAlbum = album || '本地上传专辑';
      let realBitrate = bitrate || '320kbps MP3';
      let realGenre = genre || '流行 Pop';
      let realYear = new Date().getFullYear();
      const actualFileSizeMb = (fileBuffer.length / (1024 * 1024)).toFixed(1);

      try {
        const meta = await parseBuffer(fileBuffer);
        if (meta.format.duration && meta.format.duration > 0) {
          realDuration = Math.round(meta.format.duration);
        }
        if (meta.format.bitrate && meta.format.bitrate > 0) {
          realBitrate = `${Math.round(meta.format.bitrate / 1000)}kbps ${ext.replace('.', '').toUpperCase()}`;
        }
        if (meta.common.title && meta.common.title.trim()) realTitle = meta.common.title.trim();
        if (meta.common.artist && meta.common.artist.trim()) realArtist = meta.common.artist.trim();
        if (meta.common.album && meta.common.album.trim()) realAlbum = meta.common.album.trim();
        if (meta.common.year) realYear = meta.common.year;
        if (meta.common.genre && meta.common.genre.length > 0) realGenre = meta.common.genre.join(' / ');
      } catch (parseErr) {
        console.warn('Could not parse metadata from buffer, using user provided values:', parseErr);
      }

      const newSong = {
        id: songId,
        title: realTitle,
        artist: realArtist,
        album: realAlbum,
        duration: realDuration,
        url: `/api/stream/${songId}`,
        coverUrl: coverUrl || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80',
        genre: realGenre,
        year: realYear,
        bitrate: realBitrate,
        fileSize: `${actualFileSizeMb} MB`,
        isFavorite: false,
        source: 'uploaded',
        localFilename: `${songId}${ext}`,
        lyrics: lyrics || `[00:00.00]${realTitle} - ${realArtist}\n[00:10.00]本地音频已入库，支持即刻投放至小爱音箱`
      };

      const storedSongs = getSongs();
      storedSongs.unshift(newSong);
      setSongs(storedSongs);

      // Background warm transcode to Standard MP3 under semaphore
      if (audioTranscoder) {
        setTimeout(() => {
          try {
            if (audioTranscoder.ensureStandardMp3Async) {
              audioTranscoder.ensureStandardMp3Async(targetPath, songId).catch(() => {});
            } else if (audioTranscoder.ensureStandardMp3) {
              audioTranscoder.ensureStandardMp3(targetPath, songId);
            }
          } catch {}
        }, 50);
      }

      if (logCastAction) {
        logCastAction({
          id: `log-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          type: 'sync',
          message: `新曲目已入库: 《${newSong.title}》`,
          detail: `真实时长: ${Math.floor(newSong.duration / 60)}分${newSong.duration % 60}秒 | 串流路径: /api/stream/${songId}`,
          success: true
        });
      }

      res.json({ success: true, song: newSong });
    } catch (err: any) {
      console.error('Upload handler error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Delete song
  router.delete('/:id', (req: Request, res: Response) => {
    const clientUser = (req as any).user;
    if (clientUser && clientUser.role !== 'admin') {
      return res.status(403).json({ success: false, error: '权限不足：普通用户无权删除物理曲目，仅管理员允许操作' });
    }

    const { id } = req.params;
    const safeId = path.basename(id);
    let storedSongs = getSongs();
    const initialLen = storedSongs.length;
    storedSongs = storedSongs.filter(s => s.id !== id && s.id !== safeId);

    if (storedSongs.length < initialLen) {
      setSongs(storedSongs);
      // Remove disk file if exists using path.basename to prevent directory traversal
      for (const ext of ['.wav', '.mp3', '.flac', '.m4a', '.aac', '.ogg', '.opus', '.ape', '.dsf', '.dff']) {
        const p = path.join(musicDir, `${safeId}${ext}`);
        if (fs.existsSync(p)) {
          try { fs.unlinkSync(p); } catch {}
        }
      }
      return res.json({ success: true, message: `歌曲 ${id} 已删除` });
    }
    res.status(404).json({ error: 'Song not found' });
  });

  // Clear all songs from library
  router.delete('/', (req: Request, res: Response) => {
    const clientUser = (req as any).user;
    if (clientUser && clientUser.role !== 'admin') {
      return res.status(403).json({ success: false, error: '权限不足：普通用户无权清空曲库，仅系统管理员允许操作' });
    }
    if (!clientUser && options.hasAdminAccount && options.hasAdminAccount()) {
      return res.status(403).json({ success: false, error: '安全拦截：清空全库属高危敏感操作，必须登录管理员账号方可执行' });
    }

    const storedSongs = getSongs();
    const count = storedSongs.length;
    setSongs([]);

    // Also clear song references from playlists so playlists don't reference ghost songIds
    let playlistsModified = false;
    const storedPlaylists = getPlaylists();
    for (const pl of storedPlaylists) {
      if (pl.songIds && pl.songIds.length > 0) {
        pl.songIds = [];
        playlistsModified = true;
      }
    }
    if (playlistsModified) {
      setPlaylists(storedPlaylists);
    }

    if (logCastAction) {
      logCastAction({
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        type: 'sync',
        message: `已清空曲库全部歌曲`,
        detail: `共清除 ${count} 首歌曲记录与歌单关联`,
        success: true
      });
    }

    console.log(`[MusicLibrary] 🗑️ 已清空曲库全部歌曲，共 ${count} 首`);
    res.json({ success: true, message: `已清空全部 ${count} 首歌曲`, count });
  });

  // Toggle Favorite
  router.post('/:id/favorite', (req: Request, res: Response) => {
    const { id } = req.params;
    const storedSongs = getSongs();
    const song = storedSongs.find(s => s.id === id);
    if (song) {
      song.isFavorite = !song.isFavorite;
      setSongs(storedSongs);
      return res.json({ success: true, isFavorite: song.isFavorite });
    }
    res.status(404).json({ error: 'Song not found' });
  });

  // Track playback event (increment playCount, record listening history)
  router.post('/:id/play', (req: Request, res: Response) => {
    const { id } = req.params;
    const { device, duration, title, artist, playedSeconds } = req.body || {};
    const song = getSongs().find(s => s.id === id || s.id.replace(/\.[^.]+$/, '') === id);
    const clientUser = (req as any).user;

    // Record into persistent interaction repository (SQLite + JSON)
    const historyEntry = interactionRepository.recordPlayHistory({
      userId: clientUser?.id,
      songId: id,
      songTitle: title || song?.title || '未知曲目',
      songArtist: artist || song?.artist || '未知艺术家',
      deviceName: device || '网页播放器',
      durationSeconds: duration || song?.duration || 0,
      playedSeconds: playedSeconds || 0
    });

    if (dynamicPlaylistEngine) {
      const result = dynamicPlaylistEngine.recordPlay(id, {
        title: title || song?.title,
        artist: artist || song?.artist,
        device: device || '网页播放器',
        duration: duration || song?.duration
      });
      return res.json({ success: true, historyEntry, ...result });
    }
    res.json({ success: true, historyEntry, playCount: 1, lastPlayedAt: Date.now() });
  });

  // Get recent play history
  router.get('/history/recent', (req: Request, res: Response) => {
    const clientUser = (req as any).user;
    const limit = parseInt(String(req.query.limit || '50'), 10);
    const history = interactionRepository.getRecentHistory(clientUser?.id, limit);
    res.json({ success: true, history });
  });

  // Get user interactions (favorites, ratings, play count)
  router.get('/user/interactions', (req: Request, res: Response) => {
    const clientUser = (req as any).user;
    if (!clientUser?.id) {
      return res.json({ success: true, interactions: [] });
    }
    const interactions = interactionRepository.getUserInteractions(clientUser.id);
    res.json({ success: true, interactions });
  });

  // Set favorite state
  router.post('/:id/favorite', (req: Request, res: Response) => {
    const { id } = req.params;
    const { isFavorite } = req.body || {};
    const clientUser = (req as any).user;
    const favValue = typeof isFavorite === 'boolean' ? isFavorite : true;

    if (clientUser?.id) {
      interactionRepository.setFavorite(clientUser.id, id, favValue);
    }

    // Also sync global song object isFavorite for single-user fallback
    const songs = getSongs();
    const song = songs.find(s => s.id === id || s.id.replace(/\.[^.]+$/, '') === id);
    if (song) {
      song.isFavorite = favValue;
      setSongs(songs);
    }
    res.json({ success: true, songId: id, isFavorite: favValue });
  });

  // Set song rating (1-5 stars)
  router.post('/:id/rating', (req: Request, res: Response) => {
    const { id } = req.params;
    const { rating } = req.body || {};
    const clientUser = (req as any).user;
    const ratingNum = parseInt(String(rating || 0), 10);

    if (clientUser?.id) {
      interactionRepository.setRating(clientUser.id, id, ratingNum);
    }
    res.json({ success: true, songId: id, rating: ratingNum });
  });

  // Save customized lyrics offset
  router.post('/:id/lyrics/offset', (req: Request, res: Response) => {
    const { id } = req.params;
    const { offsetMs, rawLrc, translatedLrc } = req.body || {};
    const offset = parseInt(String(offsetMs || 0), 10);
    const cached = interactionRepository.saveLyricsOffset(id, offset, rawLrc, translatedLrc);
    res.json({ success: true, lyrics: cached });
  });

  // Batch or scrobble playback
  router.post('/scrobble', (req: Request, res: Response) => {
    const { songId, device, duration, title, artist, playedSeconds } = req.body || {};
    if (!songId) return res.status(400).json({ error: 'songId required' });
    const song = getSongs().find(s => s.id === songId || s.id.replace(/\.[^.]+$/, '') === songId);
    const clientUser = (req as any).user;

    const historyEntry = interactionRepository.recordPlayHistory({
      userId: clientUser?.id,
      songId,
      songTitle: title || song?.title || '未知曲目',
      songArtist: artist || song?.artist || '未知艺术家',
      deviceName: device || '小米音箱/局域网设备',
      durationSeconds: duration || song?.duration || 0,
      playedSeconds: playedSeconds || 0
    });

    if (dynamicPlaylistEngine) {
      const result = dynamicPlaylistEngine.recordPlay(songId, {
        title: title || song?.title,
        artist: artist || song?.artist,
        device: device || '小米音箱/局域网设备',
        duration: duration || song?.duration
      });
      return res.json({ success: true, historyEntry, ...result });
    }
    res.json({ success: true, historyEntry });
  });

  // P3: Get cached audio fingerprint & metadata
  router.get('/:id/fingerprint', (req: Request, res: Response) => {
    const { id } = req.params;
    const cached = fingerprintCacheRepository.getBySongId(id);
    if (cached) {
      return res.json({ success: true, cached: true, fingerprint: cached });
    }
    return res.json({ success: true, cached: false, fingerprint: null });
  });

  // P3: Save scraped audio fingerprint & metadata
  router.post('/:id/fingerprint', (req: Request, res: Response) => {
    const { id } = req.params;
    const body = req.body;
    const saved = fingerprintCacheRepository.upsert({
      songId: id,
      fingerprintHash: body.fingerprintHash,
      acoustid: body.acoustid,
      musicbrainzId: body.musicbrainzId,
      title: body.title,
      artist: body.artist,
      album: body.album,
      coverUrl: body.coverUrl,
      genre: body.genre,
      year: body.year,
      lyrics: body.lyrics,
      matchedAt: new Date().toISOString()
    });
    return res.json({ success: true, message: '音频指纹元数据缓存已更新', fingerprint: saved });
  });

  return router;
}

/**
 * Clean domain router for Playlists management (/api/playlists)
 */
export function createPlaylistsRouter(options: PlaylistsRouterOptions): Router {
  const router = Router();
  const { getPlaylists, setPlaylists, getSongs, dynamicPlaylistEngine } = options;

  // P2: List all smart playlist rules
  router.get('/smart-rules', (req: Request, res: Response) => {
    const rules = smartPlaylistRepository.getAllRules();
    res.json({ success: true, rules });
  });

  // P2: Get smart playlist rule by playlist ID
  router.get('/:id/smart-rule', (req: Request, res: Response) => {
    const { id } = req.params;
    const rule = smartPlaylistRepository.getRuleByPlaylistId(id);
    res.json({ success: true, rule: rule || null });
  });

  // P2: Create or update smart playlist rule
  router.post('/:id/smart-rule', (req: Request, res: Response) => {
    const { id } = req.params;
    const body = req.body;
    const rule: SmartPlaylistRule = {
      id: body.id || `rule_${id}`,
      playlistId: id,
      ruleName: body.ruleName || '智能过滤规则',
      conditions: Array.isArray(body.conditions) ? body.conditions : [],
      matchType: body.matchType || 'all',
      sortBy: body.sortBy || 'recently_added',
      limitCount: body.limitCount ? Number(body.limitCount) : 50,
      autoRefresh: body.autoRefresh !== undefined ? Boolean(body.autoRefresh) : true,
      lastComputedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const saved = smartPlaylistRepository.upsertRule(rule);

    // If autoApply is requested, compute and update playlist songIds immediately
    if (body.autoApply && getSongs) {
      const allSongs = getSongs();
      const matched = smartPlaylistRepository.evaluateRules(allSongs, saved);
      const storedPlaylists = getPlaylists();
      const pl = storedPlaylists.find(p => p.id === id);
      if (pl) {
        pl.songIds = matched.map(m => m.id);
        setPlaylists(storedPlaylists);
      }
    }

    res.json({ success: true, message: '智能规则已保存', rule: saved });
  });

  // P2: Dynamically evaluate smart playlist rule
  router.post('/:id/evaluate-smart-rule', (req: Request, res: Response) => {
    const { id } = req.params;
    const rule = smartPlaylistRepository.getRuleByPlaylistId(id) || req.body.rule;
    if (!rule) {
      return res.status(400).json({ success: false, error: '未找到智能规则配置' });
    }
    const allSongs = getSongs ? getSongs() : [];
    const matchedSongs = smartPlaylistRepository.evaluateRules(allSongs, rule);

    if (req.body.applyToPlaylist) {
      const storedPlaylists = getPlaylists();
      const pl = storedPlaylists.find(p => p.id === id);
      if (pl) {
        pl.songIds = matchedSongs.map(s => s.id);
        setPlaylists(storedPlaylists);
      }
    }

    res.json({ success: true, count: matchedSongs.length, songs: matchedSongs });
  });

  // Smart Dynamic Playlists Overview (常听榜, 最近播放, 无损精选)
  router.get('/dynamic', (req: Request, res: Response) => {
    if (dynamicPlaylistEngine && getSongs) {
      const songs = getSongs();
      return res.json(dynamicPlaylistEngine.getDynamicPlaylistsOverview(songs));
    }
    res.json({
      success: true,
      playlists: [],
      stats: { totalRecordedPlays: 0, historyCount: 0, topPlayedCount: 0, recentlyPlayedCount: 0, losslessCount: 0 }
    });
  });

  // Clear "最近播放" history
  router.delete('/dynamic/recent', (req: Request, res: Response) => {
    if (dynamicPlaylistEngine) {
      dynamicPlaylistEngine.clearHistory();
      return res.json({ success: true, message: '最近播放记录已清空' });
    }
    res.json({ success: true });
  });

  router.get('/', (req: Request, res: Response) => {
    res.json(getPlaylists());
  });

  router.post('/', (req: Request, res: Response) => {
    const { name, description, songIds } = req.body;
    const storedPlaylists = getPlaylists();
    const newPl = {
      id: `pl-${Date.now()}`,
      name: name || '新建歌单',
      description: description || '',
      coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
      songIds: Array.isArray(songIds) ? songIds : [],
      createdAt: new Date().toISOString().split('T')[0]
    };
    storedPlaylists.push(newPl);
    setPlaylists(storedPlaylists);
    res.json({ success: true, playlist: newPl, playlists: storedPlaylists });
  });

  // Update playlist (name, description, songIds)
  router.put('/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, description, songIds } = req.body;
    const storedPlaylists = getPlaylists();
    const playlist = storedPlaylists.find(p => p.id === id);
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    if (name !== undefined) playlist.name = name.trim();
    if (description !== undefined) playlist.description = description.trim();
    if (Array.isArray(songIds)) playlist.songIds = songIds;

    setPlaylists(storedPlaylists);
    res.json({ success: true, playlist, playlists: storedPlaylists });
  });

  // Add song to playlist
  router.post('/:id/songs', (req: Request, res: Response) => {
    const { id } = req.params;
    const { songId, songIds } = req.body;
    const storedPlaylists = getPlaylists();
    const playlist = storedPlaylists.find(p => p.id === id);
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    const idsToAdd: string[] = Array.isArray(songIds) ? songIds : (songId ? [songId] : []);
    let addedCount = 0;

    idsToAdd.forEach(sId => {
      if (!playlist.songIds.includes(sId)) {
        playlist.songIds.push(sId);
        addedCount++;
      }
    });

    setPlaylists(storedPlaylists);
    res.json({ success: true, addedCount, playlist, playlists: storedPlaylists });
  });

  // Remove song from playlist
  router.delete('/:id/songs/:songId', (req: Request, res: Response) => {
    const { id, songId } = req.params;
    const storedPlaylists = getPlaylists();
    const playlist = storedPlaylists.find(p => p.id === id);
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    playlist.songIds = playlist.songIds.filter(sId => sId !== songId);
    setPlaylists(storedPlaylists);
    res.json({ success: true, playlist, playlists: storedPlaylists });
  });

  // Delete playlist
  router.delete('/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    let storedPlaylists = getPlaylists();
    const initialLen = storedPlaylists.length;
    storedPlaylists = storedPlaylists.filter(p => p.id !== id);

    if (storedPlaylists.length < initialLen) {
      setPlaylists(storedPlaylists);
      return res.json({ success: true, message: '歌单已成功删除', playlists: storedPlaylists });
    }
    res.status(404).json({ error: 'Playlist not found' });
  });

  return router;
}
