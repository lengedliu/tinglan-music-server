import { Router, Request, Response } from 'express';
import { aiService, AiProviderId } from '../core/aiService.js';
import { logEngine } from '../core/logEngine.js';
import { musicRepository } from '../core/repositories/musicRepository.js';
import { deviceRepository } from '../core/repositories/deviceRepository.js';
import { aiSemanticCache } from '../core/aiSemanticCache.js';

export function createAiRoutes(): Router {
  const router = Router();

  // Get masked AI configuration
  router.get('/config', (req: Request, res: Response) => {
    try {
      const config = aiService.getMaskedConfig();
      res.json({
        success: true,
        config
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Update AI configuration
  router.post('/config', (req: Request, res: Response) => {
    try {
      const updated = aiService.updateConfig(req.body);
      
      logEngine.info(
        'system',
        'AI 大模型配置已更新',
        `当前活跃模型切换为: ${updated.providers[updated.activeProvider]?.name || updated.activeProvider}`,
        { details: { activeProvider: updated.activeProvider, enabled: updated.enabled } }
      );

      res.json({
        success: true,
        config: updated,
        message: 'AI 大模型配置保存成功'
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Test connection to specified provider or active provider
  router.post('/test', async (req: Request, res: Response) => {
    const { providerId } = req.body || {};
    const targetProvider: AiProviderId = providerId || aiService.getConfig().activeProvider;

    try {
      const result = await aiService.testConnection(targetProvider);
      res.json({
        success: result.success,
        providerId: targetProvider,
        latencyMs: result.latencyMs,
        reply: result.reply,
        modelUsed: result.modelUsed,
        error: result.error
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        providerId: targetProvider,
        error: err.message
      });
    }
  });

  // Log diagnosis with AI
  router.post('/diagnose', async (req: Request, res: Response) => {
    try {
      const { logs } = req.body || {};
      const logsToAnalyze = Array.isArray(logs) && logs.length > 0 ? logs : logEngine.query({ limit: 30 }).logs;
      
      const diagnosis = await aiService.diagnoseLogs(logsToAnalyze);

      logEngine.info(
        'audit',
        '已执行 AI 智能故障诊断',
        `AI 模型 (${diagnosis.modelUsed}) 诊断结论: ${diagnosis.summary} (耗时: ${diagnosis.latencyMs}ms)`,
        { details: diagnosis }
      );

      res.json({
        success: true,
        diagnosis
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message || 'AI 诊断失败'
      });
    }
  });

  // Music insight with current active AI model
  router.post('/music-insight', async (req: Request, res: Response) => {
    try {
      const { title, artist, genre } = req.body || {};
      const insight = await aiService.generateMusicInsight(title, artist, genre);
      res.json({
        success: true,
        insight
      });
    } catch (err: any) {
      res.json({
        success: false,
        insight: `《${req.body?.title || '曲目'}》是一首经典的${req.body?.genre || '音乐'}作品。`,
        error: err.message
      });
    }
  });

  // Test voice intent parsing and dynamic mood queue matching
  router.post('/voice-parse', async (req: Request, res: Response) => {
    try {
      const { query } = req.body || {};
      if (!query) {
        return res.status(400).json({ success: false, error: 'Query parameter required' });
      }
      const songs = musicRepository.getAllSongs();
      const result = await aiService.parseVoiceIntent(query, songs as any);
      res.json({
        success: true,
        query,
        result
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message || 'Voice parsing failed'
      });
    }
  });

  // Item 3: Semantic Cache Stats
  router.get('/cache-stats', (_req: Request, res: Response) => {
    res.json({
      success: true,
      stats: aiSemanticCache.getStats()
    });
  });

  // Item 3: Clear Semantic Cache
  router.post('/clear-cache', (_req: Request, res: Response) => {
    aiSemanticCache.clear();
    res.json({
      success: true,
      message: '语义缓存已全部清空',
      stats: aiSemanticCache.getStats()
    });
  });

  // Item 5: AI Natural Language to Automation Scene Generator
  router.post('/generate-automation', async (req: Request, res: Response) => {
    try {
      const { prompt } = req.body || {};
      if (!prompt) {
        return res.status(400).json({ success: false, error: 'Prompt required' });
      }

      const devices = deviceRepository.getAllDevices();
      const playlists = musicRepository.getAllPlaylists();

      const generated = await aiService.generateAutomationScene(prompt, devices as any, playlists as any);
      res.json({
        success: true,
        generated
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message || 'AI 自动化生成失败'
      });
    }
  });

  return router;
}
