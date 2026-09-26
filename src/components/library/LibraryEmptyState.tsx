import React from 'react';
import { Disc3 } from 'lucide-react';
import { LibrarySourceFilter } from '../../types';

export interface LibraryEmptyStateProps {
  sourceFilter: LibrarySourceFilter;
  searchQuery: string;
  isLight: boolean;
  onClearSourceFilter: () => void;
  onClearSearch: () => void;
  onOpenNavidromeModal?: () => void;
}

export const LibraryEmptyState: React.FC<LibraryEmptyStateProps> = ({
  sourceFilter,
  searchQuery,
  isLight,
  onClearSourceFilter,
  onClearSearch,
  onOpenNavidromeModal
}) => {
  return (
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
            onClick={onClearSourceFilter}
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
            onClick={onClearSearch}
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
  );
};
