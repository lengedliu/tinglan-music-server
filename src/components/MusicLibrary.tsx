import React, { useState, useMemo, useEffect, useCallback, memo } from 'react';
import { 
  FolderSync, 
  UploadCloud, 
  Music, 
  Server
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
import { useSongSelection } from './library/useSongSelection';
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
          clearBatchSelection();
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
        <SongTableHeader
          isLight={isLight}
          isBatchMode={isBatchMode}
          selectedBatchCount={selectedBatchSongIds.size}
          totalFilteredCount={filteredSongs.length}
          onToggleSelectAll={handleToggleSelectAll}
        />

        {/* Song List Body */}
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
        <LibraryPagination
          currentPage={validCurrentPage}
          pageSize={pageSize}
          totalItems={totalItems}
          totalPages={totalPages}
          pageNumbers={pageNumbers}
          isLight={isLight}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
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
