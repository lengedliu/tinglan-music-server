import React, { useRef, useState, memo } from 'react';
import { Song, ABLoopConfig } from '../../types';

export interface ProgressBarProps {
  currentSong: Song | null;
  currentTime: number;
  duration: number;
  abLoop?: ABLoopConfig;
  onSeek: (time: number) => void;
}

export const ProgressBar: React.FC<ProgressBarProps> = memo(({
  currentSong,
  currentTime,
  duration,
  abLoop,
  onSeek
}) => {
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [, setIsHoveringProgress] = useState(false);

  const handleSeekClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || duration <= 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(percentage * duration);
  };

  const progressPercent = (currentSong && duration > 0) ? (currentTime / duration) * 100 : 0;

  return (
    <div 
      ref={progressBarRef}
      onClick={handleSeekClick}
      onMouseEnter={() => currentSong && setIsHoveringProgress(true)}
      onMouseLeave={() => setIsHoveringProgress(false)}
      className={`w-full h-1 bg-zinc-800/60 relative group transition-all ${
        currentSong ? 'cursor-pointer hover:h-2' : 'cursor-default opacity-40'
      }`}
    >
      {/* A-B Loop highlighted section */}
      {duration > 0 && abLoop?.a !== null && abLoop?.b !== null && abLoop.b > abLoop.a && (
        <div 
          className="absolute top-0 bottom-0 bg-cyan-400/50 z-10 border-x border-cyan-400"
          style={{
            left: `${(abLoop.a / duration) * 100}%`,
            width: `${((abLoop.b - abLoop.a) / duration) * 100}%`
          }}
        />
      )}
      <div 
        className="h-full bg-[#FF6700] transition-all duration-75 relative shadow-[0_0_10px_rgba(255,103,0,0.7)] z-10"
        style={{ width: `${progressPercent}%` }}
      >
        {currentSong && (
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md scale-0 group-hover:scale-100 transition-transform" />
        )}
      </div>
    </div>
  );
});

ProgressBar.displayName = 'ProgressBar';
