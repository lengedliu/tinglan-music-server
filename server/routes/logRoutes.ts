import { Router, Request, Response } from 'express';
import { logEngine, LogCategory, LogLevel } from '../core/logEngine.js';

export function createLogRouter() {
  const router = Router();

  // GET /api/logs - Query logs
  router.get('/logs', (req: Request, res: Response) => {
    try {
      const category = (req.query.category as LogCategory | 'all') || 'all';
      const level = (req.query.level as LogLevel | 'all') || 'all';
      const search = (req.query.search as string) || '';
      const traceId = (req.query.traceId as string) || '';
      const limit = parseInt(req.query.limit as string, 10) || 200;
      const offset = parseInt(req.query.offset as string, 10) || 0;

      const result = logEngine.query({
        category,
        level,
        search,
        traceId,
        limit,
        offset
      });

      res.json({
        success: true,
        ...result
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/logs/stats - Stats
  router.get('/logs/stats', (req: Request, res: Response) => {
    try {
      res.json({
        success: true,
        stats: logEngine.getStats()
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/logs/export - Diagnostic export report
  router.get('/logs/export', (req: Request, res: Response) => {
    try {
      const report = logEngine.exportDiagnostics();
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="diagnostics_${Date.now()}.json"`);
      res.send(JSON.stringify(report, null, 2));
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/logs/prune - Prune database logs
  router.post('/logs/prune', (req: Request, res: Response) => {
    try {
      const keep = parseInt(req.body?.keep as string, 10) || 5000;
      logEngine.pruneSqliteDatabase(keep);
      logEngine.info('system', '日志数据库归档修剪', `已执行日志持久化数据库修剪，保留最近 ${keep} 条记录`, {
        clientIp: req.ip
      });
      res.json({ success: true, message: `已修剪日志，保留最近 ${keep} 条` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // DELETE /api/logs - Clear all logs
  router.delete('/logs', (req: Request, res: Response) => {
    try {
      logEngine.clear();
      logEngine.info('audit', '日志中心清空', '管理员或用户手动清空了所有运行诊断与审计日志', {
        clientIp: req.ip
      });
      res.json({ success: true, message: '日志中心已清空' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
