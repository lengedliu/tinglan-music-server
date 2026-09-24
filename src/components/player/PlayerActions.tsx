import React, { useState, useRef, useEffect, memo } from 'react';
import { 
  Speaker, 
  Laptop, 
  Cast, 
  Sliders, 
  ListMusic, 
  Server, 
  Mic2, 
  Moon, 
  Disc, 
  Layers, 
  Flag, 
  Keyboard 
} from 'lucide-react';
import { XiaomiDevice, DeviceCommandState, SleepTimerConfig, ABLoopConfig } from '../../types';
import { formatTime } from '../../utils/lyricParser';

export interface PlayerActionsProps {
  activeDevice: XiaomiDevice | undefined;
  isCasting: boolean;
  commandState?: DeviceCommandState;
  onToggleCast: () => void;
  onOpenEQ?: () => void;
  onOpenQueue?: () => void;
  queueCount?: number;
  onOpenSubsonic?: () => void;
  onOpenLyrics: () => void;
  playbackSpeed?: number;
  onPlaybackSpeedChange?: (speed: number) => void;
  sleepTimer?: SleepTimerConfig;
  onOpenSleepTimer?: () => void;
  onOpenVinyl?: () => void;
  onOpenMultiRoom?: () => void;
  abLoop?: ABLoopConfig;
  onToggleABLoop?: () => void;
  onOpenShortcuts?: () => void;
  isLight?: boolean;
}

