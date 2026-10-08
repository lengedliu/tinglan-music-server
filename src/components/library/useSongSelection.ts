import { useState, useCallback } from 'react';
import { Song } from '../../types';

export function useSongSelection(currentPageSongs: Song[]) {
  const [isBatchMode, setIsBatchMode] = useState<boolean>(false);
  const [selectedBatchSongIds, setSelectedBatchSongIds] = useState<Set<string>>(new Set());

  // Check if all songs on the current page are selected
  const isCurrentPageAllSelected = currentPageSongs.length > 0 && 
    currentPageSongs.every(s => selectedBatchSongIds.has(s.id));

  const handleToggleSelectAll = useCallback(() => {
    if (currentPageSongs.length === 0) return;
    setSelectedBatchSongIds(prev => {
      const allSelectedOnPage = currentPageSongs.every(s => prev.has(s.id));
      const next = new Set(prev);
      if (allSelectedOnPage) {
        // 取消全选当前页歌曲
        currentPageSongs.forEach(s => next.delete(s.id));
      } else {
        // 全选当前页（仅勾选当前页的歌曲，不选所有页）
        currentPageSongs.forEach(s => next.add(s.id));
      }
      return next;
    });
  }, [currentPageSongs]);

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

  const clearBatchSelection = useCallback(() => {
    setSelectedBatchSongIds(new Set());
  }, []);

  const exitBatchMode = useCallback(() => {
    setIsBatchMode(false);
    setSelectedBatchSongIds(new Set());
  }, []);

  return {
    isBatchMode,
    setIsBatchMode,
    selectedBatchSongIds,
    setSelectedBatchSongIds,
    isCurrentPageAllSelected,
    handleToggleSelectAll,
    handleToggleBatchSelectSong,
    clearBatchSelection,
    exitBatchMode
  };
}
