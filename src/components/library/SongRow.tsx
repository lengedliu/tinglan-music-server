import React, { memo } from 'react';
import { 
  Play, 
  Radio, 
  Heart, 
  FolderPlus, 
  FolderMinus, 
  CheckSquare, 
  Square, 
  Cpu 
} from 'lucide-react';
import { Song, XiaomiDevice } from '../../types';
import { formatTime } from '../../utils/lyricParser';

export interface SongRowProps {
  song: Song;
  isCurrent: boolean;
  isPlaying: boolean;
  isSelected: boolean;
  isSongCasting: boolean;
  isBatchMode: boolean;
  isBatchChecked: boolean;
  activeDevice?: XiaomiDevice;
  isLight: boolean;
  selectedPlaylistId: string;
  onSelect: (songId: string) => void;
  onPlaySong: (song: Song) => void;
  onToggleBatchSelectSong: (songId: string) => void;
  onToggleFavorite: (songId: string) => void;
  onAddToPlaylist: (song: Song) => void;
  onToggleSongInPlaylist?: (songId: string, playlistId: string) => void;
  onInspectSong?: (song: Song) => void;
  onCastSongToXiaomi: (song: Song) => void;
}

export const SongRow: React.FC<SongRowProps> = memo(({
  song,
  isCurrent,
  isPlaying,
  isSelected,
  isSongCasting,
  isBatchMode,
  isBatchChecked,
  activeDevice,
  isLight,
  selectedPlaylistId,
  onSelect,
  onPlaySong,
  onToggleBatchSelectSong,
  onToggleFavorite,
  onAddToPlaylist,
  onToggleSongInPlaylist,
  onInspectSong,
  onCastSongToXiaomi
}) => {
  return (
    <div
      id={`song-row-${song.id}`}
      tabIndex={0}
      onClick={() => {
        if (isBatchMode) {
          onToggleBatchSelectSong(song.id);
        } else {
          onSelect(song.id);
        }
      }}
      onDoubleClick={() => {
        if (!isBatchMode) {
          onSelect(song.id);
          onPlaySong(song);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (isBatchMode) {
            onToggleBatchSelectSong(song.id);
          } else {
            onSelect(song.id);
            onPlaySong(song);
          }
        }
      }}
      title={isBatchMode ? "点击选择/取消选择此歌曲" : (isCurrent ? "当前正在播放（双击可重新播放）" : "单击选中歌曲，双击开始播放")}
      className={`group flex items-center justify-between px-6 py-3.5 transition-all duration-150 cursor-pointer select-none outline-none ${
        isBatchChecked
          ? 'bg-cyan-500/10 hover:bg-cyan-500/15 border-l-2 border-l-cyan-400'
          : isSelected 
            ? 'bg-[#FF6700]/10 hover:bg-[#FF6700]/15 border-l-2 border-l-[#FF6700]' 
            : isLight
              ? 'hover:bg-zinc-100/80 border-l-2 border-l-transparent'
              : 'hover:bg-white/5 border-l-2 border-l-transparent'
      }`}
    >
      {/* Left: Index / Play button / Checkbox & Song Details */}
      <div className="flex items-center gap-4 min-w-0 flex-1">
        
        {/* Index, Play icon, or Batch Checkbox */}
        <div className="w-6 flex items-center justify-center flex-shrink-0">
          {isBatchMode ? (
            <div
              onClick={(e) => {
                e.stopPropagation();
                onToggleBatchSelectSong(song.id);
              }}
              className="cursor-pointer p-1"
            >
              {isBatchChecked ? (
                <CheckSquare className="w-4 h-4 text-cyan-500" />
              ) : (
                <Square className={`w-4 h-4 ${isLight ? 'text-zinc-400 hover:text-zinc-600' : 'text-zinc-500 hover:text-zinc-300'}`} />
              )}
            </div>
          ) : isCurrent && isPlaying ? (
            <div className="flex items-end gap-0.5 h-4">
              <span className="w-1 bg-[#FF6700] animate-pulse h-3 rounded-full shadow-[0_0_6px_rgba(255,103,0,0.6)]" />
              <span className="w-1 bg-[#FF6700] animate-pulse delay-75 h-4 rounded-full shadow-[0_0_6px_rgba(255,103,0,0.6)]" />
              <span className="w-1 bg-[#FF6700] animate-pulse delay-150 h-2 rounded-full shadow-[0_0_6px_rgba(255,103,0,0.6)]" />
            </div>
          ) : (
            <button
              id={`btn-play-${song.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(song.id);
                onPlaySong(song);
              }}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition ${
                isLight
                  ? 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200 group-hover:text-zinc-900'
                  : 'text-zinc-400 hover:text-white hover:bg-white/20 group-hover:text-white'
              }`}
              title="播放"
            >
              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
            </button>
          )}
        </div>

        {/* Album Cover */}
        <div className={`relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 shadow border ${
          isLight ? 'border-zinc-200' : 'border-white/10'
        }`}>
          <img 
            src={song.coverUrl} 
            alt={song.title}
            className="w-full h-full object-cover"
          />
          {isSongCasting && (
            <div className="absolute inset-0 bg-[#FF6700]/40 flex items-center justify-center">
              <Radio className="w-5 h-5 text-white animate-pulse" />
            </div>
          )}
        </div>

        {/* Titles */}
        <div className="min-w-0 pr-4">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold truncate ${
              isSelected 
                ? 'text-[#FF6700]' 
                : isLight 
                  ? 'text-zinc-900 group-hover:text-zinc-950' 
                  : 'text-zinc-100 group-hover:text-white'
            }`}>
              {song.title}
            </span>
            {song.source === 'uploaded' && (
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                本地自制
              </span>
            )}
          </div>
          <div className={`flex items-center gap-2 text-xs truncate mt-0.5 ${
            isLight ? 'text-zinc-500' : 'text-zinc-400'
          }`}>
            <span className="truncate">{song.artist}</span>
            <span>·</span>
            <span className={`truncate ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`}>{song.album}</span>
          </div>
        </div>
      </div>

      {/* Right: Bitrate, Duration & Actions */}
      <div className="flex items-center gap-4 sm:gap-6 flex-shrink-0">
        
        {/* Bitrate badge */}
        <div className="hidden md:flex flex-col items-end text-right">
          <span className={`text-xs font-mono font-medium ${isLight ? 'text-zinc-700' : 'text-zinc-300'}`}>
            {song.bitrate || 'FLAC 96kHz'}
          </span>
          <span className={`text-[10px] font-mono ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`}>
            {song.fileSize || '24.1 MB'}
          </span>
        </div>

        {/* Duration */}
        <span className={`hidden sm:inline text-xs font-mono ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
          {formatTime(song.duration)}
        </span>

        {/* Favorite Heart */}
        <button
          id={`btn-fav-${song.id}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(song.id);
          }}
          className={`p-1.5 transition ${
            isLight ? 'text-zinc-400 hover:text-rose-500' : 'text-zinc-500 hover:text-rose-500'
          }`}
          title={song.isFavorite ? '取消收藏' : '添加到我喜欢'}
        >
          <Heart className={`w-4 h-4 ${song.isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
        </button>

        {/* Add to Playlist button */}
        <button
          id={`btn-add-playlist-${song.id}`}
          onClick={(e) => {
            e.stopPropagation();
            onAddToPlaylist(song);
          }}
          className={`p-1.5 rounded-lg transition ${
            isLight
              ? 'text-zinc-400 hover:text-[#FF6700] hover:bg-zinc-200/70'
              : 'text-zinc-400 hover:text-[#FF6700] hover:bg-white/5'
          }`}
          title="加入指定歌单"
        >
          <FolderPlus className="w-4 h-4" />
        </button>

        {/* Remove from current playlist if viewing a custom playlist */}
        {selectedPlaylistId !== 'all' && selectedPlaylistId !== 'favorites' && onToggleSongInPlaylist && (
          <button
            id={`btn-remove-from-playlist-${song.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSongInPlaylist(song.id, selectedPlaylistId);
            }}
            className="p-1.5 text-zinc-500 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition"
            title="从当前歌单移除"
          >
            <FolderMinus className="w-4 h-4" />
          </button>
        )}

        {/* Track Technical Inspector Button */}
        {onInspectSong && (
          <button
            id={`btn-inspect-song-${song.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onInspectSong(song);
            }}
            className={`p-1.5 rounded-lg transition ${
              isLight
                ? 'text-zinc-400 hover:text-cyan-600 hover:bg-cyan-50'
                : 'text-zinc-400 hover:text-cyan-400 hover:bg-cyan-500/10'
            }`}
            title="查看无损规格与音频指标"
          >
            <Cpu className="w-4 h-4" />
          </button>
        )}

        {/* One-Click Cast to Xiaomi Speaker Button */}
        <button
          id={`btn-cast-song-${song.id}`}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(song.id);
            onCastSongToXiaomi(song);
          }}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition ${
            isSongCasting
              ? 'bg-[#FF6700] !text-white shadow-[0_0_12px_rgba(255,103,0,0.5)]'
              : isLight
                ? 'bg-zinc-100/90 hover:bg-[#FF6700]/15 text-zinc-800 hover:text-[#FF6700] border border-zinc-200 hover:border-[#FF6700]/30'
                : 'bg-zinc-800/80 hover:bg-[#FF6700]/20 text-zinc-300 hover:text-[#FF6700] border border-white/5 hover:border-[#FF6700]/30'
          }`}
          title={`推送到【${activeDevice?.name || '小米音箱'}】播放`}
        >
          <Radio className={`w-3.5 h-3.5 ${isSongCasting ? 'animate-pulse text-white' : 'text-[#FF6700]'}`} />
          <span className={`hidden sm:inline ${isSongCasting ? '!text-white' : ''}`}>
            {isSongCasting ? '音箱播音中' : '投放到音箱'}
          </span>
        </button>

      </div>
    </div>
  );
});

SongRow.displayName = 'SongRow';
