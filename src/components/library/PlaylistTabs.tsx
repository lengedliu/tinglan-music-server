import React, { useRef, useState, memo } from 'react';
import { Music, Heart, ListMusic, Plus, ChevronLeft, ChevronRight, Flame, Clock, Sparkles } from 'lucide-react';
import { Playlist } from '../../types';

export interface PlaylistTabsProps {
  playlists: Playlist[];
  selectedPlaylistId: string;
  onSelectPlaylist: (id: string) => void;
  onOpenNewPlaylistModal: () => void;
  isLight: boolean;
  totalSongCount: number;
  favoriteSongCount: number;
  topPlayedCount?: number;
  recentlyPlayedCount?: number;
  losslessCount?: number;
}

export const PlaylistTabs: React.FC<PlaylistTabsProps> = memo(({
  playlists,
  selectedPlaylistId,
  onSelectPlaylist,
  onOpenNewPlaylistModal,
  isLight,
  totalSongCount,
  favoriteSongCount,
  topPlayedCount = 0,
  recentlyPlayedCount = 0,
  losslessCount = 0
}) => {
  const tabsScrollRef = useRef<HTMLDivElement>(null);
  const [isDraggingTabs, setIsDraggingTabs] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragScrollLeft, setDragScrollLeft] = useState(0);
  const [hasDragged, setHasDragged] = useState(false);

  const scrollTabs = (direction: 'left' | 'right') => {
    if (tabsScrollRef.current) {
      const scrollAmount = 300;
      tabsScrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const handleTabsWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (tabsScrollRef.current) {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        tabsScrollRef.current.scrollLeft += e.deltaY;
      }
    }
  };

  const handleMouseDownTabs = (e: React.MouseEvent) => {
    if (!tabsScrollRef.current) return;
    setIsDraggingTabs(true);
    setHasDragged(false);
    setDragStartX(e.pageX - tabsScrollRef.current.offsetLeft);
    setDragScrollLeft(tabsScrollRef.current.scrollLeft);
  };

  const handleMouseLeaveTabs = () => {
    setIsDraggingTabs(false);
  };

  const handleMouseUpTabs = () => {
    setIsDraggingTabs(false);
  };

  const handleMouseMoveTabs = (e: React.MouseEvent) => {
    if (!isDraggingTabs || !tabsScrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - tabsScrollRef.current.offsetLeft;
    const walk = (x - dragStartX) * 1.5;
    if (Math.abs(walk) > 5) {
      setHasDragged(true);
    }
    tabsScrollRef.current.scrollLeft = dragScrollLeft - walk;
  };

  return (
    <div className="relative flex items-center flex-1 min-w-0">
      {/* Scroll Left Button (desktop only) */}
      <button
        id="btn-scroll-tabs-left"
        type="button"
        onClick={() => scrollTabs('left')}
        className={`hidden sm:flex absolute -left-2 z-20 p-2 rounded-full border text-[#FF6700] hover:bg-[#FF6700] hover:text-white shadow-xl transition-all active:scale-95 ${
          isLight ? 'bg-white/95 border-zinc-200' : 'bg-zinc-900/95 border-[#FF6700]/40'
        }`}
        title="向左滚动歌单"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {/* Scrollable Tabs Track */}
      <div 
        ref={tabsScrollRef}
        onWheel={handleTabsWheel}
        onMouseDown={handleMouseDownTabs}
        onMouseLeave={handleMouseLeaveTabs}
        onMouseUp={handleMouseUpTabs}
        onMouseMove={handleMouseMoveTabs}
        className={`flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth px-1 sm:px-6 py-1 select-none flex-1 touch-pan-x ${
          isDraggingTabs ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {/* All Songs Pill */}
        <button
          id="btn-tab-all-songs"
          onClick={() => {
            if (!hasDragged) onSelectPlaylist('all');
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium transition-all flex-shrink-0 shadow-sm ${
            selectedPlaylistId === 'all'
              ? (isLight 
                  ? 'bg-orange-50 text-[#FF6700] border border-orange-300 font-semibold shadow-sm' 
                  : 'bg-[#FF6700]/20 text-[#FF6700] border border-[#FF6700]/50 font-semibold shadow-[0_0_12px_rgba(255,103,0,0.25)]')
              : (isLight
                  ? 'bg-white text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 border border-zinc-200'
                  : 'bg-zinc-900/80 text-zinc-300 hover:text-white hover:bg-zinc-800 border border-white/10')
          }`}
        >
          <Music className="w-3.5 h-3.5 text-[#FF6700]" />
          <span>全部歌曲</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            selectedPlaylistId === 'all' 
              ? (isLight ? 'bg-orange-200/60 text-[#FF6700]' : 'bg-[#FF6700]/30 text-[#FF6700]') 
              : (isLight ? 'bg-zinc-100 text-zinc-600' : 'bg-zinc-800 text-zinc-400')
          }`}>
            {totalSongCount}
          </span>
        </button>

        {/* Favorites Pill */}
        <button
          id="btn-tab-favorites"
          onClick={() => {
            if (!hasDragged) onSelectPlaylist('favorites');
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium transition-all flex-shrink-0 shadow-sm ${
            selectedPlaylistId === 'favorites'
              ? (isLight 
                  ? 'bg-rose-50 text-rose-600 border border-rose-300 font-semibold shadow-sm' 
                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/50 font-semibold shadow-[0_0_12px_rgba(244,63,94,0.25)]')
              : (isLight
                  ? 'bg-white text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 border border-zinc-200'
                  : 'bg-zinc-900/80 text-zinc-300 hover:text-white hover:bg-zinc-800 border border-white/10')
          }`}
        >
          <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
          <span>我的收藏</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            selectedPlaylistId === 'favorites' 
              ? (isLight ? 'bg-rose-200/60 text-rose-700' : 'bg-rose-500/30 text-rose-300') 
              : (isLight ? 'bg-zinc-100 text-zinc-600' : 'bg-zinc-800 text-zinc-400')
          }`}>
            {favoriteSongCount}
          </span>
        </button>

        {/* Dynamic: 常听榜 (Top Played) */}
        <button
          id="btn-tab-dynamic-top-played"
          onClick={() => {
            if (!hasDragged) onSelectPlaylist('dynamic:top_played');
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium transition-all flex-shrink-0 shadow-sm ${
            selectedPlaylistId === 'dynamic:top_played'
              ? (isLight 
                  ? 'bg-amber-50 text-amber-700 border border-amber-300 font-semibold shadow-sm' 
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/50 font-semibold shadow-[0_0_12px_rgba(245,158,11,0.25)]')
              : (isLight
                  ? 'bg-white text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 border border-zinc-200'
                  : 'bg-zinc-900/80 text-zinc-300 hover:text-white hover:bg-zinc-800 border border-white/10')
          }`}
          title="智能根据播放频次 (PlayCount) 实时排行的个人高频热播榜单"
        >
          <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
          <span>常听榜</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            selectedPlaylistId === 'dynamic:top_played' 
              ? (isLight ? 'bg-amber-200/70 text-amber-800' : 'bg-amber-500/30 text-amber-200') 
              : (isLight ? 'bg-zinc-100 text-zinc-600' : 'bg-zinc-800 text-zinc-400')
          }`}>
            {topPlayedCount}
          </span>
        </button>

        {/* Dynamic: 最近播放 (Recently Played) */}
        <button
          id="btn-tab-dynamic-recently-played"
          onClick={() => {
            if (!hasDragged) onSelectPlaylist('dynamic:recently_played');
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium transition-all flex-shrink-0 shadow-sm ${
            selectedPlaylistId === 'dynamic:recently_played'
              ? (isLight 
                  ? 'bg-sky-50 text-sky-700 border border-sky-300 font-semibold shadow-sm' 
                  : 'bg-sky-500/20 text-sky-300 border border-sky-500/50 font-semibold shadow-[0_0_12px_rgba(14,165,233,0.25)]')
              : (isLight
                  ? 'bg-white text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 border border-zinc-200'
                  : 'bg-zinc-900/80 text-zinc-300 hover:text-white hover:bg-zinc-800 border border-white/10')
          }`}
          title="实时记录最近在本地与小米音箱上播放过的音乐轨迹"
        >
          <Clock className="w-3.5 h-3.5 text-sky-500" />
          <span>最近播放</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            selectedPlaylistId === 'dynamic:recently_played' 
              ? (isLight ? 'bg-sky-200/70 text-sky-800' : 'bg-sky-500/30 text-sky-200') 
              : (isLight ? 'bg-zinc-100 text-zinc-600' : 'bg-zinc-800 text-zinc-400')
          }`}>
            {recentlyPlayedCount}
          </span>
        </button>

        {/* Dynamic: 无损精选 (Lossless Selection) */}
        <button
          id="btn-tab-dynamic-lossless"
          onClick={() => {
            if (!hasDragged) onSelectPlaylist('dynamic:lossless');
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium transition-all flex-shrink-0 shadow-sm ${
            selectedPlaylistId === 'dynamic:lossless'
              ? (isLight 
                  ? 'bg-purple-50 text-purple-700 border border-purple-300 font-semibold shadow-sm' 
                  : 'bg-purple-500/20 text-purple-300 border border-purple-500/50 font-semibold shadow-[0_0_12px_rgba(168,85,247,0.25)]')
              : (isLight
                  ? 'bg-white text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 border border-zinc-200'
                  : 'bg-zinc-900/80 text-zinc-300 hover:text-white hover:bg-zinc-800 border border-white/10')
          }`}
          title="自动筛选 FLAC、DSD/DSF、APE、24bit/96kHz 高解析发烧原声音轨"
        >
          <Sparkles className="w-3.5 h-3.5 text-purple-500 fill-purple-500/30" />
          <span>无损精选</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            selectedPlaylistId === 'dynamic:lossless' 
              ? (isLight ? 'bg-purple-200/70 text-purple-800' : 'bg-purple-500/30 text-purple-200') 
              : (isLight ? 'bg-zinc-100 text-zinc-600' : 'bg-zinc-800 text-zinc-400')
          }`}>
            {losslessCount}
          </span>
        </button>

        {/* Custom Playlists */}
        {playlists.map((pl) => {
          const isSelected = selectedPlaylistId === pl.id;
          const songCount = pl.songIds ? pl.songIds.length : 0;

          return (
            <button
              key={pl.id}
              id={`btn-tab-playlist-${pl.id}`}
              onClick={() => {
                if (!hasDragged) onSelectPlaylist(pl.id);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium transition-all flex-shrink-0 shadow-sm ${
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
            if (!hasDragged) onOpenNewPlaylistModal();
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

      {/* Scroll Right Button (desktop only) */}
      <button
        id="btn-scroll-tabs-right"
        type="button"
        onClick={() => scrollTabs('right')}
        className={`hidden sm:flex absolute -right-2 z-20 p-2 rounded-full border text-[#FF6700] hover:bg-[#FF6700] hover:text-white shadow-xl transition-all active:scale-95 ${
          isLight ? 'bg-white/95 border-zinc-200' : 'bg-zinc-900/95 border-[#FF6700]/40'
        }`}
        title="向右滚动歌单"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
});

PlaylistTabs.displayName = 'PlaylistTabs';
