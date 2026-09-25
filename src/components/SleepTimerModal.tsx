import React, { useState, useEffect } from 'react';
import { 
  Moon, 
  Clock, 
  X, 
  Check, 
  VolumeX, 
  AlertCircle, 
  Plus, 
  RotateCcw, 
  Calendar, 
  Play, 
  Trash2, 
  Bell, 
  Zap, 
  SlidersHorizontal 
} from 'lucide-react';
import { SleepTimerConfig, ScheduledTask } from '../types';
import { useTheme } from '../context/ThemeContext';
import { apiFetch } from '../utils/api';

interface SleepTimerModalProps {
  isOpen: boolean;
  onClose: () => void;
  sleepTimer: SleepTimerConfig;
  onStartTimer: (minutes: number, stopAtEndOfSong: boolean, smoothFadeOut: boolean) => void;
  onCancelTimer: () => void;
  onAddMinutes: (additionalMinutes: number) => void;
  currentSongTitle?: string;
  activeDeviceId?: string;
  activeDeviceName?: string;
}

export const SleepTimerModal: React.FC<SleepTimerModalProps> = ({
  isOpen,
  onClose,
  sleepTimer,
  onStartTimer,
  onCancelTimer,
  onAddMinutes,
  currentSongTitle,
  activeDeviceId = '',
  activeDeviceName = '小爱音箱'
}) => {
  const { themeConfig } = useTheme();
  const isLight = !!themeConfig?.isLight;

  const [activeTab, setActiveTab] = useState<'quick' | 'tasks'>('quick');

  // Quick Countdown States
  const [selectedMinutes, setSelectedMinutes] = useState<number>(30);
  const [stopAtEndOfSong, setStopAtEndOfSong] = useState<boolean>(false);
  const [smoothFadeOut, setSmoothFadeOut] = useState<boolean>(true);
  const [customInput, setCustomInput] = useState<string>('');

  // P0 Scheduled Tasks States
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState<boolean>(false);
  const [showCreateTask, setShowCreateTask] = useState<boolean>(false);
  const [taskTitle, setTaskTitle] = useState<string>('早晨轻音乐叫醒');
  const [taskType, setTaskType] = useState<'alarm' | 'sleep_timer' | 'routine'>('alarm');
  const [taskTime, setTaskTime] = useState<string>('07:30');
  const [taskAction, setTaskAction] = useState<'pause' | 'play_song' | 'play_playlist' | 'volume_fade' | 'tts_alarm'>('play_song');
  const [taskVolume, setTaskVolume] = useState<number>(45);
  const [taskRepeat, setTaskRepeat] = useState<number[]>([1, 2, 3, 4, 5]); // Mon-Fri
  const [taskTts, setTaskTts] = useState<string>('早上好，新的一天开始啦！');

  useEffect(() => {
    if (isOpen && activeTab === 'tasks') {
      fetchScheduledTasks();
    }
  }, [isOpen, activeTab]);

  const fetchScheduledTasks = async () => {
    setLoadingTasks(true);
    try {
      const res = await apiFetch('/api/tasks');
      const data = await res.json();
      if (res.ok && data.success) {
        setTasks(data.tasks || []);
      }
    } catch (e) {
      console.warn('Failed to load tasks:', e);
    } finally {
      setLoadingTasks(false);
    }
  };

  const handleToggleTask = async (id: string) => {
    try {
      const res = await apiFetch(`/api/tasks/${id}/toggle`, { method: 'POST' });
      if (res.ok) {
        fetchScheduledTasks();
      }
    } catch (e) {
      console.error('Toggle task failed', e);
    }
  };

  const handleDeleteTask = async (id: string) => {
    try {
      const res = await apiFetch(`/api/tasks/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setTasks(prev => prev.filter(t => t.id !== id));
      }
    } catch (e) {
      console.error('Delete task failed', e);
    }
  };

  const handleExecuteNow = async (id: string) => {
    try {
      await apiFetch(`/api/tasks/${id}/execute-now`, { method: 'POST' });
      fetchScheduledTasks();
    } catch (e) {
      console.error('Execute task failed', e);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle) return;

    try {
      const payload: Partial<ScheduledTask> = {
        title: taskTitle,
        type: taskType,
        targetTime: taskTime,
        targetDid: activeDeviceId || 'default-speaker',
        targetDeviceName: activeDeviceName || '小爱音箱',
        action: taskAction,
        volume: taskVolume,
        repeatDays: taskRepeat,
        isEnabled: true,
        ttsText: taskAction === 'tts_alarm' ? taskTts : undefined
      };

      const res = await apiFetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setShowCreateTask(false);
        fetchScheduledTasks();
      }
    } catch (e) {
      console.error('Create task error', e);
    }
  };

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

  const DAYS = ['日', '一', '二', '三', '四', '五', '六'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className={`w-full max-w-lg rounded-3xl border shadow-2xl p-6 relative overflow-hidden transition-all max-h-[90vh] overflow-y-auto ${
        isLight
          ? 'bg-white border-zinc-200 text-zinc-900 shadow-xl'
          : 'bg-zinc-950 border-white/10 text-zinc-100 shadow-[0_0_50px_rgba(0,0,0,0.8)]'
      }`}>
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4 relative z-10">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-md"
              style={{ backgroundColor: themeConfig.primaryColor }}
            >
              <Moon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold tracking-tight">
                休眠与定时调度中心
              </h3>
              <p className={`text-xs ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                即时睡眠倒计时 · 服务端常驻离线叫醒计划 (P0)
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

        {/* Tab Navigation */}
        <div className="flex rounded-xl p-1 bg-zinc-900/60 border border-white/5 mb-5">
          <button
            onClick={() => setActiveTab('quick')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
              activeTab === 'quick'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            即时休眠倒计时
          </button>
          <button
            onClick={() => {
              setActiveTab('tasks');
              fetchScheduledTasks();
            }}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
              activeTab === 'tasks'
                ? 'bg-[#FF6700] text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            离线定时与叫醒任务 (P0)
          </button>
        </div>

        {/* TAB 1: QUICK COUNTDOWN */}
        {activeTab === 'quick' && (
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
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 hover:text-rose-200 text-xs font-semibold transition border border-rose-500/30"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>取消定时器</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Presets Grid */}
                <div>
                  <label className={`block text-xs font-semibold uppercase tracking-wider mb-2.5 ${
                    isLight ? 'text-zinc-600' : 'text-zinc-400'
                  }`}>
                    快捷时长预设
                  </label>
                  <div className="grid grid-cols-5 gap-2">
                    {PRESETS.map((mins) => (
                      <button
                        key={mins}
                        onClick={() => handleApplyPreset(mins)}
                        className={`py-3 px-1 rounded-2xl border text-center transition flex flex-col items-center justify-center ${
                          selectedMinutes === mins && !stopAtEndOfSong
                            ? 'bg-[#FF6700]/20 border-[#FF6700] text-white font-bold shadow-md'
                            : isLight
                            ? 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                            : 'bg-zinc-900 border-white/5 text-zinc-300 hover:border-white/20'
                        }`}
                      >
                        <span className="text-base font-bold font-mono">{mins}</span>
                        <span className="text-[10px] opacity-70">分钟</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Stop at End of Song Option */}
                <button
                  onClick={handleApplyEndOfSong}
                  className={`w-full p-3.5 rounded-2xl border flex items-center justify-between transition ${
                    stopAtEndOfSong
                      ? 'bg-[#FF6700]/20 border-[#FF6700] text-white font-bold shadow-md'
                      : isLight
                      ? 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                      : 'bg-zinc-900 border-white/5 text-zinc-300 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-zinc-800 flex items-center justify-center text-[#FF6700]">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold">播完当前歌曲后停止</p>
                      <p className="text-[11px] text-zinc-500">当前单曲播放结束即刻关闭声音</p>
                    </div>
                  </div>
                  {stopAtEndOfSong && <Check className="w-4 h-4 text-[#FF6700]" />}
                </button>

                {/* Custom Minutes Input */}
                <form onSubmit={handleApplyCustom} className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    max="480"
                    placeholder="输入自定义分钟数 (如 40)..."
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    className={`flex-1 px-4 py-2.5 rounded-2xl text-xs border outline-none transition ${
                      isLight
                        ? 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-[#FF6700]'
                        : 'bg-zinc-900 border-white/10 text-zinc-100 focus:border-[#FF6700]'
                    }`}
                  />
                  <button
                    type="submit"
                    disabled={!customInput || parseInt(customInput, 10) <= 0}
                    className="px-4 py-2.5 rounded-2xl bg-[#FF6700] hover:bg-[#ff771a] disabled:opacity-40 text-white text-xs font-bold transition shadow-md flex items-center gap-1.5"
                  >
                    <span>启动</span>
                  </button>
                </form>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: P0 OFFLINE SCHEDULED TASKS */}
        {activeTab === 'tasks' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-400">
                后端常驻进程执行 · 关掉网页或手机锁屏依然准时触发
              </p>
              <button
                onClick={() => setShowCreateTask(!showCreateTask)}
                className="px-3 py-1 rounded-xl bg-[#FF6700]/20 border border-[#FF6700]/40 text-[#FF6700] text-xs font-semibold flex items-center gap-1 hover:bg-[#FF6700]/30 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                新建任务
              </button>
            </div>

            {/* Create Task Form */}
            {showCreateTask && (
              <form onSubmit={handleCreateTask} className="p-4 rounded-2xl bg-zinc-900 border border-white/10 space-y-3">
                <div className="text-xs font-bold text-[#FF6700] flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  新建离线计划
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-zinc-400 mb-1">任务名称</label>
                    <input
                      type="text"
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-zinc-950 border border-white/10 text-xs text-white"
                      placeholder="例: 早晨唤醒音乐"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-400 mb-1">触发时间 (24小时制)</label>
                    <input
                      type="time"
                      value={taskTime}
                      onChange={(e) => setTaskTime(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-zinc-950 border border-white/10 text-xs text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-zinc-400 mb-1">执行动作</label>
                    <select
                      value={taskAction}
                      onChange={(e: any) => setTaskAction(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-zinc-950 border border-white/10 text-xs text-white"
                    >
                      <option value="play_song">播放推荐曲目</option>
                      <option value="play_playlist">播放自建歌单</option>
                      <option value="tts_alarm">播报语音叫醒 (TTS)</option>
                      <option value="pause">暂停播放 (休眠)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-400 mb-1">音量设定 ({taskVolume}%)</label>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      value={taskVolume}
                      onChange={(e) => setTaskVolume(Number(e.target.value))}
                      className="w-full accent-[#FF6700] mt-1"
                    />
                  </div>
                </div>

                {taskAction === 'tts_alarm' && (
                  <div>
                    <label className="block text-[10px] text-zinc-400 mb-1">TTS 播报内容</label>
                    <input
                      type="text"
                      value={taskTts}
                      onChange={(e) => setTaskTts(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-zinc-950 border border-white/10 text-xs text-white"
                    />
                  </div>
                )}

                {/* Repeat Day Chips */}
                <div>
                  <label className="block text-[10px] text-zinc-400 mb-1.5">重复周期</label>
                  <div className="flex gap-1.5">
                    {DAYS.map((dayName, idx) => {
                      const isSel = taskRepeat.includes(idx);
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setTaskRepeat(prev =>
                              prev.includes(idx) ? prev.filter(d => d !== idx) : [...prev, idx]
                            );
                          }}
                          className={`w-7 h-7 rounded-lg text-xs font-bold transition flex items-center justify-center ${
                            isSel
                              ? 'bg-[#FF6700] text-white'
                              : 'bg-zinc-950 border border-white/10 text-zinc-400 hover:text-white'
                          }`}
                        >
                          {dayName}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateTask(false)}
                    className="px-3 py-1.5 rounded-xl text-xs text-zinc-400 hover:text-white"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-xl bg-[#FF6700] text-white text-xs font-bold hover:bg-[#ff771a] transition"
                  >
                    保存计划
                  </button>
                </div>
              </form>
            )}

            {/* Task List */}
            {tasks.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-zinc-900/40 border border-white/5 space-y-2">
                <Bell className="w-8 h-8 text-zinc-600 mx-auto" />
                <p className="text-xs text-zinc-400">暂无离线定时任务，点击上方「新建任务」添加</p>
              </div>
            ) : (
              <div className="space-y-2">
                {tasks.map(task => (
                  <div
                    key={task.id}
                    className={`p-3 rounded-2xl border transition flex items-center justify-between ${
                      task.isEnabled
                        ? 'bg-zinc-900/80 border-white/10'
                        : 'bg-zinc-950/40 border-white/5 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleToggleTask(task.id)}
                        className={`w-8 h-8 rounded-xl flex items-center justify-center transition ${
                          task.isEnabled
                            ? 'bg-[#FF6700]/20 text-[#FF6700] border border-[#FF6700]/40'
                            : 'bg-zinc-800 text-zinc-500'
                        }`}
                      >
                        <Clock className="w-4 h-4" />
                      </button>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white">{task.targetTime || '即时'}</span>
                          <span className="text-xs text-zinc-200 font-medium">{task.title}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                            {task.action === 'pause' ? '休眠暂停' : (task.action === 'tts_alarm' ? '语音闹钟' : '播歌')}
                          </span>
                        </div>
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                          设备: {task.targetDeviceName || '小爱音箱'} · 音量: {task.volume ?? 45}% · 
                          {task.repeatDays && task.repeatDays.length > 0 
                            ? ` 周${task.repeatDays.map(d => DAYS[d]).join('、')}`
                            : ' 单次'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        title="立即测试执行"
                        onClick={() => handleExecuteNow(task.id)}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-emerald-400 transition"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                      <button
                        title="删除任务"
                        onClick={() => handleDeleteTask(task.id)}
                        className="p-1.5 rounded-lg hover:bg-rose-500/20 text-zinc-500 hover:text-rose-400 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
