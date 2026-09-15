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
  Check,
  Disc,
  Laptop,
  Speaker
} from 'lucide-react';
import { Song, XiaomiDevice, DeviceCommandState } from '../types';
import { formatTime } from '../utils/lyricParser';
import { useTheme } from '../context/ThemeContext';

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
  queueCount?: number;
  speakerVolume?: number;
  onSpeakerVolumeChange?: (vol: number) => void;
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
  onOpenSubsonic,
  queueCount,
  speakerVolume = 40,
  onSpeakerVolumeChange
}) => {
  const [isMuted, setIsMuted] = useState(false);
  const [prevVolume, setPrevVolume] = useState(volume);
  const [isHoveringProgress, setIsHoveringProgress] = useState(false);
  const [draggingSpeakerVol, setDraggingSpeakerVol] = useState<number | null>(null);
  const draggingSpeakerVolRef = useRef<number | null>(null);
  draggingSpeakerVolRef.current = draggingSpeakerVol;
  const progressBarRef = useRef<HTMLDivElement>(null);

  // Release commit listener across window so releasing outside the slider bounds still commits cleanly
  useEffect(() => {
    const handleGlobalRelease = () => {
      if (draggingSpeakerVolRef.current !== null) {
        const finalVal = draggingSpeakerVolRef.current;
        setDraggingSpeakerVol(null);
        if (onSpeakerVolumeChange) {
          onSpeakerVolumeChange(finalVal);
        }
      }
    };

    window.addEventListener('mouseup', handleGlobalRelease);
    window.addEventListener('touchend', handleGlobalRelease);
    return () => {
      window.removeEventListener('mouseup', handleGlobalRelease);
      window.removeEventListener('touchend', handleGlobalRelease);
    };
  }, [onSpeakerVolumeChange]);

  const toggleMute = () => {
    if (isCasting) {
      if (onSpeakerVolumeChange) {
        if (speakerVolume > 0) {
          onSpeakerVolumeChange(0);
        } else {
          onSpeakerVolumeChange(40);
        }
      }
      return;
    }

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

  const progressPercent = (currentSong && duration > 0) ? (currentTime / duration) * 100 : 0;

  const { themeConfig } = useTheme();
  const isLight = !!themeConfig?.isLight;

  return (
    <div className={`fixed bottom-0 left-0 right-0 z-50 h-24 playerbar-container backdrop-blur-2xl border-t flex flex-col justify-between transition-colors duration-300 ${
      isLight
        ? 'bg-white/95 border-zinc-200 text-zinc-900 shadow-[0_-6px_28px_rgba(0,0,0,0.08)]'
        : 'bg-black/85 border-white/10 text-zinc-100 shadow-[0_-8px_32px_rgba(0,0,0,0.7)]'
    }`}>
      {/* Top micro progress bar for visual seek */}
      <div 
        ref={progressBarRef}
        onClick={handleSeekClick}
        onMouseEnter={() => currentSong && setIsHoveringProgress(true)}
        onMouseLeave={() => setIsHoveringProgress(false)}
        className={`w-full h-1 bg-zinc-800/60 relative group transition-all ${
          currentSong ? 'cursor-pointer hover:h-2' : 'cursor-default opacity-40'
        }`}
      >
        <div 
          className="h-full bg-[#FF6700] transition-all duration-75 relative shadow-[0_0_10px_rgba(255,103,0,0.7)]"
          style={{ width: `${progressPercent}%` }}
        >
          {currentSong && (
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md scale-0 group-hover:scale-100 transition-transform" />
          )}
        </div>
      </div>

      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-2 sm:gap-4 flex-1">
        
        {/* Left: Song Info (Fixed width container with truncate) */}
        {currentSong ? (
          <div className="flex items-center gap-3 min-w-0 w-[240px] sm:w-[280px] lg:w-[320px] shrink-0">
            <div 
              onClick={onOpenLyrics}
              className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-lg overflow-hidden flex-shrink-0 cursor-pointer group shadow-lg border border-white/10"
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

            <div className="min-w-0 pr-1">
              <h4 
                onClick={onOpenLyrics}
                className="text-sm font-bold text-white truncate cursor-pointer hover:text-[#FF6700] transition"
                title={currentSong.title}
              >
                {currentSong.title}
              </h4>
              <p className="text-xs text-zinc-400 truncate mt-0.5">
                {currentSong.artist}
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[10px] font-bold border border-zinc-700 bg-zinc-800/80 rounded px-1.5 py-0.5 leading-none text-zinc-300 font-mono">
                  {currentSong.bitrate?.includes('FLAC') ? 'Lossless' : currentSong.bitrate || 'Hi-Fi'}
                </span>
                {isCasting ? (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-[#FF6700]/20 text-[#FF6700] border border-[#FF6700]/40 flex items-center gap-1 font-semibold">
                    <Speaker className="w-2.5 h-2.5 animate-pulse text-[#FF6700]" />
                    小爱音箱
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800/80 text-zinc-300 border border-white/10 flex items-center gap-1 font-medium">
                    <Laptop className="w-2.5 h-2.5 text-zinc-400" />
                    本地设备
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 min-w-0 w-[240px] sm:w-[280px] lg:w-[320px] shrink-0">
            <div 
              onClick={onOpenQueue}
              className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-900/90 border border-white/10 flex items-center justify-center text-zinc-600 shadow-inner cursor-pointer hover:border-[#FF6700]/40 transition group"
              title="点击打开播放队列"
            >
              <Disc className="w-6 h-6 sm:w-7 sm:h-7 opacity-40 group-hover:text-[#FF6700] group-hover:opacity-80 transition" />
            </div>

            <div className="min-w-0 pr-1">
              <h4 className="text-sm font-medium text-zinc-400 truncate flex items-center gap-1.5">
                暂无播放曲目
              </h4>
              <p className="text-xs text-zinc-600 truncate">
                从曲库点选歌曲播放
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[10px] font-bold border border-zinc-800 bg-zinc-900/80 rounded px-1.5 py-0.5 leading-none text-zinc-500 font-mono">
                  待命
                </span>
                {isCasting ? (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/30 flex items-center gap-1 font-medium">
                    <Speaker className="w-2.5 h-2.5 text-[#FF6700]" />
                    音箱待命
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-white/5 flex items-center gap-1 font-medium">
                    <Laptop className="w-2.5 h-2.5 text-zinc-400" />
                    本地就绪
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Center: Playback Controls */}
        <div className="flex flex-col items-center justify-center gap-1 shrink-0 px-2">
          <div className="flex items-center gap-3 sm:gap-5">
            <button
              id="btn-shuffle"
              onClick={onToggleShuffle}
              disabled={!currentSong}
              title={isShuffle ? '随机播放开启' : '随机播放关闭'}
              className={`p-1.5 rounded-full transition ${
                !currentSong
                  ? 'text-zinc-600 cursor-not-allowed opacity-40'
                  : (isShuffle ? 'text-[#FF6700] bg-[#FF6700]/15' : 'text-zinc-400 hover:text-white')
              }`}
            >
              <Shuffle className="w-4 h-4" />
            </button>

            <button
              id="btn-prev-song"
              onClick={onPrev}
              disabled={!currentSong}
              title="上一首"
              className={`p-1.5 sm:p-2 transition active:scale-95 ${
                !currentSong ? 'text-zinc-600 cursor-not-allowed opacity-40' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <SkipBack className="w-5 h-5 fill-current" />
            </button>

            <button
              id="btn-play-pause-song"
              onClick={onPlayPause}
              title={!currentSong ? '从曲库开始播放' : (isPlaying ? '暂停' : '播放')}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-transform ${
                !currentSong
                  ? 'bg-zinc-800 text-zinc-400 hover:bg-[#FF6700] hover:text-white hover:scale-105 active:scale-95 shadow-md cursor-pointer'
                  : 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:scale-105 active:scale-95'
              }`}
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
              disabled={!currentSong}
              title="下一首"
              className={`p-1.5 sm:p-2 transition active:scale-95 ${
                !currentSong ? 'text-zinc-600 cursor-not-allowed opacity-40' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <SkipForward className="w-5 h-5 fill-current" />
            </button>

            <button
              id="btn-repeat"
              onClick={onCycleRepeat}
              disabled={!currentSong}
              title={`循环模式: ${repeatMode === 'one' ? '单曲循环' : repeatMode === 'all' ? '列表循环' : '关闭'}`}
              className={`p-1.5 rounded-full transition relative ${
                !currentSong 
                  ? 'text-zinc-600 cursor-not-allowed opacity-40'
                  : (repeatMode !== 'off' ? 'text-[#FF6700] bg-[#FF6700]/15' : 'text-zinc-400 hover:text-white')
              }`}
            >
              <Repeat className="w-4 h-4" />
              {repeatMode === 'one' && (
                <span className="absolute -top-1 -right-1 text-[9px] font-bold text-[#FF6700]">1</span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500">
            <span>{formatTime(currentSong ? currentTime : 0)}</span>
            <span>/</span>
            <span>{formatTime(currentSong ? duration : 0)}</span>
          </div>
        </div>

        {/* Right: Output Target Router & Volume Controls (No overlap, proper flex & min-w-0) */}
        <div className="flex items-center justify-end gap-2 sm:gap-2.5 shrink-0 min-w-0">
          
          {/* Global Output Target Switcher: Local Browser vs Xiaomi Speaker */}
          <button
            id="btn-cast-xiaomi-speaker"
            onClick={onToggleCast}
            disabled={commandState?.status === 'pending'}
            title={
              commandState?.status === 'pending'
                ? `正在向 ${activeDevice?.name || '小米音箱'} 下发指令...`
                : commandState?.status === 'failed' || commandState?.status === 'timeout'
                  ? `投放未完成: ${commandState.error || '未响应'} (点击重试)`
                  : isCasting 
                    ? `【当前：音箱串流模式】点击关闭，切回电脑本地播放` 
                    : `【当前：电脑本地模式】点击打开，全盘接管投向 ${activeDevice?.name || '小爱音箱'}`
            }
            className={`flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer shadow-sm select-none shrink-0 ${
              commandState?.status === 'pending'
                ? isLight
                  ? 'bg-amber-100 text-amber-800 border border-amber-300 cursor-wait animate-pulse'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40 cursor-wait animate-pulse'
                : isCasting 
                  ? 'is-casting bg-gradient-to-r from-[#FF6700] to-orange-500 text-white shadow-[0_0_16px_rgba(255,103,0,0.55)] hover:brightness-110 active:scale-[0.98] border border-orange-400/40' 
                  : commandState?.status === 'failed' || commandState?.status === 'timeout'
                    ? isLight
                      ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 active:scale-[0.98]'
                      : 'bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25 active:scale-[0.98]'
                    : isLight
                      ? 'bg-zinc-100/90 hover:bg-zinc-200 text-zinc-800 hover:text-zinc-950 border border-zinc-300/80 hover:border-zinc-400 active:scale-[0.98]'
                      : 'bg-zinc-900/95 hover:bg-zinc-800 text-zinc-200 border border-white/15 hover:border-white/30 hover:text-white active:scale-[0.98]'
            }`}
          >
            {commandState?.status === 'pending' ? (
              <div className={`w-3.5 h-3.5 border-2 ${isLight ? 'border-amber-600' : 'border-amber-400'} border-t-transparent rounded-full animate-spin shrink-0`} />
            ) : isCasting ? (
              <div className="flex items-center gap-1 shrink-0">
                <Speaker className="w-3.5 h-3.5 animate-pulse text-white" />
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-ping" />
              </div>
            ) : (
              <div className="flex items-center gap-1 shrink-0">
                <Laptop className={`w-3.5 h-3.5 ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`} />
                <Cast className="w-3 h-3 text-[#FF6700]" />
              </div>
            )}
            <span className={`inline-block whitespace-nowrap tracking-tight ${
              isCasting ? 'text-white font-bold' : isLight ? 'text-zinc-900 font-semibold' : 'text-zinc-200 font-medium'
            }`}>
              {commandState?.status === 'pending'
                ? '下发中...'
                : isCasting
                  ? `音箱串流 · ${activeDevice?.name ? (activeDevice.name.length > 5 ? activeDevice.name.slice(0, 5) + '…' : activeDevice.name) : '小爱'}`
                  : commandState?.status === 'failed' || commandState?.status === 'timeout'
                    ? '重试投放'
                    : `投放至【${activeDevice?.name ? (activeDevice.name.length > 5 ? activeDevice.name.slice(0, 5) + '…' : activeDevice.name) : '音箱'}】`}
            </span>
          </button>

          {/* EQ Equalizer Toggle */}
          {onOpenEQ && (
            <button
              id="btn-open-eq-modal"
              onClick={onOpenEQ}
              title="10段专业均衡器 (EQ) 与频谱"
              className={`p-2 ${isLight ? 'text-zinc-600 hover:text-[#FF6700] hover:bg-zinc-200/70' : 'text-zinc-400 hover:text-[#FF6700] hover:bg-white/5'} rounded-full transition`}
            >
              <Sliders className="w-4.5 h-4.5" />
            </button>
          )}

          {/* Play Queue Drawer Toggle */}
          {onOpenQueue && (
            <button
              id="btn-open-queue-drawer"
              onClick={onOpenQueue}
              title={`查看当前播放队列 (${queueCount || 0} 首)`}
              className={`p-2 ${isLight ? 'text-zinc-600 hover:text-[#FF6700] hover:bg-zinc-200/70' : 'text-zinc-400 hover:text-[#FF6700] hover:bg-white/5'} rounded-full transition relative`}
            >
              <ListMusic className="w-4.5 h-4.5" />
              {queueCount !== undefined && queueCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#FF6700] text-white font-bold text-[9px] flex items-center justify-center shadow-[0_0_8px_rgba(255,103,0,0.8)]">
                  {queueCount > 99 ? '99+' : queueCount}
                </span>
              )}
            </button>
          )}

          {/* Subsonic Server Gate Toggle */}
          {onOpenSubsonic && (
            <button
              id="btn-open-subsonic-dashboard"
              onClick={onOpenSubsonic}
              title="Subsonic & OpenSubsonic 接口网关"
              className={`p-2 ${isLight ? 'text-zinc-600 hover:text-emerald-600 hover:bg-zinc-200/70' : 'text-zinc-400 hover:text-emerald-400 hover:bg-white/5'} rounded-full transition`}
            >
              <Server className="w-4.5 h-4.5" />
            </button>
          )}

          {/* Lyrics Full View Toggle */}
          <button
            id="btn-open-lyrics-modal"
            onClick={onOpenLyrics}
            title="查看动态歌词与试听"
            className={`p-2 ${isLight ? 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/70' : 'text-zinc-400 hover:text-white hover:bg-white/5'} rounded-full transition`}
          >
            <Mic2 className="w-4.5 h-4.5" />
          </button>

          {/* Dual-Mode Volume Control: Speaker Physical Volume vs Local Audio Volume */}
          <div className="hidden md:flex items-center gap-2">
            <button 
              id="btn-toggle-volume-mute"
              onClick={toggleMute}
              className={`p-1.5 transition ${isCasting ? 'text-[#FF6700] hover:text-[#e55c00]' : isLight ? 'text-zinc-600 hover:text-zinc-950' : 'text-zinc-400 hover:text-white'}`}
              title={
                isCasting 
                  ? `【音箱硬件音量: ${speakerVolume}%】点击切换静音` 
                  : (isMuted ? '取消静音' : '静音')
              }
            >
              {isCasting ? (
                speakerVolume === 0 ? (
                  <VolumeX className="w-4 h-4 text-rose-500" />
                ) : (
                  <Volume2 className="w-4 h-4 text-[#FF6700]" />
                )
              ) : isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4 text-rose-500" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <div className="w-24 flex items-center relative group/vol">
              {isCasting ? (
                // Speaker hardware volume slider with drag commit
                <>
                  {draggingSpeakerVol !== null && (
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md bg-[#FF6700] text-white text-[10px] font-mono font-bold whitespace-nowrap shadow-lg pointer-events-none z-20 animate-in fade-in zoom-in-95 duration-100">
                      {draggingSpeakerVol}% 松开下发
                    </div>
                  )}
                  <input 
                    id="input-speaker-hardware-volume-slider"
                    type="range" 
                    min="0" 
                    max="100" 
                    step="1"
                    value={draggingSpeakerVol !== null ? draggingSpeakerVol : speakerVolume}
                    onMouseDown={(e) => {
                      setDraggingSpeakerVol(Number((e.target as HTMLInputElement).value));
                    }}
                    onTouchStart={(e) => {
                      setDraggingSpeakerVol(Number((e.target as HTMLInputElement).value));
                    }}
                    onChange={(e) => {
                      setDraggingSpeakerVol(Number(e.target.value));
                    }}
                    onMouseUp={(e) => {
                      const targetVal = Number((e.target as HTMLInputElement).value);
                      setDraggingSpeakerVol(null);
                      if (onSpeakerVolumeChange) onSpeakerVolumeChange(targetVal);
                    }}
                    onTouchEnd={(e) => {
                      const targetVal = Number((e.target as HTMLInputElement).value);
                      setDraggingSpeakerVol(null);
                      if (onSpeakerVolumeChange) onSpeakerVolumeChange(targetVal);
                    }}
                    onKeyUp={(e) => {
                      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) {
                        const targetVal = Number((e.target as HTMLInputElement).value);
                        setDraggingSpeakerVol(null);
                        if (onSpeakerVolumeChange) onSpeakerVolumeChange(targetVal);
                      }
                    }}
                    title={`音箱硬件音量: ${draggingSpeakerVol !== null ? draggingSpeakerVol : speakerVolume}% (拖动中实时预览，松开下发)`}
                    className={`w-full h-1.5 ${isLight ? 'bg-zinc-200' : 'bg-zinc-800'} accent-[#FF6700] rounded-full cursor-pointer`}
                  />
                </>
              ) : (
                // Local browser audio volume slider
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
                  title={`电脑本地音量: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
                  className={`w-full h-1.5 ${isLight ? 'bg-zinc-200' : 'bg-zinc-800'} accent-[#FF6700] rounded-full cursor-pointer`}
                />
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
