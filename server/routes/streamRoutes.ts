import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { Song } from '../core/musicEngine.js';
import { FfmpegTranscoder } from '../streaming/ffmpegTranscoder.js';
import { StreamServer } from '../streaming/streamServer.js';
import { transcodeSemaphorePool } from '../streaming/transcodeSemaphore.js';
import { queueEngine } from '../core/queueEngine.js';
import { ttsEngine, POPULAR_TTS_VOICES } from '../ttsEngine.js';

export interface StreamEventInfo {
  timestamp: string;
  timeMs: number;
  songId: string;
  clientIp: string;
  isBrowser: boolean;
  userAgent: string;
  status: number;
  format: string;
  bytesSent?: number;
  streamUrl?: string;
  path?: string;
}

export interface StreamRouterOptions {
  musicDir: string;
  dataDir: string;
  port: number;
  audioTranscoder: FfmpegTranscoder;
  streamServer: StreamServer;
  getStoredSongs: () => Song[];
  getNavidromeConfig: () => any;
  getXiaomiDevices: () => any[];
  getMiotConfig: () => any;
  saveMiotConfig: (cfg: any) => void;
  verifyStreamToken: (songId: string, token: string) => boolean;
  isSafeRemoteStreamUrl: (url: string) => boolean;
  getSubsonicAuthQuery: (user: string, pass: string, apiVer?: string) => string;
  getSubsonicPassAuthQuery: (user: string, pass: string, apiVer?: string) => string;
  logCastAction?: (log: any) => void;
}

