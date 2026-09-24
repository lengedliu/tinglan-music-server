import fs from 'fs';
import path from 'path';

export interface CueTrack {
  trackNumber: number;
  title: string;
  performer?: string;
  songwriter?: string;
  startSeconds: number;
  endSeconds?: number;
  durationSeconds?: number;
  rawIndex: string;
}

export interface CueSheetResult {
  cuePath: string;
  audioFile?: string;
  resolvedAudioPath?: string;
  albumTitle?: string;
  albumPerformer?: string;
  genre?: string;
  date?: string;
  tracks: CueTrack[];
}

/**
 * Parses CUE sheet timestamps (MM:SS:FF where FF is 75 frames per second)
 * e.g., "02:45:30" -> 2 * 60 + 45 + 30 / 75 = 165.4 seconds
 */
export function parseCueIndexTime(indexStr: string): number {
  const parts = indexStr.trim().split(':');
  if (parts.length < 2) return 0;
  const minutes = parseInt(parts[0], 10) || 0;
  const seconds = parseInt(parts[1], 10) || 0;
  const frames = parts.length > 2 ? parseInt(parts[2], 10) || 0 : 0;
  return minutes * 60 + seconds + frames / 75;
}

/**
 * Safely decodes a file buffer into text, intelligently handling UTF-8, GBK/GB2312, and Latin1
 */
export function decodeTextBuffer(buffer: Buffer): string {
  // Check for UTF-8 BOM
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf-8');
  }

  // Try UTF-8 first
  const utf8Text = buffer.toString('utf-8');
  if (!utf8Text.includes('\uFFFD')) {
    return utf8Text;
  }

  // Try GBK / GB2312 for Chinese CUE files
  try {
    const gbkDecoder = new TextDecoder('gbk', { fatal: false });
    const gbkText = gbkDecoder.decode(buffer);
    if (!gbkText.includes('\uFFFD')) {
      return gbkText;
    }
  } catch {}

  // Fallback to latin1 if all else fails
  return buffer.toString('latin1');
}

/**
 * Robust CUE Sheet Parser
 * Extracts album metadata, target audio file, and accurate track boundaries
 */
export function parseCueSheet(cueFilePath: string, totalAudioDurationSeconds?: number): CueSheetResult | null {
  if (!fs.existsSync(cueFilePath)) {
    return null;
  }

  try {
    const rawBuffer = fs.readFileSync(cueFilePath);
    const content = decodeTextBuffer(rawBuffer);
    const lines = content.split(/\r?\n/);

    const dir = path.dirname(cueFilePath);
    let audioFile: string | undefined;
    let albumTitle: string | undefined;
    let albumPerformer: string | undefined;
    let genre: string | undefined;
    let date: string | undefined;

    const tracks: CueTrack[] = [];
    let currentTrack: Partial<CueTrack> | null = null;

    const unquote = (str: string) => {
      const trimmed = str.trim();
      if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1);
      }
      return trimmed;
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('REM COMMENT')) continue;

      // REM metadata
      if (trimmed.startsWith('REM GENRE ')) {
        genre = unquote(trimmed.substring(10));
      } else if (trimmed.startsWith('REM DATE ')) {
        date = unquote(trimmed.substring(9));
      }

      // Global Album / Track PERFORMER
      if (trimmed.startsWith('PERFORMER ')) {
        const val = unquote(trimmed.substring(10));
        if (currentTrack) {
          currentTrack.performer = val;
        } else {
          albumPerformer = val;
        }
      }

      // Global Album / Track TITLE
      if (trimmed.startsWith('TITLE ')) {
        const val = unquote(trimmed.substring(6));
        if (currentTrack) {
          currentTrack.title = val;
        } else {
          albumTitle = val;
        }
      }

      // FILE command: e.g. FILE "Album.flac" WAVE
      if (trimmed.startsWith('FILE ')) {
        const match = trimmed.match(/^FILE\s+["']?([^"']+)["']?\s+\w+/i);
        if (match) {
          audioFile = match[1];
        }
      }

      // TRACK command: e.g. TRACK 01 AUDIO
      if (trimmed.startsWith('TRACK ')) {
        if (currentTrack && currentTrack.trackNumber !== undefined && currentTrack.startSeconds !== undefined) {
          tracks.push(currentTrack as CueTrack);
        }
        const match = trimmed.match(/^TRACK\s+(\d+)\s+AUDIO/i);
        const trackNum = match ? parseInt(match[1], 10) : tracks.length + 1;
        currentTrack = {
          trackNumber: trackNum,
          title: `Track ${trackNum}`,
          performer: albumPerformer,
          startSeconds: 0,
          rawIndex: '00:00:00'
        };
      }

      // INDEX command: e.g. INDEX 01 02:45:30
      if (trimmed.startsWith('INDEX 01 ') && currentTrack) {
        const indexStr = trimmed.substring(9).trim();
        currentTrack.rawIndex = indexStr;
        currentTrack.startSeconds = parseCueIndexTime(indexStr);
      }
    }

    if (currentTrack && currentTrack.trackNumber !== undefined && currentTrack.startSeconds !== undefined) {
      tracks.push(currentTrack as CueTrack);
    }

    // Sort tracks by trackNumber
    tracks.sort((a, b) => a.trackNumber - b.trackNumber);

    // Calculate duration for each track
    for (let i = 0; i < tracks.length; i++) {
      if (i < tracks.length - 1) {
        const nextStart = tracks[i + 1].startSeconds;
        tracks[i].endSeconds = nextStart;
        tracks[i].durationSeconds = Math.max(1, Math.round(nextStart - tracks[i].startSeconds));
      } else if (totalAudioDurationSeconds && totalAudioDurationSeconds > tracks[i].startSeconds) {
        tracks[i].endSeconds = totalAudioDurationSeconds;
        tracks[i].durationSeconds = Math.max(1, Math.round(totalAudioDurationSeconds - tracks[i].startSeconds));
      } else {
        // Fallback default duration for the last track if parent audio total duration unknown
        tracks[i].durationSeconds = 240;
      }
    }

    // Resolve matching parent audio file on disk
    let resolvedAudioPath: string | undefined;
    if (audioFile) {
      const candidate = path.join(dir, audioFile);
      if (fs.existsSync(candidate)) {
        resolvedAudioPath = candidate;
      }
    }

    // Heuristic: If referenced audio file not found directly, look for same-named audio file (.flac, .ape, .wav, .mp3)
    if (!resolvedAudioPath) {
      const cueBase = path.basename(cueFilePath, path.extname(cueFilePath));
      for (const ext of ['.flac', '.ape', '.wav', '.mp3', '.m4a', '.wv']) {
        const candidate = path.join(dir, `${cueBase}${ext}`);
        if (fs.existsSync(candidate)) {
          resolvedAudioPath = candidate;
          audioFile = path.basename(candidate);
          break;
        }
      }
    }

    return {
      cuePath: cueFilePath,
      audioFile,
      resolvedAudioPath,
      albumTitle: albumTitle || path.basename(cueFilePath, path.extname(cueFilePath)),
      albumPerformer: albumPerformer || '未知歌手',
      genre,
      date,
      tracks
    };
  } catch (err: any) {
    console.warn(`[CueParser] Failed to parse ${cueFilePath}:`, err.message);
    return null;
  }
}
