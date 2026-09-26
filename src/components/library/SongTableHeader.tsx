import React from 'react';
import { Clock, CheckSquare, Square } from 'lucide-react';

export interface SongTableHeaderProps {
  isLight: boolean;
  isBatchMode: boolean;
  selectedBatchCount: number;
  totalFilteredCount: number;
  onToggleSelectAll: () => void;
}

export const SongTableHeader: React.FC<SongTableHeaderProps> = ({
  isLight,
  isBatchMode,
  selectedBatchCount,
  totalFilteredCount,
  onToggleSelectAll
}) => {
  const isAllSelected = totalFilteredCount > 0 && selectedBatchCount === totalFilteredCount;

  return (
    <div
      className={`grid grid-cols-[auto_1fr_auto] items-center px-3 sm:px-6 py-2.5 sm:py-3 border-b text-xs font-semibold ${
        isLight ? 'bg-zinc-50 border-zinc-200 text-zinc-500' : 'bg-zinc-950/40 border-white/5 text-zinc-400'
      }`}
    >
      <div className="flex items-center gap-2 sm:gap-4 w-10 sm:w-12">
        {isBatchMode ? (
          <button
            type="button"
            onClick={onToggleSelectAll}
            className="cursor-pointer p-0.5"
            title={isAllSelected ? '取消全选' : '全选所有'}
          >
            {isAllSelected ? (
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
  );
};
