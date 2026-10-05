import { Router, Request, Response } from 'express';
import { libraryHealthService } from '../core/libraryHealthService.js';
import { libraryWatcherService } from '../core/libraryWatcherService.js';

export function createMetadataRouter(): Router {
  const router = Router();

  /**
   * GET /api/library/watcher/status
   * Real-time file watcher status & event logs
   */
  router.get('/watcher/status', (req: Request, res: Response) => {
    try {
      const status = libraryWatcherService.getStatus();
      res.json({ success: true, status });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || '获取监控状态失败' });
    }
  });

  /**
   * POST /api/library/watcher/toggle
   * Enable / disable directory watcher
   */
  router.post('/watcher/toggle', (req: Request, res: Response) => {
    try {
      const { enabled } = req.body;
      const result = libraryWatcherService.toggle(enabled);
      res.json({ success: true, enabled: result, status: libraryWatcherService.getStatus() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || '切换监控状态失败' });
    }
  });

  /**
   * POST /api/library/watcher/config
   * Update watcher auto-scrape and debounce settings
   */
  router.post('/watcher/config', (req: Request, res: Response) => {
    try {
      const { autoScrapeOnWatch, debounceMs } = req.body;
      libraryWatcherService.updateConfig({ autoScrapeOnWatch, debounceMs });
      res.json({ success: true, status: libraryWatcherService.getStatus() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || '更新监控配置失败' });
    }
  });

  /**
   * GET /api/library/health
   * Full diagnostic health audit of the music library
   */
  router.get('/health', (req: Request, res: Response) => {
    try {
      const report = libraryHealthService.auditLibraryHealth();
      res.json({ success: true, report });
    } catch (err: any) {
      console.error('[MetadataRoutes] Health audit error:', err);
      res.status(500).json({ success: false, error: err.message || '健康体检诊断失败' });
    }
  });

  /**
   * GET /api/library/duplicates
   * Returns list of duplicate song groups with audio quality rankings
   */
  router.get('/duplicates', (req: Request, res: Response) => {
    try {
      const duplicates = libraryHealthService.detectDuplicates();
      res.json({ success: true, duplicates });
    } catch (err: any) {
      console.error('[MetadataRoutes] Duplicates detection error:', err);
      res.status(500).json({ success: false, error: err.message || '重复曲目检测失败' });
    }
  });

  /**
   * POST /api/library/duplicates/deduplicate
   * Safely deletes selected redundant duplicate songs
   */
  router.post('/duplicates/deduplicate', (req: Request, res: Response) => {
    try {
      const { songIdsToRemove } = req.body;
      if (!Array.isArray(songIdsToRemove) || songIdsToRemove.length === 0) {
        return res.status(400).json({ success: false, error: '请提供待清理的重复曲目 ID 列表' });
      }

      const result = libraryHealthService.deduplicateSongs(songIdsToRemove);
      res.json({
        success: true,
        removedCount: result.removedCount,
        remainingSongsTotal: result.remainingSongsTotal,
        message: `成功清理 ${result.removedCount} 首冗余重复曲目`
      });
    } catch (err: any) {
      console.error('[MetadataRoutes] Deduplicate error:', err);
      res.status(500).json({ success: false, error: err.message || '去重执行失败' });
    }
  });

  /**
   * POST /api/library/scrape/single
   * Scrapes and enriches a single song by ID
   */
  router.post('/scrape/single', async (req: Request, res: Response) => {
    try {
      const { songId, forceOverwrite } = req.body;
      if (!songId) {
        return res.status(400).json({ success: false, error: '缺少 songId 参数' });
      }

      const result = await libraryHealthService.scrapeAndEnrichSong(songId, { forceOverwrite });
      if (!result.success) {
        return res.status(404).json({ success: false, error: '未找到对应歌曲' });
      }

      res.json({
        success: true,
        song: result.song,
        changes: result.changes,
        message: result.changes.length > 0 ? `已完成刮削并补齐 ${result.changes.length} 项元数据` : '该歌曲元数据已完备，无需修改'
      });
    } catch (err: any) {
      console.error('[MetadataRoutes] Single scrape error:', err);
      res.status(500).json({ success: false, error: err.message || '单曲刮削失败' });
    }
  });

  /**
   * POST /api/library/scrape/batch
   * Batch scrapes and cleans songs across the entire library
   */
  router.post('/scrape/batch', async (req: Request, res: Response) => {
    try {
      const { fixMissingCovers, fixMissingLyrics, cleanAdTags, forceAll } = req.body;
      const result = await libraryHealthService.batchScrapeAndEnrich({
        fixMissingCovers: fixMissingCovers !== false,
        fixMissingLyrics: fixMissingLyrics !== false,
        cleanAdTags: cleanAdTags !== false,
        forceAll: Boolean(forceAll)
      });

      res.json({
        success: true,
        totalProcessed: result.totalProcessed,
        enrichedCount: result.enrichedCount,
        logs: result.logs,
        message: `全库智能刮削完成！共处理 ${result.totalProcessed} 首歌曲，修复完善 ${result.enrichedCount} 首。`
      });
    } catch (err: any) {
      console.error('[MetadataRoutes] Batch scrape error:', err);
      res.status(500).json({ success: false, error: err.message || '全库刮削执行失败' });
    }
  });

  return router;
}
