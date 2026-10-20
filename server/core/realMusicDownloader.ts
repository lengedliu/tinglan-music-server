import fs from 'fs';
import path from 'path';
import { logEngine } from './logEngine.js';
import { ssrfSafeFetch } from './security.js';

// [Fix N3] Hard caps: the previous implementation slurped the entire response
// via arrayBuffer() with only a >100KB lower bound — a compromised/hostile
// upstream (or one returning a multi-GB body) could OOM the server.
const MAX_AUDIO_BYTES = 200 * 1024 * 1024; // 200 MB ceiling for audio payloads
const MAX_LRC_BYTES = 2 * 1024 * 1024;     // 2 MB ceiling for lyrics payloads

/**
 * [Fix N3] Fetch through the SSRF guard and stream-cap the response body.
 * The download URLs come from third-party search API RESPONSE BODIES, i.e.
 * potentially attacker-influenced content — never fetch them bare.
 */
async function fetchCapped(url: string, timeoutMs: number, maxBytes: number): Promise<Buffer | null> {
  let res: Response;
  try {
    res = await ssrfSafeFetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (err: any) {
    console.warn(`[RealMusicDownloader] SSRF-guarded fetch blocked/failed: ${err.message}`);
    return null;
  }
  if (!res.ok || !res.body) return null;
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > maxBytes) return null;
  const chunks: Buffer[] = [];
  let total = 0;
  const reader = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        try { await reader.cancel(); } catch {}
        console.warn(`[RealMusicDownloader] Response exceeded ${maxBytes} bytes cap — aborted`);
        return null;
      }
      chunks.push(Buffer.from(value));
    }
  } catch {
    return null;
  }
  return Buffer.concat(chunks);
}

export interface RealDownloadResult {
  success: boolean;
  audioPath: string;
  lrcPath: string;
  bitrate: string;
  format: string;
  fileSizeMb: number;
  source: string;
  lyricsFetched: boolean;
}

/**
 * 真正在线音乐音源检索、音频字节流下载与 LRC 歌词抓取引擎
 */
export class RealMusicDownloader {
  private static instance: RealMusicDownloader;

  private constructor() {}

  public static getInstance(): RealMusicDownloader {
    if (!RealMusicDownloader.instance) {
      RealMusicDownloader.instance = new RealMusicDownloader();
    }
    return RealMusicDownloader.instance;
  }

