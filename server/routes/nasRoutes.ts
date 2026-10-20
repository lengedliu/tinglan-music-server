import express, { Request, Response } from 'express';
import { nasStorageService } from '../core/nasStorageService.js';

const router = express.Router();

// [Fix B5] These route families had NO role checks: /config returned the full
// NAS/WebDAV config INCLUDING the plaintext password to any authenticated
// low-priv user (and to anonymous visitors in no-auth mode), /save accepted
// arbitrary config writes and /test performed arbitrary connection probes.
// Admin-only, enforced even when the system runs in no-auth mode (secret
// exposure + config rewrite = same class as the system backup endpoints).
// /sync and /status stay "any authenticated" — they are progress/operation
// endpoints invoked by external automation (AI Skill webhook callback), and
// /status scrubs credentials from its response instead of gating them away.
const requireAdmin = (req: Request, res: Response): boolean => {
  const clientUser = (req as any).user;
  if (!clientUser || clientUser.role !== 'admin') {
    res.status(403).json({
      success: false,
      error: '权限不足：NAS 存储配置属于管理员专属操作，请以管理员账号登录后使用'
    });
    return false;
  }
  return true;
};

/** [Fix B5] Never hand NAS/WebDAV credentials back through progress endpoints. */
const scrubNasConfig = (config: any) => {
  if (!config || typeof config !== 'object') return config;
  const safe = { ...config };
  delete safe.password;
  return safe;
};

/**
 * GET /api/nas/config
 * Get current NAS configuration & last sync status
 */
router.get('/config', (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
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
    if (!requireAdmin(req, res)) return;
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
    if (!requireAdmin(req, res)) return;
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
      // [Fix B5] Full config used to leak the WebDAV password to any viewer of
      // this progress endpoint — hand out a scrubbed copy instead.
      config: scrubNasConfig(config),
      lastSyncTime: config.lastSyncTime,
      lastSyncResult: config.lastSyncResult
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
