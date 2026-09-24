import React, { memo } from 'react';
import { Play, Pause, SkipBack, SkipForward, Shuffle, Repeat } from 'lucide-react';
import { Song } from '../../types';
import { formatTime } from '../../utils/lyricParser';

export interface PlaybackControlsProps {
  currentSong: Song | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isShuffle: boolean;
  repeatMode: 'off' | 'all' | 'one';
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
}

export const PlaybackControls: React.FC<PlaybackControlsProps> = memo(({
  currentSong,
  isPlaying,
  currentTime,
  duration,
  isShuffle,
  repeatMode,
  onPlayPause,
  onNext,
  onPrev,
  onToggleShuffle,
  onCycleRepeat
}) => {
  return (
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
  );
});

PlaybackControls.displayName = 'PlaybackControls';
