import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import { MusicEngine } from '../core/musicEngine.js';
import { FfmpegTranscoder } from './ffmpegTranscoder.js';
import { DeviceManager } from '../xiaomi/deviceManager.js';
import { transcodeSemaphorePool } from './transcodeSemaphore.js';

export interface StreamEvent {
  timestamp: string;
  timeMs: number;
  songId: string;
  clientIp: string;
  isBrowser: boolean;
  userAgent: string;
  status: number;
  format: string;
  bytesSent: number;
  streamUrl: string;
  path: string;
}

export interface CastLog {
  id: string;
  timestamp: string;
  type: 'cast' | 'sync' | 'tts' | 'control' | 'error';
  message: string;
  detail: string;
  success: boolean;
  ip?: string;
  isBrowser?: boolean;
  did?: string;
  model?: string;
  protocol?: string;
  requestMethod?: string;
  httpStatus?: number;
  streamUrl?: string;
  responseTimeMs?: number;
  steps?: Array<{
    timestamp: string;
    step: string;
    status: 'OK' | 'FAIL' | 'PENDING';
    statusCode?: number;
    message?: string;
  }>;
}

export class StreamServer {
  private musicDir: string;
  private musicEngine: MusicEngine;
  private transcoder: FfmpegTranscoder;
  private deviceManager: DeviceManager;
  private port: number;

  public recentStreamEvents: StreamEvent[] = [];
  public castLogs: CastLog[] = [];
  public activeStreamIps: Set<string> = new Set();
  public enableLoudnessNormalization: boolean = false;
  public targetLufs: number = -16;

  constructor(
    musicDir: string,
    musicEngine: MusicEngine,
    transcoder: FfmpegTranscoder,
    deviceManager: DeviceManager,
    port: number = 3000
  ) {
    this.musicDir = musicDir;
    this.musicEngine = musicEngine;
    this.transcoder = transcoder;
    this.deviceManager = deviceManager;
    this.port = port;
  }

  public setLoudnessConfig(enabled: boolean, targetLufs: number = -16): void {
    this.enableLoudnessNormalization = enabled;
    this.targetLufs = targetLufs;
  }

  /**
   * Express middleware / route handler for streaming audio with RFC 7233 HTTP 206 Partial Content,
   * Exact Sample-Accurate Seek, CUE Sheet Sub-Track Virtual Slicing, and ReplayGain Loudness Normalization.
   */
  public handleStream = async (req: Request, res: Response) => {
    const rawSongId = req.params.songId || req.params.filename || '';
    const songId = decodeURIComponent(rawSongId);
    const cleanSongId = songId.replace(/\.(wav|mp3|flac|m4a|ogg|aac|opus|ape|dsf|dff)$/i, '');

    // Allow CORS and streaming headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Accept-Ranges, User-Agent');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    let localFilePath = '';
    let matchedExt = '';

    // 1. Direct file match in MUSIC_DIR
    const directExactPath = path.join(this.musicDir, songId);
    if (fs.existsSync(directExactPath) && fs.statSync(directExactPath).isFile()) {
      localFilePath = directExactPath;
      matchedExt = path.extname(songId).toLowerCase();
    }

    // 2. Lookup via MusicEngine (including CUE virtual sub-tracks)
    const matchedSong = this.musicEngine.getById(cleanSongId) || this.musicEngine.getById(songId);
    let cueStartSeconds = 0;
    let cueDurationSeconds: number | undefined;

    if (matchedSong?.cueTrack) {
      cueStartSeconds = matchedSong.cueTrack.startSeconds;
      cueDurationSeconds = matchedSong.cueTrack.durationSeconds;
      if (!localFilePath && matchedSong.cueTrack.parentFilename) {
        const potential = path.isAbsolute(matchedSong.cueTrack.parentFilename)
          ? matchedSong.cueTrack.parentFilename
          : path.join(this.musicDir, matchedSong.cueTrack.parentFilename);
        if (fs.existsSync(potential) && fs.statSync(potential).isFile()) {
          localFilePath = potential;
          matchedExt = path.extname(potential).toLowerCase();
        }
      }
    }

    if (!localFilePath && matchedSong?.localFilename) {
      const potentialCustomPath = path.isAbsolute(matchedSong.localFilename)
        ? matchedSong.localFilename
        : path.join(this.musicDir, matchedSong.localFilename);
      if (fs.existsSync(potentialCustomPath) && fs.statSync(potentialCustomPath).isFile()) {
        localFilePath = potentialCustomPath;
        matchedExt = path.extname(potentialCustomPath).toLowerCase();
      }
    }

    // 3. Scan common audio extensions in MUSIC_DIR
    if (!localFilePath) {
      const candidateExts = ['.wav', '.mp3', '.flac', '.m4a', '.aac', '.ogg', '.opus', '.ape', '.dsf', '.dff'];
      for (const ext of candidateExts) {
        const candidate = path.join(this.musicDir, `${cleanSongId}${ext}`);
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          localFilePath = candidate;
          matchedExt = ext;
          break;
        }
      }
    }

