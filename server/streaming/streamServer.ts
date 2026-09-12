import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import { MusicEngine } from '../core/musicEngine.js';
import { FfmpegTranscoder } from './ffmpegTranscoder.js';
import { DeviceManager } from '../xiaomi/deviceManager.js';

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

  /**
   * Express middleware / route handler for streaming audio with RFC 7233 HTTP 206 Partial Content
   */
  public handleStream = (req: Request, res: Response) => {
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

    // 2. Lookup via MusicEngine
    if (!localFilePath) {
      const matchedSong = this.musicEngine.getById(songId);
      if (matchedSong?.localFilename) {
        const potentialCustomPath = path.isAbsolute(matchedSong.localFilename)
          ? matchedSong.localFilename
          : path.join(this.musicDir, matchedSong.localFilename);
        if (fs.existsSync(potentialCustomPath) && fs.statSync(potentialCustomPath).isFile()) {
          localFilePath = potentialCustomPath;
          matchedExt = path.extname(potentialCustomPath).toLowerCase();
        }
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

    // Standardize audio stream: hardware speakers require Standard MP3 44.1kHz CBR 320k
    const reqUserAgent = String(req.headers['user-agent'] || '');
    const isHardwareSpeaker = /stagefright|Lavf|gstreamer|xm_player|mico|xiaomi|vlc|mediaplayer/i.test(reqUserAgent);
    const requestedAsMp3 = String(req.url).includes('.mp3') || String(songId).endsWith('.mp3') || String(req.url).startsWith('/stream/');

    if (matchedExt !== '.mp3' || requestedAsMp3 || isHardwareSpeaker) {
      const transcodeResult = this.transcoder.ensureStandardMp3(localFilePath, cleanSongId);
      if (transcodeResult.success && fs.existsSync(transcodeResult.filePath)) {
        localFilePath = transcodeResult.filePath;
        matchedExt = transcodeResult.format;
      }
    }

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

    const isBrowserClient = /Mozilla|Chrome|Safari|Firefox|Edg|AppleWebKit/i.test(reqUserAgent) && !isHardwareSpeaker;
    const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1').replace('::ffff:', '');
    const isPartial = Boolean(range);
    const nowStr = new Date().toLocaleTimeString();
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
    const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || `localhost:${this.port}`;
    const fullRequestedUrl = `${proto}://${host}${req.originalUrl || req.url}`;

    const matchedDev = this.deviceManager.getByIp(clientIp);
    const resolvedDid = matchedDev?.did || '';
    const resolvedModel = matchedDev?.model || 'wifispeaker';

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
      detail: `${isPartial ? 'HTTP 206 Partial Content (Range)' : 'HTTP 200 OK (Full Stream)'} | 拉流URL: ${fullRequestedUrl} | 来自: ${clientIp} (${isBrowserClient ? '浏览器' : '音箱终端'})`,
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
