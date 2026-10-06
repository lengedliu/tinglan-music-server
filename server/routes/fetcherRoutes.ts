import { Router, Request, Response } from 'express';
import { musicAutoFetcherService } from '../core/musicAutoFetcherService.js';

export function createFetcherRoutes(): Router {
  const router = Router();

  // Get all tasks and summary
  router.get('/tasks', (_req: Request, res: Response) => {
    try {
      const tasks = musicAutoFetcherService.getAllTasks();
      const activeCount = tasks.filter(t => t.status === 'downloading' || t.status === 'searching' || t.status === 'queued').length;
      const completedCount = tasks.filter(t => t.status === 'completed').length;
      res.json({
        success: true,
        tasks,
        stats: {
          total: tasks.length,
          active: activeCount,
          completed: completedCount
        }
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Enqueue a download task
  router.post('/tasks', (req: Request, res: Response) => {
    try {
      const { title, artist, album, genre, qualityPreference, driver } = req.body || {};
      if (!title || !title.trim()) {
        return res.status(400).json({ success: false, error: '请提供有效的歌曲名称' });
      }

      const task = musicAutoFetcherService.enqueueTask({
        title: title.trim(),
        artist: (artist || '华语群星').trim(),
        album: album ? album.trim() : undefined,
        genre: genre ? genre.trim() : undefined,
        requestedBy: 'web_user',
        qualityPreference,
        driver
      });

      res.json({
        success: true,
        task,
        message: `已将《${task.title}》加入下载队列`
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Retry a task
  router.post('/tasks/:id/retry', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const ok = musicAutoFetcherService.retryTask(id);
      if (!ok) {
        return res.status(404).json({ success: false, error: '任务不存在' });
      }
      res.json({ success: true, message: '已重新调度任务' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Delete a task
  router.delete('/tasks/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const ok = musicAutoFetcherService.deleteTask(id);
      res.json({ success: ok, message: ok ? '任务已删除' : '任务不存在' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Clear completed and failed tasks
  router.post('/tasks/clear-completed', (_req: Request, res: Response) => {
    try {
      const count = musicAutoFetcherService.clearCompletedTasks();
      res.json({ success: true, count, message: `已清理 ${count} 条已完成任务` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get fetcher config
  router.get('/config', (_req: Request, res: Response) => {
    try {
      const config = musicAutoFetcherService.getConfig();
      res.json({ success: true, config });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Update fetcher config
  router.post('/config', (req: Request, res: Response) => {
    try {
      const updated = musicAutoFetcherService.saveConfig(req.body || {});
      res.json({ success: true, config: updated, message: '配置已更新' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
