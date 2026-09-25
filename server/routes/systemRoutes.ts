import { Router, Request, Response } from 'express';
import os from 'os';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';
import { Song } from '../core/musicEngine.js';
import { interactionRepository } from '../core/repositories/interactionRepository.js';

export interface SystemRouterOptions {
  musicDir: string;
  dataDir: string;
  serverStartTime: number;
  getStoredSongs: () => Song[];
  saveStoredSongs: (songs: Song[]) => void;
  lyricsService: any;
  queueEngine: any;
  xiaomiDevices: () => any[];
  audioTranscoder?: any;
  transcodeSemaphorePool?: any;
  getMiotConfig?: () => any;
  castPipelineManager?: any;
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

  // 3-Tier Architecture Status API
  router.get(['/system/3tier-architecture', '/system/xiaomusic-architecture'], (req: Request, res: Response) => {
    const transcodeStats = options.audioTranscoder?.getCacheStats() || { count: 0, totalSizeMb: '0.00' };
    const poolStats = options.transcodeSemaphorePool?.getStats() || { maxConcurrency: 4, activeCount: 0, queuedCount: 0, totalReapedZombies: 0, totalDirectPassThrough: 0 };
    const miotConfig = options.getMiotConfig ? options.getMiotConfig() : {};
    const activeMicoToken = miotConfig.micoServiceToken || (miotConfig.isMicoValid ? miotConfig.serviceToken : undefined);
    const devices = options.xiaomiDevices();
    res.json({
      success: true,
      architecture: {
        name: 'Tinglan 3-Tier Audio & Cast Engine',
        version: '3.0.0',
        audioLayer: {
          engine: 'FFmpeg Standard MP3 Transcoder with Semaphore Concurrency Pool',
          ffmpegAvailable: options.audioTranscoder?.isAvailable() ?? true,
          standardBitrate: '320kbps CBR',
          sampleRate: '44.1 kHz Stereo',
          http206RangeSupport: true,
          cacheCount: transcodeStats.count,
          cacheSize: transcodeStats.totalSizeMb,
          concurrencyLimit: poolStats.maxConcurrency,
          activeTranscodes: poolStats.activeCount,
          queuedTranscodes: poolStats.queuedCount,
          totalReapedZombies: poolStats.totalReapedZombies,
          totalDirectPassThrough: poolStats.totalDirectPassThrough,
          routes: ['/api/stream/:songId', '/stream/:songId', '/music/:filename']
        },
        controlLayer: {
          engine: 'MiService Mina UBUS Caller',
          isLoggedIn: Boolean(miotConfig.isLoggedIn),
          hasServiceToken: Boolean(activeMicoToken),
          userId: miotConfig.userId || 'N/A',
          primaryCommand: 'player_play_url (media: app_ios, type: 1)',
          fallbackCommands: [
            'player_play_url (type: 0, media: app_ios) [Touchscreen]',
            'player_play_url (type: 1)',
            'player_play_music (media: app_ios)'
          ]
        },
        compatibilityLayer: {
          modelMatrix: {
            touchscreenModels: ['LX04', 'X08A', 'X08C', 'X08E', 'X10A'],
            proSoundModels: ['OH2P', 'L16A', 'LX06', 'Xiaomi Sound'],
            playModels: ['LX05', 'L05B', 'L05C', 'L07A']
          },
          fallbackChains: ['MiService Mina Cloud', 'MIoT Cloud Action', 'LAN miIO UDP 54321', 'DLNA UPnP AVTransport'],
          activeDeviceCount: devices.length
        }
      }
    });
  });

  // Phase 3: Hardware Strategy Telemetry & Self-Healing Profiles API
  router.get('/system/cast-profiles', (req: Request, res: Response) => {
    const profiles = options.castPipelineManager?.getProfilesReport() || [];
    res.json({
      success: true,
      profiles,
      totalDevices: options.xiaomiDevices().length
    });
  });

  router.post('/system/cast-profiles/reset', (req: Request, res: Response) => {
    const { did } = req.body || {};
    if (did) {
      options.castPipelineManager?.clearProfile(did);
      res.json({ success: true, message: `已重置设备 [${did}] 的自适应策略画像` });
    } else {
      options.castPipelineManager?.resetAllProfiles();
      res.json({ success: true, message: '已重置所有音箱的自学习策略画像' });
    }
  });

  // --- Device & User EQ Presets ---
  router.get('/system/eq-presets', (req: Request, res: Response) => {
    const { deviceDid } = req.query;
    const clientUser = (req as any).user;
    const presets = interactionRepository.getEqPresets(deviceDid as string | undefined, clientUser?.id);
    res.json({ success: true, presets });
  });

  router.post('/system/eq-presets', (req: Request, res: Response) => {
    const { id, deviceDid, presetName, bands, targetLufs, bassBoost, spatialAudio } = req.body || {};
    const clientUser = (req as any).user;
    if (!presetName || !Array.isArray(bands)) {
      return res.status(400).json({ success: false, error: 'presetName and bands are required' });
    }
    const saved = interactionRepository.saveEqPreset({
      id,
      deviceDid,
      userId: clientUser?.id,
      presetName,
      bands,
      targetLufs: typeof targetLufs === 'number' ? targetLufs : -16.0,
      bassBoost: Boolean(bassBoost),
      spatialAudio: Boolean(spatialAudio)
    });
    res.json({ success: true, preset: saved });
  });

  // --- Cast Audit Logs ---
  router.get('/system/audit-logs', (req: Request, res: Response) => {
    const limit = parseInt(String(req.query.limit || '100'), 10);
    const logs = interactionRepository.getCastAuditLogs(limit);
    res.json({ success: true, logs });
  });

  return router;
}
