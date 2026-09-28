import React, { memo, useState } from 'react';
import { 
  Play, 
  Pause, 
  SkipForward, 
  Disc, 
  Radio, 
  Sliders, 
  ListMusic, 
  Speaker 
} from 'lucide-react';
import { Song, XiaomiDevice, DeviceCommandState, SleepTimerConfig, ABLoopConfig } from '../../types';
import { usePlaybackTime } from '../../context/PlaybackTimeContext';
import { useTheme } from '../../context/ThemeContext';
import { MobilePlayerActionsSheet } from './MobilePlayerActionsSheet';

export interface MobileMiniPlayerProps {
  currentSong: Song | null;
  isPlaying: boolean;
  currentTime?: number;
  duration?: number;
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
  isShuffle: boolean;
  onToggleShuffle: () => void;
  repeatMode: 'off' | 'all' | 'one';
  onCycleRepeat: () => void;
  onOpenEQ?: () => void;
  onOpenQueue?: () => void;
  queueCount?: number;
  speakerVolume?: number;
  onSpeakerVolumeChange?: (vol: number) => void;
  playbackSpeed?: number;
  onPlaybackSpeedChange?: (speed: number) => void;
  sleepTimer?: SleepTimerConfig;
  onOpenSleepTimer?: () => void;
  onOpenVinyl?: () => void;
  onOpenMultiRoom?: () => void;
  onOpenInspector?: () => void;
  abLoop?: ABLoopConfig;
  onToggleABLoop?: () => void;
}

