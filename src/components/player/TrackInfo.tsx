import React, { memo } from 'react';
import { Mic2, Cpu, Speaker, Laptop, Disc } from 'lucide-react';
import { Song } from '../../types';

export interface TrackInfoProps {
  currentSong: Song | null;
  isPlaying: boolean;
  isCasting: boolean;
  onOpenLyrics: () => void;
  onOpenQueue?: () => void;
  onOpenInspector?: () => void;
}

export const TrackInfo: React.FC<TrackInfoProps> = memo(({
  currentSong,
  isPlaying,
  isCasting,
  onOpenLyrics,
  onOpenQueue,
  onOpenInspector
}) => {
  if (!currentSong) {
    return (
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
    );
  }

  return (
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
          <button
            id="btn-inspect-track"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onOpenInspector) onOpenInspector();
            }}
            className="text-[10px] font-bold border border-zinc-700 bg-zinc-800/80 hover:bg-[#FF6700]/20 hover:border-[#FF6700]/50 hover:text-[#FF6700] rounded px-1.5 py-0.5 leading-none text-zinc-300 font-mono transition flex items-center gap-1 cursor-pointer"
            title="点击查看音频技术指标与 ID3 元数据"
          >
            <Cpu className="w-2.5 h-2.5 text-[#FF6700]" />
            {currentSong.bitrate?.includes('FLAC') ? 'Lossless' : currentSong.bitrate || 'Hi-Fi'}
          </button>
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
  );
});

TrackInfo.displayName = 'TrackInfo';
