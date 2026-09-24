import React, { useState, memo } from 'react';
import { 
  CheckSquare, 
  Play, 
  Speaker, 
  ListPlus, 
  FolderPlus, 
  FolderMinus, 
  X 
} from 'lucide-react';
import { Song, Playlist, XiaomiDevice } from '../../types';

export interface BatchActionBarProps {
  isBatchMode: boolean;
  selectedBatchSongIds: Set<string>;
  totalFilteredSongs: Song[];
  allSongs: Song[];
  playlists: Playlist[];
  selectedPlaylistId: string;
  activeDevice?: XiaomiDevice;
  onToggleSelectAll: () => void;
  onBatchPlay?: (songs: Song[]) => void;
  onPlayAll?: (songs: Song[], startIndex?: number) => void;
  onBatchCast?: (songs: Song[]) => void;
  onCastAllToXiaomi?: (songs: Song[]) => void;
  onBatchAddToQueue?: (songs: Song[]) => void;
  onBatchAddToPlaylist?: (songIds: string[], playlistId: string) => void;
  onBatchRemoveFromPlaylist?: (songIds: string[], playlistId: string) => void;
  onExitBatchMode: () => void;
}

export const BatchActionBar: React.FC<BatchActionBarProps> = memo(({
  isBatchMode,
  selectedBatchSongIds,
  totalFilteredSongs,
  allSongs,
  playlists,
  selectedPlaylistId,
  activeDevice,
  onToggleSelectAll,
  onBatchPlay,
  onPlayAll,
  onBatchCast,
  onCastAllToXiaomi,
  onBatchAddToQueue,
  onBatchAddToPlaylist,
  onBatchRemoveFromPlaylist,
  onExitBatchMode
}) => {
  const [showBatchPlaylistDropdown, setShowBatchPlaylistDropdown] = useState(false);

  if (!isBatchMode || selectedBatchSongIds.size === 0) return null;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 w-11/12 max-w-3xl py-3 px-5 rounded-2xl bg-zinc-950/95 backdrop-blur-xl border border-[#FF6700]/40 shadow-[0_10px_40px_rgba(0,0,0,0.85)] flex flex-wrap items-center justify-between gap-3 animate-in slide-in-from-bottom-6 duration-200 text-white">
      <div className="flex items-center gap-3">
        <div className="px-3 py-1 rounded-full bg-[#FF6700]/20 text-[#FF6700] font-mono text-xs font-bold border border-[#FF6700]/30 flex items-center gap-1.5">
          <CheckSquare className="w-3.5 h-3.5" />
          <span>已勾选 {selectedBatchSongIds.size} 首</span>
        </div>
        <button
          onClick={onToggleSelectAll}
          className="text-xs text-zinc-400 hover:text-white underline underline-offset-2 transition"
        >
          {selectedBatchSongIds.size === totalFilteredSongs.length ? '取消全选' : '全选筛选结果'}
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          id="btn-batch-play"
          onClick={() => {
            const selected = allSongs.filter(s => selectedBatchSongIds.has(s.id));
            if (onBatchPlay) onBatchPlay(selected);
            else if (onPlayAll) onPlayAll(selected);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-bold transition shadow-sm"
        >
          <Play className="w-3.5 h-3.5 fill-current text-zinc-950" />
          <span>播放所选</span>
        </button>

        {activeDevice && (
          <button
            id="btn-batch-cast"
            onClick={() => {
              const selected = allSongs.filter(s => selectedBatchSongIds.has(s.id));
              if (onBatchCast) onBatchCast(selected);
              else if (onCastAllToXiaomi) onCastAllToXiaomi(selected);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FF6700] hover:bg-[#e55c00] text-white text-xs font-bold transition shadow-sm"
          >
            <Speaker className="w-3.5 h-3.5" />
            <span>投播音箱</span>
          </button>
        )}

        <button
          id="btn-batch-add-queue"
          onClick={() => {
            const selected = allSongs.filter(s => selectedBatchSongIds.has(s.id));
            if (onBatchAddToQueue) onBatchAddToQueue(selected);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-white/10 transition"
        >
          <ListPlus className="w-3.5 h-3.5 text-[#FF6700]" />
          <span>加入队列</span>
        </button>

        {/* Batch Add to Playlist Dropdown */}
        <div className="relative">
          <button
            id="btn-batch-add-playlist-menu"
            onClick={() => setShowBatchPlaylistDropdown(!showBatchPlaylistDropdown)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-white/10 transition"
          >
            <FolderPlus className="w-3.5 h-3.5 text-amber-400" />
            <span>加入歌单</span>
          </button>

          {showBatchPlaylistDropdown && (
            <div className="absolute bottom-full mb-2 right-0 w-48 rounded-2xl bg-zinc-900 border border-white/10 shadow-2xl p-2 space-y-1 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="text-[10px] text-zinc-400 px-2 py-1 font-bold uppercase tracking-wider">选择目标歌单</div>
              {playlists.length === 0 ? (
                <div className="text-xs text-zinc-500 px-2 py-2">暂无自定义歌单</div>
              ) : (
                playlists.map(pl => (
                  <button
                    key={pl.id}
                    onClick={() => {
                      if (onBatchAddToPlaylist) {
                        onBatchAddToPlaylist(Array.from(selectedBatchSongIds), pl.id);
                      }
                      setShowBatchPlaylistDropdown(false);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-xl text-xs hover:bg-zinc-800 text-zinc-200 hover:text-white truncate flex items-center justify-between transition"
                  >
                    <span className="truncate">{pl.name}</span>
                    <span className="text-[10px] text-zinc-500 font-mono">{pl.songIds.length}首</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Batch Remove from custom playlist if in custom playlist */}
        {selectedPlaylistId !== 'all' && selectedPlaylistId !== 'favorites' && onBatchRemoveFromPlaylist && (
          <button
            id="btn-batch-remove-from-pl"
            onClick={() => {
              onBatchRemoveFromPlaylist(Array.from(selectedBatchSongIds), selectedPlaylistId);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-semibold border border-rose-500/30 transition"
          >
            <FolderMinus className="w-3.5 h-3.5" />
            <span>移出此歌单</span>
          </button>
        )}

        <button
          onClick={onExitBatchMode}
          className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/10 transition ml-1"
          title="退出多选模式"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
});

BatchActionBar.displayName = 'BatchActionBar';