export const PlayerActions: React.FC<PlayerActionsProps> = memo(({
  activeDevice,
  isCasting,
  commandState,
  onToggleCast,
  onOpenEQ,
  onOpenQueue,
  queueCount,
  onOpenSubsonic,
  onOpenLyrics,
  playbackSpeed = 1.0,
  onPlaybackSpeedChange,
  sleepTimer,
  onOpenSleepTimer,
  onOpenVinyl,
  onOpenMultiRoom,
  abLoop = { a: null, b: null, enabled: false },
  onToggleABLoop,
  onOpenShortcuts,
  isLight = false
}) => {
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const speedMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target as Node)) {
        setShowSpeedMenu(false);
      }
    };
    if (showSpeedMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSpeedMenu]);

  return (
    <div className="flex items-center justify-end gap-2 sm:gap-2.5 shrink-0 min-w-0">
      {/* Global Output Target Switcher: Local Browser vs Xiaomi Speaker */}
      <button
        id="btn-cast-xiaomi-speaker"
        onClick={onToggleCast}
        disabled={commandState?.status === 'pending'}
        title={
          commandState?.status === 'pending'
            ? `正在向 ${activeDevice?.name || '小米音箱'} 下发指令...`
            : commandState?.status === 'failed' || commandState?.status === 'timeout'
              ? `投放未完成: ${commandState.error || '未响应'} (点击重试)`
              : isCasting 
                ? `【当前：音箱串流模式】点击关闭，切回电脑本地播放` 
                : `【当前：电脑本地模式】点击打开，全盘接管投向 ${activeDevice?.name || '小爱音箱'}`
        }
        className={`flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer shadow-sm select-none shrink-0 ${
          commandState?.status === 'pending'
            ? isLight
              ? 'bg-amber-100 text-amber-800 border border-amber-300 cursor-wait animate-pulse'
              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40 cursor-wait animate-pulse'
            : isCasting 
              ? 'is-casting bg-gradient-to-r from-[#FF6700] to-orange-500 text-white shadow-[0_0_16px_rgba(255,103,0,0.55)] hover:brightness-110 active:scale-[0.98] border border-orange-400/40' 
              : commandState?.status === 'failed' || commandState?.status === 'timeout'
                ? isLight
                  ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 active:scale-[0.98]'
                  : 'bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25 active:scale-[0.98]'
                : isLight
                  ? 'bg-zinc-100/90 hover:bg-zinc-200 text-zinc-800 hover:text-zinc-950 border border-zinc-300/80 hover:border-zinc-400 active:scale-[0.98]'
                  : 'bg-zinc-900/95 hover:bg-zinc-800 text-zinc-200 border border-white/15 hover:border-white/30 hover:text-white active:scale-[0.98]'
        }`}
      >
        {commandState?.status === 'pending' ? (
          <div className={`w-3.5 h-3.5 border-2 ${isLight ? 'border-amber-600' : 'border-amber-400'} border-t-transparent rounded-full animate-spin shrink-0`} />
        ) : isCasting ? (
          <div className="flex items-center gap-1 shrink-0">
            <Speaker className="w-3.5 h-3.5 animate-pulse text-white" />
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-ping" />
          </div>
        ) : (
          <div className="flex items-center gap-1 shrink-0">
            <Laptop className={`w-3.5 h-3.5 ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`} />
            <Cast className="w-3 h-3 text-[#FF6700]" />
          </div>
        )}
        <span className={`inline-block whitespace-nowrap tracking-tight ${
          isCasting ? 'text-white font-bold' : isLight ? 'text-zinc-900 font-semibold' : 'text-zinc-200 font-medium'
        }`}>
          {commandState?.status === 'pending'
            ? '下发中...'
            : isCasting
              ? `音箱串流 · ${activeDevice?.name ? (activeDevice.name.length > 5 ? activeDevice.name.slice(0, 5) + '…' : activeDevice.name) : '小爱'}`
              : commandState?.status === 'failed' || commandState?.status === 'timeout'
                ? '重试投放'
                : `投放至【${activeDevice?.name ? (activeDevice.name.length > 5 ? activeDevice.name.slice(0, 5) + '…' : activeDevice.name) : '音箱'}】`}
        </span>
      </button>

      {/* EQ Equalizer Toggle */}
      {onOpenEQ && (
        <button
          id="btn-open-eq-modal"
          onClick={onOpenEQ}
          title="10段专业均衡器 (EQ) 与频谱"
          className={`p-2 ${isLight ? 'text-zinc-600 hover:text-[#FF6700] hover:bg-zinc-200/70' : 'text-zinc-400 hover:text-[#FF6700] hover:bg-white/5'} rounded-full transition`}
        >
          <Sliders className="w-4.5 h-4.5" />
        </button>
      )}

      {/* Play Queue Drawer Toggle */}
      {onOpenQueue && (
        <button
          id="btn-open-queue-drawer"
          onClick={onOpenQueue}
          title={`查看当前播放队列 (${queueCount || 0} 首)`}
          className={`p-2 ${isLight ? 'text-zinc-600 hover:text-[#FF6700] hover:bg-zinc-200/70' : 'text-zinc-400 hover:text-[#FF6700] hover:bg-white/5'} rounded-full transition relative`}
        >
          <ListMusic className="w-4.5 h-4.5" />
          {queueCount !== undefined && queueCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#FF6700] text-white font-bold text-[9px] flex items-center justify-center shadow-[0_0_8px_rgba(255,103,0,0.8)]">
              {queueCount > 99 ? '99+' : queueCount}
            </span>
          )}
        </button>
      )}

      {/* Subsonic Server Gate Toggle */}
      {onOpenSubsonic && (
        <button
          id="btn-open-subsonic-dashboard"
          onClick={onOpenSubsonic}
          title="Subsonic & OpenSubsonic 接口网关"
          className={`p-2 ${isLight ? 'text-zinc-600 hover:text-emerald-600 hover:bg-zinc-200/70' : 'text-zinc-400 hover:text-emerald-400 hover:bg-white/5'} rounded-full transition`}
        >
          <Server className="w-4.5 h-4.5" />
        </button>
      )}

      {/* Lyrics Full View Toggle */}
      <button
        id="btn-open-lyrics-modal"
        onClick={onOpenLyrics}
        title="查看动态歌词与试听 (L)"
        className={`p-2 ${isLight ? 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/70' : 'text-zinc-400 hover:text-white hover:bg-white/5'} rounded-full transition`}
      >
        <Mic2 className="w-4.5 h-4.5" />
      </button>

      {/* Playback Speed Controller */}
      {onPlaybackSpeedChange && (
        <div className="relative" ref={speedMenuRef}>
          <button
            id="btn-toggle-playback-speed"
            onClick={() => setShowSpeedMenu(prev => !prev)}
            title={`播放倍速: ${playbackSpeed}x`}
            className={`px-2 py-1 rounded-lg text-xs font-mono font-bold transition flex items-center gap-1 ${
              playbackSpeed !== 1.0
                ? 'bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/30 shadow-sm'
                : isLight
                  ? 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/70'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <span>{playbackSpeed}x</span>
          </button>

          {showSpeedMenu && (
            <div className={`absolute bottom-full mb-2 -left-6 py-1.5 px-1 rounded-2xl border shadow-xl z-50 flex flex-col gap-1 min-w-[70px] animate-in fade-in zoom-in-95 duration-100 ${
              isLight ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-zinc-900 border-white/10 text-white'
            }`}>
              {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((spd) => (
                <button
                  key={spd}
                  id={`btn-speed-option-${spd}`}
                  onClick={() => {
                    onPlaybackSpeedChange(spd);
                    setShowSpeedMenu(false);
                  }}
                  className={`px-3 py-1 rounded-xl text-xs font-mono font-semibold transition text-left ${
                    playbackSpeed === spd
                      ? 'bg-[#FF6700] text-white'
                      : isLight
                        ? 'hover:bg-zinc-100 text-zinc-700'
                        : 'hover:bg-white/10 text-zinc-300'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sleep Timer Toggle Button */}
      {onOpenSleepTimer && (
        sleepTimer?.enabled ? (
          <button
            id="btn-open-sleep-timer-active"
            onClick={onOpenSleepTimer}
            title="睡眠定时器运行中，点击查看或调整"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FF6700]/20 hover:bg-[#FF6700]/30 text-[#FF6700] border border-[#FF6700]/40 text-xs font-mono font-bold transition shadow-[0_0_10px_rgba(255,103,0,0.3)] animate-pulse shrink-0"
          >
            <Moon className="w-3.5 h-3.5 fill-current" />
            <span>
              {sleepTimer.stopAtEndOfSong 
                ? '播完停' 
                : `${Math.floor(sleepTimer.remainingSeconds / 60)}:${(sleepTimer.remainingSeconds % 60).toString().padStart(2, '0')}`}
            </span>
          </button>
        ) : (
          <button
            id="btn-open-sleep-timer-idle"
            onClick={onOpenSleepTimer}
            title="睡眠定时器 (T) - 伴着音乐入眠"
            className={`p-2 ${isLight ? 'text-zinc-600 hover:text-[#FF6700] hover:bg-zinc-200/70' : 'text-zinc-400 hover:text-[#FF6700] hover:bg-white/5'} rounded-full transition`}
          >
            <Moon className="w-4.5 h-4.5" />
          </button>
        )
      )}

      {/* Vinyl Immersive Player Fullscreen Toggle */}
      {onOpenVinyl && (
        <button
          id="btn-open-vinyl-modal"
          onClick={onOpenVinyl}
          title="开启沉浸黑胶唱盘舞台 (V)"
          className={`p-2 ${isLight ? 'text-zinc-600 hover:text-[#FF6700] hover:bg-zinc-200/70' : 'text-zinc-400 hover:text-[#FF6700] hover:bg-white/5'} rounded-full transition`}
        >
          <Disc className="w-4.5 h-4.5" />
        </button>
      )}

      {/* Multi-room Speaker Group Cast Toggle */}
      {onOpenMultiRoom && (
        <button
          id="btn-open-multiroom-modal"
          onClick={onOpenMultiRoom}
          title="全屋多音箱同播 · 分组广播"
          className={`p-2 ${isLight ? 'text-zinc-600 hover:text-[#FF6700] hover:bg-zinc-200/70' : 'text-zinc-400 hover:text-[#FF6700] hover:bg-white/5'} rounded-full transition`}
        >
          <Layers className="w-4.5 h-4.5" />
        </button>
      )}

      {/* A-B Loop Button */}
      {onToggleABLoop && (
        <button
          id="btn-toggle-ab-loop"
          onClick={onToggleABLoop}
          title={abLoop.enabled ? `A-B复读中 [${formatTime(abLoop.a || 0)} - ${formatTime(abLoop.b || 0)}] 点击重置` : (abLoop.a !== null ? `已定A点: ${formatTime(abLoop.a)}, 点击定B点` : 'A-B 段区间复读 (点击定起点)')}
          className={`p-1.5 rounded-lg text-xs font-mono font-bold transition flex items-center gap-1 ${
            abLoop.enabled 
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm' 
              : abLoop.a !== null 
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' 
                : (isLight ? 'text-zinc-500 hover:text-zinc-900' : 'text-zinc-400 hover:text-white')
          }`}
        >
          <Flag className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden xl:inline text-[11px]">{abLoop.enabled ? 'A-B' : '复读'}</span>
        </button>
      )}

      {/* Keyboard Shortcuts Guide Toggle */}
      {onOpenShortcuts && (
        <button
          id="btn-open-shortcuts-modal"
          onClick={onOpenShortcuts}
          title="全局键盘快捷键速查 (? / Shift + /)"
          className={`p-2 ${isLight ? 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/70' : 'text-zinc-400 hover:text-white hover:bg-white/5'} rounded-full transition`}
        >
          <Keyboard className="w-4.5 h-4.5" />
        </button>
      )}
    </div>
  );
});

PlayerActions.displayName = 'PlayerActions';
