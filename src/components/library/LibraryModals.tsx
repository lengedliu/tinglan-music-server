import React, { useState, useEffect } from 'react';
import { 
  FolderPlus, 
  ListMusic, 
  ListPlus, 
  Check, 
  Trash2, 
  AlertTriangle, 
  X, 
  Search, 
  Edit2 
} from 'lucide-react';
import { Song, Playlist } from '../../types';

export interface LibraryModalsProps {
  isLight: boolean;
  
  // 1. New Playlist Modal
  showNewPlaylistModal: boolean;
  onCloseNewPlaylistModal: () => void;
  onCreatePlaylist: (name: string, description: string) => void;

  // 2. Add Single Song to Playlist Modal
  songToAddToPlaylist: Song | null;
  onCloseAddToPlaylistModal: () => void;
  playlists: Playlist[];
  onToggleSongInPlaylist?: (songId: string, playlistId: string) => void;

  // 3. Batch Add Songs to Active Playlist Modal
  showBatchAddModal: boolean;
  onCloseBatchAddModal: () => void;
  selectedPlaylistId: string;
  allSongs: Song[];

  // 4. Rename Playlist Modal
  showRenamePlaylistModal: boolean;
  onCloseRenamePlaylistModal: () => void;
  renamePlaylistId: string;
  renamePlaylistName: string;
  onRenamePlaylist?: (playlistId: string, newName: string) => void;

  // 5. Clear All Songs Confirm Modal
  showClearConfirmModal: boolean;
  onCloseClearConfirmModal: () => void;
  onClearAllSongs?: () => void;
  totalSongsCount: number;
}

