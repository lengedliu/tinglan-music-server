import express, { Request, Response } from 'express';
import { nasStorageService } from '../core/nasStorageService.js';

const router = express.Router();

/**
 * GET /api/nas/config
 * Get current NAS configuration & last sync status
 */
router.get('/config', (req: Request, res: Response) => {
  try {
    const config = nasStorageService.getConfig();
    const progress = nasStorageService.getProgress();
    return res.json({ success: true, config, progress });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || '获取 NAS 配置失败' });
  }
});

/**
 * POST /api/nas/test
 * Test WebDAV or local mount connectivity
 */
router.post('/test', async (req: Request, res: Response) => {
  try {
    const testCfg = req.body;
    const result = await nasStorageService.testConnection(testCfg);
    return res.json({ success: true, result });
  } catch (err: any) {
    console.warn('[NasRoutes] Test connection error:', err.message);
    return res.status(400).json({ success: false, error: err.message || '连接测试失败' });
  }
});

/**
 * POST /api/nas/save
 * Save NAS connection & auto-sync parameters
 */
router.post('/save', (req: Request, res: Response) => {
  try {
    const newConfig = req.body;
    const saved = nasStorageService.saveConfig(newConfig);
    return res.json({ success: true, config: saved, message: 'NAS 远程存储配置保存成功' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || '保存 NAS 配置失败' });
  }
});

/**
 * POST /api/nas/sync
 * Manually trigger incremental remote NAS scan & synchronization
 */
router.post('/sync', async (req: Request, res: Response) => {
  try {
    // Run sync in background and return immediate acknowledgement
    nasStorageService.syncRemoteStorageAsync().catch(err => {
      console.error('[NasRoutes] Background sync error:', err);
    });

    return res.json({
      success: true,
      message: 'NAS 远程曲库增量同步任务已在后台启动',
      progress: nasStorageService.getProgress()
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || '启动同步任务失败' });
  }
});

/**
 * GET /api/nas/status
 * Get real-time synchronization progress
 */
router.get('/status', (req: Request, res: Response) => {
  try {
    const progress = nasStorageService.getProgress();
    const config = nasStorageService.getConfig();
    return res.json({
      success: true,
      progress,
      lastSyncTime: config.lastSyncTime,
      lastSyncResult: config.lastSyncResult
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
