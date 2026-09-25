import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { loadJson, saveJson } from '../storage/jsonStorage.js';

export function createSystemBackupRouter(): Router {
  const router = Router();
  const dataDir = path.join(process.cwd(), 'data');

  // GET /api/system/export-backup - 全量系统配置导出 JSON
  router.get('/export-backup', (_req: Request, res: Response) => {
    try {
      const backupData = {
        version: '3.0.0',
        exportedAt: new Date().toISOString(),
        config: loadJson(path.join(dataDir, 'config.json'), {}),
        devices: loadJson(path.join(dataDir, 'devices.json'), []),
        groups: loadJson(path.join(dataDir, 'groups.json'), []),
        slangRules: loadJson(path.join(dataDir, 'slang_rules.json'), []),
        podcasts: loadJson(path.join(dataDir, 'podcast_subscriptions.json'), []),
        radios: loadJson(path.join(dataDir, 'radio_stations.json'), []),
        automationScenes: loadJson(path.join(dataDir, 'automation_scenes.json'), [])
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=tinglan_cluster_backup_${Date.now()}.json`);
      res.send(JSON.stringify(backupData, null, 2));
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // POST /api/system/restore-backup - 导入并恢复集群全量 JSON
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

      res.json({
        success: true,
        message: `成功恢复 ${restoredCount} 项模块配置，建议刷新页面或重启服务生效`,
        version: backupData.version || '3.0.0'
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  return router;
}
