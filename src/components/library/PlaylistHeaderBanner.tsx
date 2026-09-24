import React, { useState, memo } from 'react';
import { 
  ListMusic, 
  Speaker, 
  Play, 
  ListPlus, 
  Edit2, 
  Download, 
  Trash2 
} from 'lucide-react';
import { Playlist, Song, XiaomiDevice } from '../../types';

export interface PlaylistHeaderBannerProps {
  currentPlaylist: Playlist | undefined;
  filteredSongs: Song[];
  isCasting: boolean;
  activeDevice?: XiaomiDevice;
  onPlaySong: (song: Song) => void;
  onPlayAll?: (songs: Song[], startIndex?: number) => void;
  onCastAllToXiaomi?: (songs: Song[]) => void;
  onOpenBatchAdd: () => void;
  onRenamePlaylist?: (playlist: Playlist) => void;
  onExportPlaylist: (format: 'm3u8' | 'json') => void;
  onDeletePlaylist?: (playlistId: string) => void;
  isLight: boolean;
}

export const PlaylistHeaderBanner: React.FC<PlaylistHeaderBannerProps> = memo(({
  currentPlaylist,
  filteredSongs,
  isCasting,
  activeDevice,
  onPlaySong,
  onPlayAll,
  onCastAllToXiaomi,
  onOpenBatchAdd,
  onRenamePlaylist,
  onExportPlaylist,
  onDeletePlaylist,
  isLight
}) => {
  const [showExportMenu, setShowExportMenu] = useState(false);

  if (!currentPlaylist) return null;

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl border shadow-xl ${
      isLight
        ? 'bg-white border-orange-200 shadow-sm'
        : 'bg-gradient-to-r from-zinc-900/90 to-zinc-950/80 border-[#FF6700]/30'
    }`}>
      <div className="flex items-center gap-3.5">
        <div className={`w-11 h-11 rounded-2xl border flex items-center justify-center text-[#FF6700] flex-shrink-0 ${
          isLight ? 'bg-orange-50 border-orange-200' : 'bg-[#FF6700]/15 border-[#FF6700]/30'
        }`}>
          <ListMusic className="w-6 h-6" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className={`text-base font-bold ${isLight ? 'text-zinc-900' : 'text-white'}`}>{currentPlaylist.name}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
              isLight ? 'bg-orange-100 text-[#FF6700]' : 'bg-[#FF6700]/20 text-[#FF6700]'
            }`}>
              {filteredSongs.length} 首歌曲
            </span>
          </div>
          {currentPlaylist.description ? (
            <p className={`text-xs mt-1 ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>{currentPlaylist.description}</p>
          ) : (
            <p className={`text-xs mt-1 ${isLight ? 'text-zinc-500' : 'text-zinc-500'}`}>创建时间: {currentPlaylist.createdAt}</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {/* Unified Dynamic Play All Button */}
        <button
          id="btn-play-all-playlist"
          onClick={() => {
            if (isCasting && onCastAllToXiaomi && activeDevice) {
              onCastAllToXiaomi(filteredSongs);
            } else if (onPlayAll) {
              onPlayAll(filteredSongs, 0);
            } else if (filteredSongs[0]) {
              onPlaySong(filteredSongs[0]);
            }
          }}
          disabled={filteredSongs.length === 0}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-50 shadow-md ${
            isCasting 
              ? 'bg-[#FF6700] hover:bg-[#e55c00] text-white shadow-[0_2px_14px_rgba(255,103,0,0.5)] border border-[#FF6700]' 
              : isLight
                ? 'bg-zinc-900 hover:bg-zinc-800 text-white'
                : 'bg-white hover:bg-zinc-100 text-zinc-950 shadow-[0_2px_10px_rgba(255,255,255,0.2)]'
          }`}
          title={
            isCasting 
              ? `【音箱模式】一键将歌单全部 (${filteredSongs.length} 首) 投播至【${activeDevice?.name || '小爱音箱'}】连续播放` 
              : `【本地模式】在当前设备/浏览器播放当前歌单全部歌曲 (${filteredSongs.length} 首)`
          }
        >
          {isCasting ? (
            <>
              <Speaker className="w-3.5 h-3.5 animate-pulse text-white" />
              <span>投播歌单至【{activeDevice?.name ? (activeDevice.name.length > 6 ? activeDevice.name.slice(0, 6) + '…' : activeDevice.name) : '小爱音箱'}】({filteredSongs.length} 首)</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>播放全部 ({filteredSongs.length} 首)</span>
            </>
          )}
        </button>

        <button
          id="btn-batch-add-songs"
          onClick={onOpenBatchAdd}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition active:scale-95 ${
            isLight
              ? 'bg-white hover:bg-zinc-50 text-zinc-800 border-zinc-200'
              : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-white/10'
          }`}
        >
          <ListPlus className="w-4 h-4 text-[#FF6700]" />
          <span>添加歌曲</span>
        </button>

        {onRenamePlaylist && (
          <button
            id="btn-rename-playlist"
            onClick={() => onRenamePlaylist(currentPlaylist)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition active:scale-95 ${
              isLight
                ? 'bg-white hover:bg-zinc-50 text-zinc-800 border-zinc-200'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-white/10'
            }`}
            title="重命名当前歌单"
          >
            <Edit2 className="w-3.5 h-3.5 text-amber-500" />
            <span>重命名</span>
          </button>
        )}

        {/* Export Playlist (M3U8 / JSON) */}
        <div className="relative">
          <button
            id="btn-export-custom-playlist"
            onClick={() => setShowExportMenu(prev => !prev)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition active:scale-95 ${
              isLight
                ? 'bg-white hover:bg-zinc-50 text-zinc-800 border-zinc-200'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-white/10'
            }`}
            title="导出当前歌单 (M3U8 / JSON 标准格式)"
          >
            <Download className="w-3.5 h-3.5 text-cyan-500" />
            <span>导出歌单</span>
          </button>
          {showExportMenu && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setShowExportMenu(false)} />
              <div className={`absolute right-0 top-full mt-1.5 w-40 py-1.5 rounded-xl border shadow-2xl z-30 flex flex-col gap-1 ${
                isLight ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-white/10'
              }`}>
                <button
                  onClick={() => {
                    onExportPlaylist('m3u8');
                    setShowExportMenu(false);
                  }}
                  className={`px-3 py-1.5 text-left text-xs flex items-center justify-between ${
                    isLight ? 'text-zinc-800 hover:bg-zinc-100' : 'text-zinc-200 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span>标准 M3U8 格式</span>
                  <span className="text-[10px] font-mono text-cyan-500">.m3u8</span>
                </button>
                <button
                  onClick={() => {
                    onExportPlaylist('json');
                    setShowExportMenu(false);
                  }}
                  className={`px-3 py-1.5 text-left text-xs flex items-center justify-between ${
                    isLight ? 'text-zinc-800 hover:bg-zinc-100' : 'text-zinc-200 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span>结构化 JSON 格式</span>
                  <span className="text-[10px] font-mono text-amber-500">.json</span>
                </button>
              </div>
            </>
          )}
        </div>

        {onDeletePlaylist && (
          <button
            id="btn-delete-playlist"
            onClick={() => {
              if (confirm(`确认删除歌单《${currentPlaylist.name}》？删除后不会清空曲库原有音频。`)) {
                onDeletePlaylist(currentPlaylist.id);
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition ${
              isLight
                ? 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-600'
                : 'bg-rose-500/15 hover:bg-rose-500/25 border-rose-500/30 text-rose-300'
            }`}
            title="删除当前歌单"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>删除歌单</span>
          </button>
        )}
      </div>
    </div>
  );
});

PlaylistHeaderBanner.displayName = 'PlaylistHeaderBanner';
