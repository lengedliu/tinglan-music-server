import React from 'react';
import { ListMusic, X, Play, Trash2, Shuffle, Disc, Repeat, Repeat1, Radio, SkipForward, SkipBack } from 'lucide-react';
import { Song, XiaomiDevice } from '../types';
import { formatTime } from '../utils/lyricParser';
import { useTheme } from '../context/ThemeContext';

interface PlayQueueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  playlist: Song[];
  currentSong: Song | null;
  isPlaying?: boolean;
  isCasting?: boolean;
  activeDevice?: XiaomiDevice;
  onSelectSong: (song: Song) => void;
  onRemoveFromQueue: (songId: string) => void;
  onClearQueue: () => void;
  isShuffle: boolean;
  onToggleShuffle: () => void;
  repeatMode?: 'off' | 'all' | 'one';
  onCycleRepeat?: () => void;
  onNext?: () => void;
  onPrev?: () => void;
}

export const PlayQueueDrawer: React.FC<PlayQueueDrawerProps> = ({
  isOpen,
  onClose,
  playlist,
  currentSong,
  isPlaying = false,
  isCasting = false,
  activeDevice,
  onSelectSong,
  onRemoveFromQueue,
  onClearQueue,
  isShuffle,
  onToggleShuffle,
  repeatMode = 'all',
  onCycleRepeat,
  onNext,
  onPrev,
}) => {
  const { themeConfig, isLight: ctxIsLight } = useTheme();
  const isLight = Boolean(ctxIsLight ?? themeConfig?.isLight);
  if (!isOpen) return null;

  const currentIndex = playlist.findIndex(s => s.id === currentSong?.id);

  return (
    <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-md flex justify-end animate-in fade-in duration-200">
      <div className={`w-full max-w-md ${isLight ? 'bg-white text-zinc-900 border-l border-zinc-200 shadow-2xl' : 'bg-zinc-950 text-white border-l border-white/10 shadow-2xl'} h-full flex flex-col relative overflow-hidden`}>
        
        {/* Top Header */}
        <div className={`p-5 sm:p-6 border-b ${isLight ? 'border-zinc-200 bg-zinc-50/80' : 'border-white/10 bg-zinc-950'} flex items-center justify-between`}>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-2xl ${isLight ? 'bg-orange-50 text-orange-600 border border-orange-200 shadow-sm' : 'bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/30 shadow-[0_0_12px_rgba(255,103,0,0.3)]'}`}>
              <ListMusic className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`text-base font-bold ${isLight ? 'text-zinc-900' : 'text-white'} flex items-center gap-2`}>
                当前播放队列
                <span className={`text-xs px-2 py-0.5 rounded-full ${isLight ? 'bg-orange-100 text-orange-700 font-bold border border-orange-200' : 'bg-zinc-800 text-[#FF6700] font-mono font-bold'}`}>
                  {playlist.length} 首
                </span>
              </h3>
              <p className={`text-xs ${isLight ? 'text-zinc-600' : 'text-zinc-400'} flex items-center gap-1.5 mt-0.5`}>
                {isCasting ? (
                  <>
                    <Radio className="w-3 h-3 text-[#FF6700] animate-pulse" />
                    <span>正在投播至: {activeDevice?.name || '小爱音箱'} (连续播放)</span>
                  </>
                ) : (
                  <span>当前输出: 浏览器本地音频</span>
                )}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`p-2 rounded-full ${isLight ? 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/70' : 'text-zinc-400 hover:text-white hover:bg-white/10'} transition`}
            title="关闭队列抽屉"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar Controls - High contrast buttons for light & dark themes */}
        <div className={`px-5 py-3 border-b flex items-center justify-between text-xs gap-2 ${
          isLight ? 'bg-zinc-100/90 border-zinc-200' : 'bg-zinc-900/50 border-white/5'
        }`}>
          <div className="flex items-center gap-2">
            {/* Shuffle Toggle Button */}
            <button
              onClick={onToggleShuffle}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all active:scale-95 shadow-sm ${
                isShuffle
                  ? (isLight 
                      ? 'bg-orange-100 text-zinc-950 border border-orange-300 font-extrabold shadow-sm' 
                      : 'bg-[#FF6700]/25 text-orange-400 border border-[#FF6700]/40 font-bold')
                  : (isLight 
                      ? 'bg-white hover:bg-zinc-50 text-zinc-900 hover:text-black border border-zinc-300 font-bold shadow-sm' 
                      : 'text-zinc-300 hover:text-white bg-zinc-800/90 border border-white/10')
              }`}
              title="切换随机/顺序播放模式"
            >
              <Shuffle className={`w-3.5 h-3.5 ${isShuffle ? (isLight ? 'text-zinc-950' : 'text-[#FF6700]') : (isLight ? 'text-zinc-700' : 'text-zinc-400')}`} />
              <span className={isLight ? 'text-zinc-950 font-extrabold' : (isShuffle ? 'text-orange-300' : 'text-zinc-200')}>
                {isShuffle ? '随机播放' : '顺序播放'}
              </span>
            </button>

            {/* Repeat Cycle Button */}
            {onCycleRepeat && (
              <button
                onClick={onCycleRepeat}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all active:scale-95 shadow-sm ${
                  repeatMode !== 'off'
                    ? (isLight 
                        ? 'bg-amber-100 text-zinc-950 border border-amber-300 font-extrabold shadow-sm' 
                        : 'bg-amber-500/25 text-amber-300 border border-amber-500/40 font-bold')
                    : (isLight 
                        ? 'bg-white hover:bg-zinc-50 text-zinc-900 hover:text-black border border-zinc-300 font-bold shadow-sm' 
                        : 'text-zinc-300 hover:text-white bg-zinc-800/90 border border-white/10')
                }`}
                title="切换循环模式（列表循环/单曲循环/不循环）"
              >
                {repeatMode === 'one' ? (
                  <>
                    <Repeat1 className={`w-3.5 h-3.5 ${isLight ? 'text-zinc-950' : 'text-amber-300'}`} />
                    <span className={isLight ? 'text-zinc-950 font-extrabold' : 'text-amber-300'}>单曲循环</span>
                  </>
                ) : repeatMode === 'all' ? (
                  <>
                    <Repeat className={`w-3.5 h-3.5 ${isLight ? 'text-zinc-950' : 'text-amber-300'}`} />
                    <span className={isLight ? 'text-zinc-950 font-extrabold' : 'text-amber-300'}>列表循环</span>
                  </>
                ) : (
                  <>
                    <Repeat className={`w-3.5 h-3.5 ${isLight ? 'text-zinc-500' : 'opacity-50'}`} />
                    <span className={isLight ? 'text-zinc-900' : 'text-zinc-300'}>不循环</span>
                  </>
                )}
              </button>
            )}
          </div>

          <div className="flex items-center gap-1">
            {onPrev && (
              <button
                onClick={onPrev}
                className={`p-1.5 rounded-lg transition ${
                  isLight ? 'text-zinc-700 hover:text-zinc-950 hover:bg-zinc-200' : 'text-zinc-400 hover:text-white hover:bg-white/10'
                }`}
                title="上一首"
              >
                <SkipBack className="w-4 h-4" />
              </button>
            )}
            {onNext && (
              <button
                onClick={onNext}
                className={`p-1.5 rounded-lg transition ${
                  isLight ? 'text-zinc-700 hover:text-zinc-950 hover:bg-zinc-200' : 'text-zinc-400 hover:text-white hover:bg-white/10'
                }`}
                title="下一首"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            )}
            {playlist.length > 0 && (
              <button
                onClick={onClearQueue}
                className={`flex items-center gap-1 transition ml-1 px-2.5 py-1 rounded-lg font-medium ${
                  isLight ? 'text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-200' : 'text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10'
                }`}
                title="清空队列"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>清空</span>
              </button>
            )}
          </div>
        </div>

        {/* Queue List */}
        <div className={`flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin ${isLight ? 'scrollbar-thumb-zinc-300' : 'scrollbar-thumb-zinc-800'}`}>
          {playlist.length === 0 ? (
            <div className={`h-full flex flex-col items-center justify-center space-y-3 ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`}>
              <Disc className="w-12 h-12 opacity-40 animate-spin duration-3000" />
              <p className={`text-sm font-bold ${isLight ? 'text-zinc-700' : 'text-zinc-300'}`}>播放队列为空</p>
              <p className="text-xs text-zinc-500">点击曲库的“播放全部”或任意单曲加入队列</p>
            </div>
          ) : (
            playlist.map((song, idx) => {
              const isCurrent = currentSong?.id === song.id;

              return (
                <div
                  key={`${song.id}-${idx}`}
                  className={`group p-3 rounded-2xl flex items-center justify-between gap-3 transition ${
                    isCurrent
                      ? 'bg-[#FF6700]/15 border border-[#FF6700]/30 shadow-[0_0_15px_rgba(255,103,0,0.15)]'
                      : 'bg-zinc-900/30 hover:bg-zinc-900 border border-white/5'
                  }`}
                >
                  <div 
                    onClick={() => onSelectSong(song)}
                    className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                  >
                    <div className="relative w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 border border-white/10">
                      <img
                        src={song.coverUrl}
                        alt={song.title}
                        className="w-full h-full object-cover"
                      />
                      {isCurrent && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                          {isPlaying ? (
                            <div className="flex items-end gap-0.5 h-3.5">
                              <span className="w-1 bg-[#FF6700] animate-pulse h-3 rounded-full" />
                              <span className="w-1 bg-[#FF6700] animate-pulse delay-75 h-4 rounded-full" />
                              <span className="w-1 bg-[#FF6700] animate-pulse delay-150 h-2 rounded-full" />
                            </div>
                          ) : (
                            <Play className="w-4 h-4 text-[#FF6700] fill-current" />
                          )}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-zinc-500 font-semibold">
                          {(idx + 1).toString().padStart(2, '0')}
                        </span>
                        <h4 className={`text-xs font-bold truncate ${isCurrent ? 'text-[#FF6700]' : 'text-white'}`}>
                          {song.title}
                        </h4>
                      </div>
                      <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                        {song.artist}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-zinc-500">
                      {formatTime(song.duration)}
                    </span>
                    <button
                      onClick={() => onRemoveFromQueue(song.id)}
                      className="p-1.5 text-zinc-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition"
                      title="从队列中移除"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className={`p-4 border-t flex items-center justify-between text-[11px] ${
          isLight ? 'border-zinc-200 bg-zinc-50 text-zinc-700' : 'border-white/10 bg-zinc-950 text-zinc-400'
        }`}>
          <span className="font-medium">当前播放进度: {playlist.length > 0 ? `${(currentIndex >= 0 ? currentIndex : 0) + 1} / ${playlist.length}` : '0 / 0'}</span>
          <span className={isLight ? 'text-emerald-700 font-bold' : 'text-emerald-400 font-medium'}>✨ 支持小爱音箱全歌单连播</span>
        </div>

      </div>
    </div>
  );
};
