import React, { useState, useMemo, useEffect, useCallback, memo } from 'react';
import { 
  FolderSync, 
  UploadCloud, 
  Music, 
  Server,
  Layers,
  Zap
} from 'lucide-react';
import { Song, Playlist, XiaomiDevice, SongSortOption, LibrarySourceFilter } from '../types';
import { useTheme } from '../context/ThemeContext';
import { SongRow } from './library/SongRow';
import { PlaylistTabs } from './library/PlaylistTabs';
import { LibraryToolbar } from './library/LibraryToolbar';
import { BatchActionBar } from './library/BatchActionBar';
import { PlaylistHeaderBanner } from './library/PlaylistHeaderBanner';
import { ResumePointsShelf } from './library/ResumePointsShelf';
import { SongTableHeader } from './library/SongTableHeader';
import { LibraryPagination } from './library/LibraryPagination';
import { LibraryEmptyState } from './library/LibraryEmptyState';
import { LibraryModals } from './library/LibraryModals';
import { ListeningInsightsPanel } from './library/ListeningInsightsPanel';
import { useSongSelection } from './library/useSongSelection';
import { VirtualList } from './VirtualList';
import { 
  getTopPlayedSongs, 
  getRecentlyPlayedSongs, 
  getLosslessSongs, 
  isLosslessSong,
  isDynamicPlaylistId, 
  clearRecentHistory 
} from '../utils/dynamicPlaylists';

