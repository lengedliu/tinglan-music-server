import { Router, Request, Response } from 'express';
import { radioService } from '../services/radioService.js';
import { deviceRepository } from '../core/repositories/deviceRepository.js';
import { xiaomiAdapter } from '../xiaomi/xiaomiAdapter.js';
import { sendMiioCommand, callMinaCloudApi, addCastLog } from '../xiaomi/miotService.js';

export interface RadioRouterOptions {
  getMiotConfig: () => any;
  setMiotConfig: (cfg: any) => void;
}

export function createRadioRouter(options: RadioRouterOptions): Router {
  const router = Router();
  const { getMiotConfig, setMiotConfig } = options;

  // GET /api/radio/stations
  router.get('/stations', (req: Request, res: Response) => {
    try {
      const stations = radioService.getAllStations();
      res.json({ success: true, stations });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // POST /api/radio/stations
  router.post('/stations', (req: Request, res: Response) => {
    try {
      const { name, url, category, logoUrl, description, bitrate } = req.body;
      if (!name || !url) {
        res.status(400).json({ success: false, error: '电台名称与直播流 URL 不能为空' });
        return;
      }
      const station = radioService.addCustomStation({
        name,
        url,
        category: category || 'custom',
        logoUrl,
        description,
        bitrate
      });
      res.json({ success: true, station });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // DELETE /api/radio/stations/:id
  router.delete('/stations/:id', (req: Request, res: Response) => {
    try {
      const deleted = radioService.deleteCustomStation(req.params.id);
      res.json({ success: deleted });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // GET /api/radio/podcasts
  router.get('/podcasts', (req: Request, res: Response) => {
    try {
      const podcasts = radioService.getPodcasts();
      res.json({ success: true, podcasts });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // POST /api/radio/podcasts/parse-rss
  router.post('/podcasts/parse-rss', async (req: Request, res: Response) => {
    try {
      const { rssUrl } = req.body;
      if (!rssUrl) {
        res.status(400).json({ success: false, error: '请提供有效的播客 RSS 订阅 URL' });
        return;
      }
      const parsed = await radioService.parseRssFeed(rssUrl);
      res.json({ success: true, podcast: parsed });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // POST /api/radio/podcasts
  router.post('/podcasts', (req: Request, res: Response) => {
    try {
      const { title, rssUrl, author, description, coverUrl, link, episodesCount } = req.body;
      if (!title || !rssUrl) {
        res.status(400).json({ success: false, error: '播客标题与 RSS 地址不能为空' });
        return;
      }
      const pod = radioService.addPodcastSubscription({
        title,
        rssUrl,
        author,
        description,
        coverUrl,
        link,
        episodesCount
      });
      res.json({ success: true, podcast: pod });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // DELETE /api/radio/podcasts/:id
  router.delete('/podcasts/:id', (req: Request, res: Response) => {
    try {
      const deleted = radioService.deletePodcastSubscription(req.params.id);
      res.json({ success: deleted });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // POST /api/radio/cast
  router.post('/cast', async (req: Request, res: Response) => {
    try {
      const { deviceId, title, artist, audioUrl, coverUrl } = req.body;
      if (!deviceId || !audioUrl) {
        res.status(400).json({ success: false, error: '请选择目标音箱设备并提供音频地址' });
        return;
      }

      const devices = deviceRepository.getAllDevices();
      const targetDevice = devices.find((d: any) => d.did === deviceId) || devices[0];
      if (!targetDevice) {
        res.status(400).json({ success: false, error: '未找到选定的音箱设备' });
        return;
      }

      const miotConfig = getMiotConfig();
      const castResult = await xiaomiAdapter.playUrl(
        targetDevice,
        audioUrl,
        title || '网络电台/播客流',
        (path, method, msg, tDid, retry) => callMinaCloudApi(path, method, msg, tDid, retry, miotConfig, setMiotConfig),
        (ip, token, method, params, timeoutMs) => sendMiioCommand(ip, token, method, params, timeoutMs || 2500),
        miotConfig,
        { songArtist: artist || '广播播客', duration: 0 }
      );

      if (castResult.success) {
        addCastLog({
          id: `log_radio_${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          type: 'cast',
          message: `【网络电台/播客投播】《${title}》->【${targetDevice.name}】`,
          detail: `音频源: ${audioUrl} | 协议: ${castResult.protocol}`,
          success: true,
          did: targetDevice.did,
          ip: targetDevice.ip,
          model: targetDevice.model,
          streamUrl: audioUrl
        });
      }

      res.json({ success: castResult.success, result: castResult });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  return router;
}
