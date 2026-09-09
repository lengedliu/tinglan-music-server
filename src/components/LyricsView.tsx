import React, { useEffect, useRef, useMemo, useState } from 'react';
import { 
  Radio, 
  Volume2, 
  Mic2, 
  Disc, 
  Cast, 
  Music, 
  Sparkles,
  Share2,
  Maximize2,
  Clock,
  Search,
  RotateCcw,
  Plus,
  Minus
} from 'lucide-react';
import { Song, XiaomiDevice } from '../types';
import { parseLrc, formatTime } from '../utils/lyricParser';
import { apiFetch } from '../utils/api';

interface LyricsViewProps {
  currentSong: Song | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onSeek: (time: number) => void;
  activeDevice: XiaomiDevice | undefined;
  isCasting: boolean;
  onToggleCast: () => void;
  onSongUpdated?: (updatedSong: Song) => void;
}

export const LyricsView: React.FC<LyricsViewProps> = ({
  currentSong,
  currentTime,
  duration,
  isPlaying,
  onSeek,
  activeDevice,
  isCasting,
  onToggleCast,
  onSongUpdated
}) => {
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);

  const [lyricOffset, setLyricOffset] = useState<number>(0);
  const [isSearchingLyrics, setIsSearchingLyrics] = useState<boolean>(false);

  const parsedLyrics = useMemo(() => {
    if (!currentSong?.lyrics) return [];
    return parseLrc(currentSong.lyrics);
  }, [currentSong?.lyrics]);

  // Adjusted time considering offset
  const effectiveTime = currentTime + lyricOffset;

  // Find index of currently active lyric
  const activeIndex = useMemo(() => {
    if (parsedLyrics.length === 0) return -1;
    let idx = -1;
    for (let i = 0; i < parsedLyrics.length; i++) {
      if (effectiveTime >= parsedLyrics[i].time) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [parsedLyrics, effectiveTime]);

  // Scroll active lyric into view
  useEffect(() => {
    if (activeLineRef.current && lyricsContainerRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, [activeIndex]);

  // Fetch / Auto Match Lyrics
  const handleFetchOnlineLyrics = async () => {
    if (!currentSong) return;
    setIsSearchingLyrics(true);
    try {
      const res = await apiFetch('/api/lyrics/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songId: currentSong.id,
          title: currentSong.title,
          artist: currentSong.artist
        })
      });
      const data = await res.json();
      if (data.success && data.lyrics) {
        const updated = { ...currentSong, lyrics: data.lyrics };
        if (onSongUpdated) onSongUpdated(updated);
      }
    } catch (e) {
      console.warn('Lyrics fetch error:', e);
    } finally {
      setIsSearchingLyrics(false);
    }
  };

  if (!currentSong) {
    return (
      <div className="py-24 text-center text-zinc-500">
        <Disc className="w-16 h-16 mx-auto mb-4 opacity-25 animate-spin duration-3000" />
        <h3 className="text-lg font-medium text-zinc-400">暂无正在播放的歌曲</h3>
        <p className="text-xs text-zinc-600 mt-1">请从音乐曲库中挑选一首歌曲开始播放</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-28">
      
      {/* Top Status Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 rounded-3xl bg-zinc-950/80 border border-white/10 backdrop-blur-md shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-[#FF6700]/20 text-[#FF6700] border border-[#FF6700]/30 shadow-[0_0_10px_rgba(255,103,0,0.3)]">
            <Mic2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2 tracking-tight">
              实时动态歌词
              <span className="text-xs font-normal text-zinc-400 font-mono">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </h2>
            <p className="text-xs text-zinc-400">
              支持 Songloft LRC 时间轴滚动，点击歌词即可精准跳转进度
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Lyric Sync Offset Adjustment Controls */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900 border border-white/10 text-xs font-mono">
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-zinc-300">
              {lyricOffset > 0 ? `+${lyricOffset.toFixed(1)}s` : `${lyricOffset.toFixed(1)}s`}
            </span>
            <button
              onClick={() => setLyricOffset(prev => prev - 0.5)}
              className="p-1 hover:bg-white/10 rounded text-zinc-400 hover:text-white"
              title="歌词延后 0.5 秒"
            >
              <Minus className="w-3 h-3" />
            </button>
            <button
              onClick={() => setLyricOffset(prev => prev + 0.5)}
              className="p-1 hover:bg-white/10 rounded text-zinc-400 hover:text-white"
              title="歌词提前 0.5 秒"
            >
              <Plus className="w-3 h-3" />
            </button>
            {lyricOffset !== 0 && (
              <button
                onClick={() => setLyricOffset(0)}
                className="p-1 hover:bg-white/10 rounded text-[#FF6700]"
                title="复位时间差"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Auto Search Lyrics */}
          <button
            onClick={handleFetchOnlineLyrics}
            disabled={isSearchingLyrics}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-xs font-semibold text-zinc-200 transition disabled:opacity-50"
          >
            <Search className={`w-3.5 h-3.5 ${isSearchingLyrics ? 'animate-spin text-[#FF6700]' : ''}`} />
            <span>{isSearchingLyrics ? '匹配歌词中...' : '在线匹配歌词'}</span>
          </button>

          <button
            id="btn-lyrics-toggle-cast"
            onClick={onToggleCast}
            className={`flex items-center gap-2 px-5 py-2 rounded-full text-xs font-semibold transition ${
              isCasting
                ? 'bg-[#FF6700] text-white shadow-[0_0_15px_rgba(255,103,0,0.4)]'
                : 'bg-white/10 hover:bg-white/20 text-white border border-white/10'
            }`}
          >
            <Radio className={`w-4 h-4 ${isCasting ? 'animate-pulse' : 'text-[#FF6700]'}`} />
            <span>
              {isCasting ? `投放中: ${activeDevice?.name}` : `投放至 ${activeDevice?.name || '小米音箱'}`}
            </span>
          </button>
        </div>
      </div>

      {/* Main Lyrics & Vinyl Layout with Immersive UI Styling */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start min-h-[520px]">
        
        {/* Left Column: Vinyl Record & Song Meta */}
        <div className="lg:col-span-5 relative overflow-hidden flex flex-col items-center justify-center p-8 rounded-3xl bg-zinc-900/40 backdrop-blur-md border border-white/5 text-center space-y-6">
          <div className="absolute top-1/4 w-48 h-48 rounded-full bg-[#FF6700]/10 blur-[60px] pointer-events-none" />

          {/* Vinyl Disc with Spinning Animation */}
          <div className="relative group my-4">
            <div className="w-60 h-60 sm:w-72 sm:h-72 rounded-full bg-gradient-to-tr from-zinc-950 via-zinc-900 to-zinc-950 p-2 shadow-[0_20px_50px_rgba(0,0,0,0.8)] border-4 border-zinc-800/80 flex items-center justify-center relative">
              
              {/* Vinyl Grooves texture */}
              <div className="absolute inset-4 rounded-full border border-zinc-800/80 pointer-events-none" />
              <div className="absolute inset-8 rounded-full border border-zinc-800/50 pointer-events-none" />
              <div className="absolute inset-12 rounded-full border border-zinc-800/40 pointer-events-none" />
              <div className="absolute inset-16 rounded-full border border-zinc-800/30 pointer-events-none" />

              {/* Album Art Core */}
              <div 
                className={`w-32 h-32 sm:w-36 sm:h-36 rounded-full overflow-hidden shadow-inner border-2 border-zinc-700 relative z-10 ${
                  isPlaying ? 'animate-[spin_12s_linear_infinite]' : ''
                }`}
              >
                <img 
                  src={currentSong.coverUrl} 
                  alt={currentSong.title}
                  className="w-full h-full object-cover"
                />
                {/* Center hole */}
                <div className="absolute inset-0 m-auto w-6 h-6 rounded-full bg-zinc-950 border-2 border-zinc-600" />
              </div>

            </div>

            {/* Pulsing Cast badge if casting */}
            {isCasting && (
              <div className="absolute bottom-2 right-2 px-3.5 py-1.5 rounded-full bg-[#FF6700] text-white text-xs font-semibold shadow-[0_0_12px_rgba(255,103,0,0.5)] flex items-center gap-1.5 backdrop-blur-sm">
                <Radio className="w-3.5 h-3.5 animate-pulse" />
                <span>小爱播放中</span>
              </div>
            )}
          </div>

          {/* Song Info */}
          <div className="space-y-1 w-full max-w-sm">
            <h3 className="text-xl font-bold text-white truncate tracking-tight">
              {currentSong.title}
            </h3>
            <p className="text-sm font-semibold text-[#FF6700] truncate">
              {currentSong.artist}
            </p>
            <p className="text-xs text-zinc-400 truncate">
              专辑：{currentSong.album} · {currentSong.year || '2024'}
            </p>
          </div>

          {/* Audio Spec Badges */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <span className="px-3 py-1 rounded-full bg-zinc-950/60 text-zinc-300 text-xs font-mono border border-white/5">
              {currentSong.bitrate || 'FLAC 24bit/96kHz'}
            </span>
            <span className="px-3 py-1 rounded-full bg-zinc-950/60 text-zinc-300 text-xs font-mono border border-white/5">
              {currentSong.genre || '高保真音频'}
            </span>
            <span className="px-3 py-1 rounded-full bg-zinc-950/60 text-zinc-400 text-xs font-mono border border-white/5">
              {currentSong.fileSize || '32 MB'}
            </span>
          </div>

          {/* Live Waveform Indicator */}
          <div className="flex items-center gap-1.5 h-6 pt-2">
            {[40, 70, 25, 90, 60, 30, 85, 45, 95, 50, 75, 35].map((height, i) => (
              <span
                key={i}
                className={`w-1 rounded-full bg-gradient-to-t from-[#FF6700] to-amber-400 transition-all duration-150 ${
                  isPlaying ? 'opacity-90 shadow-[0_0_6px_rgba(255,103,0,0.5)]' : 'opacity-20'
                }`}
                style={{
                  height: isPlaying ? `${Math.max(15, (height * ((i % 3) + 1) * 0.4) % 100)}%` : '20%'
                }}
              />
            ))}
          </div>

        </div>

        {/* Right Column: Synchronized Lyrics Stream */}
        <div className="lg:col-span-7 bg-zinc-900/40 backdrop-blur-md border border-white/5 rounded-3xl p-6 sm:p-8 flex flex-col h-[520px]">
          
          <div className="flex items-center justify-between pb-4 border-b border-white/5 mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              歌词文本 ({parsedLyrics.length} 行)
            </span>
            <span className="text-xs text-zinc-500">
              点击歌词即时定位
            </span>
          </div>

          {/* Scrollable lyrics area */}
          <div 
            ref={lyricsContainerRef}
            className="flex-1 overflow-y-auto space-y-4 pr-3 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent select-none text-center"
          >
            {parsedLyrics.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-2">
                <Music className="w-10 h-10 opacity-30" />
                <p className="text-sm">该曲目暂无 LRC 歌词数据</p>
                <p className="text-xs text-zinc-600">支持在导入或编辑歌曲时粘贴标准 [00:00.00] 歌词</p>
              </div>
            ) : (
              parsedLyrics.map((line, index) => {
                const isActive = index === activeIndex;
                const isPassed = index < activeIndex;

                return (
                  <div
                    key={`${line.time}-${index}`}
                    ref={isActive ? activeLineRef : null}
                    onClick={() => onSeek(line.time)}
                    className={`py-2 px-4 rounded-2xl cursor-pointer transition-all duration-300 ${
                      isActive
                        ? 'bg-[#FF6700]/15 text-[#FF6700] text-lg sm:text-xl font-bold scale-102 shadow-[0_0_20px_rgba(255,103,0,0.15)] border border-[#FF6700]/30'
                        : isPassed
                        ? 'text-zinc-500 hover:text-zinc-300 text-sm sm:text-base font-medium'
                        : 'text-zinc-400 hover:text-zinc-200 text-sm sm:text-base font-medium'
                    }`}
                  >
                    <p className="leading-relaxed tracking-wide">
                      {line.text}
                    </p>
                    {line.translation && (
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {line.translation}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>

        </div>

      </div>

    </div>
  );
};
