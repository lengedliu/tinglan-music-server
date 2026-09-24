import React, { useState, useEffect } from 'react';
import { ListMusic, X, Play, Trash2, Shuffle, Disc, Repeat, Repeat1, Radio, SkipForward, SkipBack, ArrowRightLeft, Check, Loader2, Sparkles } from 'lucide-react';
import { Song, XiaomiDevice } from '../types';
import { formatTime } from '../utils/lyricParser';
import { useTheme } from '../context/ThemeContext';
import { VirtualList } from './VirtualList';

interface PlayQueueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  playlist: Song[];
  currentSong: Song | null;
  isPlaying?: boolean;
  isCasting?: boolean;
  activeDevice?: XiaomiDevice;
  onSelectSong: (song: Song) => void;
  onRemoveFromQueue: (songId: string) => void;
  onClearQueue: () => void;
  isShuffle: boolean;
  onToggleShuffle: () => void;
  repeatMode?: 'off' | 'all' | 'one';
  onCycleRepeat?: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  onDeviceChange?: (device: XiaomiDevice) => void;
}

export const PlayQueueDrawer: React.FC<PlayQueueDrawerProps> = ({
  isOpen,
  onClose,
  playlist,
  currentSong,
  isPlaying = false,
  isCasting = false,
  activeDevice,
  onSelectSong,
  onRemoveFromQueue,
  onClearQueue,
  isShuffle,
  onToggleShuffle,
  repeatMode = 'all',
  onCycleRepeat,
  onNext,
  onPrev,
  onDeviceChange,
}) => {
  const { themeConfig, isLight: ctxIsLight } = useTheme();
  const isLight = Boolean(ctxIsLight ?? themeConfig?.isLight);

  const [showHandover, setShowHandover] = useState(false);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [transferringDid, setTransferringDid] = useState<string | null>(null);
  const [transferToast, setTransferToast] = useState<string | null>(null);

  useEffect(() => {
    if (showHandover) {
      setLoadingCandidates(true);
      fetch('/api/queue/handover-targets')
        .then(res => res.json())
        .then(data => {
          if (data.success && Array.isArray(data.devices)) {
            setCandidates(data.devices);
          }
        })
        .catch(err => console.warn('Failed to fetch handover targets:', err))
        .finally(() => setLoadingCandidates(false));
    }
  }, [showHandover]);

  if (!isOpen) return null;

  const currentIndex = playlist.findIndex(s => s.id === currentSong?.id);

  const handleExecuteTransfer = async (targetDev: any) => {
    try {
      setTransferringDid(targetDev.did);
      const res = await fetch('/api/queue/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetDid: targetDev.did })
      });
      const data = await res.json();
      if (data.success) {
        setTransferToast(`已成功流转至【${targetDev.name}】`);
        if (onDeviceChange) {
          onDeviceChange({
            did: targetDev.did,
            name: targetDev.name,
            model: targetDev.model || 'XiaoAi',
            ip: targetDev.ip,
            isOnline: true,
            status: { playing: true, volume: 40, updatedAt: new Date().toISOString() }
          });
        }
        setTimeout(() => {
          setShowHandover(false);
          setTransferToast(null);
        }, 1600);
      } else {
        setTransferToast(`流转失败: ${data.message || '音箱未响应'}`);
      }
    } catch (err: any) {
      setTransferToast(`流转异常: ${err.message}`);
    } finally {
      setTransferringDid(null);
    }
  };

  const renderDeviceBadge = () => {
    const state = activeDevice?.deviceState || (activeDevice?.status?.playing ? 'playing' : (activeDevice?.isOnline ? 'online' : 'offline'));
    switch (state) {
      case 'transcoding':
        return <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">FFmpeg转码中</span>;
      case 'buffering':
        return <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">缓冲中</span>;
      case 'playing':
        return <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">播放中</span>;
      case 'paused':
        return <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">已暂停</span>;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-md flex justify-end animate-in fade-in duration-200">
      <div className={`w-full max-w-md ${isLight ? 'bg-white text-zinc-900 border-l border-zinc-200 shadow-2xl' : 'bg-zinc-950 text-white border-l border-white/10 shadow-2xl'} h-full flex flex-col relative overflow-hidden`}>
        
        {/* Top Header */}
        <div className={`p-5 sm:p-6 border-b ${isLight ? 'border-zinc-200 bg-zinc-50/80' : 'border-white/10 bg-zinc-950'} flex items-center justify-between`}>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-2xl ${isLight ? 'bg-orange-50 text-orange-600 border border-orange-200 shadow-sm' : 'bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/30 shadow-[0_0_12px_rgba(255,103,0,0.3)]'}`}>
              <ListMusic className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`text-base font-bold ${isLight ? 'text-zinc-900' : 'text-white'} flex items-center gap-2`}>
                当前播放队列
                <span className={`text-xs px-2 py-0.5 rounded-full ${isLight ? 'bg-orange-100 text-orange-700 font-bold border border-orange-200' : 'bg-zinc-800 text-[#FF6700] font-mono font-bold'}`}>
                  {playlist.length} 首
                </span>
                {renderDeviceBadge()}
              </h3>
              <div className={`text-xs ${isLight ? 'text-zinc-600' : 'text-zinc-400'} flex items-center gap-1.5 mt-0.5`}>
                {isCasting ? (
                  <>
                    <Radio className="w-3 h-3 text-[#FF6700] animate-pulse shrink-0" />
                    <span className="truncate max-w-[170px]">投播: {activeDevice?.name || '小爱音箱'}</span>
                    <button
                      onClick={() => setShowHandover(!showHandover)}
                      className={`ml-1 flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold transition ${
                        isLight ? 'bg-orange-100 text-orange-800 hover:bg-orange-200' : 'bg-white/10 text-orange-400 hover:bg-white/15'
                      }`}
                      title="无缝流转播放至其他音箱"
                    >
                      <ArrowRightLeft className="w-3 h-3" />
                      <span>流转</span>
                    </button>
                  </>
                ) : (
                  <span>当前输出: 浏览器本地音频</span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`p-2 rounded-full ${isLight ? 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/70' : 'text-zinc-400 hover:text-white hover:bg-white/10'} transition`}
            title="关闭队列抽屉"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Handover Dialog Dropdown */}
        {showHandover && (
          <div className={`px-5 py-3 border-b animate-in slide-in-from-top-2 duration-150 ${
            isLight ? 'bg-orange-50/70 border-orange-200' : 'bg-zinc-900/90 border-white/10'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold flex items-center gap-1.5 text-[#FF6700]">
                <ArrowRightLeft className="w-3.5 h-3.5" />
                无缝跨音箱流转 (保持进度续播)
              </span>
              <button
                onClick={() => setShowHandover(false)}
                className="text-xs text-zinc-400 hover:text-zinc-200"
              >
                收起
              </button>
            </div>

            {transferToast && (
              <div className="mb-2 p-2 rounded bg-emerald-500/20 text-emerald-400 text-xs font-medium border border-emerald-500/30">
                {transferToast}
              </div>
            )}

            {loadingCandidates ? (
              <div className="flex items-center justify-center py-3 text-xs text-zinc-400 gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                正在发现局域网可用音箱...
              </div>
            ) : candidates.length === 0 ? (
              <p className="text-xs text-zinc-400 py-1">未发现其他在线的小爱音箱设备</p>
            ) : (
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {candidates.map((dev) => (
                  <button
                    key={dev.did}
                    disabled={transferringDid === dev.did}
                    onClick={() => handleExecuteTransfer(dev)}
                    className={`w-full flex items-center justify-between p-2 rounded-lg text-left text-xs transition ${
                      isLight
                        ? 'bg-white hover:bg-orange-100/60 border border-zinc-200 text-zinc-900'
                        : 'bg-zinc-800/80 hover:bg-zinc-700/80 border border-white/5 text-zinc-100'
                    }`}
                  >
                    <div>
                      <div className="font-bold flex items-center gap-1.5">
                        <span>{dev.name}</span>
                        {dev.model && <span className="text-[10px] text-zinc-400 font-mono">({dev.model})</span>}
                      </div>
                      <div className="text-[10px] text-zinc-400 font-mono mt-0.5">{dev.ip || 'Cloud DID'}</div>
                    </div>
                    <div>
                      {transferringDid === dev.did ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FF6700]" />
                      ) : (
                        <span className="text-[11px] font-bold text-[#FF6700] hover:underline">
                          流转至此
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Toolbar Controls */}
        <div className={`px-5 py-3 border-b flex items-center justify-between text-xs gap-2 ${
          isLight ? 'bg-zinc-100/90 border-zinc-200' : 'bg-zinc-900/50 border-white/5'
        }`}>
          <div className="flex items-center gap-2">
            {/* Shuffle Toggle Button */}
            <button
              onClick={onToggleShuffle}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all active:scale-95 shadow-sm ${
                isShuffle
                  ? (isLight 
                      ? 'bg-orange-100 text-zinc-950 border border-orange-300 font-extrabold shadow-sm' 
                      : 'bg-[#FF6700]/25 text-orange-400 border border-[#FF6700]/40 font-bold')
                  : (isLight 
                      ? 'bg-white hover:bg-zinc-50 text-zinc-900 hover:text-black border border-zinc-300 font-bold shadow-sm' 
                      : 'text-zinc-300 hover:text-white bg-zinc-800/90 border border-white/10')
              }`}
              title="切换随机/顺序播放模式"
            >
              <Shuffle className={`w-3.5 h-3.5 ${isShuffle ? (isLight ? 'text-zinc-950' : 'text-[#FF6700]') : (isLight ? 'text-zinc-700' : 'text-zinc-400')}`} />
              <span className={isLight ? 'text-zinc-950 font-extrabold' : (isShuffle ? 'text-orange-300' : 'text-zinc-200')}>
                {isShuffle ? '随机播放' : '顺序播放'}
              </span>
            </button>

            {/* Repeat Cycle Button */}
            {onCycleRepeat && (
              <button
                onClick={onCycleRepeat}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all active:scale-95 shadow-sm ${
                  repeatMode !== 'off'
                    ? (isLight 
                        ? 'bg-amber-100 text-zinc-950 border border-amber-300 font-extrabold shadow-sm' 
                        : 'bg-amber-500/25 text-amber-300 border border-amber-500/40 font-bold')
                    : (isLight 
                        ? 'bg-white hover:bg-zinc-50 text-zinc-900 hover:text-black border border-zinc-300 font-bold shadow-sm' 
                        : 'text-zinc-300 hover:text-white bg-zinc-800/90 border border-white/10')
                }`}
                title="切换循环模式（列表循环/单曲循环/不循环）"
              >
                {repeatMode === 'one' ? (
                  <>
                    <Repeat1 className={`w-3.5 h-3.5 ${isLight ? 'text-zinc-950' : 'text-amber-300'}`} />
                    <span className={isLight ? 'text-zinc-950 font-extrabold' : 'text-amber-300'}>单曲循环</span>
                  </>
                ) : repeatMode === 'all' ? (
                  <>
                    <Repeat className={`w-3.5 h-3.5 ${isLight ? 'text-zinc-950' : 'text-amber-300'}`} />
                    <span className={isLight ? 'text-zinc-950 font-extrabold' : 'text-amber-300'}>列表循环</span>
                  </>
                ) : (
                  <>
                    <Repeat className={`w-3.5 h-3.5 ${isLight ? 'text-zinc-500' : 'opacity-50'}`} />
                    <span className={isLight ? 'text-zinc-900' : 'text-zinc-300'}>不循环</span>
                  </>
                )}
              </button>
            )}
          </div>

          <div className="flex items-center gap-1">
            {onPrev && (
              <button
                onClick={onPrev}
                className={`p-1.5 rounded-lg transition ${
                  isLight ? 'text-zinc-700 hover:text-zinc-950 hover:bg-zinc-200' : 'text-zinc-400 hover:text-white hover:bg-white/10'
                }`}
                title="上一首"
              >
                <SkipBack className="w-4 h-4" />
              </button>
            )}
            {onNext && (
              <button
                onClick={onNext}
                className={`p-1.5 rounded-lg transition ${
                  isLight ? 'text-zinc-700 hover:text-zinc-950 hover:bg-zinc-200' : 'text-zinc-400 hover:text-white hover:bg-white/10'
                }`}
                title="下一首"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            )}
            {playlist.length > 0 && (
              <button
                onClick={onClearQueue}
                className={`flex items-center gap-1 transition ml-1 px-2.5 py-1 rounded-lg font-medium ${
                  isLight ? 'text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-200' : 'text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10'
                }`}
                title="清空队列"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>清空</span>
              </button>
            )}
          </div>
        </div>

        {/* High Performance Virtualized Queue List (Scheme 4) */}
        <div className="flex-1 overflow-hidden p-3">
          <VirtualList<Song>
            items={playlist}
            itemHeight={68}
            className={`h-full w-full pr-1 scrollbar-thin ${isLight ? 'scrollbar-thumb-zinc-300' : 'scrollbar-thumb-zinc-800'}`}
            emptyPlaceholder={
              <div className={`h-full flex flex-col items-center justify-center space-y-3 ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`}>
                <Disc className="w-12 h-12 opacity-40 animate-spin duration-3000" />
                <p className={`text-sm font-bold ${isLight ? 'text-zinc-700' : 'text-zinc-300'}`}>播放队列为空</p>
                <p className="text-xs text-zinc-500">点击曲库的“播放全部”或任意单曲加入队列</p>
              </div>
            }
            renderItem={(song, idx) => {
              const isCurrent = currentSong?.id === song.id;

              return (
                <div
                  key={`${song.id}-${idx}`}
                  style={{ height: '64px', marginBottom: '4px' }}
                  className={`group p-2.5 rounded-2xl flex items-center justify-between gap-3 transition ${
                    isCurrent
                      ? 'bg-[#FF6700]/15 border border-[#FF6700]/30 shadow-[0_0_15px_rgba(255,103,0,0.15)]'
                      : isLight
                      ? 'bg-zinc-50 hover:bg-zinc-100 border border-zinc-200/80 text-zinc-900'
                      : 'bg-zinc-900/30 hover:bg-zinc-900 border border-white/5'
                  }`}
                >
                  <div 
                    onClick={() => onSelectSong(song)}
                    className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                  >
                    <div className="relative w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 border border-white/10">
                      <img
                        src={song.coverUrl}
                        alt={song.title}
                        className="w-full h-full object-cover"
                      />
                      {isCurrent && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                          {isPlaying ? (
                            <div className="flex items-end gap-0.5 h-3">
                              <span className="w-1 bg-[#FF6700] animate-pulse h-2.5 rounded-full" />
                              <span className="w-1 bg-[#FF6700] animate-pulse delay-75 h-3.5 rounded-full" />
                              <span className="w-1 bg-[#FF6700] animate-pulse delay-150 h-2 rounded-full" />
                            </div>
                          ) : (
                            <Play className="w-3.5 h-3.5 text-[#FF6700] fill-current" />
                          )}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-mono ${isLight ? 'text-zinc-500' : 'text-zinc-500'} font-semibold`}>
                          {(idx + 1).toString().padStart(2, '0')}
                        </span>
                        <h4 className={`text-xs font-bold truncate ${isCurrent ? 'text-[#FF6700]' : (isLight ? 'text-zinc-900' : 'text-white')}`}>
                          {song.title}
                        </h4>
                      </div>
                      <p className={`text-[11px] truncate mt-0.5 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                        {song.artist}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-mono ${isLight ? 'text-zinc-500' : 'text-zinc-500'}`}>
                      {formatTime(song.duration)}
                    </span>
                    <button
                      onClick={() => onRemoveFromQueue(song.id)}
                      className="p-1.5 text-zinc-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition"
                      title="从队列中移除"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            }}
          />
        </div>

        {/* Footer info */}
        <div className={`p-4 border-t flex items-center justify-between text-[11px] ${
          isLight ? 'border-zinc-200 bg-zinc-50 text-zinc-700' : 'border-white/10 bg-zinc-950 text-zinc-400'
        }`}>
          <span className="font-medium">当前播放进度: {playlist.length > 0 ? `${(currentIndex >= 0 ? currentIndex : 0) + 1} / ${playlist.length}` : '0 / 0'}</span>
          <span className={isLight ? 'text-emerald-700 font-bold' : 'text-emerald-400 font-medium'}>✨ 支持小爱音箱全歌单连播</span>
        </div>

      </div>
    </div>
  );
};
