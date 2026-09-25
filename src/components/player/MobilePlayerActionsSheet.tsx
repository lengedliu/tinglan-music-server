import React, { memo } from 'react';
import { 
  Sliders, 
  Moon, 
  Gauge, 
  Disc, 
  Layers, 
  Flag, 
  Speaker, 
  Laptop, 
  X, 
  ListMusic, 
  Volume2, 
  Info, 
  Cpu, 
  Keyboard 
} from 'lucide-react';
import { XiaomiDevice, DeviceCommandState, SleepTimerConfig, ABLoopConfig, Song } from '../../types';
import { formatTime } from '../../utils/lyricParser';
import { useTheme } from '../../context/ThemeContext';

export interface MobilePlayerActionsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  currentSong: Song | null;
  activeDevice: XiaomiDevice | undefined;
  isCasting: boolean;
  commandState?: DeviceCommandState;
  onToggleCast: () => void;
  onOpenEQ?: () => void;
  onOpenQueue?: () => void;
  queueCount?: number;
  playbackSpeed?: number;
  onPlaybackSpeedChange?: (speed: number) => void;
  sleepTimer?: SleepTimerConfig;
  onOpenSleepTimer?: () => void;
  onOpenVinyl?: () => void;
  onOpenMultiRoom?: () => void;
  abLoop?: ABLoopConfig;
  onToggleABLoop?: () => void;
  onOpenInspector?: () => void;
  speakerVolume?: number;
  onSpeakerVolumeChange?: (vol: number) => void;
  volume: number;
  onVolumeChange: (vol: number) => void;
}