  /**
   * 在线全网检索真实音频资源与逐句 LRC 动态歌词，并落盘至 NAS 目录
   */
  public async searchAndDownloadTrack(params: {
    title: string;
    artist: string;
    album?: string;
    targetFilePath: string;
    companionLrcPath: string;
    qualityPreference?: 'lossless' | 'high' | 'standard';
  }): Promise<RealDownloadResult> {
    const cleanTitle = (params.title || '单曲').replace(/[《》「」『』"']/g, '').trim();
    const cleanArtist = (params.artist || '华语音乐').replace(/[《》「」『』"']/g, '').trim();
    const traceId = `real_dl_${Date.now().toString(36)}`;

    console.log(`[RealMusicDownloader] 🌐 启动全网真实音源检索下载: 《${cleanTitle}》 - ${cleanArtist}`);
    logEngine.info(
      'automation',
      '真实在线音源检索启动',
      `开始在全网在线高保真音源库中检索《${cleanTitle}》- ${cleanArtist} 的真实无损音轨与同步歌词`,
      { traceId, title: cleanTitle, artist: cleanArtist, quality: params.qualityPreference || 'lossless' }
    );

    let downloadedAudio = false;
    let fetchedLrc = false;
    let sourceUsed = '全网流媒体高保真引擎';
    let fileFormat = 'FLAC 24bit/96kHz (无损母带)';
    let bitrateText = 'Hi-Res 无损 1411kbps';

    // 1. 尝试调用线上开箱可用高高可用音源解析 API 搜索真实音频流
    try {
      const searchUrl = `https://music-api.gokudou.workers.dev/search?keyword=${encodeURIComponent(`${cleanTitle} ${cleanArtist !== '华语音乐' ? cleanArtist : ''}`)}`;
      const searchRes = await ssrfSafeFetch(searchUrl, { signal: AbortSignal.timeout(6000) }).catch(() => null);

      if (searchRes && searchRes.ok) {
        const data = await searchRes.json().catch(() => null);
        const match = data?.results?.[0] || data?.data?.[0] || data?.[0];

        if (match && (match.url || match.audioUrl || match.downloadUrl)) {
          const audioUrl = match.url || match.audioUrl || match.downloadUrl;
          console.log(`[RealMusicDownloader] 📥 匹配到真实音源直链，开始拉取网络字节流: ${String(audioUrl).slice(0, 60)}...`);

          // [Fix N3] Upstream-supplied URL: SSRF-guarded + size-capped streaming read
          const buffer = await fetchCapped(String(audioUrl), 15000, MAX_AUDIO_BYTES);
          if (buffer && buffer.length > 100000) { // 确保大于 100KB 为有效音频
            fs.writeFileSync(params.targetFilePath, buffer);
            downloadedAudio = true;
            sourceUsed = match.source || '云端高保真音源库';
            bitrateText = match.bitrate || 'FLAC 无损 1411kbps';
            fileFormat = match.format || 'FLAC 24bit 无损';
            console.log(`[RealMusicDownloader] ✅ 真实音频落盘成功: ${params.targetFilePath} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
          }
        }
      }
    } catch (err: any) {
      console.warn(`[RealMusicDownloader] 线上音源解析提示: ${err.message}，开启备用在线抓轨模式`);
    }

    // 2. 备用真实音源在线抓取引擎 (若主源未命中或超时)
    if (!downloadedAudio) {
      try {
        // 尝试开放公开音源搜索解析备用节点
        const altSearchUrl = `https://api.vocaloid.site/search?song=${encodeURIComponent(cleanTitle)}&artist=${encodeURIComponent(cleanArtist)}`;
        const altRes = await ssrfSafeFetch(altSearchUrl, { signal: AbortSignal.timeout(5000) }).catch(() => null);
        if (altRes && altRes.ok) {
          const altData = await altRes.json().catch(() => null);
          const dlUrl = altData?.url || altData?.songUrl;
          if (dlUrl) {
            // [Fix N3] SSRF-guarded + size-capped streaming read
            const buf = await fetchCapped(String(dlUrl), 12000, MAX_AUDIO_BYTES);
            if (buf && buf.length > 100000) {
              fs.writeFileSync(params.targetFilePath, buf);
              downloadedAudio = true;
              sourceUsed = '开源音源抓轨引擎';
              console.log(`[RealMusicDownloader] ✅ 备用音源真实音频落盘成功: ${params.targetFilePath}`);
            }
          }
        }
      } catch (altErr: any) {
        console.warn('[RealMusicDownloader] Alt source notice:', altErr.message);
      }
    }

    // 3. 在线搜索并抓取真正的逐句 LRC 动态同步歌词
    try {
      const lrcSearchUrl = `https://lrc-api.vocaloid.site/lrc?title=${encodeURIComponent(cleanTitle)}&artist=${encodeURIComponent(cleanArtist)}`;
      const lrcRes = await ssrfSafeFetch(lrcSearchUrl, { signal: AbortSignal.timeout(4000) }).catch(() => null);
      if (lrcRes && lrcRes.ok) {
        const lrcData = await lrcRes.json().catch(() => null);
        const lrcText = lrcData?.lrc || lrcData?.lyrics;
        // [Fix N3] Enforce a size cap on lyric content before writing to disk
        if (lrcText && lrcText.includes('[') && String(lrcText).length <= MAX_LRC_BYTES) {
          fs.writeFileSync(params.companionLrcPath, lrcText, 'utf-8');
          fetchedLrc = true;
          console.log(`[RealMusicDownloader] 📜 真实逐句 LRC 歌词落盘成功: ${params.companionLrcPath}`);
        }
      }
    } catch (lrcErr: any) {
      console.warn('[RealMusicDownloader] Lyrics fetch notice:', lrcErr.message);
    }

    // [Fix N3] The old fallback block fabricated a fake lyrics file (real song
    // lyrics pasted as "genuine line-by-line LRC") whenever the online fetch
    // missed. Fake content must never be written to the library — leave
    // fetchedLrc=false; the downstream flow already tolerates a missing .lrc.

    // 5. 如果未命中任何真实音源直链，返回下载失败状态，不生成假文件或模拟数据
    if (!downloadedAudio) {
      logEngine.warn(
        'automation',
        '真实在线音源未命中',
        `全网音源库未检索到《${cleanTitle}》- ${cleanArtist} 的有效音频流`,
        { traceId, title: cleanTitle, artist: cleanArtist }
      );
      return {
        success: false,
        audioPath: '',
        lrcPath: '',
        bitrate: '',
        format: '',
        fileSizeMb: 0,
        source: '未匹配到全网音源',
        lyricsFetched: false
      };
    }

    const stat = fs.statSync(params.targetFilePath);
    const fileSizeMb = Number((stat.size / (1024 * 1024)).toFixed(2));

    logEngine.info(
      'automation',
      '真实音频与歌词落盘成功',
      `《${cleanTitle}》- ${cleanArtist} 已成功落盘 | 来源: ${sourceUsed} | 体积: ${fileSizeMb} MB | 音质: ${fileFormat} | 路径: ${params.targetFilePath}`,
      {
        traceId,
        title: cleanTitle,
        artist: cleanArtist,
        sourceUsed,
        fileSizeMb,
        fileFormat,
        targetFilePath: params.targetFilePath,
        companionLrcPath: params.companionLrcPath
      }
    );

    return {
      success: true,
      audioPath: params.targetFilePath,
      lrcPath: params.companionLrcPath,
      bitrate: bitrateText,
      format: fileFormat,
      fileSizeMb,
      source: sourceUsed,
      lyricsFetched: fetchedLrc
    };
  }
}

export const realMusicDownloader = RealMusicDownloader.getInstance();
