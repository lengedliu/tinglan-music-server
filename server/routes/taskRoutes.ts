import { Router, Request, Response } from 'express';
import { scheduledTaskRepository, ScheduledTask } from '../core/repositories/scheduledTaskRepository.js';
import { taskSchedulerEngine } from '../core/taskSchedulerEngine.js';
import { appEventBus } from '../core/eventBus.js';

export function createTaskRouter(): Router {
  const router = Router();

  // 1. Get all scheduled tasks
  router.get('/', (req: Request, res: Response) => {
    try {
      const tasks = scheduledTaskRepository.getAllTasks();
      return res.json({
        success: true,
        tasks
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // 2. Create or Update a scheduled task
  router.post('/', (req: Request, res: Response) => {
    try {
      const body = req.body;
      if (!body.title || !body.targetDid || !body.type || !body.action) {
        return res.status(400).json({ success: false, error: '缺少必要参数 (title, targetDid, type, action)' });
      }

      const clientUser = (req as any).user;
      const id = body.id || `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const task: ScheduledTask = {
        id,
        userId: clientUser?.id || body.userId,
        title: body.title,
        type: body.type, // 'sleep_timer' | 'alarm' | 'routine'
        cronExpr: body.cronExpr,
        targetTime: body.targetTime,
        targetDid: body.targetDid,
        targetDeviceName: body.targetDeviceName,
        playlistId: body.playlistId,
        songId: body.songId,
        action: body.action, // 'pause' | 'play_song' | 'play_playlist' | 'volume_fade' | 'tts_alarm'
        volume: body.volume !== undefined ? Number(body.volume) : undefined,
        fadeDurationSeconds: body.fadeDurationSeconds ? Number(body.fadeDurationSeconds) : 0,
        repeatDays: Array.isArray(body.repeatDays) ? body.repeatDays : undefined,
        isEnabled: body.isEnabled !== undefined ? Boolean(body.isEnabled) : true,
        ttsText: body.ttsText,
        createdAt: body.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const saved = scheduledTaskRepository.upsertTask(task);
      appEventBus.broadcast('task:change', { action: 'upsert', task: saved });
      return res.json({
        success: true,
        message: '定时任务已成功保存',
        task: saved
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // 3. Toggle task enabled state
  router.post('/:id/toggle', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const task = scheduledTaskRepository.getTaskById(id);
      if (!task) {
        return res.status(404).json({ success: false, error: '未找到该定时任务' });
      }
      task.isEnabled = !task.isEnabled;
      scheduledTaskRepository.upsertTask(task);
      appEventBus.broadcast('task:change', { action: 'toggle', task });
      return res.json({
        success: true,
        message: `任务已${task.isEnabled ? '启用' : '停用'}`,
        task
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // 4. Delete task
  router.delete('/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const ok = scheduledTaskRepository.deleteTask(id);
      if (!ok) {
        return res.status(404).json({ success: false, error: '任务不存在或已删除' });
      }
      appEventBus.broadcast('task:change', { action: 'delete', taskId: id });
      return res.json({
        success: true,
        message: '定时任务已成功删除'
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // 5. Test execute task immediately
  router.post('/:id/execute-now', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const task = scheduledTaskRepository.getTaskById(id);
      if (!task) {
        return res.status(404).json({ success: false, error: '未找到该任务' });
      }
      await taskSchedulerEngine.executeTask(task);
      return res.json({
        success: true,
        message: `已立即触发执行定时任务 [${task.title}]`
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