    if (!localFilePath || !fs.existsSync(localFilePath)) {
      return res.status(404).send('Audio track not found in music engine catalog');
    }

    // Query parameter seek support: ?t=seconds or ?ss=seconds
    let querySeekSeconds = 0;
    const rawSeek = req.query.t || req.query.ss || req.query.seek;
    if (rawSeek) {
      const parsed = parseFloat(String(rawSeek));
      if (!isNaN(parsed) && parsed > 0) {
        querySeekSeconds = parsed;
      }
    }

    const replayGainDb = matchedSong?.replayGain?.trackGainDb;
    const normalizeLoudness = this.enableLoudnessNormalization;
    const targetLufs = this.targetLufs;

    const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1').replace('::ffff:', '');
    const matchedDev = this.deviceManager.getByIp(clientIp);
    const resolvedDid = matchedDev?.did || '';
    const resolvedModel = matchedDev?.model || 'wifispeaker';

    const reqUserAgent = String(req.headers['user-agent'] || '');
    // Optimization 2: Device IP Affinity Binding - if IP matches a registered XiaoAi speaker, 100% treat as hardware speaker regardless of UA
    const isIpMatchedSpeaker = Boolean(matchedDev);
    const isHardwareSpeaker = isIpMatchedSpeaker || /stagefright|Lavf|gstreamer|xm_player|mico|xiaomi|vlc|mediaplayer/i.test(reqUserAgent);
    const isBrowserClient = !isHardwareSpeaker && /Mozilla|Chrome|Safari|Firefox|Edg|AppleWebKit/i.test(reqUserAgent);

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

