import { Router, Request, Response } from 'express';
import { automationService } from '../services/automationService.js';

export function createAutomationRouter(): Router {
  const router = Router();

  // GET /api/automation/scenes - 获取所有定时场景
  router.get('/scenes', (_req: Request, res: Response) => {
    res.json({
      success: true,
      scenes: automationService.getScenes()
    });
  });

  // POST /api/automation/scenes - 保存/新建/更新场景
  router.post('/scenes', (req: Request, res: Response) => {
    try {
      const { name, cronExpr, description, actionType, targetType, targetId, payload, enabled, id } = req.body;
      if (!name || !cronExpr) {
        res.status(400).json({ success: false, error: '场景名称与 Cron 表达式不能为空' });
        return;
      }

      const saved = automationService.saveScene({
        id,
        name,
        cronExpr,
        description,
        actionType,
        targetType,
        targetId,
        payload,
        enabled
      });

      res.json({ success: true, scene: saved });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // POST /api/automation/scenes/:id/toggle - 切换状态
  router.post('/scenes/:id/toggle', (req: Request, res: Response) => {
    const { enabled } = req.body;
    const scene = automationService.toggleScene(req.params.id, enabled);
    if (!scene) {
      res.status(404).json({ success: false, error: '场景未找到' });
      return;
    }
    res.json({ success: true, scene });
  });

  // DELETE /api/automation/scenes/:id - 删除场景
  router.delete('/scenes/:id', (req: Request, res: Response) => {
    const deleted = automationService.deleteScene(req.params.id);
    res.json({ success: deleted });
  });

  // POST /api/automation/scenes/:id/trigger - 手动触发测试场景
  router.post('/scenes/:id/trigger', async (req: Request, res: Response) => {
    try {
      const result = await automationService.triggerSceneManually(req.params.id);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // GET /api/automation/logs - 获取场景日志
  router.get('/logs', (_req: Request, res: Response) => {
    res.json({
      success: true,
      logs: automationService.getLogs()
    });
  });

  return router;
}
