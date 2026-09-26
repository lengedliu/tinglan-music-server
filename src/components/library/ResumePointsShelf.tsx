import React, { useEffect, useState, useCallback } from 'react';
import { Play, Sparkles, Clock, Smartphone, Radio, X, RotateCcw, ArrowRight } from 'lucide-react';
import { Song, XiaomiDevice } from '../../types';
import { apiFetch } from '../../utils/api';
import { useTheme } from '../../context/ThemeContext';
import { useAppEvents } from '../../context/AppEventsContext';

export interface ResumePointItem {
  id: string;
  userId: string;
  songId: string;
  songTitle?: string;
  songArtist?: string;
  songAlbum?: string;
  songCoverUrl?: string;
  deviceDid?: string;
  deviceName?: string;
  resumePositionSeconds: number;
  durationSeconds: number;
  progressPercent: number;
  isCompleted: boolean;
  updatedAt: string;
  song?: Song;
}

interface ResumePointsShelfProps {
  onPlaySong: (song: Song, startPositionSeconds?: number) => void;
  onCastSongToXiaomi?: (song: Song, targetDid?: string) => void;
  activeDevice?: XiaomiDevice;
  currentSongId?: string;
}

export const ResumePointsShelf: React.FC<ResumePointsShelfProps> = ({
  onPlaySong,
  onCastSongToXiaomi,
  activeDevice,
  currentSongId
}) => {
  const { theme } = useTheme();
  const { isConnected, subscribe } = useAppEvents();
  const [resumePoints, setResumePoints] = useState<ResumePointItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchResumePoints = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/music/resume-points/list?limit=10&includeCompleted=false');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.points)) {
          setResumePoints(data.points);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch resume points:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Real-time instant sync via SSE event bus (zero latency on save/delete/finish)
  useEffect(() => {
    fetchResumePoints();
    const unsub = subscribe('resume:change', () => {
      fetchResumePoints();
    });
    return () => unsub();
  }, [fetchResumePoints, subscribe]);

  // Fallback sync ONLY when offline (Zero continuous polling while SSE stream is active)
  useEffect(() => {
    if (isConnected) return;
    const interval = setInterval(fetchResumePoints, 30000);
    return () => clearInterval(interval);
  }, [isConnected, fetchResumePoints]);

  const handleDelete = async (e: React.MouseEvent, songId: string) => {
    e.stopPropagation();
    try {
      setResumePoints(prev => prev.filter(p => p.songId !== songId));
      await apiFetch(`/api/music/${encodeURIComponent(songId)}/resume`, {
        method: 'DELETE'
      });
    } catch (err) {
      console.warn('Failed to delete resume point:', err);
    }
  };

  const handleResumePlay = (point: ResumePointItem) => {
    const songToPlay: Song = point.song || {
      id: point.songId,
      title: point.songTitle || '未知曲目',
      artist: point.songArtist || '未知艺术家',
      album: point.songAlbum || '断点续播专辑',
      url: `/api/stream/${encodeURIComponent(point.songId)}`,
      coverUrl: point.songCoverUrl,
      duration: point.durationSeconds,
      genre: '长音频/断点'
    };
    onPlaySong(songToPlay, point.resumePositionSeconds);
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    if (m >= 60) {
      const h = Math.floor(m / 60);
      const remM = m % 60;
      return `${h}:${remM.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (!resumePoints || resumePoints.length === 0) {
    return null;
  }

  return (
    <div className="mb-6 rounded-2xl bg-gradient-to-r from-emerald-900/30 via-slate-900/40 to-cyan-900/30 border border-emerald-500/20 p-4 shadow-lg backdrop-blur-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
            <RotateCcw className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
              跨端断点续播 · 继续收听
              <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {(resumePoints || []).length} 首未完曲目
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              自动记录长音频及交响乐进度，支持手机、电脑与小爱音箱无缝接力
            </p>
          </div>
        </div>
        <button
          onClick={fetchResumePoints}
          className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-white/5 transition-colors"
          title="刷新续播进度"
        >
          刷新
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {resumePoints.map((point) => {
          const isCurrent = currentSongId === point.songId;
          const posStr = formatSeconds(point.resumePositionSeconds);
          const durStr = formatSeconds(point.durationSeconds);
          const percent = Math.min(100, Math.max(0, Math.round(point.progressPercent || 0)));

          return (
            <div
              key={point.id}
              onClick={() => handleResumePlay(point)}
              className={`group relative flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer overflow-hidden ${
                isCurrent
                  ? 'bg-emerald-500/15 border-emerald-500/40 shadow-emerald-950/40 shadow-md'
                  : 'bg-slate-800/60 hover:bg-slate-800/90 border-slate-700/50 hover:border-emerald-500/30'
              }`}
            >
              {/* Cover */}
              <div className="relative w-12 h-12 rounded-lg bg-slate-700 overflow-hidden flex-shrink-0">
                {point.songCoverUrl ? (
                  <img
                    src={point.songCoverUrl}
                    alt={point.songTitle}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400">
                    <Sparkles className="w-5 h-5" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 pr-6">
                <h4 className="text-xs font-semibold text-slate-100 truncate group-hover:text-emerald-300 transition-colors">
                  {point.songTitle || '未知曲目'}
                </h4>
                <p className="text-[11px] text-slate-400 truncate">
                  {point.songArtist || '未知艺术家'}
                </p>

                {/* Progress Bar & Badges */}
                <div className="mt-1.5">
                  <div className="w-full bg-slate-700/80 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-emerald-400 h-full rounded-full transition-all duration-300"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1 text-[10px] text-slate-400">
                    <span className="font-mono text-emerald-400">
                      {posStr} <span className="text-slate-500">/ {durStr}</span>
                    </span>
                    <span className="flex items-center gap-1 text-[9px] text-slate-400">
                      {point.deviceName ? (
                        <>
                          <Radio className="w-2.5 h-2.5 text-cyan-400" />
                          <span className="truncate max-w-[60px]">{point.deviceName}</span>
                        </>
                      ) : (
                        <>
                          <Smartphone className="w-2.5 h-2.5 text-slate-400" />
                          <span>网页端</span>
                        </>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Delete button */}
              <button
                onClick={(e) => handleDelete(e, point.songId)}
                className="absolute top-2 right-2 p-1 text-slate-500 hover:text-rose-400 rounded-md hover:bg-slate-700/50 transition-colors"
                title="已听完 / 移除续播记录"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
