export interface PodcastEpisodeProgress {
  episodeId: string;
  podcastTitle: string;
  episodeTitle: string;
  audioUrl: string;
  coverUrl?: string;
  currentTime: number;
  duration: number;
  lastPlayedAt: number; // timestamp ms
  completed: boolean;
}

const STORAGE_KEY = 'tinglan_podcast_progress_v1';

export function getAllPodcastProgress(): Record<string, PodcastEpisodeProgress> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('[PodcastProgress] Failed to load progress from localStorage', e);
  }
  return {};
}

export function savePodcastProgress(progress: PodcastEpisodeProgress): void {
  try {
    const all = getAllPodcastProgress();
    // mark completed if listened over 95% or within last 30 seconds
    if (progress.duration > 0 && (progress.currentTime / progress.duration >= 0.95 || progress.duration - progress.currentTime < 30)) {
      progress.completed = true;
    } else {
      progress.completed = false;
    }
    all[progress.episodeId] = progress;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch (e) {
    console.warn('[PodcastProgress] Failed to save progress', e);
  }
}

export function getEpisodeProgress(episodeId: string): PodcastEpisodeProgress | null {
  const all = getAllPodcastProgress();
  return all[episodeId] || null;
}

export function clearEpisodeProgress(episodeId: string): void {
  try {
    const all = getAllPodcastProgress();
    delete all[episodeId];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch (e) {}
}

export function clearAllPodcastProgress(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {}
}

/**
 * Returns episodes that are currently in-progress (not completed and currentTime > 5s)
 * sorted by lastPlayedAt descending.
 */
export function getInProgressEpisodes(): PodcastEpisodeProgress[] {
  const all = getAllPodcastProgress();
  return Object.values(all)
    .filter(p => !p.completed && p.currentTime > 5 && p.duration > 0)
    .sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0));
}

/**
 * Format seconds into HH:MM:SS or MM:SS
 */
export function formatPodcastTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Parses pubDate or returns if published within last 7 days
 */
export function isNewEpisode(pubDateStr?: string): boolean {
  if (!pubDateStr) return false;
  try {
    const pubTime = new Date(pubDateStr).getTime();
    if (isNaN(pubTime)) return false;
    const now = Date.now();
    const diffDays = (now - pubTime) / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays <= 7;
  } catch {
    return false;
  }
}
