import React, { memo } from 'react';
import { Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, RotateCcw, RotateCw, Radio as RadioIcon } from 'lucide-react';
import { Song } from '../../types';
import { formatTime } from '../../utils/lyricParser';
import { usePlaybackTime } from '../../context/PlaybackTimeContext';

export interface PlaybackControlsProps {
  currentSong: Song | null;
  isPlaying: boolean;
  currentTime?: number;
  duration?: number;
  isShuffle: boolean;
  repeatMode: 'off' | 'all' | 'one';
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onSeek?: (time: number) => void;
}

const TimeDisplay: React.FC<{ currentSong: Song | null; currentTime?: number; duration?: number; isRadio?: boolean }> = memo(({
  currentSong,
  currentTime: propCurrentTime,
  duration: propDuration,
  isRadio
}) => {
  const playbackTime = usePlaybackTime();
  const currentTime = propCurrentTime !== undefined ? propCurrentTime : playbackTime.currentTime;
  const duration = propDuration !== undefined ? propDuration : playbackTime.duration;

  if (isRadio) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] font-mono text-amber-400 font-semibold">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        <span>LIVE 直播中</span>
        <span>·</span>
        <span>已收听 {formatTime(currentSong ? currentTime : 0)}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500">
      <span>{formatTime(currentSong ? currentTime : 0)}</span>
      <span>/</span>
      <span>{formatTime(currentSong ? duration : 0)}</span>
    </div>
  );
});
TimeDisplay.displayName = 'TimeDisplay';

export const PlaybackControls: React.FC<PlaybackControlsProps> = memo(({
  currentSong,
  isPlaying,
  currentTime: propCurrentTime,
  duration: propDuration,
  isShuffle,
  repeatMode,
  onPlayPause,
  onNext,
  onPrev,
  onToggleShuffle,
  onCycleRepeat,
  onSeek
}) => {
  const playbackTime = usePlaybackTime();
  const currentTime = propCurrentTime !== undefined ? propCurrentTime : playbackTime.currentTime;
  const duration = propDuration !== undefined ? propDuration : playbackTime.duration;

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

  const handleSkipSeconds = (deltaSeconds: number) => {
    if (!onSeek) return;
    const target = Math.max(0, Math.min(duration || 99999, currentTime + deltaSeconds));
    onSeek(target);
  };

  return (
    <div className="flex flex-col items-center justify-center gap-1 shrink-0 px-2">
      <div className="flex items-center gap-3 sm:gap-5">
        {/* Shuffle Button (or Live indicator for Radio / -15s for Podcast) */}
        {isRadio ? (
          <div className="p-1.5 text-amber-400/80 cursor-default" title="网络电台实时流">
            <RadioIcon className="w-4 h-4 animate-pulse" />
          </div>
        ) : isPodcast ? (
          <button
            id="btn-podcast-backward-15"
            onClick={() => handleSkipSeconds(-15)}
            disabled={!currentSong}
            title="倒退 15 秒"
            className="p-1.5 rounded-full text-zinc-400 hover:text-amber-400 hover:bg-amber-500/10 transition active:scale-95 cursor-pointer flex items-center justify-center"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        ) : (
          <button
            id="btn-shuffle"
            onClick={onToggleShuffle}
            disabled={!currentSong}
            title={isShuffle ? '随机播放开启' : '随机播放关闭'}
            className={`p-1.5 rounded-full transition cursor-pointer ${
              !currentSong
                ? 'text-zinc-600 cursor-not-allowed opacity-40'
                : (isShuffle ? 'text-[#FF6700] bg-[#FF6700]/15' : 'text-zinc-400 hover:text-white')
            }`}
          >
            <Shuffle className="w-4 h-4" />
          </button>
        )}

        {/* Previous Song / Backward button */}
        <button
          id="btn-prev-song"
          onClick={isPodcast ? () => handleSkipSeconds(-15) : onPrev}
          disabled={!currentSong || isRadio}
          title={isRadio ? '广播电台无上一首' : isPodcast ? '后退 15 秒' : '上一首'}
          className={`p-1.5 sm:p-2 transition active:scale-95 ${
            (!currentSong || isRadio) ? 'text-zinc-600 cursor-not-allowed opacity-30' : 'text-zinc-400 hover:text-white cursor-pointer'
          }`}
        >
          {isPodcast ? <RotateCcw className="w-4 h-4" /> : <SkipBack className="w-5 h-5 fill-current" />}
        </button>

        {/* Core Play / Pause Button */}
        <button
          id="btn-play-pause-song"
          onClick={onPlayPause}
          title={!currentSong ? '从曲库开始播放' : (isPlaying ? '暂停' : '播放')}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-transform cursor-pointer ${
            !currentSong
              ? 'bg-zinc-800 text-zinc-400 hover:bg-[#FF6700] hover:text-white hover:scale-105 active:scale-95 shadow-md'
              : isRadio
                ? 'bg-amber-400 text-zinc-950 shadow-[0_0_20px_rgba(251,191,36,0.4)] hover:scale-105 active:scale-95'
                : 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:scale-105 active:scale-95'
          }`}
        >
          {isPlaying ? (
            <Pause className="w-5 h-5 fill-current" />
          ) : (
            <Play className="w-5 h-5 fill-current ml-0.5" />
          )}
        </button>

        {/* Next Song / Forward button */}
        <button
          id="btn-next-song"
          onClick={isPodcast ? () => handleSkipSeconds(15) : onNext}
          disabled={!currentSong || isRadio}
          title={isRadio ? '广播电台无下一首' : isPodcast ? '快进 15 秒' : '下一首'}
          className={`p-1.5 sm:p-2 transition active:scale-95 ${
            (!currentSong || isRadio) ? 'text-zinc-600 cursor-not-allowed opacity-30' : 'text-zinc-400 hover:text-white cursor-pointer'
          }`}
        >
          {isPodcast ? <RotateCw className="w-4 h-4" /> : <SkipForward className="w-5 h-5 fill-current" />}
        </button>

        {/* Repeat Button (or +15s for Podcast / hidden for Radio) */}
        {isRadio ? (
          <div className="w-7 h-7" />
        ) : isPodcast ? (
          <button
            id="btn-podcast-forward-15"
            onClick={() => handleSkipSeconds(15)}
            disabled={!currentSong}
            title="快进 15 秒"
            className="p-1.5 rounded-full text-zinc-400 hover:text-amber-400 hover:bg-amber-500/10 transition active:scale-95 cursor-pointer flex items-center justify-center"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        ) : (
          <button
            id="btn-repeat"
            onClick={onCycleRepeat}
            disabled={!currentSong}
            title={`循环模式: ${repeatMode === 'one' ? '单曲循环' : repeatMode === 'all' ? '列表循环' : '关闭'}`}
            className={`p-1.5 rounded-full transition relative cursor-pointer ${
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
        )}
      </div>

      <TimeDisplay currentSong={currentSong} currentTime={currentTime} duration={duration} isRadio={isRadio} />
    </div>
  );
});

PlaybackControls.displayName = 'PlaybackControls';

