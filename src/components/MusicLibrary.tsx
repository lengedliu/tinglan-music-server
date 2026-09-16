import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Search, 
  Play, 
  Pause, 
  Cast, 
  Heart, 
  Plus, 
  FolderPlus, 
  FolderMinus,
  FolderSync, 
  UploadCloud, 
  Music, 
  Radio, 
  ListMusic, 
  ListPlus,
  Sparkles, 
  Check, 
  Trash2,
  AlertTriangle,
  X,
  SlidersHorizontal,
  Clock,
  Disc3,
  Flame,
  Server,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Speaker,
  Laptop
} from 'lucide-react';
import { Song, Playlist, XiaomiDevice } from '../types';
import { formatTime } from '../utils/lyricParser';
import { useTheme } from '../context/ThemeContext';

interface MusicLibraryProps {
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
  onClearAllSongs?: () => void;
  onOpenNavidromeModal?: () => void;
}

export const MusicLibrary: React.FC<MusicLibraryProps> = ({
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
  onClearAllSongs,
  onOpenNavidromeModal
}) => {
  const { themeConfig } = useTheme();
  const isLight = !!themeConfig?.isLight;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>('all');
  const [selectedGenre, setSelectedGenre] = useState<string>('all');
  
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

  // Tab bar scroll ref & drag scroll states
  const tabsNavRef = useRef<HTMLDivElement>(null);
  const [isDraggingTabs, setIsDraggingTabs] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragScrollLeft, setDragScrollLeft] = useState(0);
  const [hasDragged, setHasDragged] = useState(false);

  const scrollTabs = (direction: 'left' | 'right') => {
    if (tabsNavRef.current) {
      const scrollAmount = direction === 'left' ? -260 : 260;
      tabsNavRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const handleTabsWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (tabsNavRef.current) {
      if (e.deltaY !== 0) {
        tabsNavRef.current.scrollLeft += e.deltaY * 1.2;
      }
    }
  };

  const handleMouseDownTabs = (e: React.MouseEvent) => {
    if (!tabsNavRef.current) return;
    setIsDraggingTabs(true);
    setHasDragged(false);
    setDragStartX(e.pageX - tabsNavRef.current.offsetLeft);
    setDragScrollLeft(tabsNavRef.current.scrollLeft);
  };

  const handleMouseLeaveTabs = () => {
    setIsDraggingTabs(false);
  };

  const handleMouseUpTabs = () => {
    setIsDraggingTabs(false);
  };

  const handleMouseMoveTabs = (e: React.MouseEvent) => {
    if (!isDraggingTabs || !tabsNavRef.current) return;
    e.preventDefault();
    const x = e.pageX - tabsNavRef.current.offsetLeft;
    const walk = (x - dragStartX) * 1.5;
    if (Math.abs(walk) > 5) {
      setHasDragged(true);
    }
    tabsNavRef.current.scrollLeft = dragScrollLeft - walk;
  };

  // Reset page to 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedPlaylistId, selectedGenre, searchQuery]);

  // Extract all distinct genres
  const genres = useMemo(() => {
    const set = new Set<string>();
    songs.forEach(s => {
      if (s.genre) set.add(s.genre.split('/')[0].trim());
    });
    return ['all', ...Array.from(set)];
  }, [songs]);

  // Filter songs
  const filteredSongs = useMemo(() => {
    return songs.filter(song => {
      // Playlist filter
      if (selectedPlaylistId === 'favorites') {
        if (!song.isFavorite) return false;
      } else if (selectedPlaylistId !== 'all') {
        const pl = playlists.find(p => p.id === selectedPlaylistId);
        if (pl && !pl.songIds.includes(song.id)) return false;
      }

      // Genre filter
      if (selectedGenre !== 'all') {
        if (!song.genre || !song.genre.toLowerCase().includes(selectedGenre.toLowerCase())) {
          return false;
        }
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = song.title.toLowerCase().includes(q);
        const matchesArtist = song.artist.toLowerCase().includes(q);
        const matchesAlbum = song.album.toLowerCase().includes(q);
        return matchesTitle || matchesArtist || matchesAlbum;
      }

      return true;
    });
  }, [songs, playlists, selectedPlaylistId, selectedGenre, searchQuery]);

  const totalItems = filteredSongs.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  
  // Ensure valid current page
  const validCurrentPage = Math.min(currentPage, totalPages);

  const paginatedSongs = useMemo(() => {
    const startIdx = (validCurrentPage - 1) * pageSize;
    return filteredSongs.slice(startIdx, startIdx + pageSize);
  }, [filteredSongs, validCurrentPage, pageSize]);

  // Smart page numbers calculation
  const pageNumbers = useMemo(() => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (validCurrentPage > 3) pages.push('...');
      const start = Math.max(2, validCurrentPage - 1);
      const end = Math.min(totalPages - 1, validCurrentPage + 1);
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      if (validCurrentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  }, [totalPages, validCurrentPage]);

  const handleCreatePlaylistSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    onCreatePlaylist(newPlaylistName.trim(), newPlaylistDesc.trim());
    setNewPlaylistName('');
    setNewPlaylistDesc('');
    setShowNewPlaylistModal(false);
  };

  const handleInlineCreateAndAdd = () => {
    if (!inlineNewPlaylistName.trim()) return;
    onCreatePlaylist(inlineNewPlaylistName.trim(), '');
    setInlineNewPlaylistName('');
  };

  return (
    <div className="space-y-6 pb-28">
      
      {/* Top Banner / Dashboard Hero Info (Referencing Subsonic Server Card Architecture) */}
      <div className="p-6 sm:p-8 rounded-3xl bg-zinc-900/60 backdrop-blur-xl border border-white/10 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#FF6700]/10 blur-[120px] pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/30 text-xs font-semibold">
              <Radio className="w-3.5 h-3.5" />
              <span>当前连接音箱：{activeDevice?.name || '未选择音箱'}</span>
              <span className={`w-2 h-2 rounded-full ${activeDevice?.isOnline ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'bg-zinc-500'}`} />
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              私有音乐曲库
            </h1>

            <p className="text-sm text-zinc-300 leading-relaxed">
              支持 FLAC / 320k MP3 / DSD 纯净串流，通过 MIoT 协议一键推送到小米小爱音箱。本地目录实时挂载，适配 NAS 与 Docker 独立部署。
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-shrink-0 relative z-10">
            {onOpenNavidromeModal && (
              <button
                id="btn-open-navidrome-modal"
                onClick={onOpenNavidromeModal}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold border border-white/10 transition active:scale-95 shadow-sm"
                title="连接 Navidrome / Subsonic 远程服务器"
              >
                <Server className="w-4 h-4 text-emerald-400" />
                <span>连接 Navidrome</span>
              </button>
            )}

            <button
              id="btn-scan-music-library"
              onClick={onScanMusicDir}
              disabled={isScanning}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold border border-white/10 transition active:scale-95 disabled:opacity-50 shadow-sm"
              title="重新扫描 Docker 挂载的 /app/music 目录"
            >
              <FolderSync className={`w-4 h-4 ${isScanning ? 'animate-spin text-[#FF6700]' : 'text-zinc-400'}`} />
              <span>{isScanning ? '扫描中...' : '扫描挂载目录'}</span>
            </button>

            <button
              id="btn-upload-music-file"
              onClick={onOpenUploadModal}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-[#FF6700] hover:bg-[#e55c00] text-white text-xs font-bold shadow-[0_4px_20px_rgba(255,103,0,0.3)] transition active:scale-95"
            >
              <UploadCloud className="w-4 h-4" />
              <span>导入/上传音乐</span>
            </button>
          </div>
        </div>

        {/* Library Metrics Cards (Subsonic Style) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8 pt-6 border-t border-white/10 relative z-10">
          <div className="p-4 rounded-2xl bg-zinc-950/60 border border-white/5 space-y-1">
            <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider block">曲库总量</span>
            <span className="text-base font-bold text-white font-mono">{songs.length} 首发烧曲目</span>
          </div>
          <div className="p-4 rounded-2xl bg-zinc-950/60 border border-white/5 space-y-1">
            <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider block">自建歌单</span>
            <span className="text-base font-bold text-amber-400 font-mono">{playlists.length} 个播放列表</span>
          </div>
          <div className="p-4 rounded-2xl bg-zinc-950/60 border border-white/5 space-y-1">
            <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider block">当前筛选匹配</span>
            <span className="text-base font-bold text-emerald-400 font-mono">{filteredSongs.length} 首曲目</span>
          </div>
          <div className="p-4 rounded-2xl bg-zinc-950/60 border border-white/5 space-y-1">
            <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider block">母带串流标准</span>
            <span className="text-base font-bold text-cyan-400 font-mono">FLAC 96k / MIoT</span>
          </div>
        </div>
      </div>

      {/* Playlist & Search Bar Section (Flex layout with responsive scroll container) */}
      <div className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          {/* Scrollable Playlists Tabs with Arrow Controls & Wheel/Drag Scroll */}
          <div className="min-w-0 flex-1 relative flex items-center group/tabs">
            
            {/* Scroll Left Button */}
            <button
              id="btn-scroll-tabs-left"
              type="button"
              onClick={() => scrollTabs('left')}
              className="absolute -left-2 z-20 p-2 rounded-full bg-zinc-900/95 border border-[#FF6700]/40 text-[#FF6700] hover:bg-[#FF6700] hover:text-white shadow-2xl transition-all active:scale-95"
              title="向左滚动歌单"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div 
              ref={tabsNavRef}
              onWheel={handleTabsWheel}
              onMouseDown={handleMouseDownTabs}
              onMouseLeave={handleMouseLeaveTabs}
              onMouseUp={handleMouseUpTabs}
              onMouseMove={handleMouseMoveTabs}
              className={`flex items-center gap-2.5 overflow-x-auto py-1 px-6 scrollbar-none select-none flex-1 rounded-2xl ${
                isDraggingTabs ? 'cursor-grabbing' : 'cursor-grab'
              }`}
            >
              
              {/* All Songs Tab */}
              <button
                id="tab-playlist-all"
                onClick={() => {
                  if (!hasDragged) setSelectedPlaylistId('all');
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                  selectedPlaylistId === 'all'
                    ? 'bg-[#FF6700] text-white font-semibold shadow-[0_2px_12px_rgba(255,103,0,0.4)]'
                    : 'bg-zinc-900/80 text-zinc-300 hover:text-white hover:bg-zinc-800 border border-white/10'
                }`}
              >
                <span>全部歌曲</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${selectedPlaylistId === 'all' ? 'bg-white/20 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
                  {songs.length}
                </span>
              </button>

              {/* Favorites Tab */}
              <button
                id="tab-playlist-favorites"
                onClick={() => {
                  if (!hasDragged) setSelectedPlaylistId('favorites');
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                  selectedPlaylistId === 'favorites'
                    ? 'bg-rose-500 text-white font-semibold shadow-[0_2px_12px_rgba(244,63,94,0.4)]'
                    : 'bg-zinc-900/80 text-zinc-300 hover:text-white hover:bg-zinc-800 border border-white/10'
                }`}
              >
                <Heart className="w-3.5 h-3.5 fill-current text-rose-300" />
                <span>我喜欢的</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${selectedPlaylistId === 'favorites' ? 'bg-white/20 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
                  {songs.filter(s => s.isFavorite).length}
                </span>
              </button>

              {/* Custom Created Playlists */}
              {playlists.map(pl => {
                const isSelected = selectedPlaylistId === pl.id;
                const songCount = songs.filter(s => pl.songIds.includes(s.id)).length;
                return (
                  <button
                    key={pl.id}
                    id={`tab-playlist-${pl.id}`}
                    onClick={() => {
                      if (!hasDragged) setSelectedPlaylistId(pl.id);
                    }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                      isSelected
                        ? 'bg-[#FF6700]/20 text-[#FF6700] border border-[#FF6700]/50 font-semibold shadow-[0_0_12px_rgba(255,103,0,0.25)]'
                        : 'bg-zinc-900/80 text-zinc-300 hover:text-white hover:bg-zinc-800 border border-white/10'
                    }`}
                  >
                    <ListMusic className="w-3.5 h-3.5 text-[#FF6700]" />
                    <span>{pl.name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isSelected ? 'bg-[#FF6700]/30 text-[#FF6700]' : 'bg-zinc-800 text-zinc-400'}`}>
                      {songCount}
                    </span>
                  </button>
                );
              })}

              {/* Create New Playlist Pill Button */}
              <button
                id="btn-create-new-playlist"
                onClick={() => {
                  if (!hasDragged) setShowNewPlaylistModal(true);
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium text-zinc-300 hover:text-white bg-zinc-900/80 hover:bg-zinc-800 border border-dashed border-zinc-600 hover:border-[#FF6700] transition-all flex-shrink-0 shadow-sm"
                title="新建播放歌单"
              >
                <Plus className="w-3.5 h-3.5 text-[#FF6700]" />
                <span>新建歌单</span>
              </button>
            </div>

            {/* Scroll Right Button */}
            <button
              id="btn-scroll-tabs-right"
              type="button"
              onClick={() => scrollTabs('right')}
              className="absolute -right-2 z-20 p-2 rounded-full bg-zinc-900/95 border border-[#FF6700]/40 text-[#FF6700] hover:bg-[#FF6700] hover:text-white shadow-2xl transition-all active:scale-95"
              title="向右滚动歌单"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

          </div>

          {/* Search Bar */}
          <div className="relative w-full lg:w-72 flex-shrink-0">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="input-search-music"
              type="text"
              placeholder="搜索歌曲、歌手或专辑..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-8 py-2 bg-zinc-900/80 border border-white/10 rounded-full text-xs sm:text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-[#FF6700] transition shadow-inner"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Selected Custom Playlist Header Information Banner */}
        {selectedPlaylistId !== 'all' && selectedPlaylistId !== 'favorites' && (() => {
          const currentPl = playlists.find(p => p.id === selectedPlaylistId);
          if (!currentPl) return null;
          return (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-gradient-to-r from-zinc-900/90 to-zinc-950/80 border border-[#FF6700]/30 shadow-xl">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-[#FF6700]/15 border border-[#FF6700]/30 flex items-center justify-center text-[#FF6700] flex-shrink-0">
                  <ListMusic className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">{currentPl.name}</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#FF6700]/20 text-[#FF6700] font-semibold">
                      {filteredSongs.length} 首歌曲
                    </span>
                  </div>
                  {currentPl.description ? (
                    <p className="text-xs text-zinc-400 mt-1">{currentPl.description}</p>
                  ) : (
                    <p className="text-xs text-zinc-500 mt-1">创建时间: {currentPl.createdAt}</p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {/* Unified Dynamic Play All Button (Mode-aware: Local vs Speaker) */}
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
                      <Play className="w-3.5 h-3.5 fill-current text-zinc-950" />
                      <span>播放全部 ({filteredSongs.length} 首)</span>
                    </>
                  )}
                </button>

                <button
                  id="btn-batch-add-songs"
                  onClick={() => setShowBatchAddModal(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-white/10 transition active:scale-95"
                >
                  <ListPlus className="w-4 h-4 text-[#FF6700]" />
                  <span>添加歌曲</span>
                </button>

                {onDeletePlaylist && (
                  <button
                    id="btn-delete-playlist"
                    onClick={() => {
                      if (confirm(`确认删除歌单《${currentPl.name}》？删除后不会清空曲库原有音频。`)) {
                        onDeletePlaylist(currentPl.id);
                        setSelectedPlaylistId('all');
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-medium transition"
                    title="删除当前歌单"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>删除歌单</span>
                  </button>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Global Quick Action Toolbar for current view */}
      {filteredSongs.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3 rounded-2xl bg-zinc-900/60 border border-white/5 backdrop-blur-md">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Unified Dynamic Master Play All Button (Plan B) */}
            <button
              id="btn-play-all-current-view"
              onClick={() => {
                if (isCasting && onCastAllToXiaomi && activeDevice) {
                  onCastAllToXiaomi(filteredSongs);
                } else if (onPlayAll) {
                  onPlayAll(filteredSongs, 0);
                } else if (filteredSongs[0]) {
                  onPlaySong(filteredSongs[0]);
                }
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-md ${
                isCasting
                  ? 'bg-[#FF6700] hover:bg-[#e55c00] text-white shadow-[0_2px_14px_rgba(255,103,0,0.45)] border border-[#FF6700]'
                  : isLight
                    ? 'bg-zinc-900 hover:bg-zinc-800 text-white shadow-md'
                    : 'bg-white hover:bg-zinc-100 text-zinc-950 shadow-[0_2px_10px_rgba(255,255,255,0.2)]'
              }`}
              title={
                isCasting
                  ? `【音箱模式】一键将当前 ${filteredSongs.length} 首歌曲投播到【${activeDevice?.name || '小爱音箱'}】进行连续播放`
                  : `【本地模式】按当前列表顺序在本地设备播放所有歌曲 (${filteredSongs.length} 首)`
              }
            >
              {isCasting ? (
                <>
                  <Speaker className="w-3.5 h-3.5 animate-pulse text-white" />
                  <span>投播全部至【{activeDevice?.name ? (activeDevice.name.length > 7 ? activeDevice.name.slice(0, 7) + '…' : activeDevice.name) : '小爱音箱'}】({filteredSongs.length} 首)</span>
                </>
              ) : (
                <>
                  <Play className={`w-3.5 h-3.5 fill-current ${isLight ? 'text-white' : 'text-zinc-950'}`} />
                  <span>播放全部 ({filteredSongs.length} 首)</span>
                </>
              )}
            </button>

            {/* Clear All Songs button - only displayed in "全部歌曲" view */}
            {selectedPlaylistId === 'all' && onClearAllSongs && songs.length > 0 && (
              <button
                id="btn-clear-all-songs"
                onClick={() => setShowClearConfirmModal(true)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95 border ${
                  isLight
                    ? 'bg-rose-50 hover:bg-rose-100 text-rose-600 border-rose-200 hover:border-rose-300'
                    : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border-rose-500/20 hover:border-rose-500/40'
                }`}
                title="清空曲库中的所有歌曲"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>清除所有歌曲</span>
              </button>
            )}
          </div>

          <div className="text-xs text-zinc-400 flex items-center gap-2">
            <span>列表共 <strong className="text-white font-mono">{filteredSongs.length}</strong> 首</span>
            {searchQuery && <span className="text-amber-400 font-mono">(匹配关键词 "{searchQuery}")</span>}
          </div>
        </div>
      )}

      {/* Songs Table with Immersive UI Styling */}
      <div className="bg-zinc-900/40 backdrop-blur-md border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between text-xs text-zinc-400 font-medium">
          <div className="flex items-center gap-4">
            <span className="w-6 text-center">#</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-bold">Track & Artist</span>
              <span className="text-[10px] text-zinc-500 font-normal hidden sm:inline">(单击选中 · 双击播放)</span>
            </div>
          </div>
          <div className="flex items-center gap-8">
            <span className="hidden md:inline text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-bold">Audio Quality</span>
            <span className="hidden sm:inline text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-bold">Time</span>
            <span className="text-right text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-bold">Actions & Cast</span>
          </div>
        </div>

        <div className="divide-y divide-white/5">
          {filteredSongs.length === 0 ? (
            <div className="py-16 text-center text-zinc-500">
              <Music className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">没有找到符合条件的音乐</p>
              <p className="text-xs text-zinc-600 mt-1">请尝试更换搜索词、添加歌曲，或点击上方“导入/上传音乐”</p>
            </div>
          ) : (
            paginatedSongs.map((song, index) => {
              const isCurrent = currentSong?.id === song.id;
              const isSelected = selectedSongId === song.id;
              const isSongCasting = isCurrent && isCasting;

              return (
                <div
                  key={song.id}
                  id={`song-row-${song.id}`}
                  tabIndex={0}
                  onClick={() => {
                    setSelectedSongId(song.id);
                  }}
                  onDoubleClick={() => {
                    setSelectedSongId(song.id);
                    onPlaySong(song);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedSongId(song.id);
                      onPlaySong(song);
                    }
                  }}
                  title={isCurrent ? "当前正在播放（双击可重新播放）" : "单击选中歌曲，双击开始播放"}
                  className={`group flex items-center justify-between px-6 py-3.5 transition-all duration-150 cursor-pointer select-none outline-none ${
                    isSelected 
                      ? 'bg-[#FF6700]/10 hover:bg-[#FF6700]/15 border-l-2 border-l-[#FF6700]' 
                      : 'hover:bg-white/5 border-l-2 border-l-transparent'
                  }`}
                >
                  {/* Left: Index / Play button & Song Details */}
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    
                    {/* Index or Play icon */}
                    <div className="w-6 flex items-center justify-center flex-shrink-0">
                      {isCurrent && isPlaying ? (
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
                            setSelectedSongId(song.id);
                            onPlaySong(song);
                          }}
                          className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/20 group-hover:text-white transition"
                          title="播放"
                        >
                          <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                        </button>
                      )}
                    </div>

                    {/* Album Cover */}
                    <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 shadow border border-white/10">
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
                            : 'text-zinc-100 group-hover:text-white'
                        }`}>
                          {song.title}
                        </span>
                        {song.source === 'uploaded' && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            本地自制
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-zinc-400 truncate mt-0.5">
                        <span className="truncate">{song.artist}</span>
                        <span>·</span>
                        <span className="truncate text-zinc-500">{song.album}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Bitrate, Duration & Actions */}
                  <div className="flex items-center gap-4 sm:gap-6 flex-shrink-0">
                    
                    {/* Bitrate badge */}
                    <div className="hidden md:flex flex-col items-end text-right">
                      <span className="text-xs font-mono font-medium text-zinc-300">
                        {song.bitrate || 'FLAC 96kHz'}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {song.fileSize || '24.1 MB'}
                      </span>
                    </div>

                    {/* Duration */}
                    <span className="hidden sm:inline text-xs font-mono text-zinc-400">
                      {formatTime(song.duration)}
                    </span>

                    {/* Favorite Heart */}
                    <button
                      id={`btn-fav-${song.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(song.id);
                      }}
                      className="p-1.5 text-zinc-500 hover:text-rose-500 transition"
                      title={song.isFavorite ? '取消收藏' : '添加到我喜欢'}
                    >
                      <Heart className={`w-4 h-4 ${song.isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
                    </button>

                    {/* Add to Playlist button */}
                    <button
                      id={`btn-add-playlist-${song.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSongToAddToPlaylist(song);
                      }}
                      className="p-1.5 text-zinc-400 hover:text-[#FF6700] hover:bg-white/5 rounded-lg transition"
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
                        className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
                        title="从当前歌单移除"
                      >
                        <FolderMinus className="w-4 h-4" />
                      </button>
                    )}

                    {/* One-Click Cast to Xiaomi Speaker Button */}
                    <button
                      id={`btn-cast-song-${song.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSongId(song.id);
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
            })
          )}
        </div>

        {/* Pagination Bar */}
        {totalItems > 0 && (
          <div className="px-6 py-4 bg-zinc-950/40 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-400">
            {/* Range & Count */}
            <div className="flex items-center gap-2">
              <span>
                显示第 <strong className="text-zinc-200">{(validCurrentPage - 1) * pageSize + 1}</strong> - <strong className="text-zinc-200">{Math.min(validCurrentPage * pageSize, totalItems)}</strong> 首，共 <strong className="text-[#FF6700]">{totalItems}</strong> 首歌曲
              </span>
            </div>

            {/* Page Navigation */}
            <div className="flex items-center gap-1.5">
              <button
                id="btn-page-first"
                onClick={() => setCurrentPage(1)}
                disabled={validCurrentPage === 1}
                className="p-1.5 rounded-lg bg-zinc-900 border border-white/5 hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none text-zinc-300 transition"
                title="首页"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
              
              <button
                id="btn-page-prev"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={validCurrentPage === 1}
                className="p-1.5 rounded-lg bg-zinc-900 border border-white/5 hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none text-zinc-300 transition"
                title="上一页"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-1">
                {pageNumbers.map((p, idx) => {
                  if (p === '...') {
                    return <span key={`ellipsis-${idx}`} className="px-1.5 text-zinc-600">...</span>;
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
                className="p-1.5 rounded-lg bg-zinc-900 border border-white/5 hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none text-zinc-300 transition"
                title="下一页"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                id="btn-page-last"
                onClick={() => setCurrentPage(totalPages)}
                disabled={validCurrentPage === totalPages}
                className="p-1.5 rounded-lg bg-zinc-900 border border-white/5 hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none text-zinc-300 transition"
                title="末页"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>

            {/* Page Size Selector */}
            <div className="flex items-center gap-2">
              <span>每页显示</span>
              <select
                id="select-page-size"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-zinc-900 border border-white/10 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-[#FF6700] transition"
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

    </div>
  );
};
