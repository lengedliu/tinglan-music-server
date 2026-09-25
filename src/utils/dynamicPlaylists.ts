import { Song, DynamicPlaylistId } from '../types';

/**
 * Checks whether a song qualifies as Hi-Res / Lossless audiophile audio
 */
export function isLosslessSong(song: Song): boolean {
  if (!song) return false;

  const bitrate = (song.bitrate || '').toLowerCase();
  const format = (song.format || '').toLowerCase();
  const codec = (song.codec || '').toLowerCase();
  const bitDepth = (song.bitDepth || '').toLowerCase();
  const sampleRate = (song.sampleRate || '').toLowerCase();
  const url = (song.url || '').toLowerCase();
  const filePath = (song.filePath || '').toLowerCase();

  // Extension check
  const hasLosslessExt = /\.(flac|wav|ape|dsf|dff|alac|aiff)(\?|$)/i.test(url) ||
    /\.(flac|wav|ape|dsf|dff|alac|aiff)$/i.test(filePath) ||
    ['flac', 'wav', 'ape', 'dsf', 'dff', 'alac'].includes(format);

  // Bitrate and audiophile keywords check
  const hasLosslessKeywords =
    bitrate.includes('flac') ||
    bitrate.includes('wav') ||
    bitrate.includes('ape') ||
    bitrate.includes('dsd') ||
    bitrate.includes('无损') ||
    bitrate.includes('lossless') ||
    bitrate.includes('24bit') ||
    bitrate.includes('96khz') ||
    bitrate.includes('192khz') ||
    codec.includes('flac') ||
    codec.includes('pcm') ||
    codec.includes('dsd') ||
    bitDepth.includes('24') ||
    bitDepth.includes('32') ||
    sampleRate.includes('96') ||
    sampleRate.includes('192');

  const sizeNum = parseFloat(song.fileSize || '0');
  const isLargeFile = (song.fileSize || '').toLowerCase().includes('mb') && sizeNum >= 18;

  return Boolean(hasLosslessExt || hasLosslessKeywords || isLargeFile);
}

/**
 * Generates "常听榜" (Top Played)
 * Ranked strictly by playCount descending. Filters tracks with playCount > 0.
 */
export function getTopPlayedSongs(songs: Song[], limit = 100): Song[] {
  return songs
    .filter(s => (s.playCount || 0) > 0)
    .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
    .slice(0, limit);
}

/**
 * Generates "最近播放" (Recently Played)
 * Chronological order by lastPlayedAt timestamp descending.
 */
export function getRecentlyPlayedSongs(songs: Song[], limit = 100): Song[] {
  return songs
    .filter(s => typeof s.lastPlayedAt === 'number' && s.lastPlayedAt > 0)
    .sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0))
    .slice(0, limit);
}

/**
 * Generates "无损精选" (Lossless Masterpieces)
 * Filters tracks with FLAC / APE / WAV / DSD / 24bit Hi-Res encoding.
 */
export function getLosslessSongs(songs: Song[], limit = 100): Song[] {
  return songs
    .filter(s => isLosslessSong(s))
    .sort((a, b) => {
      // Prioritize DSD & 24bit FLAC
      const scoreA = getAudioQualityScore(a);
      const scoreB = getAudioQualityScore(b);
      return scoreB - scoreA;
    })
    .slice(0, limit);
}

function getAudioQualityScore(song: Song): number {
  let score = 10;
  const text = `${song.bitrate || ''} ${song.codec || ''} ${song.bitDepth || ''} ${song.format || ''}`.toLowerCase();
  if (text.includes('dsd') || text.includes('dsf')) score += 50;
  if (text.includes('24bit') || text.includes('24-bit')) score += 30;
  if (text.includes('192khz')) score += 25;
  if (text.includes('96khz')) score += 20;
  if (text.includes('flac')) score += 15;
  if (text.includes('wav')) score += 10;
  return score;
}

/**
 * Dispatches a play event to the backend scrobble engine
 */
export async function recordSongPlay(
  song: Song, 
  deviceName = '网页高保真播放器'
): Promise<{ playCount: number; lastPlayedAt: number } | null> {
  try {
    const res = await fetch(`/api/songs/${encodeURIComponent(song.id)}/play`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device: deviceName,
        title: song.title,
        artist: song.artist,
        duration: song.duration
      })
    });
    if (res.ok) {
      const data = await res.json();
      return {
        playCount: data.playCount || (song.playCount || 0) + 1,
        lastPlayedAt: data.lastPlayedAt || Date.now()
      };
    }
  } catch (err) {
    console.warn('[DynamicPlaylist] Failed to scrobble play event:', err);
  }
  return null;
}

/**
 * Clears "最近播放" listening history
 */
export async function clearRecentHistory(): Promise<boolean> {
  try {
    const res = await fetch('/api/playlists/dynamic/recent', {
      method: 'DELETE'
    });
    return res.ok;
  } catch (err) {
    console.warn('[DynamicPlaylist] Failed to clear history:', err);
    return false;
  }
}

/**
 * Returns human-readable relative time representation (e.g. 5分钟前, 昨天 14:20)
 */
export function formatRelativeTime(timestamp?: number): string {
  if (!timestamp) return '未播放';

  const now = Date.now();
  const diff = now - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) {
    return '刚刚播放';
  } else if (diff < hour) {
    const mins = Math.floor(diff / minute);
    return `${mins} 分钟前`;
  } else if (diff < day) {
    const hrs = Math.floor(diff / hour);
    return `${hrs} 小时前`;
  } else if (diff < 2 * day) {
    const d = new Date(timestamp);
    const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `昨天 ${timeStr}`;
  } else if (diff < 7 * day) {
    const days = Math.floor(diff / day);
    return `${days} 天前`;
  } else {
    const d = new Date(timestamp);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }
}

export function isDynamicPlaylistId(id: string): id is DynamicPlaylistId {
  return id === 'dynamic:top_played' || id === 'dynamic:recently_played' || id === 'dynamic:lossless';
}
