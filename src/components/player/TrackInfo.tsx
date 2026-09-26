import React, { memo } from 'react';
import { Mic2, Cpu, Speaker, Laptop, Disc, Radio } from 'lucide-react';
import { Song } from '../../types';
import { useTheme } from '../../context/ThemeContext';

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
  const { themeConfig, isLight: ctxIsLight } = useTheme();
  const isLight = Boolean(ctxIsLight ?? themeConfig?.isLight);

  const isRadio = Boolean(
    currentSong && (
      currentSong.url?.includes('/api/radio/') ||
      currentSong.id?.startsWith('radio_') ||
      currentSong.id?.startsWith('st_') ||
      currentSong.album === '网络广播/播客' ||
      currentSong.album === 'RADIO'
    )
  );

  if (!currentSong) {
    return (
      <div className="flex items-center gap-3 min-w-0 w-[240px] sm:w-[280px] lg:w-[320px] shrink-0">
        <div 
          onClick={onOpenQueue}
          className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-lg overflow-hidden flex-shrink-0 border flex items-center justify-center shadow-inner cursor-pointer transition group ${
            isLight
              ? 'bg-zinc-100 border-zinc-200 text-zinc-400 hover:border-amber-500/50'
              : 'bg-zinc-900/90 border-white/10 text-zinc-600 hover:border-[#FF6700]/40'
          }`}
          title="点击打开播放队列"
        >
          <Disc className={`w-6 h-6 sm:w-7 sm:h-7 opacity-40 transition ${
            isLight ? 'group-hover:text-amber-500' : 'group-hover:text-[#FF6700]'
          } group-hover:opacity-80`} />
        </div>

        <div className="min-w-0 pr-1">
          <h4 className={`text-sm font-medium truncate flex items-center gap-1.5 ${
            isLight ? 'text-zinc-600' : 'text-zinc-400'
          }`}>
            暂无播放曲目
          </h4>
          <p className={`text-xs truncate ${
            isLight ? 'text-zinc-400' : 'text-zinc-600'
          }`}>
            从曲库点选歌曲播放
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`text-[10px] font-bold border rounded px-1.5 py-0.5 leading-none font-mono ${
              isLight ? 'border-zinc-200 bg-zinc-100 text-zinc-500' : 'border-zinc-800 bg-zinc-900/80 text-zinc-500'
            }`}>
              待命
            </span>
            {isCasting ? (
              <span className="text-[10px] px-2 py-0.5 rounded bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/30 flex items-center gap-1 font-medium">
                <Speaker className="w-2.5 h-2.5 text-[#FF6700]" />
                音箱待命
              </span>
            ) : (
              <span className={`text-[10px] px-2 py-0.5 rounded border flex items-center gap-1 font-medium ${
                isLight ? 'bg-zinc-100 text-zinc-500 border-zinc-200' : 'bg-zinc-900 text-zinc-400 border-white/5'
              }`}>
                <Laptop className="w-2.5 h-2.5" />
                本地就绪
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  const coverSrc = currentSong.coverUrl || 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=150&auto=format&fit=crop&q=80';

  return (
    <div className="flex items-center gap-3 min-w-0 w-[240px] sm:w-[280px] lg:w-[320px] shrink-0">
      <div 
        onClick={onOpenLyrics}
        className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-lg overflow-hidden flex-shrink-0 cursor-pointer group shadow-lg border ${
          isLight ? 'border-zinc-200' : 'border-white/10'
        }`}
      >
        <img 
          src={coverSrc} 
          alt={currentSong.title}
          className={`w-full h-full object-cover transition duration-300 ${isPlaying ? 'scale-105' : 'group-hover:scale-105'}`}
        />
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          {isRadio ? <Radio className="w-5 h-5 text-amber-400" /> : <Mic2 className="w-5 h-5 text-white" />}
        </div>
      </div>

      <div className="min-w-0 pr-1 flex-1">
        <h4 
          onClick={onOpenLyrics}
          className={`text-sm font-bold truncate cursor-pointer transition ${
            isLight ? 'text-zinc-900 hover:text-amber-600' : 'text-white hover:text-[#FF6700]'
          }`}
          title={currentSong.title}
        >
          {currentSong.title}
        </h4>
        <p className={`text-xs truncate mt-0.5 ${
          isLight ? 'text-zinc-500' : 'text-zinc-400'
        }`}>
          {currentSong.artist}
        </p>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {isRadio ? (
            <span className="text-[10px] font-bold border border-amber-500/40 bg-amber-500/10 text-amber-400 rounded px-1.5 py-0.5 leading-none font-mono flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              LIVE 电台
            </span>
          ) : (
            <button
              id="btn-inspect-track"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onOpenInspector) onOpenInspector();
              }}
              className={`text-[10px] font-bold border rounded px-1.5 py-0.5 leading-none font-mono transition flex items-center gap-1 cursor-pointer ${
                isLight
                  ? 'border-zinc-300 bg-zinc-100 hover:bg-amber-50 hover:border-amber-400 hover:text-amber-600 text-zinc-700'
                  : 'border-zinc-700 bg-zinc-800/80 hover:bg-[#FF6700]/20 hover:border-[#FF6700]/50 hover:text-[#FF6700] text-zinc-300'
              }`}
              title="点击查看音频技术指标与 ID3 元数据"
            >
              <Cpu className="w-2.5 h-2.5 text-[#FF6700]" />
              {currentSong.bitrate?.includes('FLAC') ? 'Lossless' : currentSong.bitrate || 'Hi-Fi'}
            </button>
          )}

          {isCasting ? (
            <span className="text-[10px] px-2 py-0.5 rounded bg-[#FF6700]/20 text-[#FF6700] border border-[#FF6700]/40 flex items-center gap-1 font-semibold">
              <Speaker className="w-2.5 h-2.5 animate-pulse text-[#FF6700]" />
              小爱音箱
            </span>
          ) : (
            <span className={`text-[10px] px-2 py-0.5 rounded border flex items-center gap-1 font-medium ${
              isLight ? 'bg-zinc-100 text-zinc-600 border-zinc-200' : 'bg-zinc-800/80 text-zinc-300 border-white/10'
            }`}>
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
