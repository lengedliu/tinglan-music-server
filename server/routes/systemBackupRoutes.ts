import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { loadJson, saveJson } from '../storage/jsonStorage.js';

export function createSystemBackupRouter(): Router {
  const router = Router();
  const dataDir = path.join(process.cwd(), 'data');
  const snapshotsDir = path.join(dataDir, 'backups');

  if (!fs.existsSync(snapshotsDir)) {
    try { fs.mkdirSync(snapshotsDir, { recursive: true }); } catch {}
  }

  // GET /api/system/export-backup - 全量系统配置与家庭数据导出 JSON
  router.get('/export-backup', (_req: Request, res: Response) => {
    try {
      const backupData = {
        version: '3.5.0',
        exportedAt: new Date().toISOString(),
        config: loadJson(path.join(dataDir, 'config.json'), {}),
        devices: loadJson(path.join(dataDir, 'devices.json'), []),
        groups: loadJson(path.join(dataDir, 'groups.json'), []),
        slangRules: loadJson(path.join(dataDir, 'slang_rules.json'), []),
        podcasts: loadJson(path.join(dataDir, 'podcast_subscriptions.json'), []),
        radios: loadJson(path.join(dataDir, 'radio_stations.json'), []),
        automationScenes: loadJson(path.join(dataDir, 'automation_scenes.json'), []),
        familyUsers: loadJson(path.join(dataDir, 'family_users.json'), []),
        userFavorites: loadJson(path.join(dataDir, 'user_favorites.json'), {}),
        playlists: loadJson(path.join(dataDir, 'playlists.json'), []),
        nasConfig: loadJson(path.join(dataDir, 'nas_config.json'), {}),
        securitySettings: loadJson(path.join(dataDir, 'security.json'), {})
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=tinglan_full_dr_backup_${Date.now()}.json`);
      res.send(JSON.stringify(backupData, null, 2));
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // POST /api/system/restore-backup - 导入并恢复全量家庭灾备 JSON
  router.post('/restore-backup', (req: Request, res: Response) => {
    try {
      const backupData = req.body;
      if (!backupData || typeof backupData !== 'object') {
        res.status(400).json({ success: false, error: '无效的备份数据格式' });
        return;
      }

      let restoredCount = 0;

      if (backupData.config) {
        saveJson(path.join(dataDir, 'config.json'), backupData.config, true);
        restoredCount++;
      }
      if (Array.isArray(backupData.devices)) {
        saveJson(path.join(dataDir, 'devices.json'), backupData.devices, true);
        restoredCount++;
      }
      if (Array.isArray(backupData.groups)) {
        saveJson(path.join(dataDir, 'groups.json'), backupData.groups, true);
        restoredCount++;
      }
      if (Array.isArray(backupData.slangRules)) {
        saveJson(path.join(dataDir, 'slang_rules.json'), backupData.slangRules, true);
        restoredCount++;
      }
      if (Array.isArray(backupData.podcasts)) {
        saveJson(path.join(dataDir, 'podcast_subscriptions.json'), backupData.podcasts, true);
        restoredCount++;
      }
      if (Array.isArray(backupData.radios)) {
        saveJson(path.join(dataDir, 'radio_stations.json'), backupData.radios, true);
        restoredCount++;
      }
      if (Array.isArray(backupData.automationScenes)) {
        saveJson(path.join(dataDir, 'automation_scenes.json'), backupData.automationScenes, true);
        restoredCount++;
      }
      if (Array.isArray(backupData.familyUsers)) {
        saveJson(path.join(dataDir, 'family_users.json'), backupData.familyUsers, true);
        restoredCount++;
      }
      if (backupData.userFavorites && typeof backupData.userFavorites === 'object') {
        saveJson(path.join(dataDir, 'user_favorites.json'), backupData.userFavorites, true);
        restoredCount++;
      }
      if (Array.isArray(backupData.playlists)) {
        saveJson(path.join(dataDir, 'playlists.json'), backupData.playlists, true);
        restoredCount++;
      }
      if (backupData.nasConfig && typeof backupData.nasConfig === 'object') {
        saveJson(path.join(dataDir, 'nas_config.json'), backupData.nasConfig, true);
        restoredCount++;
      }
      if (backupData.securitySettings && typeof backupData.securitySettings === 'object') {
        saveJson(path.join(dataDir, 'security.json'), backupData.securitySettings, true);
        restoredCount++;
      }

      res.json({
        success: true,
        message: `全量云端灾备复原成功！已恢复 ${restoredCount} 项核心模块数据，刷新即可生效`,
        version: backupData.version || '3.5.0'
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // GET /api/system/snapshots - 获取本地灾备快照列表
  router.get('/snapshots', (_req: Request, res: Response) => {
    try {
      if (!fs.existsSync(snapshotsDir)) {
        return res.json({ success: true, snapshots: [] });
      }
      const files = fs.readdirSync(snapshotsDir).filter(f => f.endsWith('.json'));
      const snapshots = files.map(filename => {
        const filePath = path.join(snapshotsDir, filename);
        const stat = fs.statSync(filePath);
        return {
          filename,
          sizeKb: (stat.size / 1024).toFixed(1),
          createdAt: stat.mtimeMs
        };
      }).sort((a, b) => b.createdAt - a.createdAt);

      res.json({ success: true, snapshots });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // POST /api/system/snapshots/create - 生成全量 DR 灾备快照
  router.post('/snapshots/create', (_req: Request, res: Response) => {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `dr_snapshot_${timestamp}.json`;
      const filePath = path.join(snapshotsDir, filename);

      const snapshotData = {
        version: '3.5.0',
        exportedAt: new Date().toISOString(),
        config: loadJson(path.join(dataDir, 'config.json'), {}),
        devices: loadJson(path.join(dataDir, 'devices.json'), []),
        groups: loadJson(path.join(dataDir, 'groups.json'), []),
        slangRules: loadJson(path.join(dataDir, 'slang_rules.json'), []),
        podcasts: loadJson(path.join(dataDir, 'podcast_subscriptions.json'), []),
        radios: loadJson(path.join(dataDir, 'radio_stations.json'), []),
        automationScenes: loadJson(path.join(dataDir, 'automation_scenes.json'), []),
        familyUsers: loadJson(path.join(dataDir, 'family_users.json'), []),
        userFavorites: loadJson(path.join(dataDir, 'user_favorites.json'), {}),
        playlists: loadJson(path.join(dataDir, 'playlists.json'), []),
        nasConfig: loadJson(path.join(dataDir, 'nas_config.json'), {})
      };

      fs.writeFileSync(filePath, JSON.stringify(snapshotData, null, 2), 'utf-8');

      res.json({
        success: true,
        filename,
        message: `成功生成全量灾备快照: ${filename}`
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  return router;
}

