import React, { useState } from 'react';
import {
  Trash2,
  AlertTriangle,
  FileAudio,
  ShieldAlert,
  HardDrive,
  X,
  ListX,
  CheckCircle2,
  ShieldCheck,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Song } from '../../types';

export type BatchDeleteMode = 'list_only' | 'physical';

export interface BatchDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedSongIds: string[];
  songs: Song[];
  isLight?: boolean;
  onConfirm: (songIds: string[], deletePhysicalFiles: boolean) => Promise<void> | void;
}

export const BatchDeleteModal: React.FC<BatchDeleteModalProps> = ({
  isOpen,
  onClose,
  selectedSongIds,
  songs,
  isLight = false,
  onConfirm
}) => {
  const [deleteMode, setDeleteMode] = useState<BatchDeleteMode>('list_only');
  const [confirmHardDelete, setConfirmHardDelete] = useState(false);
  const [showPreviewList, setShowPreviewList] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen || selectedSongIds.length === 0) return null;

  const targetSongs = songs.filter(s => selectedSongIds.includes(s.id));
  const count = selectedSongIds.length;

  const handleExecute = async () => {
    if (deleteMode === 'physical' && !confirmHardDelete) {
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(selectedSongIds, deleteMode === 'physical');
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        className={`w-full max-w-lg rounded-2xl p-6 border shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150 relative ${
          isLight
            ? 'bg-white border-zinc-200 text-zinc-900'
            : 'bg-zinc-900 border-white/10 text-white'
        }`}
      >
        {/* Close Button */}
        <button
          type="button"
          disabled={submitting}
          onClick={onClose}
          className={`absolute top-4 right-4 p-1.5 rounded-xl transition ${
            isLight
              ? 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'
              : 'text-zinc-400 hover:text-white hover:bg-white/10'
          }`}
          title="关闭"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-start gap-3.5 pr-8">
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 border shadow-inner ${
              deleteMode === 'physical'
                ? 'bg-rose-500/15 border-rose-500/30 text-rose-500 shadow-rose-500/10'
                : 'bg-amber-500/15 border-amber-500/30 text-amber-500 shadow-amber-500/10'
            }`}
          >
            {deleteMode === 'physical' ? (
              <ShieldAlert className="w-5 h-5 text-rose-500" />
            ) : (
              <Trash2 className="w-5 h-5 text-amber-500" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold flex items-center gap-2">
              <span>批量删除歌曲确认</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-zinc-500/15 text-zinc-400">
                已勾选 {count} 首
              </span>
            </h3>
            <p className={`text-xs mt-1 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
              请选择本次删除的执行模式（软删除或永久物理粉碎）：
            </p>
          </div>
        </div>

        {/* Song List Preview Pill / Toggle */}
        <div
          className={`rounded-xl border overflow-hidden ${
            isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-950/60 border-white/5'
          }`}
        >
          <button
            type="button"
            onClick={() => setShowPreviewList(prev => !prev)}
            className={`w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-medium transition ${
              isLight ? 'hover:bg-zinc-100/80 text-zinc-700' : 'hover:bg-white/5 text-zinc-300'
            }`}
          >
            <div className="flex items-center gap-2 truncate">
              <FileAudio className="w-3.5 h-3.5 text-zinc-400" />
              <span>查看待删除曲目清单 ({targetSongs.length} 首)</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-zinc-400">
              <span>{showPreviewList ? '收起' : '展开'}</span>
              {showPreviewList ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </div>
          </button>

          {showPreviewList && (
            <div className="max-h-36 overflow-y-auto divide-y divide-zinc-200/50 dark:divide-white/5 border-t border-zinc-200 dark:border-white/5 px-3 py-1.5 text-xs">
              {targetSongs.map((song, idx) => (
                <div key={song.id || idx} className="py-1.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-[10px] text-zinc-400 font-mono w-4 shrink-0 text-right">
                      {idx + 1}
                    </span>
                    <span className="font-semibold truncate">{song.title}</span>
                    <span className="text-[11px] text-zinc-500 truncate">- {song.artist}</span>
                  </div>
                  <span className="text-[10px] text-zinc-400 font-mono shrink-0">
                    {song.bitrate || song.fileSize || '本地音频'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Dual Mode Selection Cards */}
        <div className="space-y-3">
          {/* Option 1: List Only (Safe / Recommended) */}
          <div
            onClick={() => {
              setDeleteMode('list_only');
              setConfirmHardDelete(false);
            }}
            className={`p-4 rounded-xl border-2 transition cursor-pointer relative ${
              deleteMode === 'list_only'
                ? isLight
                  ? 'border-emerald-500 bg-emerald-50/70 shadow-sm'
                  : 'border-emerald-500/80 bg-emerald-950/30 shadow-sm'
                : isLight
                ? 'border-zinc-200 hover:border-zinc-300 bg-white'
                : 'border-white/10 hover:border-white/20 bg-zinc-800/40'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 transition ${
                  deleteMode === 'list_only'
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : 'border-zinc-400 bg-transparent'
                }`}
              >
                {deleteMode === 'list_only' && <CheckCircle2 className="w-3.5 h-3.5" />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-xs flex items-center gap-1.5">
                    <ListX className="w-3.5 h-3.5 text-emerald-500" />
                    <span>仅在列表中删除（保留源文件）</span>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    安全推荐
                  </span>
                </div>
                <p className={`text-[11px] mt-1.5 leading-relaxed ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                  仅从听蓝播放列表、分类索引与歌单中移除记录。您的 <b>NAS / 本地磁盘物理音频源文件与歌词将完好保留</b>，随时可以通过“重新扫描挂载目录”重新入库。
                </p>
              </div>
            </div>
          </div>

          {/* Option 2: Physical Delete (High Risk / Free Disk Space) */}
          <div
            onClick={() => setDeleteMode('physical')}
            className={`p-4 rounded-xl border-2 transition cursor-pointer relative ${
              deleteMode === 'physical'
                ? isLight
                  ? 'border-rose-500 bg-rose-50/70 shadow-sm'
                  : 'border-rose-500/80 bg-rose-950/30 shadow-sm'
                : isLight
                ? 'border-zinc-200 hover:border-zinc-300 bg-white'
                : 'border-white/10 hover:border-white/20 bg-zinc-800/40'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 transition ${
                  deleteMode === 'physical'
                    ? 'border-rose-500 bg-rose-500 text-white'
                    : 'border-zinc-400 bg-transparent'
                }`}
              >
                {deleteMode === 'physical' && <CheckCircle2 className="w-3.5 h-3.5" />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-xs flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                    <HardDrive className="w-3.5 h-3.5" />
                    <span>物理彻底删除文件（释放磁盘空间）</span>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                    高危操作·不可撤销
                  </span>
                </div>
                <p className={`text-[11px] mt-1.5 leading-relaxed ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                  彻底从 NAS / 本地存储磁盘中<b>物理抹除音频源文件 (.flac / .mp3 / .wav) 与同名 LRC 歌词</b>，释放存储空间。该操作将永久粉碎文件，无法恢复！
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Physical Delete Confirmation Safety Checkbox */}
        {deleteMode === 'physical' && (
          <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs space-y-2.5 animate-in fade-in duration-150">
            <div className="flex items-start gap-2 text-rose-600 dark:text-rose-400 font-semibold text-[11px]">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>注意：此操作将永久抹除所选 {count} 首歌曲的物理磁盘源文件，无法通过重新扫描恢复！</span>
            </div>
            <label className="flex items-center gap-2.5 text-xs font-semibold cursor-pointer select-none text-zinc-800 dark:text-zinc-200">
              <input
                type="checkbox"
                checked={confirmHardDelete}
                onChange={e => setConfirmHardDelete(e.target.checked)}
                className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-zinc-300 dark:border-zinc-600"
              />
              <span>我已知晓并确认物理销毁这 {count} 个磁盘文件</span>
            </label>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition border cursor-pointer ${
              isLight
                ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-200'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-white/5'
            }`}
          >
            取消
          </button>

          {deleteMode === 'list_only' ? (
            <button
              type="button"
              disabled={submitting}
              onClick={handleExecute}
              className="flex items-center gap-1.5 px-4.5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white transition shadow-md shadow-emerald-600/20 disabled:opacity-50 cursor-pointer"
            >
              <ListX className="w-3.5 h-3.5" />
              <span>{submitting ? '正在处理...' : `确认从列表移除 (${count}首)`}</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting || !confirmHardDelete}
              onClick={handleExecute}
              className="flex items-center gap-1.5 px-4.5 py-2.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 active:scale-95 text-white transition shadow-md shadow-rose-600/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{submitting ? '正在物理删除...' : `确认物理删除源文件 (${count}首)`}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
