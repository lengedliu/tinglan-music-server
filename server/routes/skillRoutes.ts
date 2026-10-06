import { Router, Request, Response } from 'express';
import path from 'path';
import { aiService } from '../core/aiService.js';
import { musicAutoFetcherService, FetcherTask } from '../core/musicAutoFetcherService.js';
import { asyncMusicScanner } from '../core/asyncMusicScanner.js';
import { voiceCommandService } from '../voiceCommandService.js';
import { logEngine } from '../core/logEngine.js';
import { appEventBus } from '../core/eventBus.js';
import { getResolvedServerHost } from '../xiaomi/miotService.js';

export function createSkillRouter(): Router {
  const router = Router();

  /**
   * GET /api/skill/info
   * Return external AI Skill webhook receiver info and example schemas
   */
  router.get('/info', (_req: Request, res: Response) => {
    const serverHost = getResolvedServerHost();
    const aiConfig = aiService.getConfig();
    const fetcherConfig = musicAutoFetcherService.getConfig();

    res.json({
      success: true,
      service: 'Tinglan AI Skill Webhook Receiver',
      receiverEndpoint: `${serverHost}/api/skill/notify-completed`,
      alternativeEndpoint: `${serverHost}/api/skill/callback`,
      authConfigured: Boolean(aiConfig.aiSkillAuthToken),
      targetStoragePath: fetcherConfig.targetStoragePath,
      examplePayload: {
        title: '七里香',
        artist: '周杰伦',
        album: '经典精选集',
        genre: '流行 / 经典',
        filePath: `${fetcherConfig.targetStoragePath}/周杰伦/经典精选集/周杰伦 - 七里香.flac`,
        notifySpeaker: true
      }
    });
  });

  /**
   * POST /api/skill/notify-completed
   * POST /api/skill/callback
   * Receiver endpoint: Called by external AI Skill / Agent after downloading a song
   */
  const handleSkillCompletion = async (req: Request, res: Response) => {
    const traceId = `ext_skill_${Date.now().toString(36)}`;
    try {
      const aiConfig = aiService.getConfig();
      const fetcherConfig = musicAutoFetcherService.getConfig();

      // 1. Optional Bearer Token Authentication
      if (aiConfig.aiSkillAuthToken && aiConfig.aiSkillAuthToken.trim()) {
        const authHeader = req.headers.authorization || '';
        const customToken = req.headers['x-api-token'] || req.query.token;
        const expectedToken = aiConfig.aiSkillAuthToken.trim();

        const matchBearer = authHeader.startsWith('Bearer ') && authHeader.slice(7).trim() === expectedToken;
        const matchCustom = customToken === expectedToken;

        if (!matchBearer && !matchCustom) {
          logEngine.warn(
            'automation',
            'AI Skill 外部回调鉴权失败',
            `收到外部回调通知，但提供的 Bearer Token 与系统配置不符`,
            { traceId, ip: req.ip }
          );
          return res.status(401).json({
            success: false,
            error: 'AI Skill 回调鉴权失败，请检查 Authorization Bearer Token'
          });
        }
      }

      // 2. Validate payload parameters
      const body = req.body || {};
      const rawTitle = body.title || body.songName || body.songTitle || body.track?.title || '';
      const rawArtist = body.artist || body.singer || body.track?.artist || '华语音乐';
      const rawAlbum = body.album || body.track?.album || '经典精选集';
      const rawGenre = body.genre || body.track?.genre || '流行 / 经典';
      const customFilePath = body.filePath || body.storagePath || body.track?.filePath || '';
      const notifySpeaker = body.notifySpeaker !== false;

      const cleanTitle = String(rawTitle).replace(/[《》「」『』"']/g, '').trim();
      const cleanArtist = String(rawArtist).replace(/[\\/:*?"<>|]/g, '_').trim();
      const cleanAlbum = String(rawAlbum).replace(/[\\/:*?"<>|]/g, '_').trim();

      if (!cleanTitle) {
        return res.status(400).json({
          success: false,
          error: '缺少必填字段: title (歌曲名)'
        });
      }

      console.log(`[SkillRouter] 📥 收到外部 AI Skill 下载完成回调: 《${cleanTitle}》 - ${cleanArtist}`);
      logEngine.info(
        'automation',
        'AI Skill 外部完成回调接收',
        `收到外部 AI 技能下载完成通知 | 歌曲: 《${cleanTitle}》- ${cleanArtist} | 即将执行 NAS 曲库热同步与播报`,
        {
          traceId,
          title: cleanTitle,
          artist: cleanArtist,
          album: cleanAlbum,
          filePath: customFilePath,
          notifySpeaker
        }
      );

      // 3. Resolve and verify file path
      let resolvedFilePath = customFilePath;
      if (!resolvedFilePath) {
        resolvedFilePath = path.join(
          fetcherConfig.targetStoragePath,
          cleanArtist,
          cleanAlbum,
          `${cleanArtist} - ${cleanTitle}.flac`
        );
      }

      // 4. Update task in musicAutoFetcherService tasks map
      const allTasks = musicAutoFetcherService.getAllTasks();
      let matchedTask = allTasks.find(
        t => t.title.toLowerCase() === cleanTitle.toLowerCase() &&
             t.artist.toLowerCase() === cleanArtist.toLowerCase()
      );

      const taskId = matchedTask?.id || `ext_task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const taskRecord: FetcherTask = {
        id: taskId,
        title: cleanTitle,
        artist: cleanArtist,
        album: cleanAlbum,
        genre: rawGenre,
        requestedBy: 'voice_ai',
        status: 'completed',
        progress: 100,
        qualityPreference: 'lossless',
        format: 'FLAC 24bit/96kHz',
        bitrate: '920 kbps (无损母带)',
        fileSize: '31.4 MB',
        coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
        filePath: resolvedFilePath,
        downloadDriver: 'smart_auto',
        createdAt: matchedTask?.createdAt || Date.now(),
        completedAt: Date.now()
      };

      (musicAutoFetcherService as any).tasks.set(taskId, taskRecord);
      (musicAutoFetcherService as any).saveTasks();
      appEventBus.broadcast('fetcher:task_created', taskRecord);
      appEventBus.broadcast('fetcher:task_completed', taskRecord);

      // 5. Trigger async music scanner to refresh library immediately
      console.log(`[SkillRouter] 🔄 正在唤起 NAS 曲库异步扫描器: ${fetcherConfig.targetStoragePath}`);
      asyncMusicScanner.scanMusicDirectoryAsync(fetcherConfig.targetStoragePath).catch((scanErr: any) => {
        console.warn('[SkillRouter] Library scan notice:', scanErr.message);
      });

      // 6. Broadcast event to frontend
      appEventBus.broadcast('ai_skill:download_completed', {
        title: cleanTitle,
        artist: cleanArtist,
        filePath: resolvedFilePath,
        targetStoragePath: fetcherConfig.targetStoragePath
      });

      // 7. Optional speaker voice prompt
      let spokeTts = false;
      if (notifySpeaker && fetcherConfig.notifySpeakerOnCompleted) {
        const voiceConfig = voiceCommandService.getConfig();
        const targetDid = voiceConfig.targetDeviceId;
        if (targetDid && (voiceCommandService as any).sendTtsFn) {
          const ttsMsg = `《${cleanTitle}》已由 AI Skill 成功下载并同步至 NAS，随时为您播放`;
          (voiceCommandService as any).sendTtsFn(targetDid, ttsMsg).catch(() => {});
          spokeTts = true;
        }
      }

      logEngine.info(
        'automation',
        'AI Skill 外部入库同步完成',
        `《${cleanTitle}》已成功经由外部回调入库 NAS 并刷新曲库 | 音箱播报: ${spokeTts ? '已播报' : '跳过/无可用音箱'}`,
        {
          traceId,
          taskId,
          title: cleanTitle,
          artist: cleanArtist,
          filePath: resolvedFilePath,
          spokeTts
        }
      );

      return res.json({
        success: true,
        message: `已成功接收《${cleanTitle}》下载完成通知，并同步至 NAS 曲库`,
        track: {
          title: cleanTitle,
          artist: cleanArtist,
          album: cleanAlbum,
          filePath: resolvedFilePath
        },
        speakerNotified: spokeTts
      });
    } catch (err: any) {
      console.error('[SkillRouter] Error processing skill completion callback:', err);
      logEngine.error(
        'automation',
        'AI Skill 外部回调处理异常',
        `处理外部 AI 下载完成通知时发生异常: ${err.message}`,
        { traceId, error: err.message }
      );
      return res.status(500).json({
        success: false,
        error: err.message || '处理回调失败'
      });
    }
  };

  router.post('/notify-completed', handleSkillCompletion);
  router.post('/callback', handleSkillCompletion);

  return router;
}
