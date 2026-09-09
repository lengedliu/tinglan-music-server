import React, { useRef, useState, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  VolumeX, 
  Repeat, 
  Shuffle, 
  Mic2, 
  Radio, 
  Cast, 
  ListMusic,
  Sliders,
  Server,
  Check
} from 'lucide-react';
import { Song, XiaomiDevice, DeviceCommandState } from '../types';
import { formatTime } from '../utils/lyricParser';

interface PlayerBarProps {
  currentSong: Song | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (time: number) => void;
  volume: number;
  onVolumeChange: (vol: number) => void;
  activeDevice: XiaomiDevice | undefined;
  isCasting: boolean;
  commandState?: DeviceCommandState;
  onToggleCast: () => void;
  onOpenLyrics: () => void;
  onOpenXiaomiPanel: () => void;
  isShuffle: boolean;
  onToggleShuffle: () => void;
  repeatMode: 'off' | 'all' | 'one';
  onCycleRepeat: () => void;
  onOpenEQ?: () => void;
  onOpenQueue?: () => void;
  onOpenSubsonic?: () => void;
}

export const PlayerBar: React.FC<PlayerBarProps> = ({
  currentSong,
  isPlaying,
  currentTime,
  duration,
  onPlayPause,
  onNext,
  onPrev,
  onSeek,
  volume,
  onVolumeChange,
  activeDevice,
  isCasting,
  commandState,
  onToggleCast,
  onOpenLyrics,
  onOpenXiaomiPanel,
  isShuffle,
  onToggleShuffle,
  repeatMode,
  onCycleRepeat,
  onOpenEQ,
  onOpenQueue,
  onOpenSubsonic
}) => {
  const [isMuted, setIsMuted] = useState(false);
  const [prevVolume, setPrevVolume] = useState(volume);
  const [isHoveringProgress, setIsHoveringProgress] = useState(false);
  const progressBarRef = useRef<HTMLDivElement>(null);

  const toggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      onVolumeChange(prevVolume || 0.7);
    } else {
      setPrevVolume(volume);
      setIsMuted(true);
      onVolumeChange(0);
    }
  };

  const handleSeekClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || duration <= 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(percentage * duration);
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (!currentSong) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 h-24 bg-black/80 backdrop-blur-2xl border-t border-white/10 text-zinc-100 flex flex-col justify-between shadow-[0_-8px_32px_rgba(0,0,0,0.7)]">
      {/* Top micro progress bar for visual seek */}
      <div 
        ref={progressBarRef}
        onClick={handleSeekClick}
        onMouseEnter={() => setIsHoveringProgress(true)}
        onMouseLeave={() => setIsHoveringProgress(false)}
        className="w-full h-1 bg-zinc-800/60 cursor-pointer relative group transition-all hover:h-2"
      >
        <div 
          className="h-full bg-[#FF6700] transition-all duration-75 relative shadow-[0_0_10px_rgba(255,103,0,0.7)]"
          style={{ width: `${progressPercent}%` }}
        >
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md scale-0 group-hover:scale-100 transition-transform" />
        </div>
      </div>

      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-4 flex-1">
        
        {/* Left: Song Info */}
        <div className="flex items-center gap-3.5 min-w-0 w-1/4 sm:w-1/3">
          <div 
            onClick={onOpenLyrics}
            className="relative w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 cursor-pointer group shadow-lg border border-white/10"
          >
            <img 
              src={currentSong.coverUrl} 
              alt={currentSong.title}
              className={`w-full h-full object-cover transition duration-300 ${isPlaying ? 'scale-105' : 'group-hover:scale-105'}`}
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Mic2 className="w-5 h-5 text-white" />
            </div>
          </div>

          <div className="min-w-0 pr-2">
            <h4 
              onClick={onOpenLyrics}
              className="text-sm font-bold text-white truncate cursor-pointer hover:text-[#FF6700] transition"
              title={currentSong.title}
            >
              {currentSong.title}
            </h4>
            <p className="text-xs text-zinc-400 truncate">
              {currentSong.artist}
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-[10px] font-bold border border-zinc-700 bg-zinc-800/80 rounded px-1.5 py-0.5 leading-none text-zinc-300 font-mono">
                {currentSong.bitrate?.includes('FLAC') ? 'Lossless' : currentSong.bitrate || 'Hi-Fi'}
              </span>
              {isCasting && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/30 flex items-center gap-1 font-medium">
                  <Radio className="w-2.5 h-2.5 animate-pulse" />
                  已投向音箱
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Center: Playback Controls */}
        <div className="flex flex-col items-center gap-1 flex-1 max-w-md">
          <div className="flex items-center gap-4 sm:gap-6">
            <button
              id="btn-shuffle"
              onClick={onToggleShuffle}
              title={isShuffle ? '随机播放开启' : '随机播放关闭'}
              className={`p-1.5 rounded-full transition ${isShuffle ? 'text-[#FF6700] bg-[#FF6700]/15' : 'text-zinc-400 hover:text-white'}`}
            >
              <Shuffle className="w-4 h-4" />
            </button>

            <button
              id="btn-prev-song"
              onClick={onPrev}
              title="上一首"
              className="p-2 text-zinc-400 hover:text-white transition active:scale-95"
            >
              <SkipBack className="w-5 h-5 fill-current" />
            </button>

            <button
              id="btn-play-pause-song"
              onClick={onPlayPause}
              title={isPlaying ? '暂停' : '播放'}
              className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:scale-105 active:scale-95 transition-transform"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </button>

            <button
              id="btn-next-song"
              onClick={onNext}
              title="下一首"
              className="p-2 text-zinc-400 hover:text-white transition active:scale-95"
            >
              <SkipForward className="w-5 h-5 fill-current" />
            </button>

            <button
              id="btn-repeat"
              onClick={onCycleRepeat}
              title={`循环模式: ${repeatMode === 'one' ? '单曲循环' : repeatMode === 'all' ? '列表循环' : '关闭'}`}
              className={`p-1.5 rounded-full transition relative ${repeatMode !== 'off' ? 'text-[#FF6700] bg-[#FF6700]/15' : 'text-zinc-400 hover:text-white'}`}
            >
              <Repeat className="w-4 h-4" />
              {repeatMode === 'one' && (
                <span className="absolute -top-1 -right-1 text-[9px] font-bold text-[#FF6700]">1</span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-500">
            <span>{formatTime(currentTime)}</span>
            <span>/</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Right: Speaker Cast & Volume Controls */}
        <div className="flex items-center justify-end gap-3 sm:gap-4 w-1/4 sm:w-1/3">
          
          {/* Cast to Xiaomi Speaker Button */}
          <button
            id="btn-cast-xiaomi-speaker"
            onClick={onToggleCast}
            disabled={commandState?.status === 'pending'}
            title={
              commandState?.status === 'pending'
                ? `正在向 ${activeDevice?.name || '小米音箱'} 下发指令...`
                : commandState?.status === 'failed' || commandState?.status === 'timeout'
                  ? `投放未完成: ${commandState.error || '未响应'} (点击重试)`
                  : (isCasting ? `点击断开与 ${activeDevice?.name} 投放` : `点击推送到 ${activeDevice?.name || '小米音箱'}`)
            }
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition shadow-sm ${
              commandState?.status === 'pending'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 cursor-wait animate-pulse'
                : isCasting 
                  ? 'bg-[#FF6700] text-white shadow-[0_0_15px_rgba(255,103,0,0.5)] hover:bg-[#e55c00]' 
                  : commandState?.status === 'failed' || commandState?.status === 'timeout'
                    ? 'bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25'
                    : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 border border-white/10 hover:border-white/20'
            }`}
          >
            {commandState?.status === 'pending' ? (
              <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Cast className={`w-3.5 h-3.5 ${isCasting ? 'animate-pulse' : (commandState?.status === 'failed' ? 'text-red-400' : 'text-[#FF6700]')}`} />
            )}
            <span className="hidden sm:inline">
              {commandState?.status === 'pending'
                ? '指令下发中...'
                : isCasting
                  ? '音箱串流中'
                  : commandState?.status === 'failed' || commandState?.status === 'timeout'
                    ? '投放失败'
                    : '投放小米音箱'}
            </span>
          </button>

          {/* EQ Equalizer Toggle */}
          {onOpenEQ && (
            <button
              id="btn-open-eq-modal"
              onClick={onOpenEQ}
              title="10段专业均衡器 (EQ) 与频谱"
              className="p-2 text-zinc-400 hover:text-[#FF6700] hover:bg-white/5 rounded-full transition"
            >
              <Sliders className="w-4.5 h-4.5" />
            </button>
          )}

          {/* Play Queue Drawer Toggle */}
          {onOpenQueue && (
            <button
              id="btn-open-queue-drawer"
              onClick={onOpenQueue}
              title="查看当前播放队列"
              className="p-2 text-zinc-400 hover:text-[#FF6700] hover:bg-white/5 rounded-full transition"
            >
              <ListMusic className="w-4.5 h-4.5" />
            </button>
          )}

          {/* Subsonic Server Gate Toggle */}
          {onOpenSubsonic && (
            <button
              id="btn-open-subsonic-dashboard"
              onClick={onOpenSubsonic}
              title="Subsonic & OpenSubsonic 接口网关"
              className="p-2 text-zinc-400 hover:text-emerald-400 hover:bg-white/5 rounded-full transition"
            >
              <Server className="w-4.5 h-4.5" />
            </button>
          )}

          {/* Lyrics Full View Toggle */}
          <button
            id="btn-open-lyrics-modal"
            onClick={onOpenLyrics}
            title="查看动态歌词与试听"
            className="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-full transition"
          >
            <Mic2 className="w-4.5 h-4.5" />
          </button>

          {/* Volume Control */}
          <div className="hidden md:flex items-center gap-2">
            <button 
              id="btn-toggle-volume-mute"
              onClick={toggleMute}
              className="p-1.5 text-zinc-400 hover:text-white transition"
              title={isMuted ? '取消静音' : '静音'}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4 text-rose-400" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <div className="w-20 flex items-center">
              <input 
                id="input-audio-volume-slider"
                type="range" 
                min="0" 
                max="1" 
                step="0.01"
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setIsMuted(false);
                  onVolumeChange(val);
                }}
                className="w-full h-1 bg-zinc-800 accent-[#FF6700] rounded-full cursor-pointer"
              />
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
