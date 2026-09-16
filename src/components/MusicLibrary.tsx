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
  Laptop,
  CheckSquare,
  Square,
  ArrowUpDown,
  Edit2,
  Download,
  Cpu
} from 'lucide-react';
import { Song, Playlist, XiaomiDevice, SongSortOption, LibrarySourceFilter } from '../types';
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
  onRenamePlaylist?: (playlistId: string, newName: string) => void;
  onClearAllSongs?: () => void;
  onOpenNavidromeModal?: () => void;
  onBatchPlay?: (songs: Song[]) => void;
  onBatchCast?: (songs: Song[]) => void;
  onBatchAddToQueue?: (songs: Song[]) => void;
  onBatchAddToPlaylist?: (songIds: string[], playlistId: string) => void;
  onBatchRemoveFromPlaylist?: (songIds: string[], playlistId: string) => void;
  onInspectSong?: (song: Song) => void;
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
  onRenamePlaylist,
  onClearAllSongs,
  onOpenNavidromeModal,
  onBatchPlay,
  onBatchCast,
  onBatchAddToQueue,
  onBatchAddToPlaylist,
  onBatchRemoveFromPlaylist,
  onInspectSong
}) => {
  const { themeConfig } = useTheme();
  const isLight = !!themeConfig?.isLight;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>('all');
  const [selectedGenre, setSelectedGenre] = useState<string>('all');
  const [sortOption, setSortOption] = useState<SongSortOption>('default');
  const [sourceFilter, setSourceFilter] = useState<LibrarySourceFilter>('all');
  const [isBatchMode, setIsBatchMode] = useState<boolean>(false);
  const [selectedBatchSongIds, setSelectedBatchSongIds] = useState<Set<string>>(new Set());
  const [showRenamePlaylistModal, setShowRenamePlaylistModal] = useState<boolean>(false);
  const [renamePlaylistId, setRenamePlaylistId] = useState<string>('');
  const [renamePlaylistName, setRenamePlaylistName] = useState<string>('');
  const [showBatchPlaylistDropdown, setShowBatchPlaylistDropdown] = useState<boolean>(false);
  const [showExportMenu, setShowExportMenu] = useState<boolean>(false);
  
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
  }, [selectedPlaylistId, selectedGenre, searchQuery, sourceFilter, sortOption]);

  // Extract all distinct genres
  const genres = useMemo(() => {
    const set = new Set<string>();
    songs.forEach(s => {
      if (s.genre) set.add(s.genre.split('/')[0].trim());
    });
    return ['all', ...Array.from(set)];
  }, [songs]);

  // Filter & Sort songs
  const filteredSongs = useMemo(() => {
    let result = songs.filter(song => {
      // Playlist filter
      if (selectedPlaylistId === 'favorites') {
        if (!song.isFavorite) return false;
      } else if (selectedPlaylistId !== 'all') {
        const pl = playlists.find(p => p.id === selectedPlaylistId);
        if (pl && !pl.songIds.includes(song.id)) return false;
      }

      // Source filter
      if (sourceFilter === 'local') {
        if (song.id.startsWith('navidrome-') || (song.url && song.url.includes('/rest/stream'))) return false;
      } else if (sourceFilter === 'navidrome') {
        if (!song.id.startsWith('navidrome-') && (!song.url || !song.url.includes('/rest/stream'))) return false;
      } else if (sourceFilter === 'favorites') {
        if (!song.isFavorite) return false;
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

    // Multi-criteria sorting
    if (sortOption === 'title_asc') {
      result = [...result].sort((a, b) => (a.title || '').localeCompare(b.title || '', 'zh-CN'));
    } else if (sortOption === 'title_desc') {
      result = [...result].sort((a, b) => (b.title || '').localeCompare(a.title || '', 'zh-CN'));
    } else if (sortOption === 'artist_asc') {
      result = [...result].sort((a, b) => (a.artist || '').localeCompare(b.artist || '', 'zh-CN'));
    } else if (sortOption === 'duration_asc') {
      result = [...result].sort((a, b) => (a.duration || 0) - (b.duration || 0));
    } else if (sortOption === 'duration_desc') {
      result = [...result].sort((a, b) => (b.duration || 0) - (a.duration || 0));
    } else if (sortOption === 'bitrate_desc') {
      result = [...result].sort((a, b) => {
        const aFlac = (a.bitrate || '').toLowerCase().includes('flac') ? 1 : 0;
        const bFlac = (b.bitrate || '').toLowerCase().includes('flac') ? 1 : 0;
        return bFlac - aFlac;
      });
    }

    return result;
  }, [songs, playlists, selectedPlaylistId, selectedGenre, searchQuery, sourceFilter, sortOption]);

  // Batch selection helpers
  const isAllSelected = useMemo(() => {
    if (filteredSongs.length === 0) return false;
    return filteredSongs.every(s => selectedBatchSongIds.has(s.id));
  }, [filteredSongs, selectedBatchSongIds]);

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedBatchSongIds(new Set());
    } else {
      setSelectedBatchSongIds(new Set(filteredSongs.map(s => s.id)));
    }
  };

  const handleToggleBatchSelectSong = (songId: string) => {
    setSelectedBatchSongIds(prev => {
      const next = new Set(prev);
      if (next.has(songId)) {
        next.delete(songId);
      } else {
        next.add(songId);
      }
      return next;
    });
  };

  const exportPlaylist = (format: 'm3u8' | 'json') => {
    let name = '曲库全部歌曲';
    if (selectedPlaylistId === 'favorites') {
      name = '我喜欢的音乐';
    } else if (selectedPlaylistId !== 'all') {
      const pl = playlists.find(p => p.id === selectedPlaylistId);
      if (pl) name = pl.name;
    }

    const exportSongs = filteredSongs;
    if (exportSongs.length === 0) {
      return;
    }

    if (format === 'm3u8') {
      let content = '#EXTM3U\n';
      content += `#PLAYLIST:${name}\n\n`;
      exportSongs.forEach(s => {
        const dur = Math.round(s.duration || 0);
        content += `#EXTINF:${dur},${s.artist} - ${s.title}\n`;
        content += `${s.publicStreamUrl || s.url}\n\n`;
      });
      const blob = new Blob([content], { type: 'audio/x-mpegurl;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name.replace(/[/\\?%*:|"<>]/g, '_')}.m3u8`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const data = {
        playlistName: name,
        exportedAt: new Date().toISOString(),
        totalSongs: exportSongs.length,
        songs: exportSongs
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name.replace(/[/\\?%*:|"<>]/g, '_')}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

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
      <div className={`p-6 sm:p-8 rounded-3xl backdrop-blur-xl border relative overflow-hidden shadow-2xl transition-colors ${
        isLight 
          ? 'bg-white/90 border-zinc-200/80 shadow-[0_10px_30px_rgba(0,0,0,0.06)]' 
          : 'bg-zinc-900/60 border-white/10'
      }`}>
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#FF6700]/10 blur-[120px] pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-3 max-w-2xl">
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${
              isLight
                ? 'bg-orange-50 text-[#FF6700] border border-orange-200'
                : 'bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/30'
            }`}>
              <Radio className="w-3.5 h-3.5" />
              <span>当前连接音箱：{activeDevice?.name || '未选择音箱'}</span>
              <span className={`w-2 h-2 rounded-full ${activeDevice?.isOnline ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'bg-zinc-400'}`} />
            </div>

            <h1 className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${
              isLight ? 'text-zinc-900' : 'text-white'
            }`}>
              私有音乐曲库
            </h1>

            <p className={`text-sm leading-relaxed ${
              isLight ? 'text-zinc-600' : 'text-zinc-300'
            }`}>
              支持 FLAC / 320k MP3 / DSD 纯净串流，通过 MIoT 协议一键推送到小米小爱音箱。本地目录实时挂载，适配 NAS 与 Docker 独立部署。
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-shrink-0 relative z-10">
            {onOpenNavidromeModal && (
              <button
                id="btn-open-navidrome-modal"
                onClick={onOpenNavidromeModal}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-xs font-semibold border transition active:scale-95 shadow-sm ${
                  isLight
                    ? 'bg-white hover:bg-zinc-50 text-zinc-800 border-zinc-200'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-white border-white/10'
                }`}
                title="连接 Navidrome / Subsonic 远程服务器"
              >
                <Server className="w-4 h-4 text-emerald-500" />
                <span>连接 Navidrome</span>
              </button>
            )}

            <button
              id="btn-scan-music-library"
              onClick={onScanMusicDir}
              disabled={isScanning}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-xs font-semibold border transition active:scale-95 disabled:opacity-50 shadow-sm ${
                isLight
                  ? 'bg-white hover:bg-zinc-50 text-zinc-800 border-zinc-200'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-white border-white/10'
              }`}
              title="重新扫描 Docker 挂载的 /app/music 目录"
            >
              <FolderSync className={`w-4 h-4 ${isScanning ? 'animate-spin text-[#FF6700]' : isLight ? 'text-zinc-500' : 'text-zinc-400'}`} />
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
        <div className={`grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8 pt-6 border-t relative z-10 ${
          isLight ? 'border-zinc-200/80' : 'border-white/10'
        }`}>
          <div className={`p-4 rounded-2xl border space-y-1 ${
            isLight ? 'bg-zinc-50/80 border-zinc-200/70' : 'bg-zinc-950/60 border-white/5'
          }`}>
            <span className={`text-[10px] font-medium uppercase tracking-wider block ${
              isLight ? 'text-zinc-500' : 'text-zinc-500'
            }`}>曲库总量</span>
            <span className={`text-base font-bold font-mono ${
              isLight ? 'text-zinc-900' : 'text-white'
            }`}>{songs.length} 首发烧曲目</span>
          </div>
          <div className={`p-4 rounded-2xl border space-y-1 ${
            isLight ? 'bg-zinc-50/80 border-zinc-200/70' : 'bg-zinc-950/60 border-white/5'
          }`}>
            <span className={`text-[10px] font-medium uppercase tracking-wider block ${
              isLight ? 'text-zinc-500' : 'text-zinc-500'
            }`}>自建歌单</span>
            <span className="text-base font-bold text-amber-500 font-mono">{playlists.length} 个播放列表</span>
          </div>
          <div className={`p-4 rounded-2xl border space-y-1 ${
            isLight ? 'bg-zinc-50/80 border-zinc-200/70' : 'bg-zinc-950/60 border-white/5'
          }`}>
            <span className={`text-[10px] font-medium uppercase tracking-wider block ${
              isLight ? 'text-zinc-500' : 'text-zinc-500'
            }`}>当前筛选匹配</span>
            <span className="text-base font-bold text-emerald-500 font-mono">{filteredSongs.length} 首曲目</span>
          </div>
          <div className={`p-4 rounded-2xl border space-y-1 ${
            isLight ? 'bg-zinc-50/80 border-zinc-200/70' : 'bg-zinc-950/60 border-white/5'
          }`}>
            <span className={`text-[10px] font-medium uppercase tracking-wider block ${
              isLight ? 'text-zinc-500' : 'text-zinc-500'
            }`}>母带串流标准</span>
            <span className="text-base font-bold text-cyan-500 font-mono">FLAC 96k / MIoT</span>
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
              className={`absolute -left-2 z-20 p-2 rounded-full border text-[#FF6700] hover:bg-[#FF6700] hover:text-white shadow-xl transition-all active:scale-95 ${
                isLight ? 'bg-white/95 border-zinc-200' : 'bg-zinc-900/95 border-[#FF6700]/40'
              }`}
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
                    : isLight
                      ? 'bg-white text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 border border-zinc-200'
                      : 'bg-zinc-900/80 text-zinc-300 hover:text-white hover:bg-zinc-800 border border-white/10'
                }`}
              >
                <span>全部歌曲</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  selectedPlaylistId === 'all' 
                    ? 'bg-white/20 text-white' 
                    : isLight 
                      ? 'bg-zinc-100 text-zinc-600' 
                      : 'bg-zinc-800 text-zinc-400'
                }`}>
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
                    : isLight
                      ? 'bg-white text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 border border-zinc-200'
                      : 'bg-zinc-900/80 text-zinc-300 hover:text-white hover:bg-zinc-800 border border-white/10'
                }`}
              >
                <Heart className="w-3.5 h-3.5 fill-current text-rose-400" />
                <span>我喜欢的</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  selectedPlaylistId === 'favorites' 
                    ? 'bg-white/20 text-white' 
                    : isLight 
                      ? 'bg-zinc-100 text-zinc-600' 
                      : 'bg-zinc-800 text-zinc-400'
                }`}>
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
                        ? (isLight 
                            ? 'bg-orange-50 text-[#FF6700] border border-orange-300 font-semibold shadow-sm' 
                            : 'bg-[#FF6700]/20 text-[#FF6700] border border-[#FF6700]/50 font-semibold shadow-[0_0_12px_rgba(255,103,0,0.25)]')
                        : (isLight
                            ? 'bg-white text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 border border-zinc-200'
                            : 'bg-zinc-900/80 text-zinc-300 hover:text-white hover:bg-zinc-800 border border-white/10')
                    }`}
                  >
                    <ListMusic className="w-3.5 h-3.5 text-[#FF6700]" />
                    <span>{pl.name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      isSelected 
                        ? (isLight ? 'bg-orange-200/60 text-[#FF6700]' : 'bg-[#FF6700]/30 text-[#FF6700]') 
                        : (isLight ? 'bg-zinc-100 text-zinc-600' : 'bg-zinc-800 text-zinc-400')
                    }`}>
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
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium border border-dashed transition-all flex-shrink-0 shadow-sm ${
                  isLight
                    ? 'text-zinc-700 hover:text-zinc-950 bg-white hover:bg-zinc-50 border-zinc-300 hover:border-[#FF6700]'
                    : 'text-zinc-300 hover:text-white bg-zinc-900/80 hover:bg-zinc-800 border-zinc-600 hover:border-[#FF6700]'
                }`}
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
              className={`absolute -right-2 z-20 p-2 rounded-full border text-[#FF6700] hover:bg-[#FF6700] hover:text-white shadow-xl transition-all active:scale-95 ${
                isLight ? 'bg-white/95 border-zinc-200' : 'bg-zinc-900/95 border-[#FF6700]/40'
              }`}
              title="向右滚动歌单"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

          </div>

          {/* Search Bar */}
          <div className="relative w-full lg:w-72 flex-shrink-0">
            <Search className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none ${
              isLight ? 'text-zinc-400' : 'text-zinc-400'
            }`} />
            <input
              id="input-search-music"
              type="text"
              placeholder="搜索歌曲、歌手或专辑..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-10 pr-8 py-2 border rounded-full text-xs sm:text-sm focus:outline-none focus:border-[#FF6700] transition ${
                isLight
                  ? 'bg-white border-zinc-200 text-zinc-900 placeholder-zinc-400 shadow-sm'
                  : 'bg-zinc-900/80 border-white/10 text-zinc-200 placeholder-zinc-500 shadow-inner'
              }`}
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className={`absolute right-3 top-1/2 -translate-y-1/2 p-0.5 ${
                  isLight ? 'text-zinc-400 hover:text-zinc-900' : 'text-zinc-400 hover:text-white'
                }`}
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
                    <h3 className={`text-base font-bold ${isLight ? 'text-zinc-900' : 'text-white'}`}>{currentPl.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      isLight ? 'bg-orange-100 text-[#FF6700]' : 'bg-[#FF6700]/20 text-[#FF6700]'
                    }`}>
                      {filteredSongs.length} 首歌曲
                    </span>
                  </div>
                  {currentPl.description ? (
                    <p className={`text-xs mt-1 ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>{currentPl.description}</p>
                  ) : (
                    <p className={`text-xs mt-1 ${isLight ? 'text-zinc-500' : 'text-zinc-500'}`}>创建时间: {currentPl.createdAt}</p>
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
                  onClick={() => setShowBatchAddModal(true)}
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
                    onClick={() => {
                      setRenamePlaylistId(currentPl.id);
                      setRenamePlaylistName(currentPl.name);
                      setShowRenamePlaylistModal(true);
                    }}
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
                            exportPlaylist('m3u8');
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
                            exportPlaylist('json');
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
                      if (confirm(`确认删除歌单《${currentPl.name}》？删除后不会清空曲库原有音频。`)) {
                        onDeletePlaylist(currentPl.id);
                        setSelectedPlaylistId('all');
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
        })()}
      </div>

      {/* Global Quick Action Toolbar for current view */}
      <div className={`flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-5 py-3 rounded-2xl border backdrop-blur-md transition-colors ${
        isLight
          ? 'bg-white/90 border-zinc-200 shadow-sm'
          : 'bg-zinc-900/60 border-white/5'
      }`}>
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Unified Dynamic Master Play All Button */}
          <button
            id="btn-play-all-current-view"
            disabled={filteredSongs.length === 0}
            onClick={() => {
              if (filteredSongs.length === 0) return;
              if (isCasting && onCastAllToXiaomi && activeDevice) {
                onCastAllToXiaomi(filteredSongs);
              } else if (onPlayAll) {
                onPlayAll(filteredSongs, 0);
              } else if (filteredSongs[0]) {
                onPlaySong(filteredSongs[0]);
              }
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md ${
              filteredSongs.length === 0
                ? isLight
                  ? 'bg-zinc-100 text-zinc-400 border border-zinc-200 cursor-not-allowed opacity-75'
                  : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-white/5 opacity-60'
                : isCasting
                  ? 'bg-[#FF6700] hover:bg-[#e55c00] text-white shadow-[0_2px_14px_rgba(255,103,0,0.45)] border border-[#FF6700] active:scale-95'
                  : isLight
                    ? 'bg-zinc-900 hover:bg-zinc-800 text-white shadow-md active:scale-95'
                    : 'bg-white hover:bg-zinc-100 text-zinc-950 shadow-[0_2px_10px_rgba(255,255,255,0.2)] active:scale-95'
            }`}
            title={
              filteredSongs.length === 0
                ? '当前列表暂无歌曲可播放'
                : isCasting
                  ? `【音箱模式】一键将当前 ${filteredSongs.length} 首歌曲投播到【${activeDevice?.name || '小爱音箱'}】进行连续播放`
                  : `【本地模式】按当前列表顺序在本地设备播放所有歌曲 (${filteredSongs.length} 首)`
            }
          >
            {isCasting ? (
              <>
                <Speaker className={`w-3.5 h-3.5 ${filteredSongs.length > 0 ? 'animate-pulse text-white' : 'text-zinc-400'}`} />
                <span>投播全部至【{activeDevice?.name ? (activeDevice.name.length > 7 ? activeDevice.name.slice(0, 7) + '…' : activeDevice.name) : '小爱音箱'}】({filteredSongs.length} 首)</span>
              </>
            ) : (
              <>
                <Play className={`w-3.5 h-3.5 fill-current ${filteredSongs.length === 0 ? 'text-zinc-400' : isLight ? 'text-white' : 'text-zinc-950'}`} />
                <span>播放全部 ({filteredSongs.length} 首)</span>
              </>
            )}
          </button>

          {/* Source Filter Pills */}
          <div className={`flex items-center p-1 rounded-xl border text-xs ${
            isLight ? 'bg-zinc-100/90 border-zinc-200' : 'bg-zinc-800/80 border-white/5'
          }`}>
            <button
              type="button"
              id="btn-source-filter-all"
              onClick={() => setSourceFilter('all')}
              className={`px-2.5 py-1 rounded-lg transition font-medium ${
                sourceFilter === 'all' 
                  ? 'bg-[#FF6700] text-white font-bold shadow-sm' 
                  : isLight ? 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/60' : 'text-zinc-400 hover:text-white'
              }`}
            >
              全部
            </button>
            <button
              type="button"
              id="btn-source-filter-local"
              onClick={() => setSourceFilter('local')}
              className={`px-2.5 py-1 rounded-lg transition font-medium ${
                sourceFilter === 'local' 
                  ? 'bg-[#FF6700] text-white font-bold shadow-sm' 
                  : isLight ? 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/60' : 'text-zinc-400 hover:text-white'
              }`}
            >
              本地音频
            </button>
            <button
              type="button"
              id="btn-source-filter-navidrome"
              onClick={() => setSourceFilter('navidrome')}
              className={`px-2.5 py-1 rounded-lg transition font-medium ${
                sourceFilter === 'navidrome' 
                  ? 'bg-[#FF6700] text-white font-bold shadow-sm' 
                  : isLight ? 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/60' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Navidrome
            </button>
            <button
              type="button"
              id="btn-source-filter-favorites"
              onClick={() => setSourceFilter('favorites')}
              className={`px-2.5 py-1 rounded-lg transition font-medium ${
                sourceFilter === 'favorites' 
                  ? 'bg-[#FF6700] text-white font-bold shadow-sm' 
                  : isLight ? 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/60' : 'text-zinc-400 hover:text-white'
              }`}
            >
              收藏
            </button>
          </div>

          {/* Sorting Dropdown */}
          <div className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs ${
            isLight ? 'bg-zinc-100/90 border-zinc-200 text-zinc-700' : 'bg-zinc-800/80 border-white/5 text-zinc-300'
          }`}>
            <ArrowUpDown className="w-3.5 h-3.5 text-[#FF6700] flex-shrink-0" />
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as any)}
              className={`bg-transparent text-xs outline-none cursor-pointer pr-1 font-medium ${
                isLight ? 'text-zinc-800' : 'text-zinc-200'
              }`}
              title="选择列表排序方式"
            >
              <option value="default" className={isLight ? 'bg-white text-zinc-900' : 'bg-zinc-900 text-white'}>默认顺序</option>
              <option value="title_asc" className={isLight ? 'bg-white text-zinc-900' : 'bg-zinc-900 text-white'}>歌名 (A-Z)</option>
              <option value="title_desc" className={isLight ? 'bg-white text-zinc-900' : 'bg-zinc-900 text-white'}>歌名 (Z-A)</option>
              <option value="artist_asc" className={isLight ? 'bg-white text-zinc-900' : 'bg-zinc-900 text-white'}>歌手 (A-Z)</option>
              <option value="duration_desc" className={isLight ? 'bg-white text-zinc-900' : 'bg-zinc-900 text-white'}>时长 (长到短)</option>
              <option value="duration_asc" className={isLight ? 'bg-white text-zinc-900' : 'bg-zinc-900 text-white'}>时长 (短到长)</option>
              <option value="bitrate_desc" className={isLight ? 'bg-white text-zinc-900' : 'bg-zinc-900 text-white'}>无损母带优先</option>
            </select>
          </div>

          {/* Export Current View Playlist - Always kept in toolbar row */}
          <div className="relative">
            <button
              id="btn-export-view-playlist"
              type="button"
              disabled={filteredSongs.length === 0}
              onClick={() => setShowExportMenu(prev => !prev)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition border active:scale-95 ${
                filteredSongs.length === 0
                  ? isLight 
                    ? 'bg-zinc-100 text-zinc-400 border-zinc-200 cursor-not-allowed opacity-60' 
                    : 'bg-zinc-800/40 text-zinc-600 border-white/5 cursor-not-allowed opacity-50'
                  : isLight
                    ? 'bg-zinc-100/90 hover:bg-zinc-200/80 text-zinc-700 border-zinc-200'
                    : 'bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 border-white/5'
              }`}
              title={filteredSongs.length === 0 ? "当前列表暂无歌曲可导出" : "导出当前列表为 M3U8 或 JSON 文件"}
            >
              <Download className={`w-3.5 h-3.5 ${filteredSongs.length === 0 ? 'text-zinc-400' : 'text-cyan-500'}`} />
              <span>导出歌单</span>
            </button>
            {showExportMenu && filteredSongs.length > 0 && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setShowExportMenu(false)} />
                <div className={`absolute right-0 top-full mt-1.5 w-40 py-1.5 rounded-xl border shadow-2xl z-30 flex flex-col gap-1 ${
                  isLight ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-white/10'
                }`}>
                  <button
                    onClick={() => {
                      exportPlaylist('m3u8');
                      setShowExportMenu(false);
                    }}
                    className={`px-3 py-1.5 text-left text-xs flex items-center justify-between ${
                      isLight ? 'text-zinc-800 hover:bg-zinc-100' : 'text-zinc-200 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span>标准 M3U8 歌单</span>
                    <span className="text-[10px] font-mono text-cyan-500">.m3u8</span>
                  </button>
                  <button
                    onClick={() => {
                      exportPlaylist('json');
                      setShowExportMenu(false);
                    }}
                    className={`px-3 py-1.5 text-left text-xs flex items-center justify-between ${
                      isLight ? 'text-zinc-800 hover:bg-zinc-100' : 'text-zinc-200 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span>元数据 JSON</span>
                    <span className="text-[10px] font-mono text-amber-500">.json</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Batch Mode Toggle */}
          <button
            id="btn-toggle-batch-mode"
            type="button"
            disabled={filteredSongs.length === 0}
            onClick={() => {
              if (filteredSongs.length === 0) return;
              setIsBatchMode(prev => !prev);
              setSelectedBatchSongIds(new Set());
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition border ${
              filteredSongs.length === 0
                ? isLight 
                  ? 'bg-zinc-100 text-zinc-400 border-zinc-200 cursor-not-allowed opacity-60' 
                  : 'bg-zinc-800/40 text-zinc-600 border-white/5 cursor-not-allowed opacity-50'
                : isBatchMode
                  ? (isLight 
                      ? 'bg-cyan-50 text-cyan-700 border-cyan-300 shadow-sm' 
                      : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm')
                  : (isLight
                      ? 'bg-zinc-100/90 hover:bg-zinc-200/80 text-zinc-700 border-zinc-200'
                      : 'bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 border-white/5')
            }`}
            title={filteredSongs.length === 0 ? "暂无歌曲可批量管理" : "批量多选操作歌曲"}
          >
            <CheckSquare className="w-3.5 h-3.5 text-cyan-500" />
            <span>{isBatchMode ? '退出批量' : '批量管理'}</span>
          </button>

          {/* Clear All Songs button - only displayed in "全部歌曲" view */}
          {selectedPlaylistId === 'all' && onClearAllSongs && songs.length > 0 && (
            <button
              id="btn-clear-all-songs"
              onClick={() => setShowClearConfirmModal(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95 border ${
                isLight
                  ? 'bg-rose-50 hover:bg-rose-100 text-rose-600 border-rose-200 hover:border-rose-300'
                  : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border-rose-500/20 hover:border-rose-500/40'
              }`}
              title="清空曲库中的所有歌曲"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>清空曲库</span>
            </button>
          )}
        </div>

        <div className={`text-xs flex items-center gap-2 ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
          <span>列表共 <strong className={`font-mono ${isLight ? 'text-zinc-900' : 'text-white'}`}>{filteredSongs.length}</strong> 首</span>
          {searchQuery && <span className="text-amber-500 font-mono">(匹配 "{searchQuery}")</span>}
        </div>
      </div>

      {/* Songs Table with Immersive UI Styling */}
      <div className={`border rounded-3xl overflow-hidden shadow-2xl transition-colors ${
        isLight
          ? 'bg-white/90 border-zinc-200 shadow-[0_10px_30px_rgba(0,0,0,0.05)]'
          : 'bg-zinc-900/40 backdrop-blur-md border-white/5'
      }`}>
        <div className={`px-6 py-4 border-b flex items-center justify-between text-xs font-medium ${
          isLight ? 'border-zinc-200 text-zinc-500 bg-zinc-50/60' : 'border-white/5 text-zinc-400'
        }`}>
          <div className="flex items-center gap-4">
            {isBatchMode ? (
              <button
                id="btn-batch-toggle-all"
                type="button"
                onClick={handleToggleSelectAll}
                className={`w-6 flex items-center justify-center transition ${
                  isLight ? 'text-zinc-500 hover:text-zinc-900' : 'text-zinc-400 hover:text-white'
                }`}
                title={isAllSelected ? "取消全选" : "全选当前筛选结果"}
              >
                {isAllSelected ? <CheckSquare className="w-4 h-4 text-[#FF6700]" /> : <Square className="w-4 h-4" />}
              </button>
            ) : (
              <span className="w-6 text-center">#</span>
            )}
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.15em] font-bold">Track & Artist</span>
              <span className="text-[10px] font-normal hidden sm:inline opacity-80">
                {isBatchMode ? '(点击行或勾选框选择)' : '(单击选中 · 双击播放)'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-8">
            <span className="hidden md:inline text-[10px] uppercase tracking-[0.15em] font-bold">Audio Quality</span>
            <span className="hidden sm:inline text-[10px] uppercase tracking-[0.15em] font-bold">Time</span>
            <span className="text-right text-[10px] uppercase tracking-[0.15em] font-bold">Actions & Cast</span>
          </div>
        </div>

        <div className={`divide-y ${isLight ? 'divide-zinc-200/80' : 'divide-white/5'}`}>
          {filteredSongs.length === 0 ? (
            <div className="py-16 text-center">
              <Music className={`w-12 h-12 mx-auto mb-3 ${isLight ? 'text-zinc-300' : 'text-zinc-600 opacity-40'}`} />
              <p className={`text-sm font-semibold ${isLight ? 'text-zinc-800' : 'text-zinc-300'}`}>
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
            paginatedSongs.map((song, index) => {
              const isCurrent = currentSong?.id === song.id;
              const isSelected = selectedSongId === song.id;
              const isSongCasting = isCurrent && isCasting;
              const isBatchChecked = selectedBatchSongIds.has(song.id);

              return (
                <div
                  key={song.id}
                  id={`song-row-${song.id}`}
                  tabIndex={0}
                  onClick={() => {
                    if (isBatchMode) {
                      handleToggleBatchSelectSong(song.id);
                    } else {
                      setSelectedSongId(song.id);
                    }
                  }}
                  onDoubleClick={() => {
                    if (!isBatchMode) {
                      setSelectedSongId(song.id);
                      onPlaySong(song);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (isBatchMode) {
                        handleToggleBatchSelectSong(song.id);
                      } else {
                        setSelectedSongId(song.id);
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
                            handleToggleBatchSelectSong(song.id);
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
                            setSelectedSongId(song.id);
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
                        setSongToAddToPlaylist(song);
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
          <div className={`px-6 py-4 border-t flex flex-col sm:flex-row items-center justify-between gap-4 text-xs ${
            isLight
              ? 'bg-zinc-50 border-zinc-200 text-zinc-600'
              : 'bg-zinc-950/40 border-white/5 text-zinc-400'
          }`}>
            {/* Range & Count */}
            <div className="flex items-center gap-2">
              <span>
                显示第 <strong className={isLight ? 'text-zinc-900 font-semibold' : 'text-zinc-200'}>{(validCurrentPage - 1) * pageSize + 1}</strong> - <strong className={isLight ? 'text-zinc-900 font-semibold' : 'text-zinc-200'}>{Math.min(validCurrentPage * pageSize, totalItems)}</strong> 首，共 <strong className="text-[#FF6700] font-semibold">{totalItems}</strong> 首歌曲
              </span>
            </div>

            {/* Page Navigation */}
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

      {/* Floating Batch Operations Toolbar */}
      {isBatchMode && selectedBatchSongIds.size > 0 && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 w-11/12 max-w-3xl py-3 px-5 rounded-2xl bg-zinc-950/95 backdrop-blur-xl border border-[#FF6700]/40 shadow-[0_10px_40px_rgba(0,0,0,0.85)] flex flex-wrap items-center justify-between gap-3 animate-in slide-in-from-bottom-6 duration-200 text-white">
          <div className="flex items-center gap-3">
            <div className="px-3 py-1 rounded-full bg-[#FF6700]/20 text-[#FF6700] font-mono text-xs font-bold border border-[#FF6700]/30 flex items-center gap-1.5">
              <CheckSquare className="w-3.5 h-3.5" />
              <span>已勾选 {selectedBatchSongIds.size} 首</span>
            </div>
            <button
              onClick={() => {
                if (selectedBatchSongIds.size === filteredSongs.length) {
                  setSelectedBatchSongIds(new Set());
                } else {
                  setSelectedBatchSongIds(new Set(filteredSongs.map(s => s.id)));
                }
              }}
              className="text-xs text-zinc-400 hover:text-white underline underline-offset-2 transition"
            >
              {selectedBatchSongIds.size === filteredSongs.length ? '取消全选' : '全选筛选结果'}
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              id="btn-batch-play"
              onClick={() => {
                const selected = songs.filter(s => selectedBatchSongIds.has(s.id));
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
                  const selected = songs.filter(s => selectedBatchSongIds.has(s.id));
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
                const selected = songs.filter(s => selectedBatchSongIds.has(s.id));
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
                  setSelectedBatchSongIds(new Set());
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-semibold border border-rose-500/30 transition"
              >
                <FolderMinus className="w-3.5 h-3.5" />
                <span>移出此歌单</span>
              </button>
            )}

            <button
              onClick={() => {
                setIsBatchMode(false);
                setSelectedBatchSongIds(new Set());
              }}
              className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/10 transition ml-1"
              title="退出多选模式"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
