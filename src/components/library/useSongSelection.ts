import { useState, useCallback } from 'react';
import { Song } from '../../types';

export function useSongSelection(filteredSongs: Song[]) {
  const [isBatchMode, setIsBatchMode] = useState<boolean>(false);
  const [selectedBatchSongIds, setSelectedBatchSongIds] = useState<Set<string>>(new Set());

  const handleToggleSelectAll = useCallback(() => {
    if (selectedBatchSongIds.size === filteredSongs.length) {
      setSelectedBatchSongIds(new Set());
    } else {
      setSelectedBatchSongIds(new Set(filteredSongs.map(s => s.id)));
    }
  }, [filteredSongs, selectedBatchSongIds.size]);

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
    handleToggleSelectAll,
    handleToggleBatchSelectSong,
    clearBatchSelection,
    exitBatchMode
  };
}