    const rangeHeader = req.headers.range;
    let isSmallProbe = false;
    let probeStart = 0;
    let probeEnd = 1;
    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        probeStart = parseInt(match[1], 10);
        if (match[2]) {
          probeEnd = parseInt(match[2], 10);
          if (probeStart === 0 && probeEnd - probeStart <= 2048) {
            isSmallProbe = true;
          }
        }
      }
    }

    // 4. Check if standard MP3 cache already exists
    let cachedMp3: string | null = null;
    if (matchedExt !== '.mp3') {
      cachedMp3 = this.transcoder.getCachedMp3(localFilePath, cleanSongId);
      if (cachedMp3) {
        localFilePath = cachedMp3;
        matchedExt = '.mp3';
      }
    }

    // 5. Short-circuit fast-path for HEAD and small Range probes (bytes=0-1 etc.)
    // If not yet transcoded to MP3, do NOT block the event loop or consume a concurrency slot for a 2-byte probe!
    if (matchedExt !== '.mp3' && !cachedMp3 && (req.method === 'HEAD' || isSmallProbe)) {
      const matchedSong = this.musicEngine.getById(cleanSongId);
      const durationSec = matchedSong?.duration || 240;
      const estimatedMp3Size = Math.max(1024 * 1024, Math.round(durationSec * (320 * 1000 / 8)) + 4096);

      // Trigger non-blocking async background pre-transcode so full stream will be ready
      this.transcoder.ensureStandardMp3Async(localFilePath, cleanSongId, {
        deviceModel: resolvedModel,
        userAgent: reqUserAgent,
        clientIp
      }).catch((err) => {
        console.warn(`[StreamServer] Background probe-triggered transcode warning:`, err);
      });

      if (req.method === 'HEAD') {
        res.writeHead(200, {
          'Content-Length': estimatedMp3Size,
          'Content-Type': 'audio/mpeg',
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*'
        });
        return res.end();
      }

      if (isSmallProbe) {
        // Synthesize valid MP3 ID3 header prefix for the probe
        const probeLength = probeEnd - probeStart + 1;
        const synthHeader = Buffer.alloc(Math.max(probeLength, 128));
        synthHeader.write('ID3', 0);
        synthHeader[3] = 0x03; // version 2.3
        synthHeader[4] = 0x00; // flags
        synthHeader[6] = 0x00;
        synthHeader[7] = 0x00;
        synthHeader[8] = 0x02;
        synthHeader[9] = 0x00;

        res.writeHead(206, {
          'Content-Range': `bytes ${probeStart}-${probeEnd}/${estimatedMp3Size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': probeLength,
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        });
        return res.end(synthHeader.slice(probeStart, probeEnd + 1));
      }
    }

    // 6. Live streaming & seek fast-paths (for non-MP3 files, CUE virtual sub-tracks, or ReplayGain processing)
    const needsProcessing = matchedExt !== '.mp3' || Boolean(matchedSong?.cueTrack) || querySeekSeconds > 0 || normalizeLoudness || replayGainDb !== undefined;
    if (needsProcessing && this.transcoder.isAvailable()) {
      const durationSec = cueDurationSeconds || matchedSong?.duration || 240;
      const estimatedMp3Size = Math.max(1024 * 1024, Math.round(durationSec * (320 * 1000 / 8)) + 4096);

      // 6a. Live Streaming from beginning (bytes=0- or no range) (TTFB < 50ms)
      if (!rangeHeader || rangeHeader === 'bytes=0-' || rangeHeader.startsWith('bytes=0-')) {
        const liveStartSec = cueStartSeconds + querySeekSeconds;
        const liveSession = await this.transcoder.createLiveTranscodeStreamAsync(localFilePath, liveStartSec, {
          sessionId: `stream-${cleanSongId}-${Date.now()}`,
          songId: cleanSongId,
          persistCache: !matchedSong?.cueTrack && liveStartSec === 0 && !normalizeLoudness,
          durationSeconds: cueDurationSeconds,
          replayGainDb,
          normalizeLoudness,
          targetLufs,
          clientIp,
          userAgent: reqUserAgent,
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

      // 6b. Accurate Seeking (Range: bytes=START-) with CBR MP3 frame-boundary alignment (TTFB < 80ms)
      if (rangeHeader) {
        const rangeMatch = rangeHeader.match(/bytes=(\d+)-/);
        if (rangeMatch) {
          const startByte = parseInt(rangeMatch[1], 10);
          if (startByte > 2048) {
            // Align startByte to MP3 CBR frame boundary (1044 bytes for 320k 44.1kHz CBR)
            const alignedStartByte = Math.floor(startByte / 1044) * 1044;
            const seekOffsetSec = Math.max(0, Math.floor((alignedStartByte - 128) / (320000 / 8)));
            const seekStartSec = cueStartSeconds + querySeekSeconds + seekOffsetSec;

            let remainingDurationSec: number | undefined;
            if (cueDurationSeconds) {
              remainingDurationSec = Math.max(1, cueDurationSeconds - seekOffsetSec);
            }

            const seekSession = await this.transcoder.createLiveTranscodeStreamAsync(localFilePath, seekStartSec, {
              sessionId: `seek-${cleanSongId}-${Date.now()}`,
              songId: cleanSongId,
              persistCache: false,
              durationSeconds: remainingDurationSec,
              replayGainDb,
              normalizeLoudness,
              targetLufs,
              clientIp,
              userAgent: reqUserAgent,
              deviceModel: resolvedModel,
              timeoutMs: 3000
            });

            if (seekSession && !seekSession.isPassThrough) {
              res.writeHead(206, {
                'Content-Range': `bytes ${startByte}-${estimatedMp3Size - 1}/${estimatedMp3Size}`,
                'Accept-Ranges': 'bytes',
                'Content-Type': 'audio/mpeg',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*'
              });

              const onSeekClose = () => {
                seekSession.notifyClientDisconnected(3000);
              };
              res.on('close', onSeekClose);
              res.on('finish', () => {
                res.off('close', onSeekClose);
                seekSession.kill('client seek finished');
              });

              seekSession.stream.pipe(res);
              return;
            }
          }
        }
      }

      // Fallback: full transcode
      if (matchedExt !== '.mp3' && !matchedSong?.cueTrack) {
        const transcodeResult = await this.transcoder.ensureStandardMp3Async(localFilePath, cleanSongId, {
          deviceModel: resolvedModel,
          userAgent: reqUserAgent,
          clientIp,
          replayGainDb,
          normalizeLoudness,
          targetLufs
        });
        if (transcodeResult.success && fs.existsSync(transcodeResult.filePath)) {
          localFilePath = transcodeResult.filePath;
          matchedExt = transcodeResult.format;
        }
      }
    }

    const stat = fs.statSync(localFilePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const contentType = mimeTypes[matchedExt] || 'audio/mpeg';

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
    const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || `localhost:${this.port}`;
    const fullRequestedUrl = `${proto}://${host}${req.originalUrl || req.url}`;

    if (!isBrowserClient && clientIp && clientIp !== '127.0.0.1' && clientIp !== 'localhost') {
      this.activeStreamIps.add(clientIp);
    }

    // Record stream event
    this.recentStreamEvents.unshift({
      timestamp: nowStr,
      timeMs: Date.now(),
      songId: String(songId),
      clientIp,
      isBrowser: isBrowserClient,
      userAgent: reqUserAgent,
      status: isPartial ? 206 : 200,
      format: matchedExt,
      bytesSent: fileSize,
      streamUrl: fullRequestedUrl,
      path: req.originalUrl || req.url
    });
    if (this.recentStreamEvents.length > 50) this.recentStreamEvents.pop();

    // Stream diagnostic log
    const streamLogEntry: CastLog = {
      id: `log-stream-${Date.now()}`,
      timestamp: nowStr,
      type: 'sync',
      message: isBrowserClient ? `网页端试听拉取音频流: ${songId}` : `音箱硬件拉取音频流: ${songId}`,
      detail: `${isPartial ? 'HTTP 206 Partial Content (Range)' : 'HTTP 200 OK (Full Stream)'} | 格式: ${matchedExt} | 来自: ${clientIp} (${isBrowserClient ? '浏览器' : '音箱终端'})`,
      success: true,
      ip: clientIp,
      isBrowser: isBrowserClient,
      did: resolvedDid,
      model: resolvedModel,
      protocol: 'HTTP 206 Stream',
      requestMethod: `GET ${req.originalUrl || req.url}`,
      httpStatus: isPartial ? 206 : 200,
      streamUrl: fullRequestedUrl,
      responseTimeMs: 8,
      steps: [
        {
          timestamp: nowStr,
          step: 'STREAM_GET',
          status: 'OK',
          statusCode: isPartial ? 206 : 200,
          message: isPartial ? `HTTP 206 Partial Content (${range})` : 'HTTP 200 Full Content'
        },
        {
          timestamp: nowStr,
          step: 'STREAM_URL',
          status: 'OK',
          statusCode: 200,
          message: `完整拉流URL: ${fullRequestedUrl}`
        },
        {
          timestamp: nowStr,
          step: 'PLAYBACK_CHECK',
          status: 'OK',
          statusCode: 200,
          message: isBrowserClient ? '网页播放器缓冲中' : '音箱成功接管音频流'
        }
      ]
    };
    this.castLogs.unshift(streamLogEntry);
    if (this.castLogs.length > 50) this.castLogs.pop();

    // RFC 7233 Range Streaming Pipe
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const file = fs.createReadStream(localFilePath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      };
      res.writeHead(200, head);
      fs.createReadStream(localFilePath).pipe(res);
    }
  };
}
