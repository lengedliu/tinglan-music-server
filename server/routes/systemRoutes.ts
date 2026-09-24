import { Router, Request, Response } from 'express';
import os from 'os';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';
import { Song } from '../core/musicEngine.js';

export interface SystemRouterOptions {
  musicDir: string;
  dataDir: string;
  serverStartTime: number;
  getStoredSongs: () => Song[];
  saveStoredSongs: (songs: Song[]) => void;
  lyricsService: any;
  queueEngine: any;
  xiaomiDevices: () => any[];
}

export function createSystemRouter(options: SystemRouterOptions): Router {
  const router = Router();

  // Health check endpoint
  router.get('/health', (req: Request, res: Response) => {
    const uptimeSec = Math.floor((Date.now() - options.serverStartTime) / 1000);
    const mem = process.memoryUsage();
    res.json({
      status: 'ok',
      service: 'TingLan-Music-Server',
      version: '3.2.0',
      uptime: `${uptimeSec}s`,
      uptimeSeconds: uptimeSec,
      timestamp: new Date().toISOString(),
      memory: {
        rssMb: Math.round(mem.rss / 1024 / 1024),
        heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024)
      },
      songsCount: options.getStoredSongs().length,
      devicesCount: options.xiaomiDevices().length,
      queueStatus: options.queueEngine.getStatus()
    });
  });

  // Docker & Host environment info
  router.get('/system/docker-info', (req: Request, res: Response) => {
    const isDocker = fs.existsSync('/.dockerenv') || fs.existsSync('/run/.containerenv');
    res.json({
      isDocker,
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      cpus: os.cpus().length,
      freeMemMb: Math.round(os.freemem() / 1024 / 1024),
      totalMemMb: Math.round(os.totalmem() / 1024 / 1024),
      musicDir: options.musicDir,
      dataDir: options.dataDir
    });
  });

  // Lyrics search & auto-match API
  router.post('/lyrics/search', async (req: Request, res: Response) => {
    try {
      const { title, artist, songId, duration, forceOnline } = req.body;
      const storedSongs = options.getStoredSongs();
      const song = songId ? storedSongs.find(s => s.id === songId) : null;

      const cleanTitle = String(title || song?.title || '').trim();
      const cleanArtist = String(artist || song?.artist || '').trim();
      const songDuration = duration || song?.duration;

      const searchResult = await options.lyricsService.searchLyricsAsync({
        title: cleanTitle,
        artist: cleanArtist,
        duration: songDuration,
        forceOnline: Boolean(forceOnline),
        existingLyrics: song?.lyrics
      });

      if (song && searchResult.lyrics && searchResult.source !== 'generated') {
        song.lyrics = searchResult.lyrics;
        options.saveStoredSongs(storedSongs);
      }

      return res.json({
        success: true,
        lyrics: searchResult.lyrics,
        source: searchResult.source,
        providerName: searchResult.providerName,
        isSynced: searchResult.isSynced,
        title: searchResult.title || cleanTitle,
        artist: searchResult.artist || cleanArtist
      });
    } catch (err: any) {
      console.error('[API /api/lyrics/search] Error:', err);
      return res.status(500).json({ success: false, message: '检索歌词时发生错误', error: err.message });
    }
  });

  // AI Music Insight & Recommendation (server-side Gemini)
  router.post('/ai/music-insight', async (req: Request, res: Response) => {
    try {
      const { title, artist, genre } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.json({
          success: true,
          insight: `《${title || '曲目'}》是一首经典的${genre || '音乐'}作品。如需获取专属 AI 鉴赏与风格解析，请在环境变量或系统设置中配置 GEMINI_API_KEY。`
        });
      }

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `为歌曲《${title || '未命名'}》${artist ? `（艺术家：${artist}）` : ''}${genre ? `（流派：${genre}）` : ''}写一段简短优美（80字以内）的鉴赏语与情绪共鸣分析。`,
      });

      return res.json({
        success: true,
        insight: response.text || '暂无解析'
      });
    } catch (err: any) {
      return res.json({
        success: false,
        insight: 'AI 乐评生成暂不可用',
        error: err.message
      });
    }
  });

  return router;
}
