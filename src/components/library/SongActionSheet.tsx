import React, { memo } from 'react';
import { 
  Play, 
  Radio, 
  Heart, 
  FolderPlus, 
  FolderMinus, 
  Cpu, 
  X, 
  Plus, 
  ListMusic 
} from 'lucide-react';
import { Song, XiaomiDevice } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import { formatTime } from '../../utils/lyricParser';

export interface SongActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  song: Song | null;
  activeDevice?: XiaomiDevice;
  isSongCasting: boolean;
  selectedPlaylistId: string;
  onPlaySong: (song: Song) => void;
  onCastSongToXiaomi: (song: Song) => void;
  onToggleFavorite: (songId: string) => void;
  onAddToPlaylist: (song: Song) => void;
  onToggleSongInPlaylist?: (songId: string, playlistId: string) => void;
  onInspectSong?: (song: Song) => void;
}

export const SongActionSheet: React.FC<SongActionSheetProps> = memo(({
  isOpen,
  onClose,
  song,
  activeDevice,
  isSongCasting,
  selectedPlaylistId,
  onPlaySong,
  onCastSongToXiaomi,
  onToggleFavorite,
  onAddToPlaylist,
  onToggleSongInPlaylist,
  onInspectSong
}) => {
  const { themeConfig, isLight: ctxIsLight } = useTheme();
  const isLight = Boolean(ctxIsLight ?? themeConfig?.isLight);

  if (!isOpen || !song) return null;

  return (
    <div className="fixed inset-0 z-[85] md:hidden flex flex-col justify-end animate-in fade-in duration-200">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm" 
        onClick={onClose}
      />

      {/* Sheet Modal */}
      <div className={`relative z-10 w-full rounded-t-3xl overflow-hidden pb-safe border-t shadow-2xl transition-colors duration-200 ${
        isLight ? 'bg-white text-zinc-900 border-zinc-200' : 'bg-zinc-900 text-zinc-100 border-white/10'
      }`}>
        {/* Grab Handle */}
        <div className="w-12 h-1.5 bg-zinc-400/40 rounded-full mx-auto my-3" />

        {/* Song Info Header */}
        <div className="px-5 pb-3 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={`w-12 h-12 rounded-xl overflow-hidden shrink-0 border ${
              isLight ? 'border-zinc-200' : 'border-white/10'
            } shadow`}>
              <img 
                src={song.coverUrl} 
                alt={song.title}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0 pr-2">
              <h4 className="text-sm font-bold truncate">
                {song.title}
              </h4>
              <p className="text-xs text-zinc-400 truncate mt-0.5">
                {song.artist} · {song.album}
              </p>
              <div className="flex items-center gap-2 mt-1 text-[10px] font-mono text-zinc-500">
                <span>{song.bitrate || 'FLAC 24bit'}</span>
                <span>·</span>
                <span>{formatTime(song.duration)}</span>
              </div>
            </div>
          </div>

          <button 
            onClick={onClose}
            className={`p-2 rounded-full min-h-[44px] min-w-[44px] flex items-center justify-center ${
              isLight ? 'text-zinc-500 hover:text-zinc-900' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action List Items (each with min 48px height) */}
        <div className="p-3 divide-y divide-white/5 space-y-1">
          {/* 1. Play Now */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onPlaySong(song);
            }}
            className={`w-full h-12 px-4 rounded-xl flex items-center gap-3.5 transition active:scale-98 ${
              isLight ? 'hover:bg-zinc-100 text-zinc-900' : 'hover:bg-white/5 text-zinc-100'
            }`}
          >
            <div className="w-8 h-8 rounded-lg bg-orange-500/15 text-[#FF6700] flex items-center justify-center shrink-0">
              <Play className="w-4 h-4 fill-current ml-0.5" />
            </div>
            <span className="text-xs font-semibold">立即播放</span>
          </button>

          {/* 2. Cast to Xiaomi Speaker */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onCastSongToXiaomi(song);
            }}
            className={`w-full h-12 px-4 rounded-xl flex items-center gap-3.5 transition active:scale-98 ${
              isLight ? 'hover:bg-zinc-100 text-zinc-900' : 'hover:bg-white/5 text-zinc-100'
            }`}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              isSongCasting 
                ? 'bg-[#FF6700] text-white shadow-sm' 
                : 'bg-orange-500/15 text-[#FF6700]'
            }`}>
              <Radio className={`w-4 h-4 ${isSongCasting ? 'animate-pulse' : ''}`} />
            </div>
            <div className="text-left min-w-0">
              <span className="text-xs font-semibold block truncate">
                {isSongCasting ? '正在音箱播放中' : `投放到【${activeDevice?.name || '小米音箱'}】`}
              </span>
            </div>
          </button>

          {/* 3. Favorite Toggle */}
          <button
            type="button"
            onClick={() => {
              onToggleFavorite(song.id);
            }}
            className={`w-full h-12 px-4 rounded-xl flex items-center gap-3.5 transition active:scale-98 ${
              isLight ? 'hover:bg-zinc-100 text-zinc-900' : 'hover:bg-white/5 text-zinc-100'
            }`}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              song.isFavorite 
                ? 'bg-rose-500/15 text-rose-500' 
                : 'bg-zinc-700/30 text-zinc-400'
            }`}>
              <Heart className={`w-4 h-4 ${song.isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
            </div>
            <span className="text-xs font-semibold">
              {song.isFavorite ? '已在“我的收藏”中 (点击移除)' : '添加到“我的收藏”'}
            </span>
          </button>

          {/* 4. Add to Playlist */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onAddToPlaylist(song);
            }}
            className={`w-full h-12 px-4 rounded-xl flex items-center gap-3.5 transition active:scale-98 ${
              isLight ? 'hover:bg-zinc-100 text-zinc-900' : 'hover:bg-white/5 text-zinc-100'
            }`}
          >
            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 text-cyan-400 flex items-center justify-center shrink-0">
              <FolderPlus className="w-4 h-4" />
            </div>
            <span className="text-xs font-semibold">加入指定歌单</span>
          </button>

          {/* 5. Remove from Playlist (if custom playlist) */}
          {selectedPlaylistId !== 'all' && selectedPlaylistId !== 'favorites' && onToggleSongInPlaylist && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onToggleSongInPlaylist(song.id, selectedPlaylistId);
              }}
              className="w-full h-12 px-4 rounded-xl flex items-center gap-3.5 text-rose-400 hover:bg-rose-500/10 transition active:scale-98"
            >
              <div className="w-8 h-8 rounded-lg bg-rose-500/15 text-rose-500 flex items-center justify-center shrink-0">
                <FolderMinus className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold">从当前歌单移除</span>
            </button>
          )}

          {/* 6. Audio Inspector */}
          {onInspectSong && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onInspectSong(song);
              }}
              className={`w-full h-12 px-4 rounded-xl flex items-center gap-3.5 transition active:scale-98 ${
                isLight ? 'hover:bg-zinc-100 text-zinc-900' : 'hover:bg-white/5 text-zinc-100'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0">
                <Cpu className="w-4 h-4" />
              </div>
              <div className="text-left min-w-0">
                <span className="text-xs font-semibold block truncate">查看无损规格与技术指标</span>
                <span className="text-[10px] text-zinc-400 block font-mono">{song.bitrate || 'Hi-Fi Master'}</span>
              </div>
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

SongActionSheet.displayName = 'SongActionSheet';
