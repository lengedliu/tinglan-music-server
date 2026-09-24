import { LyricLine } from '../types';

/**
 * Parses standard LRC lyrics format into timed lines
 * Format: [mm:ss.xx] Lyric text or multiple timestamps [01:00.00][02:00.00]Lyric text
 */
export function parseLrc(lrcText: string, totalDuration = 200): LyricLine[] {
  if (!lrcText || typeof lrcText !== 'string') return [];

  const lines = lrcText.split('\n');
  const result: LyricLine[] = [];
  const timeRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Reset regex for each line
    timeRegex.lastIndex = 0;
    const matches: number[] = [];
    let match: RegExpExecArray | null;

    while ((match = timeRegex.exec(trimmed)) !== null) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const msStr = match[3] || '0';
      const milliseconds = parseInt(msStr.padEnd(3, '0').slice(0, 3), 10);
      const totalSeconds = minutes * 60 + seconds + milliseconds / 1000;
      matches.push(totalSeconds);
    }

    if (matches.length > 0) {
      // Cleanly remove all [mm:ss.xx] timestamps
      const cleanText = trimmed.replace(/\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/g, '').trim();
      if (cleanText) {
        for (const time of matches) {
          result.push({
            time,
            text: cleanText
          });
        }
      }
    }
  }

  // If no timestamps found, parse as plain text lyrics evenly spaced
  if (result.length === 0 && lines.some(l => l.trim().length > 0)) {
    const validLines = lines.map(l => l.trim()).filter(Boolean);
    const step = Math.max(3, (totalDuration - 10) / Math.max(1, validLines.length));
    validLines.forEach((text, i) => {
      result.push({
        time: Math.round(i * step),
        text
      });
    });
  }

  // Sort chronologically by timestamp
  return result.sort((a, b) => a.time - b.time);
}

export function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * High-performance O(log N) / O(1) active lyric finder with binary search & pointer caching.
 */
export function findActiveLyricIndex(
  lyrics: LyricLine[],
  currentTime: number,
  previousIndex: number = -1
): number {
  const len = lyrics.length;
  if (len === 0) return -1;
  if (currentTime < lyrics[0].time) return -1;
  if (currentTime >= lyrics[len - 1].time) return len - 1;

  // 1. O(1) fast path: check if still on current line or stepped to next line
  if (previousIndex >= 0 && previousIndex < len) {
    const curTime = lyrics[previousIndex].time;
    const nextTime = previousIndex + 1 < len ? lyrics[previousIndex + 1].time : Infinity;
    if (currentTime >= curTime && currentTime < nextTime) {
      return previousIndex;
    }
    if (previousIndex + 1 < len) {
      const nextNextTime = previousIndex + 2 < len ? lyrics[previousIndex + 2].time : Infinity;
      if (currentTime >= nextTime && currentTime < nextNextTime) {
        return previousIndex + 1;
      }
    }
  }

  // 2. O(log N) binary search for seeking/jumping
  let low = 0;
  let high = len - 1;
  let ans = 0;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lyrics[mid].time <= currentTime) {
      ans = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return ans;
}


