import React, { useState, useMemo, useEffect, useCallback, memo } from 'react';
import { 
  Play, 
  FolderPlus, 
  FolderSync, 
  UploadCloud, 
  Music, 
  ListMusic, 
  ListPlus,
  Check, 
  Trash2,
  AlertTriangle,
  X,
  Clock,
  Disc3,
  Server,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CheckSquare,
  Square,
  Search,
  Edit2
} from 'lucide-react';
import { Song, Playlist, XiaomiDevice, SongSortOption, LibrarySourceFilter } from '../types';
import { useTheme } from '../context/ThemeContext';
import { VirtualList } from './VirtualList';
import { SongRow } from './library/SongRow';
import { PlaylistTabs } from './library/PlaylistTabs';
import { LibraryToolbar } from './library/LibraryToolbar';
import { BatchActionBar } from './library/BatchActionBar';
import { PlaylistHeaderBanner } from './library/PlaylistHeaderBanner';
import { ResumePointsShelf } from './library/ResumePointsShelf';
import { 
  getTopPlayedSongs, 
  getRecentlyPlayedSongs, 
  getLosslessSongs, 
  isDynamicPlaylistId, 
  clearRecentHistory 
} from '../utils/dynamicPlaylists';

export interface MusicLibraryProps {
  songs: Song[];
  playlists: Playlist[];
  currentSong: Song | null;
  isPlaying: boolean;
  onPlaySong: (song: Song) => void;
  onPlayAll?: (songs: Song[], startIndex?: number) => void;
  onCastSongToXiaomi: (song: Song) => void;
  onCastAllToXiaomi?: (songs: Song[]) => void;
  onToggleFavorite: (songId: string) => void;
  activeDevice: XiaomiDevice | undefined;
  isCasting: boolean;
  onOpenUploadModal: () => void;
  onScanMusicDir: () => void;
  isScanning: boolean;
  onCreatePlaylist: (name: string, description: string) => void;
  onToggleSongInPlaylist?: (songId: string, playlistId: string) => void;
  onDeletePlaylist?: (playlistId: string) => void;
  onRenamePlaylist?: (playlistId: string, newName: string) => void;
  onClearAllSongs?: () => void;
  onOpenNavidromeModal?: () => void;
  onBatchPlay?: (songs: Song[]) => void;
  onBatchCast?: (songs: Song[]) => void;
  onBatchAddToQueue?: (songs: Song[]) => void;
  onBatchAddToPlaylist?: (songIds: string[], playlistId: string) => void;
  onBatchRemoveFromPlaylist?: (songIds: string[], playlistId: string) => void;
  onInspectSong?: (song: Song) => void;
  onClearRecentHistory?: () => void;
}