export const MobileMiniPlayer: React.FC<MobileMiniPlayerProps> = memo(({
  currentSong,
  isPlaying,
  currentTime: propCurrentTime,
  duration: propDuration,
  onPlayPause,
  onNext,
  onPrev: _onPrev,
  onSeek: _onSeek,
  volume,
  onVolumeChange,
  activeDevice,
  isCasting,
  commandState,
  onToggleCast,
  onOpenLyrics,
  isShuffle: _isShuffle,
  onToggleShuffle: _onToggleShuffle,
  repeatMode: _repeatMode,
  onCycleRepeat: _onCycleRepeat,
  onOpenEQ,
  onOpenQueue,
  queueCount,
  speakerVolume,
  onSpeakerVolumeChange,
  playbackSpeed,
  onPlaybackSpeedChange,
  sleepTimer,
  onOpenSleepTimer,
  onOpenVinyl,
  onOpenMultiRoom,
  onOpenInspector,
  abLoop,
  onToggleABLoop
}) => {
  const { themeConfig, isLight: ctxIsLight } = useTheme();
  const isLight = Boolean(ctxIsLight ?? themeConfig?.isLight);
  const playbackTime = usePlaybackTime();
  const [isActionsSheetOpen, setIsActionsSheetOpen] = useState(false);

  const isRadio = Boolean(
    currentSong && (
      currentSong.url?.includes('/api/radio/stream') ||
      currentSong.id?.startsWith('st_') ||
      currentSong.id?.startsWith('radio_') ||
      currentSong.album === 'RADIO'
    )
  );

  const isPodcast = Boolean(
    currentSong && (
      currentSong.url?.includes('/api/radio/proxy') ||
      currentSong.id?.startsWith('ep_') ||
      currentSong.album === '网络广播/播客' ||
      currentSong.album === 'PODCAST'
    )
  );

  const currentTime = propCurrentTime !== undefined ? propCurrentTime : playbackTime.currentTime;
  const duration = (propDuration !== undefined ? propDuration : playbackTime.duration) || currentSong?.duration || 200;
  const progressPercent = isRadio ? 100 : (duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0);

  return (
    <>
      <div 
        aria-label="移动端迷你播放器"
        className={`md:hidden fixed bottom-14 mb-safe left-0 right-0 z-30 h-14 border-t flex flex-col justify-between transition-colors duration-200 backdrop-blur-xl ${
          isLight
            ? 'bg-white/95 border-zinc-200/90 text-zinc-900 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]'
            : 'bg-zinc-900/95 border-white/10 text-zinc-100 shadow-[0_-6px_24px_rgba(0,0,0,0.5)]'
        }`}
      >
        {/* Top 2px micro progress bar */}
        <div className="w-full h-0.5 bg-zinc-700/30 overflow-hidden relative">
          <div 
            className={`h-full transition-all duration-150 ${
              isRadio 
                ? 'w-full bg-gradient-to-r from-amber-500 via-orange-400 to-amber-300 animate-pulse' 
                : 'bg-gradient-to-r from-[#FF6700] to-orange-400'
            }`}
            style={{ width: isRadio ? '100%' : `${progressPercent}%` }}
          />
        </div>

        {/* Content row */}
        <div className="flex items-center justify-between px-3 h-full gap-2">
          
          {/* Left: Album Cover & Track Title (Click to open full lyrics/player) */}
          <div 
            className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer py-1"
            onClick={onOpenLyrics}
          >
            {/* Cover art with micro spinning state when playing */}
            <div className={`relative w-10 h-10 rounded-lg overflow-hidden shrink-0 border ${
              isLight ? 'border-zinc-200' : 'border-white/10'
            } shadow-sm`}>
              {currentSong ? (
                <img 
                  src={currentSong.coverUrl} 
                  alt={currentSong.title}
                  className={`w-full h-full object-cover transition duration-300 ${isPlaying ? 'scale-105' : ''}`}
                />
              ) : (
                <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-zinc-500">
                  <Disc className="w-5 h-5 opacity-50" />
                </div>
              )}
              {isCasting && (
                <div className="absolute inset-0 bg-[#FF6700]/30 flex items-center justify-center">
                  <Radio className="w-3.5 h-3.5 text-white animate-pulse" />
                </div>
              )}
            </div>

            {/* Title & Artist & Badges */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold truncate">
                  {currentSong ? currentSong.title : '听澜音乐中枢'}
                </span>
                {isRadio ? (
                  <span className="text-[9px] px-1 py-0.2 rounded font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40 shrink-0 flex items-center gap-0.5">
                    <span className="w-1 h-1 rounded-full bg-amber-400 animate-pulse" />
                    LIVE
                  </span>
                ) : isPodcast ? (
                  <span className="text-[9px] px-1 py-0.2 rounded font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shrink-0">
                    播客
                  </span>
                ) : isCasting ? (
                  <span className="text-[9px] px-1 py-0.2 rounded font-bold bg-[#FF6700]/20 text-[#FF6700] border border-[#FF6700]/40 shrink-0">
                    小爱
                  </span>
                ) : null}
              </div>
              <div className="text-[10px] text-zinc-400 truncate flex items-center gap-1 mt-0.5">
                <span className="truncate">
                  {currentSong ? currentSong.artist : '点选曲库歌曲开始播放'}
                </span>
                {currentSong?.bitrate?.includes('FLAC') && !isRadio && (
                  <span className="text-[9px] font-mono text-cyan-400 font-bold shrink-0">
                    · Hi-Res
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: Core Playback Controls (Play/Pause, Next, More Sheet) with 44px+ hitboxes */}
          <div className="flex items-center gap-0.5 shrink-0">
            {/* Play/Pause Button */}
            <button
              id="btn-mobile-play-pause"
              type="button"
              onClick={onPlayPause}
              aria-label={isPlaying ? '暂停' : '播放'}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer active:scale-90 transition-transform"
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shadow-md ${
                !currentSong
                  ? 'bg-zinc-800 text-zinc-400'
                  : isRadio
                    ? 'bg-amber-400 text-zinc-950 shadow-[0_0_12px_rgba(251,191,36,0.5)]'
                    : isLight
                      ? 'bg-zinc-900 text-white'
                      : 'bg-white text-zinc-950'
              }`}>
                {isPlaying ? (
                  <Pause className="w-4 h-4 fill-current" />
                ) : (
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                )}
              </div>
            </button>

            {/* Next Track / Skip Forward Button */}
            {!isRadio && (
              <button
                id="btn-mobile-next-track"
                type="button"
                onClick={onNext}
                disabled={!currentSong}
                aria-label={isPodcast ? "快进15秒" : "下一首"}
                className={`min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer active:scale-90 transition-transform ${
                  !currentSong 
                    ? 'text-zinc-600 opacity-40 cursor-not-allowed' 
                    : isLight ? 'text-zinc-700 hover:text-zinc-950' : 'text-zinc-300 hover:text-white'
                }`}
              >
                <SkipForward className="w-5 h-5 fill-current" />
              </button>
            )}

            {/* More Advanced Controls Button (Opens Sheet) */}
            <button
              id="btn-mobile-open-actions"
              type="button"
              onClick={() => setIsActionsSheetOpen(true)}
              aria-label="播放设置与音箱控制"
              className={`min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer active:scale-90 transition-transform relative ${
                isCasting ? 'text-[#FF6700]' : isLight ? 'text-zinc-600' : 'text-zinc-400'
              }`}
            >
              <Sliders className="w-4.5 h-4.5" />
              {isCasting && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#FF6700] absolute top-2.5 right-2.5 animate-pulse" />
              )}
            </button>
          </div>

        </div>
      </div>

      {/* Advanced Mobile Player Actions Bottom Sheet */}
      <MobilePlayerActionsSheet
        isOpen={isActionsSheetOpen}
        onClose={() => setIsActionsSheetOpen(false)}
        currentSong={currentSong}
        activeDevice={activeDevice}
        isCasting={isCasting}
        commandState={commandState}
        onToggleCast={onToggleCast}
        onOpenEQ={onOpenEQ}
        onOpenQueue={onOpenQueue}
        queueCount={queueCount}
        playbackSpeed={playbackSpeed}
        onPlaybackSpeedChange={onPlaybackSpeedChange}
        sleepTimer={sleepTimer}
        onOpenSleepTimer={onOpenSleepTimer}
        onOpenVinyl={onOpenVinyl}
        onOpenMultiRoom={onOpenMultiRoom}
        abLoop={abLoop}
        onToggleABLoop={onToggleABLoop}
        onOpenInspector={onOpenInspector}
        speakerVolume={speakerVolume}
        onSpeakerVolumeChange={onSpeakerVolumeChange}
        volume={volume}
        onVolumeChange={onVolumeChange}
      />
    </>
  );
});

MobileMiniPlayer.displayName = 'MobileMiniPlayer';
