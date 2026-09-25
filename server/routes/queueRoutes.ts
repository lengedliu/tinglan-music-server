import { Router, Request, Response } from 'express';
import { queueEngine, QueueLoopMode } from '../core/queueEngine.js';
import { playbackCheckpointRepository } from '../core/repositories/playbackCheckpointRepository.js';

export interface QueueRouterOptions {
  getTargetDevice: (did?: string) => { did: string; name: string } | undefined;
  getAllDevices?: () => any[];
}

/**
 * Clean domain router for QueueEngine playback and queue manipulation endpoints
 */
export function createQueueRouter(options: QueueRouterOptions): Router {
  const router = Router();

  // Get current play queue status
  router.get('/', (req: Request, res: Response) => {
    res.json({
      success: true,
      data: queueEngine.getStatus()
    });
  });

  // Phase 3: Seamless cross-speaker playback handover
  router.post('/transfer', async (req: Request, res: Response) => {
    const { targetDid, positionSeconds } = req.body;
    if (!targetDid) {
      return res.status(400).json({ success: false, error: '目标音箱 DID 不能为空' });
    }
    const targetDev = options.getTargetDevice(targetDid);
    const targetName = targetDev ? targetDev.name : '小爱音箱';

    const result = await queueEngine.transferPlayback(
      targetDid,
      targetName,
      typeof positionSeconds === 'number' ? positionSeconds : undefined
    );

    res.json({
      success: result.success,
      message: result.message,
      elapsedSeconds: result.elapsedSeconds,
      currentSong: result.song,
      data: queueEngine.getStatus()
    });
  });

  // Phase 3: Get available handover target devices
  router.get('/handover-targets', (req: Request, res: Response) => {
    const allDevs = options.getAllDevices ? options.getAllDevices() : [];
    const currentDid = queueEngine.getStatus().targetDid;
    const candidates = allDevs
      .filter((d: any) => d.did !== currentDid && (d.isOnline || d.online || d.ip))
      .map((d: any) => ({
        did: d.did,
        name: d.name,
        model: d.model,
        ip: d.ip,
        isOnline: Boolean(d.isOnline || d.online)
      }));
    res.json({
      success: true,
      currentDid,
      devices: candidates
    });
  });

  // Play entire playlist or songs list on speaker
  router.post('/play-all', async (req: Request, res: Response) => {
    const { songs, startIndex, did, mode } = req.body;
    if (!Array.isArray(songs) || songs.length === 0) {
      return res.status(400).json({ success: false, error: '歌曲列表不能为空' });
    }

    const targetDev = options.getTargetDevice(did);
    const targetDid = targetDev ? targetDev.did : (did || '');
    const deviceName = targetDev ? targetDev.name : '小爱音箱';

    const result = await queueEngine.playQueue(
      songs,
      startIndex || 0,
      targetDid,
      deviceName,
      mode as QueueLoopMode
    );

    res.json({
      success: result.success,
      message: result.message,
      currentSong: result.currentSong,
      data: queueEngine.getStatus()
    });
  });

  // Next song in active queue
  router.post('/next', async (req: Request, res: Response) => {
    const result = await queueEngine.next(true);
    res.json({
      success: result.success,
      message: result.message,
      song: result.song,
      data: queueEngine.getStatus()
    });
  });

  // Previous song in active queue
  router.post('/prev', async (req: Request, res: Response) => {
    const result = await queueEngine.prev();
    res.json({
      success: result.success,
      message: result.message,
      song: result.song,
      data: queueEngine.getStatus()
    });
  });

  // Jump to specific index in queue
  router.post('/jump', async (req: Request, res: Response) => {
    const { index } = req.body;
    const result = await queueEngine.jumpTo(Number(index) || 0);
    res.json({
      success: result.success,
      message: result.message,
      song: result.song,
      data: queueEngine.getStatus()
    });
  });

  // Update loop mode
  router.post('/mode', (req: Request, res: Response) => {
    const { mode } = req.body;
    if (mode && ['all', 'one', 'shuffle'].includes(mode)) {
      queueEngine.setLoopMode(mode);
    }
    res.json({
      success: true,
      mode,
      data: queueEngine.getStatus()
    });
  });

  // Remove song from queue
  router.post('/remove', (req: Request, res: Response) => {
    const { songId } = req.body;
    const ok = queueEngine.removeSong(songId);
    res.json({
      success: ok,
      data: queueEngine.getStatus()
    });
  });

  // Insert a song to play next
  router.post('/insert-next', (req: Request, res: Response) => {
    const { song } = req.body;
    if (!song || !song.id) {
      return res.status(400).json({ success: false, error: '歌曲信息缺失' });
    }
    const ok = queueEngine.insertNext(song);
    res.json({
      success: ok,
      data: queueEngine.getStatus()
    });
  });

  // Reorder queue item
  router.post('/reorder', (req: Request, res: Response) => {
    const { fromIndex, toIndex } = req.body;
    const ok = queueEngine.reorder(Number(fromIndex), Number(toIndex));
    res.json({
      success: ok,
      data: queueEngine.getStatus()
    });
  });

  // Replace entire queue
  router.post('/replace', (req: Request, res: Response) => {
    const { queue, currentIndex } = req.body;
    if (!Array.isArray(queue)) {
      return res.status(400).json({ success: false, error: '队列必须是数组' });
    }
    const ok = queueEngine.replaceQueue(queue, currentIndex);
    res.json({
      success: ok,
      data: queueEngine.getStatus()
    });
  });

  // Clear queue
  router.post('/clear', (req: Request, res: Response) => {
    queueEngine.clear();
    res.json({
      success: true,
      data: queueEngine.getStatus()
    });
  });

  // Pause queue
  router.post('/pause', (req: Request, res: Response) => {
    queueEngine.pause();
    res.json({
      success: true,
      data: queueEngine.getStatus()
    });
  });

  // Resume queue
  router.post('/resume', (req: Request, res: Response) => {
    queueEngine.resume();
    res.json({
      success: true,
      data: queueEngine.getStatus()
    });
  });

  // P3: Save playback checkpoint
  router.post('/checkpoint', (req: Request, res: Response) => {
    try {
      const { deviceDid, songId, positionSeconds, durationSeconds, queueContext } = req.body;
      const clientUser = (req as any).user;
      if (!songId) {
        return res.status(400).json({ success: false, error: '缺少歌曲 ID' });
      }
      const saved = playbackCheckpointRepository.saveCheckpoint({
        deviceDid,
        userId: clientUser?.id,
        songId,
        positionSeconds: Number(positionSeconds) || 0,
        durationSeconds: Number(durationSeconds) || 0,
        queueContext
      });
      res.json({ success: true, checkpoint: saved });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // P3: Get latest playback checkpoint
  router.get('/checkpoint', (req: Request, res: Response) => {
    try {
      const did = req.query.did as string | undefined;
      const clientUser = (req as any).user;
      const checkpoint = playbackCheckpointRepository.getCheckpoint(did, clientUser?.id);
      res.json({ success: true, checkpoint: checkpoint || null });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
