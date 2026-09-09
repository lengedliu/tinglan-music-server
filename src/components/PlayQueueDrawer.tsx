import React from 'react';
import { ListMusic, X, Play, Trash2, Music, Shuffle, Disc } from 'lucide-react';
import { Song } from '../types';
import { formatTime } from '../utils/lyricParser';

interface PlayQueueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  playlist: Song[];
  currentSong: Song | null;
  onSelectSong: (song: Song) => void;
  onRemoveFromQueue: (songId: string) => void;
  onClearQueue: () => void;
  isShuffle: boolean;
  onToggleShuffle: () => void;
}

export const PlayQueueDrawer: React.FC<PlayQueueDrawerProps> = ({
  isOpen,
  onClose,
  playlist,
  currentSong,
  onSelectSong,
  onRemoveFromQueue,
  onClearQueue,
  isShuffle,
  onToggleShuffle,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-md flex justify-end animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-zinc-950 border-l border-white/10 h-full flex flex-col shadow-2xl relative overflow-hidden">
        
        {/* Top Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/30 shadow-[0_0_12px_rgba(255,103,0,0.3)]">
              <ListMusic className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                当前播放队列
                <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 font-mono">
                  {playlist.length} 首
                </span>
              </h3>
              <p className="text-xs text-zinc-400">
                可切换歌曲或清空队列
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar Controls */}
        <div className="px-6 py-3 bg-zinc-900/40 border-b border-white/5 flex items-center justify-between text-xs">
          <button
            onClick={onToggleShuffle}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition ${
              isShuffle ? 'bg-[#FF6700]/20 text-[#FF6700] border border-[#FF6700]/30' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Shuffle className="w-3.5 h-3.5" />
            <span>{isShuffle ? '随机播放中' : '顺序播放'}</span>
          </button>

          {playlist.length > 0 && (
            <button
              onClick={onClearQueue}
              className="flex items-center gap-1 text-zinc-500 hover:text-rose-400 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>清空队列</span>
            </button>
          )}
        </div>

        {/* Queue List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin scrollbar-thumb-zinc-800">
          {playlist.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-3">
              <Disc className="w-12 h-12 opacity-30 animate-spin duration-3000" />
              <p className="text-sm font-medium">播放队列为空</p>
              <p className="text-xs text-zinc-600">双击或播放歌曲将其加入播放队列</p>
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
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <Play className="w-4 h-4 text-[#FF6700] fill-current animate-pulse" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <h4 className={`text-xs font-bold truncate ${isCurrent ? 'text-[#FF6700]' : 'text-white'}`}>
                        {song.title}
                      </h4>
                      <p className="text-[11px] text-zinc-400 truncate">
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
        <div className="p-4 border-t border-white/10 bg-zinc-950 text-center text-[11px] text-zinc-500">
          支持连续与自动列表循环播放
        </div>

      </div>
    </div>
  );
};
