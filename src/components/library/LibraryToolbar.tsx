import React, { useState, memo } from 'react';
import { 
  Search, 
  X, 
  ArrowUpDown, 
  Download, 
  CheckSquare, 
  Trash2, 
  SlidersHorizontal 
} from 'lucide-react';
import { SongSortOption, LibrarySourceFilter } from '../../types';

export interface LibraryToolbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  sourceFilter: LibrarySourceFilter;
  onSourceFilterChange: (f: LibrarySourceFilter) => void;
  sortOption: SongSortOption;
  onSortChange: (opt: SongSortOption) => void;
  isBatchMode: boolean;
  onToggleBatchMode: () => void;
  filteredCount: number;
  totalSongsCount: number;
  selectedPlaylistId: string;
  onExportPlaylist: (format: 'm3u8' | 'json') => void;
  onClearAllSongs?: () => void;
  isLight: boolean;
}

export const LibraryToolbar: React.FC<LibraryToolbarProps> = memo(({
  searchQuery,
  onSearchChange,
  sourceFilter,
  onSourceFilterChange,
  sortOption,
  onSortChange,
  isBatchMode,
  onToggleBatchMode,
  filteredCount,
  totalSongsCount,
  selectedPlaylistId,
  onExportPlaylist,
  onClearAllSongs,
  isLight
}) => {
  const [showExportMenu, setShowExportMenu] = useState(false);

  return (
    <div className={`p-3 sm:p-4 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 shadow-xl transition-colors duration-200 ${
      isLight ? 'bg-white border-zinc-200 shadow-sm' : 'bg-zinc-900/60 border-white/10'
    }`}>
      {/* Search Input */}
      <div className="relative w-full lg:w-72 flex-shrink-0">
        <Search className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none ${
          isLight ? 'text-zinc-400' : 'text-zinc-400'
        }`} />
        <input
          id="input-search-music"
          type="text"
          placeholder="搜索歌曲、歌手或专辑..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className={`w-full pl-10 pr-8 py-2 border rounded-full text-xs sm:text-sm focus:outline-none focus:border-[#FF6700] transition ${
            isLight
              ? 'bg-white border-zinc-200 text-zinc-900 placeholder-zinc-400 shadow-sm'
              : 'bg-zinc-900/80 border-white/10 text-zinc-200 placeholder-zinc-500 shadow-inner'
          }`}
        />
        {searchQuery && (
          <button 
            onClick={() => onSearchChange('')}
            className={`absolute right-3 top-1/2 -translate-y-1/2 p-0.5 ${
              isLight ? 'text-zinc-400 hover:text-zinc-900' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Right Controls: Filters, Sort, Export, Batch */}
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-3">
        {/* Source Filter Group */}
        <div className={`flex items-center gap-0.5 sm:gap-1 p-1 rounded-xl border text-xs overflow-x-auto no-scrollbar ${
          isLight ? 'bg-zinc-100/90 border-zinc-200 text-zinc-700' : 'bg-zinc-800/80 border-white/5 text-zinc-300'
        }`}>
          <button
            type="button"
            id="btn-source-filter-all"
            onClick={() => onSourceFilterChange('all')}
            className={`px-2 sm:px-2.5 py-1 rounded-lg transition font-medium ${
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
            onClick={() => onSourceFilterChange('local')}
            className={`px-2 sm:px-2.5 py-1 rounded-lg transition font-medium whitespace-nowrap ${
              sourceFilter === 'local' 
                ? 'bg-[#FF6700] text-white font-bold shadow-sm' 
                : isLight ? 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/60' : 'text-zinc-400 hover:text-white'
            }`}
          >
            本地
          </button>
          <button
            type="button"
            id="btn-source-filter-navidrome"
            onClick={() => onSourceFilterChange('navidrome')}
            className={`px-2 sm:px-2.5 py-1 rounded-lg transition font-medium whitespace-nowrap ${
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
            onClick={() => onSourceFilterChange('favorites')}
            className={`px-2 sm:px-2.5 py-1 rounded-lg transition font-medium whitespace-nowrap ${
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
            onChange={(e) => onSortChange(e.target.value as SongSortOption)}
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

        {/* Export Current View Playlist */}
        <div className="relative">
          <button
            id="btn-export-view-playlist"
            type="button"
            disabled={filteredCount === 0}
            onClick={() => setShowExportMenu(prev => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition border active:scale-95 ${
              filteredCount === 0
                ? isLight 
                  ? 'bg-zinc-100 text-zinc-400 border-zinc-200 cursor-not-allowed opacity-60' 
                  : 'bg-zinc-800/40 text-zinc-600 border-white/5 cursor-not-allowed opacity-50'
                : isLight
                  ? 'bg-zinc-100/90 hover:bg-zinc-200/80 text-zinc-700 border-zinc-200'
                  : 'bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 border-white/5'
            }`}
            title={filteredCount === 0 ? "当前列表暂无歌曲可导出" : "导出当前列表为 M3U8 或 JSON 文件"}
          >
            <Download className={`w-3.5 h-3.5 ${filteredCount === 0 ? 'text-zinc-400' : 'text-cyan-500'}`} />
            <span>导出歌单</span>
          </button>
          {showExportMenu && filteredCount > 0 && (
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
                  <span>标准 M3U8 歌单</span>
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
          disabled={filteredCount === 0}
          onClick={onToggleBatchMode}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition border ${
            filteredCount === 0
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
          title={filteredCount === 0 ? "暂无歌曲可批量管理" : "批量多选操作歌曲"}
        >
          <CheckSquare className="w-3.5 h-3.5 text-cyan-500" />
          <span>{isBatchMode ? '退出批量' : '批量管理'}</span>
        </button>

        {/* Clear All Songs button - only in 'all' view */}
        {selectedPlaylistId === 'all' && onClearAllSongs && totalSongsCount > 0 && (
          <button
            id="btn-clear-all-songs"
            onClick={onClearAllSongs}
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
    </div>
  );
});

LibraryToolbar.displayName = 'LibraryToolbar';