export const LibraryModals: React.FC<LibraryModalsProps> = ({
  isLight,
  showNewPlaylistModal,
  onCloseNewPlaylistModal,
  onCreatePlaylist,
  songToAddToPlaylist,
  onCloseAddToPlaylistModal,
  playlists,
  onToggleSongInPlaylist,
  showBatchAddModal,
  onCloseBatchAddModal,
  selectedPlaylistId,
  allSongs,
  showRenamePlaylistModal,
  onCloseRenamePlaylistModal,
  renamePlaylistId,
  renamePlaylistName: initialRenameName,
  onRenamePlaylist,
  showClearConfirmModal,
  onCloseClearConfirmModal,
  onClearAllSongs,
  totalSongsCount
}) => {
  // New playlist state
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('');

  // Inline playlist creation in Add Single Song Modal
  const [inlineNewPlaylistName, setInlineNewPlaylistName] = useState('');

  // Batch add search
  const [batchSearchQuery, setBatchSearchQuery] = useState('');

  // Rename modal local state
  const [renameInputName, setRenameInputName] = useState(initialRenameName);
  useEffect(() => {
    setRenameInputName(initialRenameName);
  }, [initialRenameName, showRenamePlaylistModal]);

  // Clear modal loading
  const [isClearing, setIsClearing] = useState(false);

  const handleCreatePlaylistSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    onCreatePlaylist(newPlaylistName.trim(), newPlaylistDesc.trim());
    setNewPlaylistName('');
    setNewPlaylistDesc('');
    onCloseNewPlaylistModal();
  };

  const handleInlineCreateAndAdd = () => {
    if (!inlineNewPlaylistName.trim()) return;
    onCreatePlaylist(inlineNewPlaylistName.trim(), '快速创建歌单');
    setInlineNewPlaylistName('');
  };

  return (
    <>
      {/* 1. New Playlist Modal */}
      {showNewPlaylistModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className={`border rounded-3xl p-6 w-full max-w-md shadow-2xl backdrop-blur-xl space-y-4 ${
            isLight ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-zinc-900/90 border-white/10 text-white'
          }`}>
            <h3 className={`text-lg font-bold flex items-center gap-2 ${isLight ? 'text-zinc-900' : 'text-white'}`}>
              <FolderPlus className="w-5 h-5 text-[#FF6700]" />
              创建新播放歌单
            </h3>
            <form onSubmit={handleCreatePlaylistSubmit} className="space-y-4">
              <div>
                <label className={`block text-xs mb-1 font-semibold ${isLight ? 'text-zinc-700' : 'text-zinc-400'}`}>歌单名称</label>
                <input
                  type="text"
                  required
                  placeholder="例如：睡前助眠、车载发烧试音"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:border-[#FF6700] focus:ring-1 focus:ring-[#FF6700]/50 ${
                    isLight ? 'bg-zinc-50 border-zinc-300 text-zinc-950 placeholder-zinc-400' : 'bg-zinc-950/80 border-white/10 text-zinc-100'
                  }`}
                />
              </div>
              <div>
                <label className={`block text-xs mb-1 font-semibold ${isLight ? 'text-zinc-700' : 'text-zinc-400'}`}>歌单描述 (可选)</label>
                <textarea
                  placeholder="歌单介绍与场景..."
                  value={newPlaylistDesc}
                  onChange={(e) => setNewPlaylistDesc(e.target.value)}
                  rows={3}
                  className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:border-[#FF6700] focus:ring-1 focus:ring-[#FF6700]/50 ${
                    isLight ? 'bg-zinc-50 border-zinc-300 text-zinc-950 placeholder-zinc-400' : 'bg-zinc-950/80 border-white/10 text-zinc-100'
                  }`}
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onCloseNewPlaylistModal}
                  className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
                    isLight ? 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-full text-sm font-semibold bg-[#FF6700] hover:bg-[#e55c00] text-white shadow-[0_4px_15px_rgba(255,103,0,0.3)] transition"
                >
                  确认创建
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Add Single Song to Playlist Modal */}
      {songToAddToPlaylist && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className={`border rounded-3xl p-6 w-full max-w-md shadow-2xl backdrop-blur-xl space-y-4 ${
            isLight ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-zinc-900/95 border-white/10 text-white'
          }`}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className={`text-base font-bold flex items-center gap-2 ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                  <FolderPlus className="w-5 h-5 text-[#FF6700]" />
                  将歌曲加入歌单
                </h3>
                <p className="text-xs text-[#FF6700] font-semibold mt-1">
                  《{songToAddToPlaylist.title}》 - {songToAddToPlaylist.artist}
                </p>
              </div>
              <button
                onClick={onCloseAddToPlaylistModal}
                className={`p-1.5 rounded-xl transition ${
                  isLight ? 'text-zinc-500 hover:text-zinc-950 hover:bg-zinc-100' : 'text-zinc-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Create New Playlist Inline */}
            <div className={`flex items-center gap-2 p-2.5 rounded-2xl border ${
              isLight ? 'bg-zinc-100/90 border-zinc-200' : 'bg-zinc-950/80 border-white/10'
            }`}>
              <input
                type="text"
                placeholder="新建歌单名称..."
                value={inlineNewPlaylistName}
                onChange={(e) => setInlineNewPlaylistName(e.target.value)}
                className={`flex-1 bg-transparent px-2 py-1 text-xs placeholder-zinc-400 focus:outline-none ${
                  isLight ? 'text-zinc-950 font-medium' : 'text-zinc-100'
                }`}
              />
              <button
                onClick={handleInlineCreateAndAdd}
                disabled={!inlineNewPlaylistName.trim()}
                className="px-3 py-1.5 rounded-xl bg-[#FF6700] hover:bg-[#e55c00] disabled:opacity-40 text-white text-xs font-semibold transition"
              >
                新建
              </button>
            </div>

            {/* Existing Playlists Checklist */}
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {playlists.length === 0 ? (
                <p className={`text-xs py-4 text-center ${isLight ? 'text-zinc-500' : 'text-zinc-500'}`}>暂无歌单，请在上方输入名称创建一个</p>
              ) : (
                playlists.map(pl => {
                  const isInPlaylist = pl.songIds.includes(songToAddToPlaylist.id);
                  return (
                    <button
                      key={pl.id}
                      onClick={() => onToggleSongInPlaylist?.(songToAddToPlaylist.id, pl.id)}
                      className={`w-full flex items-center justify-between p-3 rounded-2xl border transition text-left ${
                        isInPlaylist
                          ? (isLight ? 'bg-orange-50 border-orange-300 text-zinc-950 shadow-sm' : 'bg-[#FF6700]/15 border-[#FF6700]/40 text-white')
                          : (isLight ? 'bg-zinc-50 hover:bg-zinc-100 border-zinc-200 text-zinc-800' : 'bg-zinc-950/50 border-white/5 hover:border-white/20 text-zinc-300')
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                          isInPlaylist ? 'bg-[#FF6700] text-white' : (isLight ? 'bg-zinc-200 text-zinc-600' : 'bg-zinc-800 text-zinc-400')
                        }`}>
                          {isInPlaylist ? <Check className="w-4 h-4" /> : <ListMusic className="w-4 h-4" />}
                        </div>
                        <div>
                          <p className={`text-xs font-bold ${isLight ? 'text-zinc-950' : 'text-zinc-100'}`}>{pl.name}</p>
                          <p className={`text-[10px] ${isLight ? 'text-zinc-600 font-medium' : 'text-zinc-400'}`}>{pl.songIds.length} 首歌曲</p>
                        </div>
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                        isInPlaylist 
                          ? (isLight ? 'bg-orange-200/90 text-orange-950' : 'bg-[#FF6700]/30 text-[#FF6700]') 
                          : (isLight ? 'bg-zinc-200 text-zinc-800' : 'bg-zinc-800 text-zinc-400')
                      }`}>
                        {isInPlaylist ? '已加入' : '+ 加入'}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={onCloseAddToPlaylistModal}
                className="px-5 py-2 rounded-full text-xs font-semibold bg-[#FF6700] text-white hover:bg-[#e55c00] transition"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Batch Add Songs to Active Playlist Modal */}
      {showBatchAddModal && selectedPlaylistId !== 'all' && selectedPlaylistId !== 'favorites' && (() => {
        const activePl = playlists.find(p => p.id === selectedPlaylistId);
        if (!activePl) return null;

        const filteredLibrarySongs = allSongs.filter(s => {
          if (!batchSearchQuery.trim()) return true;
          const q = batchSearchQuery.toLowerCase();
          return s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q);
        });

        return (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className={`border rounded-3xl p-6 w-full max-w-lg shadow-2xl backdrop-blur-xl space-y-4 ${
              isLight ? 'bg-white border-zinc-200 text-zinc-900 shadow-[0_20px_50px_rgba(0,0,0,0.15)]' : 'bg-zinc-900/95 border-white/10 text-white shadow-2xl'
            }`}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className={`text-base font-bold flex items-center gap-2 ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                    <ListPlus className="w-5 h-5 text-[#FF6700]" />
                    添加歌曲到《{activePl.name}》
                  </h3>
                  <p className={`text-xs mt-0.5 ${isLight ? 'text-zinc-600 font-medium' : 'text-zinc-400'}`}>点击勾选歌曲即可加入或从本歌单移除</p>
                </div>
                <button
                  onClick={onCloseBatchAddModal}
                  className={`p-1.5 rounded-xl transition ${
                    isLight ? 'text-zinc-500 hover:text-zinc-950 hover:bg-zinc-100' : 'text-zinc-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Search Bar inside Modal */}
              <div className="relative">
                <Search className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`} />
                <input
                  type="text"
                  placeholder="在完整曲库中搜索歌曲..."
                  value={batchSearchQuery}
                  onChange={(e) => setBatchSearchQuery(e.target.value)}
                  className={`w-full pl-10 pr-4 py-2 border rounded-xl text-xs focus:outline-none transition ${
                    isLight 
                      ? 'bg-zinc-100/90 border-zinc-200 text-zinc-950 placeholder-zinc-500 focus:bg-white focus:border-[#FF6700] focus:ring-2 focus:ring-[#FF6700]/20 font-medium' 
                      : 'bg-zinc-950/80 border-white/10 text-zinc-100 placeholder-zinc-500 focus:border-[#FF6700]'
                  }`}
                />
              </div>

              {/* Song List with Toggle Checkbox */}
              <div className={`space-y-1.5 max-h-72 overflow-y-auto pr-1 divide-y ${isLight ? 'divide-zinc-100' : 'divide-white/5'}`}>
                {filteredLibrarySongs.map(s => {
                  const isAdded = activePl.songIds.includes(s.id);
                  return (
                    <div
                      key={s.id}
                      onClick={() => onToggleSongInPlaylist?.(s.id, activePl.id)}
                      className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition ${
                        isAdded 
                          ? (isLight ? 'bg-orange-50/90 border border-orange-200/90 shadow-sm' : 'bg-[#FF6700]/15 border border-[#FF6700]/30') 
                          : (isLight ? 'bg-white hover:bg-zinc-50/90 border border-transparent' : 'hover:bg-white/5')
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className={`w-5 h-5 rounded-md flex items-center justify-center border transition ${
                          isAdded 
                            ? 'bg-[#FF6700] border-[#FF6700] text-white' 
                            : (isLight ? 'border-zinc-300 bg-zinc-100 text-transparent' : 'border-zinc-700 bg-zinc-900 text-transparent')
                        }`}>
                          <Check className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs truncate ${
                            isAdded 
                              ? (isLight ? 'text-orange-950 font-bold' : 'text-[#FF6700] font-bold') 
                              : (isLight ? 'text-zinc-950 font-extrabold' : 'text-zinc-200 font-semibold')
                          }`}>
                            {s.title}
                          </p>
                          <p className={`text-[11px] truncate mt-0.5 ${
                            isAdded 
                              ? (isLight ? 'text-orange-900/80 font-medium' : 'text-orange-300/80') 
                              : (isLight ? 'text-zinc-600 font-medium' : 'text-zinc-400')
                          }`}>
                            {s.artist} · {s.album}
                          </p>
                        </div>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold whitespace-nowrap ml-2 ${
                        isAdded 
                          ? (isLight ? 'bg-orange-200/90 text-orange-950' : 'bg-[#FF6700]/25 text-orange-300') 
                          : (isLight ? 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200' : 'text-zinc-400 bg-zinc-800/80')
                      }`}>
                        {isAdded ? '已包含' : '+ 点击添加'}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={onCloseBatchAddModal}
                  className="px-5 py-2 rounded-full text-xs font-semibold bg-[#FF6700] text-white hover:bg-[#e55c00] transition"
                >
                  完成添加 ({activePl.songIds.length} 首)
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 4. Confirmation Modal for Clearing All Songs */}
      {showClearConfirmModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`w-full max-w-md rounded-2xl p-6 border shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 ${
            isLight ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-zinc-900 border-white/10 text-white'
          }`}>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center flex-shrink-0 text-rose-500">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-rose-500">确认清除所有歌曲？</h3>
                <p className={`text-xs mt-1 leading-relaxed ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                  此操作将从曲库中移除全部 <strong className="text-rose-500 font-mono font-bold">{totalSongsCount}</strong> 首歌曲记录及对应歌单关联，同时重置当前播放队列。
                </p>
                <div className={`mt-3 p-3 rounded-xl text-[11px] leading-normal border ${
                  isLight ? 'bg-zinc-50 border-zinc-200 text-zinc-600' : 'bg-zinc-800/60 border-white/5 text-zinc-400'
                }`}>
                  💡 提示：本地挂载目录中的音频源文件不会受损，您随时可以再次点击【扫描挂载目录】或重新同步 Navidrome 导入。
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isClearing}
                onClick={onCloseClearConfirmModal}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition border ${
                  isLight 
                    ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-200' 
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-white/5'
                }`}
              >
                取消
              </button>
              <button
                type="button"
                disabled={isClearing}
                onClick={async () => {
                  if (onClearAllSongs) {
                    setIsClearing(true);
                    try {
                      await onClearAllSongs();
                    } finally {
                      setIsClearing(false);
                      onCloseClearConfirmModal();
                    }
                  }
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 active:scale-95 text-white transition disabled:opacity-50 shadow-md shadow-rose-600/20"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isClearing ? '正在清除...' : '确认清除全部歌曲'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Rename Playlist Modal */}
      {showRenamePlaylistModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className={`w-full max-w-sm rounded-2xl p-5 border shadow-2xl space-y-4 ${
            isLight ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-zinc-900 border-white/10 text-white'
          }`}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-amber-400" />
                <span>重命名歌单</span>
              </h3>
              <button
                onClick={onCloseRenamePlaylistModal}
                className="text-zinc-400 hover:text-white transition p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="text-[11px] text-zinc-400 block mb-1.5 font-medium">新歌单名称</label>
              <input
                type="text"
                value={renameInputName}
                onChange={(e) => setRenameInputName(e.target.value)}
                placeholder="请输入歌单新名称..."
                className={`w-full px-3.5 py-2 rounded-xl text-xs border outline-none transition ${
                  isLight 
                    ? 'bg-zinc-50 border-zinc-300 text-zinc-900 focus:border-[#FF6700]' 
                    : 'bg-zinc-800/80 border-white/10 text-white focus:border-[#FF6700]'
                }`}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && renameInputName.trim() && onRenamePlaylist) {
                    onRenamePlaylist(renamePlaylistId, renameInputName.trim());
                    onCloseRenamePlaylistModal();
                  }
                }}
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onCloseRenamePlaylistModal}
                className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 transition"
              >
                取消
              </button>
              <button
                type="button"
                disabled={!renameInputName.trim()}
                onClick={() => {
                  if (renameInputName.trim() && onRenamePlaylist) {
                    onRenamePlaylist(renamePlaylistId, renameInputName.trim());
                    onCloseRenamePlaylistModal();
                  }
                }}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-[#FF6700] hover:bg-[#e55c00] text-white disabled:opacity-40 transition shadow-sm"
              >
                保存重命名
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
