import { Router, Request, Response } from 'express';
import { Readable } from 'stream';
import { radioService } from '../services/radioService.js';
import { deviceRepository } from '../core/repositories/deviceRepository.js';
import { xiaomiAdapter } from '../xiaomi/xiaomiAdapter.js';
import { sendMiioCommand, callMinaCloudApi, addCastLog } from '../xiaomi/miotService.js';
import { isSafeRemoteStreamUrl } from '../core/security.js';

export interface RadioRouterOptions {
  getMiotConfig: () => any;
  setMiotConfig: (cfg: any) => void;
}

async function relayRemoteStream(remoteUrl: string, req: Request, res: Response) {
  if (!isSafeRemoteStreamUrl(remoteUrl)) {
    return res.status(403).json({ success: false, error: '非法或受限制的电台外部流地址' });
  }

  const abortController = new AbortController();
  req.on('close', () => {
    try { abortController.abort(); } catch {}
  });

  const forwardHeaders: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 TingLan-RadioRelay',
    'Accept': '*/*'
  };
  if (req.headers.range) {
    forwardHeaders['Range'] = String(req.headers.range);
  }

  try {
    const upstreamRes = await fetch(remoteUrl, {
      headers: forwardHeaders,
      signal: abortController.signal
    });

    if (!upstreamRes.ok && upstreamRes.status !== 206) {
      return res.status(upstreamRes.status).json({ success: false, error: `电台源响应异常 (HTTP ${upstreamRes.status})` });
    }

    const rawContentType = upstreamRes.headers.get('content-type') || '';
    const isHlsPlaylist = /mpegurl|\.m3u8/i.test(rawContentType) || /\.m3u8($|\?)/i.test(remoteUrl);

    if (isHlsPlaylist) {
      const playlistText = await upstreamRes.text();
      const baseUrl = new URL(remoteUrl);
      const rewrittenPlaylist = playlistText.split('\n').map(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;
        try {
          const fullSegmentUrl = new URL(trimmed, baseUrl).toString();
          return `/api/radio/proxy?url=${encodeURIComponent(fullSegmentUrl)}`;
        } catch {
          return line;
        }
      }).join('\n');

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Accept-Ranges');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.send(rewrittenPlaylist);
    }

    const contentType = rawContentType || 'audio/mpeg';
    const contentLength = upstreamRes.headers.get('content-length');
    const contentRange = upstreamRes.headers.get('content-range');
    const acceptRanges = upstreamRes.headers.get('accept-ranges') || 'bytes';

    res.status(upstreamRes.status);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Accept-Ranges');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Accept-Ranges', acceptRanges);

    if (contentLength) res.setHeader('Content-Length', contentLength);
    if (contentRange) res.setHeader('Content-Range', contentRange);

    if (req.method === 'HEAD') {
      return res.end();
    }

    if (upstreamRes.body) {
      const nodeStream = Readable.fromWeb(upstreamRes.body as any);
      nodeStream.on('error', () => {
        if (!res.headersSent) {
          try { res.status(502).end(); } catch {}
        }
      });
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (err: any) {
    if (abortController.signal.aborted) return;
    if (!res.headersSent) {
      res.status(502).json({ success: false, error: `拉取电台直播流失败: ${err.message}` });
    }
  }
}

export function createRadioRouter(options: RadioRouterOptions): Router {
  const router = Router();
  const { getMiotConfig, setMiotConfig } = options;

  // GET /api/radio/stream/:id - Stream station with proxy relay and backup failover
  router.get('/stream/:id', async (req: Request, res: Response) => {
    try {
      const rawId = req.params.id.replace(/\.m3u8$|\.mp3$/, '');
      const station = radioService.getStationById(rawId);
      if (!station) {
        return res.status(404).json({ success: false, error: '未找到指定的网络电台' });
      }

      // Try main URL first
      try {
        await relayRemoteStream(station.url, req, res);
      } catch (err: any) {
        // Fallback to backup URLs if available
        if (station.backupUrls && station.backupUrls.length > 0 && !res.headersSent) {
          for (const backupUrl of station.backupUrls) {
            try {
              await relayRemoteStream(backupUrl, req, res);
              return;
            } catch {}
          }
        }
        if (!res.headersSent) {
          res.status(502).json({ success: false, error: `电台主备源均无法连接: ${err.message}` });
        }
      }
    } catch (e: any) {
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: e.message });
      }
    }
  });

  // GET /api/radio/proxy?url=... - Generic audio/m3u8 stream proxy
  router.get('/proxy', async (req: Request, res: Response) => {
    try {
      const targetUrl = String(req.query.url || '').trim();
      if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
        return res.status(400).json({ success: false, error: '请提供合法的 HTTP/HTTPS 音频源 URL' });
      }
      await relayRemoteStream(targetUrl, req, res);
    } catch (e: any) {
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: e.message });
      }
    }
  });

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
      
      // Resolve stream URL for XiaoAi speaker casting
      let finalAudioUrl = audioUrl;
      const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
      const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || req.get('host') || '';
      const serverBase = miotConfig.serverHost ? miotConfig.serverHost.replace(/\/+$/, '') : (host ? `${proto}://${host}` : '');

      if (finalAudioUrl.startsWith('/api/')) {
        finalAudioUrl = `${serverBase}${finalAudioUrl}`;
      }

      const castResult = await xiaomiAdapter.playUrl(
        targetDevice,
        finalAudioUrl,
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
          detail: `音频源: ${finalAudioUrl} | 协议: ${castResult.protocol}`,
          success: true,
          did: targetDevice.did,
          ip: targetDevice.ip,
          model: targetDevice.model,
          streamUrl: finalAudioUrl
        });
      }

      res.json({ success: castResult.success, result: castResult, streamUrl: finalAudioUrl });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  return router;
}
