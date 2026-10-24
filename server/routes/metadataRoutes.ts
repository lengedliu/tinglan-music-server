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
   * Returns list of duplicate song groups with audio quality rankings & version badges
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
   * Safely deletes selected redundant duplicate songs and migrates playlist & favorite references
   */
  router.post('/duplicates/deduplicate', (req: Request, res: Response) => {
    try {
      const { songIdsToRemove } = req.body;
      if (!Array.isArray(songIdsToRemove) || songIdsToRemove.length === 0) {
        return res.status(400).json({ success: false, error: '请提供待清理的重复曲目 ID 列表' });
      }

      const result = libraryHealthService.deduplicateSongs(songIdsToRemove);
      const migrationSummary =
        result.migratedPlaylistRefs > 0 || result.migratedFavorites > 0
          ? `（已无损迁移 ${result.migratedPlaylistRefs} 处歌单引用与 ${result.migratedFavorites} 项红心收藏至保留版本）`
          : '';
      res.json({
        success: true,
        removedCount: result.removedCount,
        migratedPlaylistRefs: result.migratedPlaylistRefs,
        migratedFavorites: result.migratedFavorites,
        remainingSongsTotal: result.remainingSongsTotal,
        message: `成功清理 ${result.removedCount} 首冗余重复曲目${migrationSummary}`
      });
    } catch (err: any) {
      console.error('[MetadataRoutes] Deduplicate error:', err);
      res.status(500).json({ success: false, error: err.message || '去重执行失败' });
    }
  });

  /**
   * GET /api/library/scrape/search
   * Batch 1: Multi-source online metadata candidate search (iTunes + LRCLIB + NetEase)
   */
  router.get('/scrape/search', async (req: Request, res: Response) => {
    try {
      const q = String(req.query.q || '').trim();
      const artist = String(req.query.artist || '').trim();
      const album = String(req.query.album || '').trim();
      const duration = Number(req.query.duration || 0);
      const source = (String(req.query.source || 'all') as 'all' | 'itunes' | 'lrclib' | 'netease') || 'all';

      if (!q) {
        return res.status(400).json({ success: false, error: '请输入搜索关键词（歌名或歌手）' });
      }

      const candidates = await libraryHealthService.searchOnlineMetadataCandidates(q, {
        artist,
        album,
        duration: duration > 0 ? duration : undefined,
        source
      });

      res.json({
        success: true,
        candidates
      });
    } catch (err: any) {
      console.error('[MetadataRoutes] Online search error:', err);
      res.status(500).json({ success: false, error: err.message || '在线元数据检索失败' });
    }
  });

  /**
   * POST /api/library/song/:id/metadata
   * Batch 1 & 3: Manual tag editor or selective candidate apply + physical .lrc sidecar write
   */
  router.post('/song/:id/metadata', (req: Request, res: Response) => {
    try {
      const songId = decodeURIComponent(req.params.id || '');
      const { title, artist, album, year, genre, coverUrl, lyrics, writeSidecarLrc } = req.body || {};

      const result = libraryHealthService.updateSongMetadata(songId, {
        title,
        artist,
        album,
        year: year !== undefined && year !== '' ? Number(year) : undefined,
        genre,
        coverUrl,
        lyrics,
        writeSidecarLrc
      });

      if (!result.success) {
        return res.status(404).json({ success: false, error: '未找到对应歌曲' });
      }

      res.json({
        success: true,
        song: result.song,
        changes: result.changes,
        sidecarWritten: result.sidecarWritten,
        message:
          result.changes.length > 0
            ? `已保存 ${result.changes.length} 项标签更改${result.sidecarWritten ? '并同步写入 .lrc 歌词文件' : ''}`
            : '标签未发生变化'
      });
    } catch (err: any) {
      console.error('[MetadataRoutes] Update song metadata error:', err);
      res.status(500).json({ success: false, error: err.message || '保存标签失败' });
    }
  });

  /**
   * POST /api/library/scrape/single
   * Scrapes and enriches a single song by ID using online multi-source candidates
   */
  router.post('/scrape/single', async (req: Request, res: Response) => {
    try {
      const { songId, forceOverwrite, minConfidence, writeSidecarLrc } = req.body;
      if (!songId) {
        return res.status(400).json({ success: false, error: '缺少 songId 参数' });
      }

      const result = await libraryHealthService.scrapeAndEnrichSong(songId, {
        forceOverwrite,
        minConfidence,
        writeSidecarLrc
      });
      if (!result.success) {
        return res.status(404).json({ success: false, error: '未找到对应歌曲' });
      }

      res.json({
        success: true,
        song: result.song,
        changes: result.changes,
        matchedSource: result.matchedSource,
        confidence: result.confidence,
        message:
          result.changes.length > 0
            ? `已完成刮削并补齐 ${result.changes.length} 项元数据`
            : '该歌曲元数据已完备，无需修改'
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
      const { fixMissingCovers, fixMissingLyrics, cleanAdTags, forceAll, minConfidence, writeSidecarLrc, songIds } =
        req.body;
      const result = await libraryHealthService.batchScrapeAndEnrich({
        fixMissingCovers: fixMissingCovers !== false,
        fixMissingLyrics: fixMissingLyrics !== false,
        cleanAdTags: cleanAdTags !== false,
        forceAll: Boolean(forceAll),
        minConfidence: typeof minConfidence === 'number' ? minConfidence : 60,
        writeSidecarLrc: writeSidecarLrc !== false,
        songIds: Array.isArray(songIds) ? songIds : undefined
      });

      res.json({
        success: true,
        totalProcessed: result.totalProcessed,
        enrichedCount: result.enrichedCount,
        logs: result.logs,
        message: `全库智能刮削完成！共扫描 ${result.totalProcessed} 首歌曲，精准修复完善 ${result.enrichedCount} 首。`
      });
    } catch (err: any) {
      console.error('[MetadataRoutes] Batch scrape error:', err);
      res.status(500).json({ success: false, error: err.message || '全库刮削执行失败' });
    }
  });

  /**
   * POST /api/library/tools/filename-to-tag
   * Batch 2: Extracts tags from filename using customizable pattern (supports dryRun preview)
   */
  router.post('/tools/filename-to-tag', (req: Request, res: Response) => {
    try {
      const { pattern, dryRun, overwriteExisting, songIds } = req.body || {};
      const result = libraryHealthService.filenameToTag({
        pattern: pattern || '%artist% - %title%',
        dryRun: dryRun !== false,
        overwriteExisting: Boolean(overwriteExisting),
        songIds: Array.isArray(songIds) ? songIds : undefined
      });

      res.json({
        success: true,
        ...result,
        message:
          dryRun !== false
            ? `预览完成：匹配到 ${result.totalMatched} 首可从文件名提取标签的曲目`
            : `已成功为 ${result.appliedCount} 首歌曲写入提取标签`
      });
    } catch (err: any) {
      console.error('[MetadataRoutes] Filename to tag error:', err);
      res.status(500).json({ success: false, error: err.message || '文件名转标签执行失败' });
    }
  });

  /**
   * POST /api/library/tools/tag-to-filename
   * Batch 2: Renames physical files in music/ according to pattern (supports dryRun preview)
   */
  router.post('/tools/tag-to-filename', (req: Request, res: Response) => {
    try {
      const { pattern, dryRun, songIds } = req.body || {};
      const result = libraryHealthService.tagToFilename({
        pattern: pattern || '%artist% - %title%',
        dryRun: dryRun !== false,
        songIds: Array.isArray(songIds) ? songIds : undefined
      });

      res.json({
        success: true,
        ...result,
        message:
          dryRun !== false
            ? `预览完成：共有 ${result.totalMatched} 首歌曲文件名可按标签规范化重命名`
            : `已成功重命名 ${result.renamedCount} 首歌曲文件（含关联 .lrc）`
      });
    } catch (err: any) {
      console.error('[MetadataRoutes] Tag to filename error:', err);
      res.status(500).json({ success: false, error: err.message || '标签重命名文件执行失败' });
    }
  });

  /**
   * POST /api/library/tools/fix-encoding
   * Batch 2: Detects and fixes GBK / Latin-1 mojibake tags
   */
  router.post('/tools/fix-encoding', (req: Request, res: Response) => {
    try {
      const { dryRun, songIds } = req.body || {};
      const result = libraryHealthService.fixGarbledEncoding({
        dryRun: dryRun !== false,
        songIds: Array.isArray(songIds) ? songIds : undefined
      });

      res.json({
        success: true,
        ...result,
        message:
          dryRun !== false
            ? `乱码扫描完成：共发现 ${result.totalDetected} 处编码异常字段`
            : `已成功修复 ${result.fixedCount} 首歌曲的 GBK/Latin-1 乱码标签`
      });
    } catch (err: any) {
      console.error('[MetadataRoutes] Fix encoding error:', err);
      res.status(500).json({ success: false, error: err.message || '乱码修复失败' });
    }
  });

  /**
   * POST /api/library/tools/write-sidecar-lrc
   * Batch 3: Writes physical .lrc sidecar files into music/ for all songs with lyrics
   */
  router.post('/tools/write-sidecar-lrc', (req: Request, res: Response) => {
    try {
      const { songIds } = req.body || {};
      const result = libraryHealthService.batchWriteSidecarLrc(Array.isArray(songIds) ? songIds : undefined);
      res.json({
        success: true,
        ...result,
        message: `已将 ${result.writtenCount} 首歌曲的同步歌词导出为物理同名 .lrc 文件`
      });
    } catch (err: any) {
      console.error('[MetadataRoutes] Write sidecar LRC error:', err);
      res.status(500).json({ success: false, error: err.message || '导出物理 .lrc 文件失败' });
    }
  });

  return router;
}
