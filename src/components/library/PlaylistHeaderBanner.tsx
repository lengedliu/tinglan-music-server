import React, { useState, memo } from 'react';
import { 
  ListMusic, 
  Speaker, 
  Play, 
  ListPlus, 
  Edit2, 
  Download, 
  Trash2,
  Flame,
  Clock,
  Sparkles,
  RotateCcw
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
  onOpenBatchAdd?: () => void;
  onRenamePlaylist?: (playlist: Playlist) => void;
  onExportPlaylist: (format: 'm3u8' | 'json') => void;
  onDeletePlaylist?: (playlistId: string) => void;
  onClearRecentHistory?: () => void;
  isLight: boolean;
  dynamicType?: 'top_played' | 'recently_played' | 'lossless' | null;
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
  onClearRecentHistory,
  isLight,
  dynamicType = null
}) => {
  const [showExportMenu, setShowExportMenu] = useState(false);

  if (!currentPlaylist && !dynamicType) return null;

  // Resolve dynamic metadata
  const isDynamic = Boolean(dynamicType);
  const title = dynamicType === 'top_played'
    ? '🔥 常听榜 (Top Played)'
    : dynamicType === 'recently_played'
    ? '🕒 最近播放 (Recently Played)'
    : dynamicType === 'lossless'
    ? '💎 无损精选 (Lossless Masterpieces)'
    : currentPlaylist?.name || '歌单';

  const description = dynamicType === 'top_played'
    ? '根据您的综合播放频次 (PlayCount) 实时计算生成的个人高频热播榜单'
    : dynamicType === 'recently_played'
    ? '实时同步记录您在网页播放器与小米智能音箱上的听歌足迹'
    : dynamicType === 'lossless'
    ? '自动甄别曲库中 FLAC、DSD/DSF、APE、24bit/96kHz 高解析发烧原声音轨'
    : currentPlaylist?.description || `创建时间: ${currentPlaylist?.createdAt || '未知'}`;

  const badgeText = dynamicType === 'top_played'
    ? '智能热度排行'
    : dynamicType === 'recently_played'
    ? '听歌轨迹倒序'
    : dynamicType === 'lossless'
    ? 'Hi-Res 发烧甄选'
    : `${filteredSongs.length} 首歌曲`;

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl border shadow-xl ${
      isLight
        ? (dynamicType === 'top_played'
            ? 'bg-amber-50/70 border-amber-200 shadow-sm'
            : dynamicType === 'recently_played'
            ? 'bg-sky-50/70 border-sky-200 shadow-sm'
            : dynamicType === 'lossless'
            ? 'bg-purple-50/70 border-purple-200 shadow-sm'
            : 'bg-white border-orange-200 shadow-sm')
        : (dynamicType === 'top_played'
            ? 'bg-gradient-to-r from-amber-950/40 via-zinc-900/90 to-zinc-950/80 border-amber-500/30'
            : dynamicType === 'recently_played'
            ? 'bg-gradient-to-r from-sky-950/40 via-zinc-900/90 to-zinc-950/80 border-sky-500/30'
            : dynamicType === 'lossless'
            ? 'bg-gradient-to-r from-purple-950/40 via-zinc-900/90 to-zinc-950/80 border-purple-500/30'
            : 'bg-gradient-to-r from-zinc-900/90 to-zinc-950/80 border-[#FF6700]/30')
    }`}>
      <div className="flex items-center gap-3.5">
        <div className={`w-11 h-11 rounded-2xl border flex items-center justify-center flex-shrink-0 ${
          dynamicType === 'top_played'
            ? (isLight ? 'bg-amber-100 text-amber-600 border-amber-300' : 'bg-amber-500/20 text-amber-400 border-amber-500/40')
            : dynamicType === 'recently_played'
            ? (isLight ? 'bg-sky-100 text-sky-600 border-sky-300' : 'bg-sky-500/20 text-sky-400 border-sky-500/40')
            : dynamicType === 'lossless'
            ? (isLight ? 'bg-purple-100 text-purple-600 border-purple-300' : 'bg-purple-500/20 text-purple-400 border-purple-500/40')
            : (isLight ? 'bg-orange-50 text-[#FF6700] border-orange-200' : 'bg-[#FF6700]/15 text-[#FF6700] border-[#FF6700]/30')
        }`}>
          {dynamicType === 'top_played' ? (
            <Flame className="w-6 h-6 fill-amber-500/40" />
          ) : dynamicType === 'recently_played' ? (
            <Clock className="w-6 h-6" />
          ) : dynamicType === 'lossless' ? (
            <Sparkles className="w-6 h-6 fill-purple-500/30" />
          ) : (
            <ListMusic className="w-6 h-6" />
          )}
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={`text-base font-bold ${isLight ? 'text-zinc-900' : 'text-white'}`}>{title}</h3>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
              dynamicType === 'top_played'
                ? (isLight ? 'bg-amber-200/80 text-amber-800' : 'bg-amber-500/25 text-amber-300 border border-amber-500/40')
                : dynamicType === 'recently_played'
                ? (isLight ? 'bg-sky-200/80 text-sky-800' : 'bg-sky-500/25 text-sky-300 border border-sky-500/40')
                : dynamicType === 'lossless'
                ? (isLight ? 'bg-purple-200/80 text-purple-800' : 'bg-purple-500/25 text-purple-300 border border-purple-500/40')
                : (isLight ? 'bg-orange-100 text-[#FF6700]' : 'bg-[#FF6700]/20 text-[#FF6700]')
            }`}>
              {badgeText} · {filteredSongs.length} 首
            </span>
          </div>
          <p className={`text-xs mt-1 ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>{description}</p>
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
              ? `【音箱模式】一键将当前歌单全部 (${filteredSongs.length} 首) 投播至【${activeDevice?.name || '小爱音箱'}】连续播放` 
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

        {/* Custom playlist actions only */}
        {!isDynamic && onOpenBatchAdd && (
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
        )}

        {!isDynamic && onRenamePlaylist && currentPlaylist && (
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

        {/* Clear Recent History for "最近播放" */}
        {dynamicType === 'recently_played' && onClearRecentHistory && (
          <button
            id="btn-clear-recent-history"
            onClick={() => {
              if (confirm('确认清空最近播放历史记录？')) {
                onClearRecentHistory();
              }
            }}
            disabled={filteredSongs.length === 0}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition disabled:opacity-40 ${
              isLight
                ? 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-600'
                : 'bg-rose-500/15 hover:bg-rose-500/25 border-rose-500/30 text-rose-300'
            }`}
            title="清空最近播放记录"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>清空记录</span>
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

        {!isDynamic && onDeletePlaylist && currentPlaylist && (
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
