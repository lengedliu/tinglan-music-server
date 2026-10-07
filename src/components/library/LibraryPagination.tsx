import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Layers, Zap } from 'lucide-react';

export interface LibraryPaginationProps {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  pageNumbers: (number | string)[];
  isLight: boolean;
  onPageChange: (page: number | ((prev: number) => number)) => void;
  onPageSizeChange: (size: number) => void;
  viewMode?: 'paginated' | 'virtual';
  onViewModeChange?: (mode: 'paginated' | 'virtual') => void;
}

export const LibraryPagination: React.FC<LibraryPaginationProps> = ({
  currentPage,
  pageSize,
  totalItems,
  totalPages,
  pageNumbers,
  isLight,
  onPageChange,
  onPageSizeChange,
  viewMode = 'paginated',
  onViewModeChange
}) => {
  if (totalItems <= 0) return null;

  const validCurrentPage = Math.min(Math.max(1, currentPage), Math.max(1, totalPages));

  return (
    <div
      className={`px-6 py-4 border-t flex flex-col sm:flex-row items-center justify-between gap-4 text-xs ${
        isLight
          ? 'bg-zinc-50 border-zinc-200 text-zinc-600'
          : 'bg-zinc-950/40 border-white/5 text-zinc-400'
      }`}
    >
      <div className="flex items-center gap-2">
        <span>
          显示第 <strong className={isLight ? 'text-zinc-900 font-semibold' : 'text-zinc-200'}>{(validCurrentPage - 1) * pageSize + 1}</strong> - <strong className={isLight ? 'text-zinc-900 font-semibold' : 'text-zinc-200'}>{Math.min(validCurrentPage * pageSize, totalItems)}</strong> 首，共 <strong className="text-[#FF6700] font-semibold">{totalItems}</strong> 首歌曲
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          id="btn-page-first"
          onClick={() => onPageChange(1)}
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
          onClick={() => onPageChange(p => Math.max(1, p - 1))}
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
              return (
                <span key={`ellipsis-${idx}`} className={`px-1.5 ${isLight ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  ...
                </span>
              );
            }
            const pageNum = p as number;
            const isActive = pageNum === validCurrentPage;
            return (
              <button
                key={`page-${pageNum}`}
                id={`btn-page-${pageNum}`}
                onClick={() => onPageChange(pageNum)}
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
          onClick={() => onPageChange(p => Math.min(totalPages, p + 1))}
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
          onClick={() => onPageChange(totalPages)}
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

      <div className="flex items-center gap-3">
        {/* Mode Switcher: 分页 | 虚拟流 placed right before 每页显示 */}
        {onViewModeChange && (
          <div className={`flex items-center p-0.5 rounded-xl border text-xs ${
            isLight ? 'bg-zinc-200/80 border-zinc-300' : 'bg-zinc-900 border-white/10'
          }`}>
            <button
              type="button"
              id="btn-view-mode-paginated"
              onClick={() => onViewModeChange('paginated')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition font-semibold cursor-pointer ${
                viewMode === 'paginated'
                  ? 'bg-[#FF6700] text-white font-bold shadow-sm'
                  : isLight ? 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200' : 'text-zinc-400 hover:text-white'
              }`}
              title="传统分页模式"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>分页</span>
            </button>
            <button
              type="button"
              id="btn-view-mode-virtual"
              onClick={() => onViewModeChange('virtual')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition font-semibold cursor-pointer ${
                viewMode === 'virtual'
                  ? 'bg-[#FF6700] text-white font-bold shadow-sm'
                  : isLight ? 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200' : 'text-zinc-400 hover:text-white'
              }`}
              title="极速虚拟流模式（60fps 丝滑滑行）"
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>虚拟流</span>
            </button>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <span>每页显示</span>
          <select
            id="select-page-size"
            value={pageSize}
            onChange={(e) => {
              const newSize = Number(e.target.value);
              onPageSizeChange(newSize);
              try {
                localStorage.setItem('tinglan_page_size', String(newSize));
              } catch {}
              onPageChange(1);
            }}
            className={`border rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-[#FF6700] transition cursor-pointer ${
              isLight
                ? 'bg-white border-zinc-300 text-zinc-800 hover:border-zinc-400'
                : 'bg-zinc-900 border-white/10 text-zinc-200 hover:border-white/20'
            }`}
          >
            <option value={5}>5 条/页</option>
            <option value={10}>10 条/页</option>
            <option value={15}>15 条/页</option>
            <option value={30}>30 条/页</option>
            <option value={50}>50 条/页</option>
            <option value={100}>100 条/页</option>
            <option value={200}>200 条/页</option>
          </select>
        </div>
      </div>
    </div>
  );
};
