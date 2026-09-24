import { Router, Request, Response } from 'express';
import { queueEngine, QueueLoopMode } from '../core/queueEngine.js';

export interface QueueRouterOptions {
  getTargetDevice: (did?: string) => { did: string; name: string } | undefined;
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

  return router;
}
