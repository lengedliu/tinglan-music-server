import React, { useState } from 'react';
import { Moon, Clock, X, Check, VolumeX, AlertCircle, Plus, RotateCcw } from 'lucide-react';
import { SleepTimerConfig } from '../types';
import { useTheme } from '../context/ThemeContext';

interface SleepTimerModalProps {
  isOpen: boolean;
  onClose: () => void;
  sleepTimer: SleepTimerConfig;
  onStartTimer: (minutes: number, stopAtEndOfSong: boolean, smoothFadeOut: boolean) => void;
  onCancelTimer: () => void;
  onAddMinutes: (additionalMinutes: number) => void;
  currentSongTitle?: string;
}

export const SleepTimerModal: React.FC<SleepTimerModalProps> = ({
  isOpen,
  onClose,
  sleepTimer,
  onStartTimer,
  onCancelTimer,
  onAddMinutes,
  currentSongTitle
}) => {
  const { themeConfig } = useTheme();
  const isLight = !!themeConfig?.isLight;

  const [selectedMinutes, setSelectedMinutes] = useState<number>(30);
  const [stopAtEndOfSong, setStopAtEndOfSong] = useState<boolean>(false);
  const [smoothFadeOut, setSmoothFadeOut] = useState<boolean>(true);
  const [customInput, setCustomInput] = useState<string>('');

  if (!isOpen) return null;

  const PRESETS = [15, 30, 45, 60, 90];

  const formatRemaining = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleApplyPreset = (mins: number) => {
    setSelectedMinutes(mins);
    setStopAtEndOfSong(false);
    onStartTimer(mins, false, smoothFadeOut);
  };

  const handleApplyEndOfSong = () => {
    setStopAtEndOfSong(true);
    onStartTimer(0, true, smoothFadeOut);
  };

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(customInput, 10);
    if (!isNaN(val) && val > 0 && val <= 480) {
      setSelectedMinutes(val);
      setStopAtEndOfSong(false);
      onStartTimer(val, false, smoothFadeOut);
      setCustomInput('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className={`w-full max-w-md rounded-3xl border shadow-2xl p-6 relative overflow-hidden transition-all ${
        isLight
          ? 'bg-white border-zinc-200 text-zinc-900 shadow-xl'
          : 'bg-zinc-950 border-white/10 text-zinc-100 shadow-[0_0_50px_rgba(0,0,0,0.8)]'
      }`}>
        
        {/* Top Glow */}
        <div 
          className="absolute -top-20 -right-20 w-48 h-48 rounded-full blur-3xl pointer-events-none opacity-20"
          style={{ backgroundColor: themeConfig.primaryColor }}
        />

        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-5 relative z-10">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-md"
              style={{ backgroundColor: themeConfig.primaryColor }}
            >
              <Moon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold tracking-tight">
                睡眠定时器 (Sleep Timer)
              </h3>
              <p className={`text-xs ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                伴着音乐入眠，到时自动暂停本地播放与音箱串流
              </p>
            </div>
          </div>

          <button
            id="btn-close-sleep-timer-modal"
            onClick={onClose}
            className={`p-2 rounded-full transition ${
              isLight ? 'hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700' : 'hover:bg-white/10 text-zinc-400 hover:text-white'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="space-y-6 relative z-10">

          {/* Active Countdown Status Display */}
          {sleepTimer.enabled ? (
            <div className={`p-5 rounded-2xl border text-center space-y-3 relative overflow-hidden ${
              isLight 
                ? 'bg-amber-50 border-amber-200 text-amber-950' 
                : 'bg-zinc-900/80 border-[#FF6700]/30 text-white shadow-inner'
            }`}>
              <div className="flex items-center justify-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#FF6700] animate-ping" />
                <span className="text-xs font-semibold uppercase tracking-wider text-[#FF6700]">
                  定时休眠倒计时中
                </span>
              </div>

              {sleepTimer.stopAtEndOfSong ? (
                <div className="py-2">
                  <div className="text-2xl font-bold font-mono tracking-tight text-[#FF6700]">
                    播完当前歌曲后停止
                  </div>
                  {currentSongTitle && (
                    <p className="text-xs text-zinc-400 mt-1 truncate">
                      当前曲目：《{currentSongTitle}》
                    </p>
                  )}
                </div>
              ) : (
                <div className="py-1">
                  <div className="text-4xl font-extrabold font-mono tracking-wider text-[#FF6700]">
                    {formatRemaining(sleepTimer.remainingSeconds)}
                  </div>
                  <p className={`text-xs mt-1 ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                    初始设定 {sleepTimer.initialMinutes} 分钟
                    {sleepTimer.smoothFadeOut ? ' · 结束前10秒平滑淡出' : ''}
                  </p>
                </div>
              )}

              {/* Action Buttons for active timer */}
              <div className="flex items-center justify-center gap-2 pt-1">
                {!sleepTimer.stopAtEndOfSong && (
                  <button
                    id="btn-sleep-timer-add-5m"
                    onClick={() => onAddMinutes(5)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white text-xs font-semibold transition border border-white/10"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#FF6700]" />
                    <span>+5 分钟</span>
                  </button>
                )}

                <button
                  id="btn-sleep-timer-cancel"
                  onClick={onCancelTimer}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-semibold transition border border-rose-500/30"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>取消定时器</span>
                </button>
              </div>
            </div>
          ) : (
            /* Quick Presets Grid */
            <div className="space-y-3">
              <label className={`text-xs font-bold uppercase tracking-wider block ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                选择定时时长
              </label>

              <div className="grid grid-cols-3 gap-2.5">
                {PRESETS.map((mins) => {
                  const isSelected = selectedMinutes === mins && !stopAtEndOfSong;
                  return (
                    <button
                      key={mins}
                      id={`btn-sleep-preset-${mins}`}
                      onClick={() => handleApplyPreset(mins)}
                      className={`py-3 px-3 rounded-2xl text-center font-bold text-sm transition-all border ${
                        isSelected
                          ? 'bg-[#FF6700] text-white border-[#FF6700] shadow-[0_4px_16px_rgba(255,103,0,0.4)] scale-102'
                          : isLight
                            ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border-zinc-200'
                            : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border-white/10 hover:border-white/20'
                      }`}
                    >
                      <span className="block text-base">{mins}</span>
                      <span className="text-[10px] opacity-75 font-normal">分钟</span>
                    </button>
                  );
                })}

                {/* Stop at End of Current Song */}
                <button
                  id="btn-sleep-preset-end-of-song"
                  onClick={handleApplyEndOfSong}
                  className={`py-3 px-2 rounded-2xl text-center font-bold text-xs transition-all border ${
                    stopAtEndOfSong
                      ? 'bg-[#FF6700] text-white border-[#FF6700] shadow-[0_4px_16px_rgba(255,103,0,0.4)]'
                      : isLight
                        ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border-zinc-200'
                        : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border-white/10 hover:border-white/20'
                  }`}
                  title="播完当前这首歌后停止"
                >
                  <span className="block text-xs font-semibold">播完当前</span>
                  <span className="text-[10px] opacity-75 font-normal">曲目后停止</span>
                </button>
              </div>

              {/* Custom Minutes Input */}
              <form onSubmit={handleApplyCustom} className="pt-2 flex items-center gap-2">
                <input
                  id="input-sleep-custom-minutes"
                  type="number"
                  min="1"
                  max="480"
                  placeholder="自定义分钟数 (如 75)"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  className={`flex-1 px-4 py-2.5 rounded-xl text-xs border outline-none transition ${
                    isLight
                      ? 'bg-zinc-100 border-zinc-200 text-zinc-900 focus:border-[#FF6700]'
                      : 'bg-zinc-900 border-white/10 text-white focus:border-[#FF6700]'
                  }`}
                />
                <button
                  id="btn-apply-custom-sleep-timer"
                  type="submit"
                  disabled={!customInput.trim()}
                  className="px-4 py-2.5 rounded-xl bg-[#FF6700] hover:bg-[#e55c00] text-white text-xs font-bold transition disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shrink-0"
                >
                  设定
                </button>
              </form>
            </div>
          )}

          {/* Smooth Fade Out Option */}
          <div className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
            isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900/60 border-white/5'
          }`}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
                <VolumeX className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold block">平滑淡出 (Fade Out)</span>
                <span className={`text-[11px] block ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  停止前 10 秒渐弱音量，保护听感不惊醒
                </span>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                id="checkbox-sleep-fadeout"
                type="checkbox"
                checked={smoothFadeOut}
                onChange={(e) => setSmoothFadeOut(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#FF6700]"></div>
            </label>
          </div>

        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-xs">
          <span className={`${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
            关闭此弹窗后定时器将在后台持续运行
          </span>
          <button
            id="btn-done-sleep-timer"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-medium transition"
          >
            完成
          </button>
        </div>

      </div>
    </div>
  );
};