export function createStreamRouter(options: StreamRouterOptions) {
  const router = Router();
  const recentStreamEvents: StreamEventInfo[] = [];

  // Active Stream IPs tracker
  const activeStreamIpsTracker = new Map<string, number>();
  const activeStreamIps = {
    add(ip: string) {
      if (!ip) return this;
      const cleanIp = String(ip).replace(/^::ffff:/, '').trim();
      activeStreamIpsTracker.set(cleanIp, Date.now());
      return this;
    },
    has(ip: string): boolean {
      const cleanIp = String(ip).replace(/^::ffff:/, '').trim();
      const last = activeStreamIpsTracker.get(cleanIp);
      if (!last) return false;
      if (Date.now() - last > 5 * 60 * 1000) {
        activeStreamIpsTracker.delete(cleanIp);
        return false;
      }
      return true;
    },
    delete(ip: string): boolean {
      const cleanIp = String(ip).replace(/^::ffff:/, '').trim();
      return activeStreamIpsTracker.delete(cleanIp);
    },
    clear(): void {
      activeStreamIpsTracker.clear();
    },
    get size(): number {
      return this.toArray().length;
    },
    toArray(): string[] {
      const now = Date.now();
      const TTL_MS = 5 * 60 * 1000;
      for (const [ip, last] of activeStreamIpsTracker.entries()) {
        if (now - last > TTL_MS) {
          activeStreamIpsTracker.delete(ip);
        }
      }
      return Array.from(activeStreamIpsTracker.keys());
    },
    [Symbol.iterator]() {
      return this.toArray()[Symbol.iterator]();
    }
  };

  type StreamConsumerCallback = (event: { clientIp: string; songId: string; userAgent: string; status: number; timeMs: number; isBrowser?: boolean; startByte?: number; range?: string; duration?: number }) => void;
  const streamConsumerCallbacks: Set<StreamConsumerCallback> = new Set();

  function registerStreamConsumerCallback(cb: StreamConsumerCallback) {
    streamConsumerCallbacks.add(cb);
    return () => {
      streamConsumerCallbacks.delete(cb);
    };
  }

  function notifyStreamConsumed(event: { clientIp: string; songId: string; userAgent: string; status: number; timeMs: number; isBrowser?: boolean; startByte?: number; range?: string; duration?: number }) {
    for (const cb of streamConsumerCallbacks) {
      try { cb(event); } catch {}
    }
    try {
      queueEngine.notifyStreamConsumed(event.songId, {
        isBrowser: event.isBrowser,
        startByte: event.startByte,
        range: event.range,
        duration: event.duration
      });
    } catch {}
  }

  async function waitForStreamConsumption(
    targetIp?: string,
    songId?: string,
    timeoutMs: number = 3500
  ): Promise<{ consumed: boolean; latencyMs?: number; event?: any }> {
    const startTime = Date.now();
    const cleanSong = (songId || '').replace(/\.(mp3|flac|wav|m4a|aac|ogg|opus)$/i, '').toLowerCase();

    // 1. Check recent stream events within 1500ms
    const recent = recentStreamEvents.find(e => {
      const matchIp = !targetIp || e.clientIp === targetIp || targetIp.includes(e.clientIp) || e.clientIp.includes(targetIp);
      const cleanEventSong = (e.songId || '').replace(/\.(mp3|flac|wav|m4a|aac|ogg|opus)$/i, '').toLowerCase();
      const matchSong = !cleanSong || cleanEventSong.includes(cleanSong) || cleanSong.includes(cleanEventSong);
      return matchIp && matchSong && (e.timeMs >= startTime - 1500);
    });

    if (recent) {
      return { consumed: true, latencyMs: Date.now() - startTime, event: recent };
    }

    // 2. Wait for incoming stream request
    return new Promise(resolve => {
      let resolved = false;
      let unsubscribe: () => void;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          if (unsubscribe) unsubscribe();
          resolve({ consumed: false });
        }
      }, timeoutMs);

      unsubscribe = registerStreamConsumerCallback((ev) => {
        if (resolved) return;
        const matchIp = !targetIp || ev.clientIp === targetIp || targetIp.includes(ev.clientIp) || ev.clientIp.includes(targetIp);
        const cleanEventSong = (ev.songId || '').replace(/\.(mp3|flac|wav|m4a|aac|ogg|opus)$/i, '').toLowerCase();
        const matchSong = !cleanSong || cleanEventSong.includes(cleanSong) || cleanSong.includes(cleanEventSong);
        if (matchIp && matchSong) {
          resolved = true;
          clearTimeout(timer);
          unsubscribe();
          resolve({ consumed: true, latencyMs: Date.now() - startTime, event: ev });
        }
      });
    });
  }

  // Handle TTS audio stream
  const handleTtsAudioStream = async (req: Request, res: Response) => {
    const text = String(req.query.text || req.body?.text || '').trim();
    const voice = String(req.query.voice || req.body?.voice || 'zh-CN-XiaoxiaoNeural').trim();
    const rate = String(req.query.rate || '+0%').trim();
    const pitch = String(req.query.pitch || '+0Hz').trim();

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Accept-Ranges');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (!text) {
      return res.status(400).send('Missing "text" query param for TTS synthesis');
    }

    try {
      const audioBuffer = await ttsEngine.synthesizeSpeechMp3(text, voice, rate, pitch);
      const totalLength = audioBuffer.length;
      const rangeHeader = req.headers.range;

      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=86400');

      if (req.method === 'HEAD') {
        res.setHeader('Content-Length', totalLength);
        return res.status(200).end();
      }

      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : totalLength - 1;

        if (start >= totalLength || end >= totalLength) {
          res.status(416).setHeader('Content-Range', `bytes */${totalLength}`).end();
          return;
        }

        const chunk = audioBuffer.subarray(start, end + 1);
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${totalLength}`);
        res.setHeader('Content-Length', chunk.length);
        res.send(chunk);
      } else {
        res.setHeader('Content-Length', totalLength);
        res.send(audioBuffer);
      }
    } catch (err: any) {
      console.error('[TTS API] Audio stream error:', err?.message);
      res.status(500).send(`TTS Error: ${err?.message}`);
    }
  };

  // Main HTTP Stream Handler
  const streamAudioHandler = async (req: Request, res: Response): Promise<any> => {
    let { songId } = req.params;
    if (!songId) {
      songId = (req.query.id || req.query.songId || '') as string;
    }
    if (!songId) {
      return res.status(400).send('Missing song ID');
    }

    // Range & HEAD Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Accept-Ranges, Authorization');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    const token = (req.query.token as string) || '';
    const rawCleanSongId = decodeURIComponent(songId).replace(/\.(mp3|wav|flac|m4a|aac|ogg|opus|ape|dsf|dff)$/i, '').trim();

    // Verify token if supplied
    if (token) {
      options.verifyStreamToken(rawCleanSongId, token);
    }

    const storedSongs = options.getStoredSongs();
    const xiaomiDevices = options.getXiaomiDevices();
    const miotConfig = options.getMiotConfig();
    const navidromeConfig = options.getNavidromeConfig();

    const cleanSongId = rawCleanSongId;
    const safeCleanSongId = path.basename(cleanSongId);
    const safeSongId = path.basename(songId);
    let foundSong = storedSongs.find(s => s.id === cleanSongId || s.id === songId);

    // Resolve local file path
    let localFilePath = '';
    let matchedExt = '.mp3';

    if (foundSong?.localFilename) {
      const sanitizedFilename = path.normalize(foundSong.localFilename).replace(/^(\.\.[\/\\])+/, '');
      const candidatePath = path.isAbsolute(foundSong.localFilename)
        ? foundSong.localFilename
        : path.join(options.musicDir, sanitizedFilename);
      const resolvedMusicDir = path.resolve(options.musicDir);
      const resolvedCandidate = path.resolve(candidatePath);
      if (resolvedCandidate.startsWith(resolvedMusicDir) && fs.existsSync(resolvedCandidate)) {
        localFilePath = resolvedCandidate;
        matchedExt = path.extname(resolvedCandidate).toLowerCase();
      }
    }

    if (!localFilePath) {
      const supportedExtensions = ['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.ape', '.dsf', '.dff'];
      for (const ext of supportedExtensions) {
        const checkPath1 = path.join(options.musicDir, `${safeCleanSongId}${ext}`);
        if (fs.existsSync(checkPath1)) {
          localFilePath = checkPath1;
          matchedExt = ext;
          break;
        }
        const checkPath2 = path.join(options.musicDir, `${safeSongId}${ext}`);
        if (fs.existsSync(checkPath2)) {
          localFilePath = checkPath2;
          matchedExt = ext;
          break;
        }
      }
    }

    // Remote Navidrome / Subsonic Relay Stream
    let remoteStreamUrl = '';
    const isNavidromeTrack = cleanSongId.startsWith('navidrome-') || (foundSong && (foundSong.source as string) === 'navidrome') || (foundSong?.url && (/rest\/stream/i.test(foundSong.url) || /rest\/stream\.view/i.test(foundSong.url)));

    if (isNavidromeTrack) {
      if (navidromeConfig.serverUrl && options.isSafeRemoteStreamUrl(navidromeConfig.serverUrl)) {
        let rawNaviId = cleanSongId.replace(/^navidrome-/, '');
        if (!rawNaviId && foundSong?.id) rawNaviId = String(foundSong.id).replace(/^navidrome-/, '');
        if (!rawNaviId && foundSong?.url) {
          const m = foundSong.url.match(/[?&]id=([^&]+)/);
          if (m) rawNaviId = decodeURIComponent(m[1]);
        }
        if (rawNaviId) {
          const authQuery = navidromeConfig.password
            ? options.getSubsonicPassAuthQuery(navidromeConfig.username, navidromeConfig.password)
            : options.getSubsonicAuthQuery(navidromeConfig.username, navidromeConfig.password);
          remoteStreamUrl = `${navidromeConfig.serverUrl.replace(/\/+$/, '')}/rest/stream?id=${encodeURIComponent(rawNaviId)}&${authQuery}`;
        }
      } else {
        return res.status(403).json({ error: 'Unsafe Navidrome server address is forbidden' });
      }
    }

    if (!remoteStreamUrl && foundSong?.url && /^https?:\/\//i.test(foundSong.url) && !foundSong.url.includes('/api/stream/')) {
      if (options.isSafeRemoteStreamUrl(foundSong.url)) {
        remoteStreamUrl = foundSong.url;
      } else {
        return res.status(403).json({ error: 'Unsafe remote stream URL is forbidden' });
      }
    }

    if (remoteStreamUrl) {
      const userAgent = String(req.headers['user-agent'] || '');
      const isBrowserClient = /Mozilla|Chrome|Safari|Firefox|Edg|AppleWebKit/i.test(userAgent) && !/stagefright|Lavf|gstreamer|xm_player|mico|xiaomi|vlc/i.test(userAgent);
      const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1').replace('::ffff:', '');
      const nowStr = new Date().toLocaleTimeString();
      const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
      const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || req.get('host') || `localhost:${options.port}`;
      const fullRequestedUrl = `${proto}://${host}${req.originalUrl || req.url}`;

      const proxyHeaders: Record<string, string> = {
        'Accept': '*/*',
        'User-Agent': userAgent || 'Lavf/58.29.100 (TingLan-StreamServer)'
      };
      if (req.headers.range) {
        proxyHeaders['Range'] = String(req.headers.range);
      }

      const abortController = new AbortController();
      req.on('close', () => {
        try { abortController.abort(); } catch {}
      });

      try {
        let remoteRes: any;
        if (req.method === 'HEAD') {
          try {
            remoteRes = await fetch(remoteStreamUrl, {
              method: 'HEAD',
              headers: proxyHeaders,
              signal: abortController.signal
            });
            if (remoteRes.status === 405) {
              remoteRes = await fetch(remoteStreamUrl, {
                method: 'GET',
                headers: { ...proxyHeaders, Range: 'bytes=0-0' },
                signal: abortController.signal
              });
            }
          } catch {
            remoteRes = await fetch(remoteStreamUrl, {
              method: 'GET',
              headers: { ...proxyHeaders, Range: 'bytes=0-0' },
              signal: abortController.signal
            });
          }
        } else {
          remoteRes = await fetch(remoteStreamUrl, {
            method: 'GET',
            headers: proxyHeaders,
            signal: abortController.signal
          });
        }

        if (!remoteRes.ok && remoteRes.status !== 206) {
          return res.status(remoteRes.status).json({
            error: 'Remote audio stream error',
            message: `Navidrome 远端服务器响应状态错误 (HTTP ${remoteRes.status})`
          });
        }

        const contentType = remoteRes.headers.get('content-type') || 'audio/mpeg';
        const contentLength = remoteRes.headers.get('content-length');
        const contentRange = remoteRes.headers.get('content-range');
        const acceptRanges = remoteRes.headers.get('accept-ranges') || 'bytes';

        res.status(remoteRes.status);
        res.setHeader('Content-Type', contentType);
        res.setHeader('Accept-Ranges', acceptRanges);
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Access-Control-Allow-Origin', '*');
        if (contentLength) res.setHeader('Content-Length', contentLength);
        if (contentRange) res.setHeader('Content-Range', contentRange);

        if (!isBrowserClient && clientIp && clientIp !== '127.0.0.1' && clientIp !== 'localhost') {
          activeStreamIps.add(clientIp);
        }

        const navRangeHdr = (req.headers.range as string) || '';
        let navStartByte: number | undefined = undefined;
        if (navRangeHdr) {
          const m = navRangeHdr.match(/bytes=(\d+)-/);
          if (m) navStartByte = parseInt(m[1], 10);
        }

        notifyStreamConsumed({
          clientIp,
          songId: String(songId),
          userAgent,
          status: remoteRes.status,
          timeMs: Date.now(),
          isBrowser: isBrowserClient,
          startByte: navStartByte,
          range: navRangeHdr
        });

        if (req.method === 'HEAD') {
          return res.end();
        }

        if (remoteRes.body) {
          const nodeStream = Readable.fromWeb(remoteRes.body as any);
          res.on('close', () => {
            try {
              abortController.abort();
              nodeStream.destroy();
            } catch {}
          });
          nodeStream.pipe(res);
        } else {
          res.end();
        }
        return;
      } catch (proxyErr: any) {
        if (proxyErr.name === 'AbortError') {
          return res.end();
        }
        return res.status(502).json({
          error: 'Remote stream connection failed',
          message: `Navidrome 远端流代理异常: ${proxyErr.message}`
        });
      }
    }

    // Local Disk File
    if (!localFilePath || !fs.existsSync(localFilePath)) {
      return res.status(404).json({
        error: 'Audio file not found',
        message: `未找到指定歌曲音频文件 (ID: ${songId})`
      });
    }

    const userAgent = String(req.headers['user-agent'] || '');
    const isBrowserClient = /Mozilla|Chrome|Safari|Firefox|Edg|AppleWebKit/i.test(userAgent) && !/stagefright|Lavf|gstreamer|xm_player|mico|xiaomi|vlc/i.test(userAgent);
    const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1').replace('::ffff:', '');
    const matchedDev = xiaomiDevices.find((d: any) => d.ip && clientIp.includes(d.ip)) ||
      (miotConfig.activeDeviceId ? xiaomiDevices.find((d: any) => d.did === miotConfig.activeDeviceId) : null);
    const resolvedModel = matchedDev?.model || 'wifispeaker';

    // Transcode non-MP3 files on demand
    if (matchedExt !== '.mp3') {
      const existingCachePath = options.audioTranscoder.getCachedMp3(localFilePath, cleanSongId);
      if (existingCachePath) {
        localFilePath = existingCachePath;
        matchedExt = '.mp3';
      } else {
        const durationSec = foundSong?.duration || 240;
        const estimatedMp3Size = Math.max(1024 * 1024, Math.round(durationSec * (320 * 1000 / 8)) + 4096);
        const rangeHeader = req.headers.range;

        if (req.method === 'HEAD') {
          options.audioTranscoder.ensureStandardMp3Async(localFilePath, cleanSongId, {
            clientIp,
            userAgent,
            deviceModel: resolvedModel
          }).catch(() => {});

          res.writeHead(200, {
            'Content-Length': estimatedMp3Size,
            'Content-Type': 'audio/mpeg',
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': '*'
          });
          return res.end();
        }

        // Live streaming pipe
        if (options.audioTranscoder.isAvailable() && (!rangeHeader || rangeHeader === 'bytes=0-' || rangeHeader.startsWith('bytes=0-'))) {
          const liveSession = await options.audioTranscoder.createLiveTranscodeStreamAsync(localFilePath, 0, {
            sessionId: `stream-${cleanSongId}-${Date.now()}`,
            songId: cleanSongId,
            persistCache: true,
            clientIp,
            userAgent,
            deviceModel: resolvedModel,
            timeoutMs: 3000
          });

          if (liveSession && !liveSession.isPassThrough) {
            const isRange = Boolean(rangeHeader);
            res.writeHead(isRange ? 206 : 200, {
              'Content-Type': 'audio/mpeg',
              ...(isRange ? { 'Content-Range': `bytes 0-${estimatedMp3Size - 1}/${estimatedMp3Size}` } : {}),
              'Accept-Ranges': 'bytes',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
              'Access-Control-Allow-Origin': '*'
            });

            const onLiveClose = () => {
              liveSession.notifyClientDisconnected(3000);
            };
            res.on('close', onLiveClose);
            res.on('finish', () => {
              res.off('close', onLiveClose);
              liveSession.kill('client stream finished');
            });

            liveSession.stream.pipe(res);
            return;
          }
        }

        // Fallback: full transcode
        const transcodeResult = await options.audioTranscoder.ensureStandardMp3Async(localFilePath, cleanSongId, {
          clientIp,
          userAgent,
          deviceModel: resolvedModel
        });
        if (transcodeResult.success && fs.existsSync(transcodeResult.filePath)) {
          localFilePath = transcodeResult.filePath;
          matchedExt = transcodeResult.format;
        }
      }
    }

    if (localFilePath && fs.existsSync(localFilePath)) {
      const stat = fs.statSync(localFilePath);
      const fileSize = stat.size;
      const range = req.headers.range;

      const mimeTypes: Record<string, string> = {
        '.wav': 'audio/wav',
        '.mp3': 'audio/mpeg',
        '.flac': 'audio/flac',
        '.m4a': 'audio/mp4',
        '.aac': 'audio/aac',
        '.ogg': 'audio/ogg',
        '.opus': 'audio/opus',
        '.ape': 'audio/x-ape',
        '.dsf': 'audio/x-dsd',
        '.dff': 'audio/x-dsd'
      };
      const contentType = mimeTypes[matchedExt] || (matchedExt === '.wav' ? 'audio/wav' : 'audio/mpeg');

      if (req.method === 'HEAD') {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*'
        });
        return res.end();
      }

      const isPartial = Boolean(range);
      const nowStr = new Date().toLocaleTimeString();
      const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
      const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || req.get('host') || `localhost:${options.port}`;
      const fullRequestedUrl = `${proto}://${host}${req.originalUrl || req.url}`;

      if (!isBrowserClient && clientIp && clientIp !== '127.0.0.1' && clientIp !== 'localhost') {
        activeStreamIps.add(clientIp);
      }

      recentStreamEvents.unshift({
        timestamp: nowStr,
        timeMs: Date.now(),
        songId: String(songId),
        clientIp,
        isBrowser: isBrowserClient,
        userAgent,
        status: isPartial ? 206 : 200,
        format: matchedExt,
        bytesSent: fileSize,
        streamUrl: fullRequestedUrl,
        path: req.originalUrl || req.url
      });
      if (recentStreamEvents.length > 50) recentStreamEvents.pop();

      const localRangeHdr = (req.headers.range as string) || '';
      let localStartByte: number | undefined = undefined;
      if (localRangeHdr) {
        const m = localRangeHdr.match(/bytes=(\d+)-/);
        if (m) localStartByte = parseInt(m[1], 10);
      }

      notifyStreamConsumed({
        clientIp,
        songId: String(songId),
        userAgent,
        status: isPartial ? 206 : 200,
        timeMs: Date.now(),
        isBrowser: isBrowserClient,
        startByte: localStartByte,
        range: localRangeHdr,
        duration: foundSong?.duration
      });

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        let start = parseInt(parts[0], 10);
        let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (isNaN(start)) {
          start = fileSize - end;
          end = fileSize - 1;
        }

        if (start >= fileSize || end >= fileSize || start > end || start < 0) {
          res.writeHead(416, {
            'Content-Range': `bytes */${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Type': contentType
          });
          return res.end();
        }

        const chunksize = (end - start) + 1;
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': contentType,
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });

        const fileStream = fs.createReadStream(localFilePath, { start, end });
        res.on('close', () => fileStream.destroy());
        res.on('finish', () => {
          if (!isBrowserClient && end >= fileSize - 4096) {
            queueEngine.notifyStreamCompleted(String(songId), clientIp);
          }
        });
        fileStream.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });

        const fileStream = fs.createReadStream(localFilePath);
        res.on('close', () => fileStream.destroy());
        res.on('finish', () => {
          if (!isBrowserClient) {
            queueEngine.notifyStreamCompleted(String(songId), clientIp);
          }
        });
        fileStream.pipe(res);
      }
      return;
    }

    res.status(404).send('Audio track not found');
  };

  // Mount Audio Streaming Routes
  router.get('/api/stream/:songId', streamAudioHandler);
  router.head('/api/stream/:songId', streamAudioHandler);
  router.get('/api/stream/:songId.mp3', streamAudioHandler);
  router.head('/api/stream/:songId.mp3', streamAudioHandler);
  router.get('/stream/:songId', streamAudioHandler);
  router.head('/stream/:songId', streamAudioHandler);
  router.get('/music/:filename', (req: Request, res: Response) => {
    req.params.songId = req.params.filename;
    return streamAudioHandler(req, res);
  });
  router.head('/music/:filename', (req: Request, res: Response) => {
    req.params.songId = req.params.filename;
    return streamAudioHandler(req, res);
  });

  // TTS Speech Routes
  router.get('/api/tts/voices', (req: Request, res: Response) => {
    res.json({
      success: true,
      voices: POPULAR_TTS_VOICES,
      defaultVoice: 'zh-CN-XiaoxiaoNeural'
    });
  });
  router.get('/api/tts/stream', handleTtsAudioStream);
  router.get('/api/tts/audio.mp3', handleTtsAudioStream);
  router.post('/api/tts/stream', handleTtsAudioStream);

  // Transcode & Concurrency & Cache Quota APIs
  router.get('/api/transcode/status', (req: Request, res: Response) => {
    const poolStats = transcodeSemaphorePool.getStats();
    const cacheStats = options.audioTranscoder.getCacheStats();
    res.json({
      success: true,
      semaphore: poolStats,
      cache: cacheStats,
      ffmpegAvailable: options.audioTranscoder.isAvailable()
    });
  });

  router.post('/api/transcode/concurrency', (req: Request, res: Response) => {
    const clientUser = (req as any).user;
    if (!clientUser || clientUser.role !== 'admin') {
      return res.status(403).json({ success: false, error: '权限不足：仅系统管理员允许调整全局转码并发数' });
    }
    const { maxConcurrency } = req.body || {};
    const count = parseInt(maxConcurrency, 10);
    if (isNaN(count) || count < 1 || count > 16) {
      return res.status(400).json({
        success: false,
        message: 'maxConcurrency 必须为 1 到 16 之间的有效整数'
      });
    }
    transcodeSemaphorePool.setMaxConcurrency(count);
    res.json({
      success: true,
      maxConcurrency: transcodeSemaphorePool.getMaxConcurrency(),
      message: `已将全局 FFmpeg 最大转码并发数更新为 ${transcodeSemaphorePool.getMaxConcurrency()}`
    });
  });

  router.post('/api/transcode/cache/clear', (req: Request, res: Response) => {
    const clientUser = (req as any).user;
    if (!clientUser || clientUser.role !== 'admin') {
      return res.status(403).json({ success: false, error: '权限不足：仅系统管理员允许清空转码缓存' });
    }
    const result = options.audioTranscoder.clearCache();
    res.json({
      success: true,
      ...result,
      message: `已清空转码缓存（共清除 ${result.clearedCount} 个文件，释放 ${result.freedMb} 磁盘空间）`
    });
  });

  router.post('/api/transcode/cache/quota', (req: Request, res: Response) => {
    const clientUser = (req as any).user;
    if (!clientUser || clientUser.role !== 'admin') {
      return res.status(403).json({ success: false, error: '权限不足：仅系统管理员允许修改转码缓存配额' });
    }
    const { maxQuotaMb } = req.body || {};
    const quotaMb = parseInt(maxQuotaMb, 10);
    if (isNaN(quotaMb) || quotaMb < 100 || quotaMb > 50000) {
      return res.status(400).json({
        success: false,
        message: '缓存配额必须为 100MB 至 50000MB (50GB) 之间的有效数值'
      });
    }
    const maxBytes = quotaMb * 1024 * 1024;
    options.audioTranscoder.quotaManager.setMaxQuotaBytes(maxBytes);
    res.json({
      success: true,
      stats: options.audioTranscoder.quotaManager.getStats(),
      message: `已将转码缓存上限成功更新为 ${quotaMb} MB (超过时自动淘汰至 80%)`
    });
  });

  router.post('/api/transcode/cache/prune', (req: Request, res: Response) => {
    const clientUser = (req as any).user;
    if (!clientUser || clientUser.role !== 'admin') {
      return res.status(403).json({ success: false, error: '权限不足：仅系统管理员允许执行转码缓存淘汰' });
    }
    const result = options.audioTranscoder.quotaManager.enforceQuota();
    res.json({
      success: true,
      ...result,
      stats: options.audioTranscoder.quotaManager.getStats(),
      message: result.evictedCount > 0
        ? `已执行智能 LRU 淘汰：清理 ${result.evictedCount} 首低频/超期音频，释放 ${result.freedMb}`
        : '当前缓存占用健康，未超过配额上限，无需淘汰'
    });
  });

  router.get('/api/transcode/replaygain', (req: Request, res: Response) => {
    res.json({
      success: true,
      enabled: options.streamServer.enableLoudnessNormalization,
      targetLufs: options.streamServer.targetLufs
    });
  });

  router.post('/api/transcode/replaygain', (req: Request, res: Response) => {
    const { enabled, targetLufs } = req.body || {};
    const isEnabled = Boolean(enabled);
    const lufs = typeof targetLufs === 'number' ? Math.max(-30, Math.min(-6, targetLufs)) : -16;
    options.streamServer.setLoudnessConfig(isEnabled, lufs);
    const miotConfig = options.getMiotConfig();
    miotConfig.enableReplayGain = isEnabled;
    miotConfig.targetLufs = lufs;
    options.saveMiotConfig(miotConfig);
    res.json({
      success: true,
      enabled: isEnabled,
      targetLufs: lufs,
      message: isEnabled ? `已开启智能等响度均衡（目标响度 ${lufs} LUFS）` : '已关闭智能等响度均衡'
    });
  });

  return {
    router,
    streamAudioHandler,
    waitForStreamConsumption,
    notifyStreamConsumed,
    activeStreamIps,
    recentStreamEvents
  };
}