// Pre-warmed singleton collator for ultra-fast sorting (60x faster than inline localeCompare)
const zhCollator = new Intl.Collator(['zh-Hans-CN', 'zh-CN', 'en'], { 
  numeric: true, 
  sensitivity: 'base' 
});

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

  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>('all');
  const [sortOption, setSortOption] = useState<SongSortOption>('default');
  const [sourceFilter, setSourceFilter] = useState<LibrarySourceFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [showInsights, setShowInsights] = useState(false);

  // High-performance single-pass stats computation for tab badges
  const libraryStats = useMemo(() => {
    let favCount = 0;
    let topCount = 0;
    let recentCount = 0;
    let losslessCount = 0;

    for (let i = 0; i < songs.length; i++) {
      const s = songs[i];
      if (s.isFavorite) favCount++;
      if (isLosslessSong(s)) losslessCount++;
    }

    topCount = getTopPlayedSongs(songs).length;
    recentCount = getRecentlyPlayedSongs(songs).length;

    return { favCount, topCount, recentCount, losslessCount };
  }, [songs]);

  // Lazy dynamic playlists: Only compute full list when that tab is actually active
  const topPlayedSongs = useMemo(() => {
    if (selectedPlaylistId === 'dynamic:top_played') {
      return getTopPlayedSongs(songs);
    }
    return [];
  }, [songs, selectedPlaylistId]);

  const recentlyPlayedSongs = useMemo(() => {
    if (selectedPlaylistId === 'dynamic:recently_played') {
      return getRecentlyPlayedSongs(songs);
    }
    return [];
  }, [songs, selectedPlaylistId]);

  const losslessSongs = useMemo(() => {
    if (selectedPlaylistId === 'dynamic:lossless') {
      return getLosslessSongs(songs);
    }
    return [];
  }, [songs, selectedPlaylistId]);

  const handleClearRecentHistory = async () => {
    await clearRecentHistory();
    if (onClearRecentHistory) {
      onClearRecentHistory();
    }
  };

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

  // View Mode: 'paginated' vs 'virtual' (Smooth infinite stream)
  const [viewMode, setViewMode] = useState<'paginated' | 'virtual'>(() => {
    try {
      const saved = localStorage.getItem('tinglan_library_view_mode');
      if (saved === 'virtual' || saved === 'paginated') return saved;
    } catch {}
    return 'paginated';
  });

  const handleViewModeChange = useCallback((mode: 'paginated' | 'virtual') => {
    setViewMode(mode);
    try {
      localStorage.setItem('tinglan_library_view_mode', mode);
    } catch {}
  }, []);

  // Modal toggles
  const [showNewPlaylistModal, setShowNewPlaylistModal] = useState(false);
  const [songToAddToPlaylist, setSongToAddToPlaylist] = useState<Song | null>(null);
  const [showBatchAddModal, setShowBatchAddModal] = useState(false);
  const [showRenamePlaylistModal, setShowRenamePlaylistModal] = useState(false);
  const [renamePlaylistId, setRenamePlaylistId] = useState('');
  const [renamePlaylistName, setRenamePlaylistName] = useState('');
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);

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

  const handleSelectSong = useCallback((id: string) => {
    setSelectedSongId(id);
  }, []);

  const handleOpenAddToPlaylistModal = useCallback((s: Song) => {
    setSongToAddToPlaylist(s);
  }, []);

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

    // 3. Filter by search query (multi-token search with fast substring matching)
    if (debouncedSearchQuery.trim()) {
      const tokens = debouncedSearchQuery.toLowerCase().split(/\s+/).filter(Boolean);
      result = result.filter(s => {
        const text = `${s.title} ${s.artist} ${s.album} ${s.genre || ''}`.toLowerCase();
        return tokens.every(token => text.includes(token));
      });
    }

    // 4. Sort songs with high performance collator
    result = [...result];
    switch (sortOption) {
      case 'title_asc':
        result.sort((a, b) => zhCollator.compare(a.title, b.title));
        break;
      case 'title_desc':
        result.sort((a, b) => zhCollator.compare(b.title, a.title));
        break;
      case 'artist_asc':
        result.sort((a, b) => zhCollator.compare(a.artist, b.artist));
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
  }, [songs, playlists, selectedPlaylistId, debouncedSearchQuery, sourceFilter, sortOption, topPlayedSongs, recentlyPlayedSongs, losslessSongs]);

  // Hook for batch selection
  const {
    isBatchMode,
    setIsBatchMode,
    selectedBatchSongIds,
    handleToggleSelectAll,
    handleToggleBatchSelectSong,
    clearBatchSelection,
    exitBatchMode
  } = useSongSelection(filteredSongs);

  // Reset page & selection when search, tab, or sort changes
  useEffect(() => {
    setCurrentPage(1);
    clearBatchSelection();
  }, [selectedPlaylistId, debouncedSearchQuery, sourceFilter, sortOption, clearBatchSelection]);

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
        favoriteSongCount={libraryStats.favCount}
        topPlayedCount={libraryStats.topCount}
        recentlyPlayedCount={libraryStats.recentCount}
        losslessCount={libraryStats.losslessCount}
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

      {/* 4. Listening Insights Analytics Panel */}
      {showInsights && (
        <ListeningInsightsPanel
          songs={songs}
          isLight={isLight}
          onClose={() => setShowInsights(false)}
          onPlaySong={onPlaySong}
        />
      )}

      {/* 5. Search, Filter, Sort & Export Toolbar */}
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
          clearBatchSelection();
        }}
        filteredCount={filteredSongs.length}
        totalSongsCount={songs.length}
        selectedPlaylistId={selectedPlaylistId}
        onExportPlaylist={exportPlaylist}
        onClearAllSongs={() => setShowClearConfirmModal(true)}
        isLight={isLight}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        showInsights={showInsights}
        onToggleInsights={() => setShowInsights(prev => !prev)}
      />

      {/* 5. Main Song Table Container */}
      <div className={`rounded-2xl border shadow-xl overflow-hidden transition-colors duration-200 ${
        isLight ? 'bg-white border-zinc-200 shadow-sm' : 'bg-zinc-900/60 border-white/10'
      }`}>
        {/* Table Header */}
        <SongTableHeader
          isLight={isLight}
          isBatchMode={isBatchMode}
          selectedBatchCount={selectedBatchSongIds.size}
          totalFilteredCount={filteredSongs.length}
          onToggleSelectAll={handleToggleSelectAll}
        />

        {/* Dual Mode Song List Body: Virtual Scroll Stream vs Standard Paginated */}
        {viewMode === 'virtual' ? (
          <div>
            {filteredSongs.length === 0 ? (
              <LibraryEmptyState
                sourceFilter={sourceFilter}
                searchQuery={searchQuery}
                isLight={isLight}
                onClearSourceFilter={() => setSourceFilter('all')}
                onClearSearch={() => setSearchQuery('')}
                onOpenNavidromeModal={onOpenNavidromeModal}
              />
            ) : (
              <VirtualList<Song>
                items={filteredSongs}
                itemHeight={72}
                overscan={8}
                className={`h-[640px] max-h-[75vh] w-full overflow-y-auto divide-y ${
                  isLight ? 'divide-zinc-100 scrollbar-thin scrollbar-thumb-zinc-300' : 'divide-white/5 scrollbar-thin scrollbar-thumb-zinc-800'
                }`}
                renderItem={(song, songIndex) => {
                  const isCurrent = currentSong?.id === song.id;
                  const isSelected = selectedSongId === song.id;
                  const isSongCasting = isCurrent && isCasting;
                  const isBatchChecked = selectedBatchSongIds.has(song.id);

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
                      onSelect={handleSelectSong}
                      onPlaySong={onPlaySong}
                      onToggleBatchSelectSong={handleToggleBatchSelectSong}
                      onToggleFavorite={onToggleFavorite}
                      onAddToPlaylist={handleOpenAddToPlaylistModal}
                      onToggleSongInPlaylist={onToggleSongInPlaylist}
                      onInspectSong={onInspectSong}
                      onCastSongToXiaomi={onCastSongToXiaomi}
                    />
                  );
                }}
              />
            )}
            {/* Virtual Stream Status Bar */}
            <div className={`px-4 sm:px-6 py-3 border-t flex flex-wrap items-center justify-between gap-3 text-xs ${
              isLight ? 'bg-zinc-50 border-zinc-200 text-zinc-600' : 'bg-zinc-950/40 border-white/5 text-zinc-400'
            }`}>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>极速虚拟流模式 · 仅渲染视口 DOM，丝滑畅滑海量曲库（共 <strong className="text-[#FF6700] font-semibold">{filteredSongs.length}</strong> 首）</span>
              </div>

              {/* View Mode Tag Switcher right at bottom */}
              <div className={`flex items-center p-0.5 rounded-xl border text-xs ${
                isLight ? 'bg-zinc-200/80 border-zinc-300' : 'bg-zinc-900 border-white/10'
              }`}>
                <button
                  type="button"
                  id="btn-virtual-switch-paginated"
                  onClick={() => handleViewModeChange('paginated')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition font-semibold cursor-pointer ${
                    isLight ? 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200' : 'text-zinc-400 hover:text-white'
                  }`}
                  title="切换至传统分页"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>分页</span>
                </button>
                <button
                  type="button"
                  id="btn-virtual-active"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FF6700] text-white font-bold shadow-sm"
                  title="当前为极速虚拟流模式"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-300" />
                  <span>虚拟流</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className={`divide-y ${isLight ? 'divide-zinc-100' : 'divide-white/5'}`}>
              {paginatedSongs.length === 0 ? (
                <LibraryEmptyState
                  sourceFilter={sourceFilter}
                  searchQuery={searchQuery}
                  isLight={isLight}
                  onClearSourceFilter={() => setSourceFilter('all')}
                  onClearSearch={() => setSearchQuery('')}
                  onOpenNavidromeModal={onOpenNavidromeModal}
                />
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
                      onSelect={handleSelectSong}
                      onPlaySong={onPlaySong}
                      onToggleBatchSelectSong={handleToggleBatchSelectSong}
                      onToggleFavorite={onToggleFavorite}
                      onAddToPlaylist={handleOpenAddToPlaylistModal}
                      onToggleSongInPlaylist={onToggleSongInPlaylist}
                      onInspectSong={onInspectSong}
                      onCastSongToXiaomi={onCastSongToXiaomi}
                    />
                  );
                })
              )}
            </div>

            {/* Pagination Bar */}
            <LibraryPagination
              currentPage={validCurrentPage}
              pageSize={pageSize}
              totalItems={totalItems}
              totalPages={totalPages}
              pageNumbers={pageNumbers}
              isLight={isLight}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              viewMode={viewMode}
              onViewModeChange={handleViewModeChange}
            />
          </>
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
        onExitBatchMode={exitBatchMode}
      />

      {/* Grouped Library Modals */}
      <LibraryModals
        isLight={isLight}
        showNewPlaylistModal={showNewPlaylistModal}
        onCloseNewPlaylistModal={() => setShowNewPlaylistModal(false)}
        onCreatePlaylist={onCreatePlaylist}
        songToAddToPlaylist={songToAddToPlaylist}
        onCloseAddToPlaylistModal={() => setSongToAddToPlaylist(null)}
        playlists={playlists}
        onToggleSongInPlaylist={onToggleSongInPlaylist}
        showBatchAddModal={showBatchAddModal}
        onCloseBatchAddModal={() => setShowBatchAddModal(false)}
        selectedPlaylistId={selectedPlaylistId}
        allSongs={songs}
        showRenamePlaylistModal={showRenamePlaylistModal}
        onCloseRenamePlaylistModal={() => setShowRenamePlaylistModal(false)}
        renamePlaylistId={renamePlaylistId}
        renamePlaylistName={renamePlaylistName}
        onRenamePlaylist={onRenamePlaylist}
        showClearConfirmModal={showClearConfirmModal}
        onCloseClearConfirmModal={() => setShowClearConfirmModal(false)}
        onClearAllSongs={onClearAllSongs}
        totalSongsCount={songs.length}
      />
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