const MusicLibraryComponent: React.FC<MusicLibraryProps> = ({
  songs,
  playlists,
  currentSong,
  isPlaying,
  onPlaySong,
  onPlayAll,
  onCastSongToXiaomi,
  onCastAllToXiaomi,
  onToggleFavorite,
  activeDevice,
  isCasting,
  onOpenUploadModal,
  onScanMusicDir,
  isScanning,
  onCreatePlaylist,
  onToggleSongInPlaylist,
  onDeletePlaylist,
  onRenamePlaylist,
  onClearAllSongs,
  onOpenNavidromeModal,
  onBatchPlay,
  onBatchCast,
  onBatchAddToQueue,
  onBatchAddToPlaylist,
  onBatchRemoveFromPlaylist,
  onInspectSong,
  onClearRecentHistory
}) => {
  const { themeConfig } = useTheme();
  const isLight = !!themeConfig?.isLight;

  // Dynamic Playlists Calculation
  const topPlayedSongs = useMemo(() => getTopPlayedSongs(songs), [songs]);
  const recentlyPlayedSongs = useMemo(() => getRecentlyPlayedSongs(songs), [songs]);
  const losslessSongs = useMemo(() => getLosslessSongs(songs), [songs]);

  const handleClearRecentHistory = async () => {
    await clearRecentHistory();
    if (onClearRecentHistory) {
      onClearRecentHistory();
    }
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

  // Debounce search query to prevent heavy recalculations on large libraries
  useEffect(() => {
    if (!searchQuery.trim()) {
      setDebouncedSearchQuery('');
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 120);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>('all');
  const [sortOption, setSortOption] = useState<SongSortOption>('default');
  const [sourceFilter, setSourceFilter] = useState<LibrarySourceFilter>('all');
  const [isBatchMode, setIsBatchMode] = useState<boolean>(false);
  const [selectedBatchSongIds, setSelectedBatchSongIds] = useState<Set<string>>(new Set());
  const [showRenamePlaylistModal, setShowRenamePlaylistModal] = useState<boolean>(false);
  const [renamePlaylistId, setRenamePlaylistId] = useState<string>('');
  const [renamePlaylistName, setRenamePlaylistName] = useState<string>('');
  
  // Modal states
  const [showNewPlaylistModal, setShowNewPlaylistModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('');

  const [songToAddToPlaylist, setSongToAddToPlaylist] = useState<Song | null>(null);
  const [showBatchAddModal, setShowBatchAddModal] = useState(false);
  const [inlineNewPlaylistName, setInlineNewPlaylistName] = useState('');
  const [batchSearchQuery, setBatchSearchQuery] = useState('');
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Selected song in list (Single click to select without playing, double click to select and play)
  const [selectedSongId, setSelectedSongId] = useState<string | null>(() => currentSong?.id || null);

  useEffect(() => {
    if (currentSong?.id) {
      setSelectedSongId(currentSong.id);
    }
  }, [currentSong?.id]);

  // Reset page when search or tab changes
  useEffect(() => {
    setCurrentPage(1);
    setSelectedBatchSongIds(new Set());
  }, [selectedPlaylistId, debouncedSearchQuery, sourceFilter, sortOption]);

  // Filter songs based on search, playlist, and source
  const filteredSongs = useMemo(() => {
    let result = songs;

    // 1. Filter by playlist
    if (selectedPlaylistId === 'favorites') {
      result = result.filter(s => s.isFavorite);
    } else if (selectedPlaylistId === 'dynamic:top_played') {
      result = topPlayedSongs;
    } else if (selectedPlaylistId === 'dynamic:recently_played') {
      result = recentlyPlayedSongs;
    } else if (selectedPlaylistId === 'dynamic:lossless') {
      result = losslessSongs;
    } else if (selectedPlaylistId !== 'all') {
      const targetPl = playlists.find(p => p.id === selectedPlaylistId);
      if (targetPl) {
        result = result.filter(s => targetPl.songIds.includes(s.id));
      }
    }

    // 2. Filter by source (all, local, navidrome, favorites)
    if (sourceFilter === 'local') {
      result = result.filter(s => s.source === 'local' || s.source === 'uploaded');
    } else if (sourceFilter === 'navidrome') {
      result = result.filter(s => s.source === 'navidrome');
    } else if (sourceFilter === 'favorites') {
      result = result.filter(s => s.isFavorite);
    }

    // 3. Filter by search query (debounced)
    if (debouncedSearchQuery.trim()) {
      const q = debouncedSearchQuery.toLowerCase();
      result = result.filter(
        s => s.title.toLowerCase().includes(q) ||
             s.artist.toLowerCase().includes(q) ||
             s.album.toLowerCase().includes(q)
      );
    }

    // 4. Sort songs
    result = [...result];
    switch (sortOption) {
      case 'title_asc':
        result.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'));
        break;
      case 'title_desc':
        result.sort((a, b) => b.title.localeCompare(a.title, 'zh-Hans-CN'));
        break;
      case 'artist_asc':
        result.sort((a, b) => a.artist.localeCompare(b.artist, 'zh-Hans-CN'));
        break;
      case 'duration_desc':
        result.sort((a, b) => b.duration - a.duration);
        break;
      case 'duration_asc':
        result.sort((a, b) => a.duration - b.duration);
        break;
      case 'bitrate_desc':
        result.sort((a, b) => {
          const aFlac = (a.bitrate || '').toLowerCase().includes('flac') ? 1 : 0;
          const bFlac = (b.bitrate || '').toLowerCase().includes('flac') ? 1 : 0;
          return bFlac - aFlac;
        });
        break;
      case 'default':
      default:
        break;
    }

    return result;
  }, [songs, playlists, selectedPlaylistId, searchQuery, sourceFilter, sortOption]);

  const handleToggleSelectAll = () => {
    if (selectedBatchSongIds.size === filteredSongs.length) {
      setSelectedBatchSongIds(new Set());
    } else {
      setSelectedBatchSongIds(new Set(filteredSongs.map(s => s.id)));
    }
  };

  const handleToggleBatchSelectSong = useCallback((songId: string) => {
    setSelectedBatchSongIds(prev => {
      const next = new Set(prev);
      if (next.has(songId)) {
        next.delete(songId);
      } else {
        next.add(songId);
      }
      return next;
    });
  }, []);

  const exportPlaylist = (format: 'm3u8' | 'json') => {
    const listToExport = filteredSongs;
    const currentPl = selectedPlaylistId !== 'all' && selectedPlaylistId !== 'favorites'
      ? playlists.find(p => p.id === selectedPlaylistId)
      : null;
    const playlistName = currentPl?.name || (selectedPlaylistId === 'favorites' ? '我的收藏' : '听蓝全部曲库');

    if (format === 'm3u8') {
      let m3uContent = '#EXTM3U\n';
      m3uContent += `#PLAYLIST:${playlistName}\n\n`;

      listToExport.forEach(song => {
        m3uContent += `#EXTINF:${Math.round(song.duration)},${song.artist} - ${song.title}\n`;
        m3uContent += `${song.url}\n\n`;
      });

      const blob = new Blob([m3uContent], { type: 'audio/x-mpegurl;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${playlistName}.m3u8`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      const jsonContent = JSON.stringify({
        playlistName,
        exportTime: new Date().toISOString(),
        totalSongs: listToExport.length,
        songs: listToExport.map(s => ({
          id: s.id,
          title: s.title,
          artist: s.artist,
          album: s.album,
          duration: s.duration,
          bitrate: s.bitrate,
          source: s.source,
          url: s.url
        }))
      }, null, 2);

      const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${playlistName}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  // Pagination calculations
  const totalItems = filteredSongs.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedSongs = useMemo(() => {
    const startIdx = (validCurrentPage - 1) * pageSize;
    return filteredSongs.slice(startIdx, startIdx + pageSize);
  }, [filteredSongs, validCurrentPage, pageSize]);

  // Generate page numbers array with ellipses
  const pageNumbers = useMemo(() => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (validCurrentPage > 3) pages.push('...');
      const start = Math.max(2, validCurrentPage - 1);
      const end = Math.min(totalPages - 1, validCurrentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (validCurrentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  }, [totalPages, validCurrentPage]);

  const handleCreatePlaylistSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPlaylistName.trim()) {
      onCreatePlaylist(newPlaylistName.trim(), newPlaylistDesc.trim());
      setNewPlaylistName('');
      setNewPlaylistDesc('');
      setShowNewPlaylistModal(false);
    }
  };

  const handleInlineCreateAndAdd = () => {
    if (inlineNewPlaylistName.trim() && songToAddToPlaylist) {
      onCreatePlaylist(inlineNewPlaylistName.trim(), '');
      setInlineNewPlaylistName('');
    }
  };

  const currentPlaylist = playlists.find(p => p.id === selectedPlaylistId);

  return (
    <div className="space-y-4 sm:space-y-6 pb-36 sm:pb-28">
      {/* 1. Top Bar: Title, Stats & Primary Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h2 className={`text-xl sm:text-2xl font-bold flex items-center gap-2 sm:gap-2.5 ${isLight ? 'text-zinc-900' : 'text-white'}`}>
            <Music className="w-6 h-6 sm:w-7 sm:h-7 text-[#FF6700]" />
            <span>音乐库</span>
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
              isLight ? 'bg-orange-100 text-[#FF6700]' : 'bg-[#FF6700]/20 text-[#FF6700]'
            }`}>
              {songs.length} 首歌曲
            </span>
          </h2>
          <p className={`text-xs mt-0.5 sm:mt-1 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
            多格式高保真无损曲库 · 小米小爱音箱专属无缝推流
          </p>
        </div>

        {/* Global Action Toolbar */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5">
          {/* Scan Music Folder */}
          <button
            id="btn-scan-music-dir"
            onClick={onScanMusicDir}
            disabled={isScanning}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs font-semibold transition-all duration-200 border disabled:opacity-50 ${
              isLight
                ? 'bg-zinc-100/90 hover:bg-zinc-200/90 text-zinc-800 border-zinc-300 shadow-sm'
                : 'bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-200 border-white/10 shadow-sm'
            }`}
            title="扫描挂载目录 /music 内的最新音频文件"
          >
            <FolderSync className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isScanning ? 'animate-spin text-[#FF6700]' : 'text-zinc-400'}`} />
            <span>{isScanning ? '正在扫描...' : '扫描挂载目录'}</span>
          </button>

          {/* Sync Navidrome Remote Subsonic Library */}
          {onOpenNavidromeModal && (
            <button
              id="btn-open-navidrome-modal"
              onClick={onOpenNavidromeModal}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs font-semibold transition-all duration-200 border ${
                isLight
                  ? 'bg-zinc-100/90 hover:bg-zinc-200/90 text-zinc-800 border-zinc-300 shadow-sm'
                  : 'bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-200 border-white/10 shadow-sm'
              }`}
              title="连接并同步 Navidrome / Subsonic 远程服务器曲库与歌单"
            >
              <Server className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#FF6700]" />
              <span>同步 Navidrome</span>
            </button>
          )}

          {/* Upload / Import Audio File */}
          <button
            id="btn-open-upload-modal"
            onClick={onOpenUploadModal}
            className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs font-bold bg-[#FF6700] hover:bg-[#e55c00] active:scale-95 text-white transition-all shadow-[0_4px_16px_rgba(255,103,0,0.35)]"
          >
            <UploadCloud className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>上传音乐</span>
          </button>
        </div>
      </div>

      {/* 2. Cross-Device Resume Points Shelf (Phase 1) */}
      <ResumePointsShelf
        onPlaySong={(s, pos) => {
          onPlaySong(s);
          if (pos && pos > 0) {
            // seek on next tick
            setTimeout(() => {
              const audioEl = document.querySelector('audio');
              if (audioEl) audioEl.currentTime = pos;
            }, 100);
          }
        }}
        onCastSongToXiaomi={(s) => onCastSongToXiaomi(s)}
        activeDevice={activeDevice}
        currentSongId={currentSong?.id}
      />

      {/* 3. Playlist Tabs Strip */}
      <PlaylistTabs
        playlists={playlists}
        selectedPlaylistId={selectedPlaylistId}
        onSelectPlaylist={(id) => setSelectedPlaylistId(id)}
        onOpenNewPlaylistModal={() => setShowNewPlaylistModal(true)}
        isLight={isLight}
        totalSongCount={songs.length}
        favoriteSongCount={songs.filter(s => s.isFavorite).length}
        topPlayedCount={topPlayedSongs.length}
        recentlyPlayedCount={recentlyPlayedSongs.length}
        losslessCount={losslessSongs.length}
      />

      {/* 3. Selected Custom or Dynamic Playlist Header Information Banner */}
      {(
        (selectedPlaylistId !== 'all' && selectedPlaylistId !== 'favorites' && currentPlaylist) ||
        isDynamicPlaylistId(selectedPlaylistId)
      ) && (
        <PlaylistHeaderBanner
          currentPlaylist={currentPlaylist}
          filteredSongs={filteredSongs}
          isCasting={isCasting}
          activeDevice={activeDevice}
          onPlaySong={onPlaySong}
          onPlayAll={onPlayAll}
          onCastAllToXiaomi={onCastAllToXiaomi}
          onOpenBatchAdd={() => setShowBatchAddModal(true)}
          onRenamePlaylist={(pl) => {
            setRenamePlaylistId(pl.id);
            setRenamePlaylistName(pl.name);
            setShowRenamePlaylistModal(true);
          }}
          onExportPlaylist={exportPlaylist}
          onDeletePlaylist={(id) => {
            if (onDeletePlaylist) onDeletePlaylist(id);
            setSelectedPlaylistId('all');
          }}
          onClearRecentHistory={handleClearRecentHistory}
          dynamicType={
            selectedPlaylistId === 'dynamic:top_played'
              ? 'top_played'
              : selectedPlaylistId === 'dynamic:recently_played'
              ? 'recently_played'
              : selectedPlaylistId === 'dynamic:lossless'
              ? 'lossless'
              : null
          }
          isLight={isLight}
        />
      )}

      {/* 4. Search, Filter, Sort & Export Toolbar */}
      <LibraryToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        sourceFilter={sourceFilter}
        onSourceFilterChange={setSourceFilter}
        sortOption={sortOption}
        onSortChange={setSortOption}
        isBatchMode={isBatchMode}
        onToggleBatchMode={() => {
          setIsBatchMode(prev => !prev);
          setSelectedBatchSongIds(new Set());
        }}
        filteredCount={filteredSongs.length}
        totalSongsCount={songs.length}
        selectedPlaylistId={selectedPlaylistId}
        onExportPlaylist={exportPlaylist}
        onClearAllSongs={() => setShowClearConfirmModal(true)}
        isLight={isLight}
      />

      {/* 5. Main Song Table Container */}
      <div className={`rounded-2xl border shadow-xl overflow-hidden transition-colors duration-200 ${
        isLight ? 'bg-white border-zinc-200 shadow-sm' : 'bg-zinc-900/60 border-white/10'
      }`}>
        {/* Table Header */}
        <div className={`grid grid-cols-[auto_1fr_auto] items-center px-3 sm:px-6 py-2.5 sm:py-3 border-b text-xs font-semibold ${
          isLight ? 'bg-zinc-50 border-zinc-200 text-zinc-500' : 'bg-zinc-950/40 border-white/5 text-zinc-400'
        }`}>
          <div className="flex items-center gap-2 sm:gap-4 w-10 sm:w-12">
            {isBatchMode ? (
              <button
                type="button"
                onClick={handleToggleSelectAll}
                className="cursor-pointer p-0.5"
                title={selectedBatchSongIds.size === filteredSongs.length ? '取消全选' : '全选所有'}
              >
                {selectedBatchSongIds.size > 0 && selectedBatchSongIds.size === filteredSongs.length ? (
                  <CheckSquare className="w-4 h-4 text-cyan-500" />
                ) : (
                  <Square className={`w-4 h-4 ${isLight ? 'text-zinc-400 hover:text-zinc-600' : 'text-zinc-500 hover:text-zinc-300'}`} />
                )}
              </button>
            ) : (
              <span className="w-6 text-center">#</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span>标题 / 歌手 / 专辑</span>
            <span className={`hidden sm:inline text-[10px] font-normal ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`}>
              {isBatchMode ? '(点击行或勾选框选择)' : '(单击选中 · 双击播放)'}
            </span>
          </div>
          <div className="flex items-center gap-4 sm:gap-12 pr-1 sm:pr-2">
            <span className="hidden md:inline">规格</span>
            <span className="hidden sm:inline flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>时长</span>
            </span>
            <span className="text-right">操作</span>
          </div>
        </div>

        {/* Song List Body */}
        <div className={`divide-y ${isLight ? 'divide-zinc-100' : 'divide-white/5'}`}>
          {paginatedSongs.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-16 h-16 rounded-full bg-zinc-800/40 border border-white/10 mx-auto flex items-center justify-center text-zinc-500 mb-3">
                <Disc3 className="w-8 h-8 opacity-40 animate-spin" style={{ animationDuration: '8s' }} />
              </div>
              <p className={`text-sm font-medium ${isLight ? 'text-zinc-700' : 'text-zinc-300'}`}>
                {sourceFilter === 'navidrome'
                  ? 'Navidrome 音乐库中暂无歌曲'
                  : sourceFilter === 'local'
                    ? '本地音频库中暂无歌曲'
                    : sourceFilter === 'favorites'
                      ? '暂无收藏的音乐'
                      : searchQuery
                        ? `未找到与 "${searchQuery}" 匹配的歌曲`
                        : '没有找到符合条件的音乐'}
              </p>
              <p className={`text-xs mt-1 max-w-md mx-auto leading-relaxed ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                {sourceFilter === 'navidrome'
                  ? '可前往右上角设置面板配置并一键同步 Navidrome 歌曲，或点击下方切换回全部/本地音频'
                  : sourceFilter === 'favorites'
                    ? '在歌曲列表中点击红心图标即可快速收藏您喜爱的音乐'
                    : searchQuery
                      ? '请尝试检查错别字或缩短搜索关键词'
                      : '请尝试更换筛选条件，或点击上方“导入/上传音乐”添加本地音频'}
              </p>
              <div className="mt-5 flex items-center justify-center gap-2.5 flex-wrap">
                {sourceFilter !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setSourceFilter('all')}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition border shadow-sm ${
                      isLight
                        ? 'bg-zinc-900 hover:bg-zinc-800 text-white border-zinc-900'
                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-white/10'
                    }`}
                  >
                    查看全部歌曲
                  </button>
                )}
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition border shadow-sm ${
                      isLight
                        ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border-zinc-200'
                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-white/10'
                    }`}
                  >
                    清除搜索关键词
                  </button>
                )}
                {sourceFilter === 'navidrome' && onOpenNavidromeModal && (
                  <button
                    type="button"
                    onClick={onOpenNavidromeModal}
                    className="px-4 py-2 rounded-xl text-xs font-bold transition bg-[#FF6700] hover:bg-[#e55c00] text-white shadow-sm"
                  >
                    同步 Navidrome 音乐
                  </button>
                )}
              </div>
            </div>
          ) : (
            paginatedSongs.map((song, idx) => {
              const isCurrent = currentSong?.id === song.id;
              const isSelected = selectedSongId === song.id;
              const isSongCasting = isCurrent && isCasting;
              const isBatchChecked = selectedBatchSongIds.has(song.id);
              const songIndex = (validCurrentPage - 1) * pageSize + idx;

              return (
                <SongRow
                  key={song.id}
                  song={song}
                  index={songIndex}
                  isCurrent={isCurrent}
                  isPlaying={isPlaying}
                  isSelected={isSelected}
                  isSongCasting={isSongCasting}
                  isBatchMode={isBatchMode}
                  isBatchChecked={isBatchChecked}
                  activeDevice={activeDevice}
                  isLight={isLight}
                  selectedPlaylistId={selectedPlaylistId}
                  onSelect={(id) => setSelectedSongId(id)}
                  onPlaySong={onPlaySong}
                  onToggleBatchSelectSong={handleToggleBatchSelectSong}
                  onToggleFavorite={onToggleFavorite}
                  onAddToPlaylist={(s) => setSongToAddToPlaylist(s)}
                  onToggleSongInPlaylist={onToggleSongInPlaylist}
                  onInspectSong={onInspectSong}
                  onCastSongToXiaomi={onCastSongToXiaomi}
                />
              );
            })
          )}
        </div>

        {/* Pagination Bar */}
        {totalItems > 0 && (
          <div className={`px-6 py-4 border-t flex flex-col sm:flex-row items-center justify-between gap-4 text-xs ${
            isLight
              ? 'bg-zinc-50 border-zinc-200 text-zinc-600'
              : 'bg-zinc-950/40 border-white/5 text-zinc-400'
          }`}>
            <div className="flex items-center gap-2">
              <span>
                显示第 <strong className={isLight ? 'text-zinc-900 font-semibold' : 'text-zinc-200'}>{(validCurrentPage - 1) * pageSize + 1}</strong> - <strong className={isLight ? 'text-zinc-900 font-semibold' : 'text-zinc-200'}>{Math.min(validCurrentPage * pageSize, totalItems)}</strong> 首，共 <strong className="text-[#FF6700] font-semibold">{totalItems}</strong> 首歌曲
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                id="btn-page-first"
                onClick={() => setCurrentPage(1)}
                disabled={validCurrentPage === 1}
                className={`p-1.5 rounded-lg border disabled:opacity-30 disabled:pointer-events-none transition ${
                  isLight
                    ? 'bg-white border-zinc-200 hover:bg-zinc-100 text-zinc-700'
                    : 'bg-zinc-900 border-white/5 hover:bg-zinc-800 text-zinc-300'
                }`}
                title="首页"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
              
              <button
                id="btn-page-prev"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={validCurrentPage === 1}
                className={`p-1.5 rounded-lg border disabled:opacity-30 disabled:pointer-events-none transition ${
                  isLight
                    ? 'bg-white border-zinc-200 hover:bg-zinc-100 text-zinc-700'
                    : 'bg-zinc-900 border-white/5 hover:bg-zinc-800 text-zinc-300'
                }`}
                title="上一页"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-1">
                {pageNumbers.map((p, idx) => {
                  if (p === '...') {
                    return <span key={`ellipsis-${idx}`} className={`px-1.5 ${isLight ? 'text-zinc-400' : 'text-zinc-600'}`}>...</span>;
                  }
                  const pageNum = p as number;
                  const isActive = pageNum === validCurrentPage;
                  return (
                    <button
                      key={`page-${pageNum}`}
                      id={`btn-page-${pageNum}`}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-semibold transition ${
                        isActive
                          ? 'bg-[#FF6700] text-white shadow-[0_0_10px_rgba(255,103,0,0.4)]'
                          : isLight
                            ? 'bg-white hover:bg-zinc-100 text-zinc-700 border border-zinc-200'
                            : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-white/5'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                id="btn-page-next"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={validCurrentPage === totalPages}
                className={`p-1.5 rounded-lg border disabled:opacity-30 disabled:pointer-events-none transition ${
                  isLight
                    ? 'bg-white border-zinc-200 hover:bg-zinc-100 text-zinc-700'
                    : 'bg-zinc-900 border-white/5 hover:bg-zinc-800 text-zinc-300'
                }`}
                title="下一页"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                id="btn-page-last"
                onClick={() => setCurrentPage(totalPages)}
                disabled={validCurrentPage === totalPages}
                className={`p-1.5 rounded-lg border disabled:opacity-30 disabled:pointer-events-none transition ${
                  isLight
                    ? 'bg-white border-zinc-200 hover:bg-zinc-100 text-zinc-700'
                    : 'bg-zinc-900 border-white/5 hover:bg-zinc-800 text-zinc-300'
                }`}
                title="末页"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span>每页显示</span>
              <select
                id="select-page-size"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className={`border rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-[#FF6700] transition ${
                  isLight
                    ? 'bg-white border-zinc-300 text-zinc-800'
                    : 'bg-zinc-900 border-white/10 text-zinc-200'
                }`}
              >
                <option value={15}>15 条/页</option>
                <option value={30}>30 条/页</option>
                <option value={50}>50 条/页</option>
                <option value={100}>100 条/页</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Floating Batch Operations Toolbar */}
      <BatchActionBar
        isBatchMode={isBatchMode}
        selectedBatchSongIds={selectedBatchSongIds}
        totalFilteredSongs={filteredSongs}
        allSongs={songs}
        playlists={playlists}
        selectedPlaylistId={selectedPlaylistId}
        activeDevice={activeDevice}
        onToggleSelectAll={handleToggleSelectAll}
        onBatchPlay={onBatchPlay}
        onPlayAll={onPlayAll}
        onBatchCast={onBatchCast}
        onCastAllToXiaomi={onCastAllToXiaomi}
        onBatchAddToQueue={onBatchAddToQueue}
        onBatchAddToPlaylist={onBatchAddToPlaylist}
        onBatchRemoveFromPlaylist={onBatchRemoveFromPlaylist}
        onExitBatchMode={() => {
          setIsBatchMode(false);
          setSelectedBatchSongIds(new Set());
        }}
      />

      {/* New Playlist Modal */}
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
                  onClick={() => setShowNewPlaylistModal(false)}
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

      {/* Add Single Song to Playlist Modal */}
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
                onClick={() => setSongToAddToPlaylist(null)}
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
                onClick={() => setSongToAddToPlaylist(null)}
                className="px-5 py-2 rounded-full text-xs font-semibold bg-[#FF6700] text-white hover:bg-[#e55c00] transition"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Add Songs to Active Playlist Modal */}
      {showBatchAddModal && selectedPlaylistId !== 'all' && selectedPlaylistId !== 'favorites' && (() => {
        const activePl = playlists.find(p => p.id === selectedPlaylistId);
        if (!activePl) return null;

        const filteredLibrarySongs = songs.filter(s => {
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
                  onClick={() => setShowBatchAddModal(false)}
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
                  onClick={() => setShowBatchAddModal(false)}
                  className="px-5 py-2 rounded-full text-xs font-semibold bg-[#FF6700] text-white hover:bg-[#e55c00] transition"
                >
                  完成添加 ({activePl.songIds.length} 首)
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Confirmation Modal for Clearing All Songs */}
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
                  此操作将从曲库中移除全部 <strong className="text-rose-500 font-mono font-bold">{songs.length}</strong> 首歌曲记录及对应歌单关联，同时重置当前播放队列。
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
                onClick={() => setShowClearConfirmModal(false)}
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
                      setShowClearConfirmModal(false);
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

      {/* Rename Playlist Modal */}
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
                onClick={() => setShowRenamePlaylistModal(false)}
                className="text-zinc-400 hover:text-white transition p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="text-[11px] text-zinc-400 block mb-1.5 font-medium">新歌单名称</label>
              <input
                type="text"
                value={renamePlaylistName}
                onChange={(e) => setRenamePlaylistName(e.target.value)}
                placeholder="请输入歌单新名称..."
                className={`w-full px-3.5 py-2 rounded-xl text-xs border outline-none transition ${
                  isLight 
                    ? 'bg-zinc-50 border-zinc-300 text-zinc-900 focus:border-[#FF6700]' 
                    : 'bg-zinc-800/80 border-white/10 text-white focus:border-[#FF6700]'
                }`}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && renamePlaylistName.trim() && onRenamePlaylist) {
                    onRenamePlaylist(renamePlaylistId, renamePlaylistName.trim());
                    setShowRenamePlaylistModal(false);
                  }
                }}
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowRenamePlaylistModal(false)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 transition"
              >
                取消
              </button>
              <button
                type="button"
                disabled={!renamePlaylistName.trim()}
                onClick={() => {
                  if (renamePlaylistName.trim() && onRenamePlaylist) {
                    onRenamePlaylist(renamePlaylistId, renamePlaylistName.trim());
                    setShowRenamePlaylistModal(false);
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

    </div>
  );
};

// Render isolation: Do not re-render MusicLibrary on global player playback tick (currentTime changes in parent)
export const MusicLibrary = memo(MusicLibraryComponent, (prevProps, nextProps) => {
  return (
    prevProps.songs === nextProps.songs &&
    prevProps.playlists === nextProps.playlists &&
    prevProps.currentSong?.id === nextProps.currentSong?.id &&
    prevProps.isPlaying === nextProps.isPlaying &&
    prevProps.activeDevice?.did === nextProps.activeDevice?.did &&
    prevProps.isCasting === nextProps.isCasting &&
    prevProps.isScanning === nextProps.isScanning
  );
});

MusicLibrary.displayName = 'MusicLibrary';