export const MobilePlayerActionsSheet: React.FC<MobilePlayerActionsSheetProps> = memo(({
  isOpen,
  onClose,
  currentSong,
  activeDevice,
  isCasting,
  commandState,
  onToggleCast,
  onOpenEQ,
  onOpenQueue,
  queueCount = 0,
  playbackSpeed = 1.0,
  onPlaybackSpeedChange,
  sleepTimer,
  onOpenSleepTimer,
  onOpenVinyl,
  onOpenMultiRoom,
  abLoop,
  onToggleABLoop,
  onOpenInspector,
  speakerVolume = 40,
  onSpeakerVolumeChange,
  volume,
  onVolumeChange
}) => {
  const { themeConfig, isLight: ctxIsLight } = useTheme();
  const isLight = Boolean(ctxIsLight ?? themeConfig?.isLight);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] md:hidden flex flex-col justify-end animate-in fade-in duration-200">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm" 
        onClick={onClose}
      />

      {/* Sheet Content */}
      <div 
        className={`relative z-10 w-full rounded-t-3xl max-h-[85vh] overflow-y-auto pb-safe border-t shadow-2xl transition-colors duration-200 ${
          isLight ? 'bg-white text-zinc-900 border-zinc-200' : 'bg-zinc-900 text-zinc-100 border-white/10'
        }`}
      >
        {/* Grab Handle */}
        <div className="w-12 h-1.5 bg-zinc-400/40 rounded-full mx-auto my-3" />

        {/* Header */}
        <div className="px-5 pb-3 border-b border-white/5 flex items-center justify-between">
          <div className="min-w-0 pr-2">
            <h3 className="text-base font-bold truncate">
              {currentSong ? currentSong.title : '播放中枢与音频控制'}
            </h3>
            <p className="text-xs text-zinc-400 truncate">
              {currentSong ? `${currentSong.artist} · 播放设置与高级工具` : '设备与声音增强配置'}
            </p>
          </div>
          <button 
            onClick={onClose}
            className={`p-2 rounded-full min-h-[44px] min-w-[44px] flex items-center justify-center ${
              isLight ? 'text-zinc-500 hover:text-zinc-900' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Volume Controllers */}
        <div className="p-5 space-y-4 border-b border-white/5">
          {/* Output Device Volume */}
          <div>
            <div className="flex items-center justify-between text-xs font-semibold mb-2">
              <span className="flex items-center gap-1.5">
                {isCasting ? <Speaker className="w-4 h-4 text-[#FF6700]" /> : <Laptop className="w-4 h-4 text-zinc-400" />}
                {isCasting ? `音箱音量 (${activeDevice?.name || '小爱音箱'})` : '浏览器本地音量'}
              </span>
              <span className="font-mono text-[#FF6700]">
                {isCasting ? `${speakerVolume}%` : `${Math.round(volume * 100)}%`}
              </span>
            </div>
            {isCasting ? (
              <input
                type="range"
                min="0"
                max="100"
                value={speakerVolume}
                onChange={(e) => onSpeakerVolumeChange && onSpeakerVolumeChange(Number(e.target.value))}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-[#FF6700] bg-zinc-700/50"
              />
            ) : (
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={(e) => onVolumeChange(Number(e.target.value))}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-[#FF6700] bg-zinc-700/50"
              />
            )}
          </div>

          {/* Quick Cast Toggle Button */}
          <button
            onClick={() => {
              onToggleCast();
            }}
            className={`w-full py-3 px-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition active:scale-98 shadow-sm ${
              isCasting
                ? 'bg-gradient-to-r from-[#FF6700] to-orange-500 text-white shadow-[0_4px_16px_rgba(255,103,0,0.35)]'
                : isLight
                  ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-900 border border-zinc-200'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-white border border-white/10'
            }`}
          >
            {isCasting ? (
              <>
                <Speaker className="w-4 h-4 animate-pulse text-white" />
                <span>当前串流中 · 点击切回本地播放</span>
              </>
            ) : (
              <>
                <Speaker className="w-4 h-4 text-[#FF6700]" />
                <span>一键串流投播至【{activeDevice?.name || '小爱音箱'}】</span>
              </>
            )}
          </button>
        </div>

        {/* Feature Grid with 44px+ hitboxes */}
        <div className="p-5 grid grid-cols-2 gap-3">
          
          {/* Play Queue */}
          {onOpenQueue && (
            <button
              onClick={() => {
                onClose();
                onOpenQueue();
              }}
              className={`p-3.5 rounded-2xl border flex items-center gap-3 text-left transition active:scale-95 ${
                isLight ? 'bg-zinc-50 border-zinc-200 hover:bg-zinc-100' : 'bg-zinc-800/60 border-white/5 hover:bg-zinc-800'
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-orange-500/15 text-[#FF6700] flex items-center justify-center shrink-0">
                <ListMusic className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold truncate">播放队列</div>
                <div className="text-[10px] text-zinc-400 font-mono">{queueCount} 首歌曲</div>
              </div>
            </button>
          )}

          {/* 10-Band EQ */}
          {onOpenEQ && (
            <button
              onClick={() => {
                onClose();
                onOpenEQ();
              }}
              className={`p-3.5 rounded-2xl border flex items-center gap-3 text-left transition active:scale-95 ${
                isLight ? 'bg-zinc-50 border-zinc-200 hover:bg-zinc-100' : 'bg-zinc-800/60 border-white/5 hover:bg-zinc-800'
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
                <Sliders className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold truncate">10段均衡器</div>
                <div className="text-[10px] text-zinc-400">EQ 音效与频谱</div>
              </div>
            </button>
          )}

          {/* Sleep Timer */}
          {onOpenSleepTimer && (
            <button
              onClick={() => {
                onClose();
                onOpenSleepTimer();
              }}
              className={`p-3.5 rounded-2xl border flex items-center gap-3 text-left transition active:scale-95 ${
                sleepTimer?.enabled 
                  ? 'bg-rose-500/15 border-rose-500/30' 
                  : isLight ? 'bg-zinc-50 border-zinc-200 hover:bg-zinc-100' : 'bg-zinc-800/60 border-white/5 hover:bg-zinc-800'
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center shrink-0">
                <Moon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold truncate">睡眠定时器</div>
                <div className="text-[10px] text-zinc-400 font-mono">
                  {sleepTimer?.enabled ? `${Math.floor(sleepTimer.remainingSeconds / 60)}分后停止` : '定时停止播放'}
                </div>
              </div>
            </button>
          )}

          {/* Vinyl Stage Fullscreen */}
          {onOpenVinyl && (
            <button
              onClick={() => {
                onClose();
                onOpenVinyl();
              }}
              className={`p-3.5 rounded-2xl border flex items-center gap-3 text-left transition active:scale-95 ${
                isLight ? 'bg-zinc-50 border-zinc-200 hover:bg-zinc-100' : 'bg-zinc-800/60 border-white/5 hover:bg-zinc-800'
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                <Disc className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold truncate">黑胶唱机</div>
                <div className="text-[10px] text-zinc-400">沉浸式黑胶大盘</div>
              </div>
            </button>
          )}

          {/* Multi-Room Broadcast */}
          {onOpenMultiRoom && (
            <button
              onClick={() => {
                onClose();
                onOpenMultiRoom();
              }}
              className={`p-3.5 rounded-2xl border flex items-center gap-3 text-left transition active:scale-95 ${
                isLight ? 'bg-zinc-50 border-zinc-200 hover:bg-zinc-100' : 'bg-zinc-800/60 border-white/5 hover:bg-zinc-800'
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold truncate">全屋同播</div>
                <div className="text-[10px] text-zinc-400">多音箱分组广播</div>
              </div>
            </button>
          )}

          {/* AB Loop */}
          {onToggleABLoop && (
            <button
              onClick={() => {
                onToggleABLoop();
              }}
              className={`p-3.5 rounded-2xl border flex items-center gap-3 text-left transition active:scale-95 ${
                abLoop?.enabled 
                  ? 'bg-cyan-500/15 border-cyan-500/30' 
                  : isLight ? 'bg-zinc-50 border-zinc-200 hover:bg-zinc-100' : 'bg-zinc-800/60 border-white/5 hover:bg-zinc-800'
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-pink-500/15 text-pink-400 flex items-center justify-center shrink-0">
                <Flag className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold truncate">A-B 段复读</div>
                <div className="text-[10px] text-zinc-400 font-mono">
                  {abLoop?.enabled ? `${formatTime(abLoop.a || 0)}-${formatTime(abLoop.b || 0)}` : '循环区间段'}
                </div>
              </div>
            </button>
          )}

          {/* Audio Inspector */}
          {onOpenInspector && currentSong && (
            <button
              onClick={() => {
                onClose();
                onOpenInspector();
              }}
              className={`p-3.5 rounded-2xl border flex items-center gap-3 text-left transition active:scale-95 ${
                isLight ? 'bg-zinc-50 border-zinc-200 hover:bg-zinc-100' : 'bg-zinc-800/60 border-white/5 hover:bg-zinc-800'
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0">
                <Cpu className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold truncate">音频指标</div>
                <div className="text-[10px] text-zinc-400">{currentSong.bitrate || '无损采样率'}</div>
              </div>
            </button>
          )}

          {/* Speed Selector */}
          {onPlaybackSpeedChange && (
            <div className={`p-3.5 rounded-2xl border flex flex-col justify-center gap-1.5 ${
              isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-800/60 border-white/5'
            }`}>
              <div className="text-xs font-bold flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Gauge className="w-3.5 h-3.5 text-[#FF6700]" />
                  播放倍速
                </span>
                <span className="text-[#FF6700] font-mono">{playbackSpeed}x</span>
              </div>
              <div className="flex items-center justify-between gap-1 pt-1">
                {[0.75, 1.0, 1.25, 1.5].map((spd) => (
                  <button
                    key={spd}
                    onClick={() => onPlaybackSpeedChange(spd)}
                    className={`flex-1 py-1 rounded-lg text-[10px] font-mono font-bold transition ${
                      playbackSpeed === spd
                        ? 'bg-[#FF6700] text-white shadow-sm'
                        : isLight ? 'bg-zinc-200 text-zinc-700' : 'bg-zinc-700/60 text-zinc-300'
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
});

MobilePlayerActionsSheet.displayName = 'MobilePlayerActionsSheet';
