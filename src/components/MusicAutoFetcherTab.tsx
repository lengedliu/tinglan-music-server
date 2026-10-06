import React, { useState, useEffect, useCallback } from 'react';
import { 
  Download, 
  Sparkles, 
  HardDrive, 
  Play, 
  RotateCw, 
  Trash2, 
  Plus, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Music, 
  Sliders, 
  Volume2, 
  FolderSync, 
  Check, 
  Search,
  Radio,
  FileAudio,
  Bot
} from 'lucide-react';
import { apiFetch } from '../utils/api';
import { useTheme } from '../context/ThemeContext';

export interface FetcherTask {
  id: string;
  title: string;
  artist: string;
  album?: string;
  genre?: string;
  requestedBy: 'voice_ai' | 'web_user' | 'system';
  status: 'queued' | 'searching' | 'downloading' | 'tagging' | 'importing' | 'completed' | 'failed';
  progress: number;
  qualityPreference: 'lossless' | 'high' | 'standard';
  bitrate?: string;
  format?: string;
  fileSize?: string;
  filePath?: string;
  coverUrl?: string;
  lyricsSnippet?: string;
  downloadDriver: 'smart_auto' | 'stream_probe' | 'ytdlp_engine' | 'external_aria2';
  error?: string;
  createdAt: number;
  completedAt?: number;
}

export interface FetcherConfig {
  enabled: boolean;
  downloadMode: 'scheduler' | 'ai_skill';
  autoTriggerOnMissingVoiceQuery: boolean;
  defaultQuality: 'lossless' | 'high' | 'standard';
  storageSubfolderFormat: '{artist}/{album}' | '{artist}' | 'flat';
  maxConcurrentDownloads: number;
  notifySpeakerOnCompleted: boolean;
  driverPreference: 'smart_auto' | 'stream_probe' | 'ytdlp_engine' | 'external_aria2';
  targetStoragePath: string;
}

interface MusicAutoFetcherTabProps {
  onShowToast?: (title: string, message: string, type?: 'success' | 'error' | 'info') => void;
}

export const MusicAutoFetcherTab: React.FC<MusicAutoFetcherTabProps> = ({ onShowToast }) => {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  const [tasks, setTasks] = useState<FetcherTask[]>([]);
  const [stats, setStats] = useState({ total: 0, active: 0, completed: 0 });
  const [config, setConfig] = useState<FetcherConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // Add Task Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newArtist, setNewArtist] = useState('');
  const [newAlbum, setNewAlbum] = useState('');
  const [newQuality, setNewQuality] = useState<'lossless' | 'high'>('lossless');
  const [newDriver, setNewDriver] = useState<'smart_auto' | 'stream_probe' | 'ytdlp_engine'>('smart_auto');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Quick Preset Songs
  const presets = [
    { title: '笑看风云', artist: '郑少秋', album: '笑看风云 经典录音室原声' },
    { title: '晴天', artist: '周杰伦', album: '叶惠美 (Classic Hi-Res)' },
    { title: '青花瓷', artist: '周杰伦', album: '我很忙 (24bit 发烧重制)' },
    { title: '红日', artist: '李克勤', album: '红日 (粤语原声大碟)' },
    { title: '光辉岁月', artist: 'Beyond', album: '命运派对 (无损经典)' }
  ];

  const fetchTasks = useCallback(async () => {
    try {
      const res = await apiFetch('/api/fetcher/tasks');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setTasks(data.tasks || []);
          if (data.stats) setStats(data.stats);
        }
      }
    } catch (err: any) {
      console.warn('Failed to load fetcher tasks:', err);
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await apiFetch('/api/fetcher/config');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setConfig(data.config);
        }
      }
    } catch (err: any) {
      console.warn('Failed to load fetcher config:', err);
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    Promise.all([fetchTasks(), fetchConfig()]).finally(() => {
      setIsLoading(false);
    });

    // Auto-poll active tasks every 2.5 seconds
    const interval = setInterval(() => {
      fetchTasks();
    }, 2500);

    return () => clearInterval(interval);
  }, [fetchTasks, fetchConfig]);

  const handleCreateTask = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newTitle.trim()) {
      onShowToast?.('请输入歌曲名', '歌曲标题不能为空', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiFetch('/api/fetcher/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          artist: newArtist.trim() || '华语音乐',
          album: newAlbum.trim() || undefined,
          qualityPreference: newQuality,
          driver: newDriver
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          onShowToast?.('任务已添加', `《${data.task.title}》已加入下载队列并自动同步 NAS`, 'success');
          setIsAddModalOpen(false);
          setNewTitle('');
          setNewArtist('');
          setNewAlbum('');
          fetchTasks();
        } else {
          onShowToast?.('添加失败', data.error || '无法加入任务', 'error');
        }
      }
    } catch (err: any) {
      onShowToast?.('请求异常', err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApplyPreset = (p: typeof presets[0]) => {
    setNewTitle(p.title);
    setNewArtist(p.artist);
    setNewAlbum(p.album);
  };

  const handleRetry = async (id: string) => {
    try {
      const res = await apiFetch(`/api/fetcher/tasks/${id}/retry`, { method: 'POST' });
      if (res.ok) {
        onShowToast?.('重新调度', '任务已重新加入下载队列', 'info');
        fetchTasks();
      }
    } catch (err: any) {
      onShowToast?.('操作失败', err.message, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await apiFetch(`/api/fetcher/tasks/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setTasks(prev => prev.filter(t => t.id !== id));
        onShowToast?.('已删除', '下载任务已移除', 'info');
      }
    } catch (err: any) {
      onShowToast?.('操作失败', err.message, 'error');
    }
  };

  const handleClearCompleted = async () => {
    try {
      const res = await apiFetch('/api/fetcher/tasks/clear-completed', { method: 'POST' });
      if (res.ok) {
        fetchTasks();
        onShowToast?.('清理成功', '已清理已完成的任务记录', 'success');
      }
    } catch (err: any) {
      onShowToast?.('清理失败', err.message, 'error');
    }
  };

  const handleUpdateConfig = async (patch: Partial<FetcherConfig>) => {
    if (!config) return;
    setIsSavingConfig(true);
    try {
      const res = await apiFetch('/api/fetcher/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setConfig(data.config);
          onShowToast?.('配置已更新', '离线下载与 NAS 同步策略已生效', 'success');
        }
      }
    } catch (err: any) {
      onShowToast?.('保存失败', err.message, 'error');
    } finally {
      setIsSavingConfig(false);
    }
  };

  const getStatusBadge = (status: FetcherTask['status']) => {
    switch (status) {
      case 'queued':
        return (
          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-500/10 text-zinc-500 border border-zinc-500/20">
            <Clock className="w-3 h-3" />
            排队中
          </span>
        );
      case 'searching':
        return (
          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-500 border border-blue-500/20 animate-pulse">
            <Search className="w-3 h-3" />
            音源检索中
          </span>
        );
      case 'downloading':
        return (
          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20 animate-pulse">
            <Download className="w-3 h-3" />
            高速下载中
          </span>
        );
      case 'tagging':
        return (
          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/10 text-purple-500 border border-purple-500/20 animate-pulse">
            <Sparkles className="w-3 h-3" />
            元数据刮削中
          </span>
        );
      case 'importing':
        return (
          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 animate-pulse">
            <FolderSync className="w-3 h-3" />
            NAS 自动同步入库
          </span>
        );
      case 'completed':
        return (
          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            ✨ 已入库 NAS
          </span>
        );
      case 'failed':
        return (
          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-500/10 text-red-500 border border-red-500/20">
            <AlertCircle className="w-3 h-3" />
            下载失败
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className={`p-6 sm:p-7 rounded-3xl border transition-all ${
        isLight ? 'bg-white border-zinc-200 shadow-sm' : 'bg-zinc-900/40 border-white/10'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-zinc-100 dark:border-white/5">
          <div className="flex items-center gap-3.5">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/20">
              <Download className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className={`text-base sm:text-lg font-bold ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                  AI 离线下载调度中心
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  Music Auto-Fetcher
                </span>
              </div>
              <p className={`text-xs mt-1 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                当小爱音箱搜歌未在私有曲库找到时，自动智能检索下载高保真音频，配齐歌词封面并秒级同步落盘 NAS
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end md:self-auto">
            <button
              onClick={() => fetchTasks()}
              className={`p-2.5 rounded-xl border transition ${
                isLight ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-200' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-white/5'
              }`}
              title="刷新队列状态"
            >
              <RotateCw className="w-4 h-4" />
            </button>
            <button
              onClick={handleClearCompleted}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                isLight ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-200' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-white/5'
              }`}
            >
              清理已完成
            </button>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-zinc-950 transition shadow-md shadow-amber-500/20"
            >
              <Plus className="w-4 h-4" />
              <span>新建下载任务</span>
            </button>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-5">
          <div className={`p-3.5 rounded-2xl border ${isLight ? 'bg-zinc-50/80 border-zinc-200' : 'bg-zinc-950/40 border-white/5'}`}>
            <span className={`text-[11px] font-medium block ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>下载总任务</span>
            <span className={`text-xl font-bold mt-1 block ${isLight ? 'text-zinc-900' : 'text-white'}`}>{stats.total}</span>
          </div>
          <div className={`p-3.5 rounded-2xl border ${isLight ? 'bg-zinc-50/80 border-zinc-200' : 'bg-zinc-950/40 border-white/5'}`}>
            <span className={`text-[11px] font-medium block ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>进行中任务</span>
            <span className="text-xl font-bold mt-1 block text-amber-500">{stats.active}</span>
          </div>
          <div className={`p-3.5 rounded-2xl border ${isLight ? 'bg-zinc-50/80 border-zinc-200' : 'bg-zinc-950/40 border-white/5'}`}>
            <span className={`text-[11px] font-medium block ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>已同步入库 NAS</span>
            <span className="text-xl font-bold mt-1 block text-emerald-500">{stats.completed}</span>
          </div>
          <div className={`p-3.5 rounded-2xl border ${isLight ? 'bg-zinc-50/80 border-zinc-200' : 'bg-zinc-950/40 border-white/5'}`}>
            <span className={`text-[11px] font-medium block ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>目标落盘目录</span>
            <span className="text-[11px] font-mono truncate mt-1 block text-zinc-400" title={config?.targetStoragePath}>
              {config?.targetStoragePath || 'app/music'}
            </span>
          </div>
        </div>
      </div>

      {/* Master Toggle: Scheduler Center vs AI Skill Direct Mode */}
      <div className={`p-5 sm:p-6 rounded-3xl border transition-all ${
        isLight ? 'bg-white border-zinc-200 shadow-sm' : 'bg-zinc-900/40 border-white/10'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className={`p-3 rounded-2xl ${
              config?.enabled !== false 
                ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' 
                : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
            }`}>
              {config?.enabled !== false ? <Download className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className={`text-sm font-bold ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                  {config?.enabled !== false ? '⚡ 当前模式：启用下载调度中心 (Scheduler Mode)' : '🤖 当前模式：使用 AI 自身 Skill 下载 (AI Skill Mode)'}
                </h4>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  config?.enabled !== false
                    ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                    : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                }`}>
                  {config?.enabled !== false ? '● 调度中心启用' : '● AI Skill 直连'}
                </span>
              </div>
              <p className={`text-xs mt-1 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                {config?.enabled !== false 
                  ? '开启状态（推荐）：使用内置离线下载调度中心进行多任务流水线队列管理、进度监控与断点续传。' 
                  : '关闭状态：绕过调度中心排队，由 AI 核心 Skill 智能体直接调用探针秒级落盘并主动通知 NAS 挂载同步。'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
            <button
              onClick={() => handleUpdateConfig({ enabled: true, downloadMode: 'scheduler' })}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition border cursor-pointer ${
                config?.enabled !== false
                  ? 'bg-amber-500 text-zinc-950 border-amber-400 shadow-md shadow-amber-500/20 font-bold'
                  : isLight
                  ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-600 border-zinc-200'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border-white/5'
              }`}
            >
              开启调度中心
            </button>
            <button
              onClick={() => handleUpdateConfig({ enabled: false, downloadMode: 'ai_skill' })}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition border cursor-pointer ${
                config?.enabled === false
                  ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-500/20 font-bold'
                  : isLight
                  ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-600 border-zinc-200'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border-white/5'
              }`}
            >
              使用 AI Skill 下载
            </button>
          </div>
        </div>
      </div>

      {/* Task Queue List */}
      <div className={`p-6 sm:p-7 rounded-3xl border transition-all space-y-4 ${
        isLight ? 'bg-white border-zinc-200 shadow-sm' : 'bg-zinc-900/40 border-white/10'
      }`}>
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-white/5">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-amber-500 animate-pulse" />
            <h4 className={`text-sm font-bold ${isLight ? 'text-zinc-900' : 'text-white'}`}>
              下载与 NAS 同步队列 ({tasks.length})
            </h4>
          </div>
          <span className={`text-xs ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`}>
            每 2.5 秒自动与调度引擎保持同步
          </span>
        </div>

        {tasks.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-zinc-500/10 flex items-center justify-center mx-auto text-zinc-400">
              <FileAudio className="w-6 h-6" />
            </div>
            <p className={`text-sm font-medium ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
              当前队列为空，暂无正在下载的曲目
            </p>
            <p className={`text-xs ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`}>
              您可以点击右上角手动添加，或对小爱音箱说一首曲库没有的歌曲，系统会自动启动下载
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map(task => {
              const isActive = task.status === 'downloading' || task.status === 'searching' || task.status === 'tagging' || task.status === 'importing';
              return (
                <div
                  key={task.id}
                  className={`p-4 rounded-2xl border transition-all ${
                    isLight 
                      ? 'bg-zinc-50/70 border-zinc-200 hover:border-zinc-300' 
                      : 'bg-zinc-950/40 border-white/5 hover:border-white/10'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center text-amber-500 flex-shrink-0">
                        <Music className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h5 className={`text-sm font-bold ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                            《{task.title}》
                          </h5>
                          <span className={`text-xs ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                            - {task.artist}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-400">
                          <span>{task.album || '单曲精选'}</span>
                          <span>•</span>
                          <span className="font-mono text-amber-500/90">{task.format || 'FLAC 24bit'}</span>
                          {task.fileSize && (
                            <>
                              <span>•</span>
                              <span>{task.fileSize}</span>
                            </>
                          )}
                          <span>•</span>
                          <span className="capitalize">{task.requestedBy === 'voice_ai' ? '小爱音箱自动调度' : '网页手动加入'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-auto">
                      {getStatusBadge(task.status)}
                      <div className="flex items-center gap-1">
                        {task.status === 'failed' && (
                          <button
                            onClick={() => handleRetry(task.id)}
                            className="p-1.5 rounded-lg hover:bg-zinc-500/10 text-zinc-400 hover:text-white transition"
                            title="重试下载"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(task.id)}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-zinc-400 hover:text-red-400 transition"
                          title="删除任务"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar for Active or Completed Tasks */}
                  <div className="mt-3 space-y-1">
                    <div className="h-1.5 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-300 rounded-full ${
                          task.status === 'completed'
                            ? 'bg-emerald-500'
                            : task.status === 'failed'
                            ? 'bg-red-500'
                            : 'bg-gradient-to-r from-amber-500 to-orange-500'
                        }`}
                        style={{ width: `${task.progress}%` }}
                      />
                    </div>
                    {isActive && (
                      <div className="flex justify-between items-center text-[10px] text-zinc-400">
                        <span>正在进行自动化流水线调度...</span>
                        <span className="font-mono">{task.progress}%</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Settings & Automation Strategy */}
      <div className={`p-6 sm:p-7 rounded-3xl border transition-all space-y-5 ${
        isLight ? 'bg-white border-zinc-200 shadow-sm' : 'bg-zinc-900/40 border-white/10'
      }`}>
        <div className="flex items-center gap-2 pb-3 border-b border-zinc-100 dark:border-white/5">
          <Sliders className="w-4 h-4 text-amber-500" />
          <h4 className={`text-sm font-bold ${isLight ? 'text-zinc-900' : 'text-white'}`}>
            自动化下载策略与小爱音箱联动配置
          </h4>
        </div>

        {config && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Auto Trigger Toggle */}
            <div 
              onClick={() => handleUpdateConfig({ autoTriggerOnMissingVoiceQuery: !config.autoTriggerOnMissingVoiceQuery })}
              className={`p-4 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
                config.autoTriggerOnMissingVoiceQuery
                  ? isLight ? 'bg-amber-50/70 border-amber-200' : 'bg-amber-950/20 border-amber-500/30'
                  : isLight ? 'bg-zinc-50 border-zinc-200 opacity-60' : 'bg-zinc-900/20 border-white/5 opacity-60'
              }`}
            >
              <div className="space-y-1">
                <span className={`text-xs font-bold block ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                  小爱搜歌未命中时后台自动补库
                </span>
                <p className={`text-[11px] ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  当对小爱点播 NAS 未收录的歌名时，自动在后台加入下载队列并同步落盘
                </p>
              </div>
              <div className={`w-10 h-6 rounded-full transition-colors flex items-center p-1 ${
                config.autoTriggerOnMissingVoiceQuery ? 'bg-amber-500' : 'bg-zinc-300 dark:bg-zinc-700'
              }`}>
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  config.autoTriggerOnMissingVoiceQuery ? 'translate-x-4' : 'translate-x-0'
                }`} />
              </div>
            </div>

            {/* Speaker TTS Notification Toggle */}
            <div 
              onClick={() => handleUpdateConfig({ notifySpeakerOnCompleted: !config.notifySpeakerOnCompleted })}
              className={`p-4 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
                config.notifySpeakerOnCompleted
                  ? isLight ? 'bg-amber-50/70 border-amber-200' : 'bg-amber-950/20 border-amber-500/30'
                  : isLight ? 'bg-zinc-50 border-zinc-200 opacity-60' : 'bg-zinc-900/20 border-white/5 opacity-60'
              }`}
            >
              <div className="space-y-1">
                <span className={`text-xs font-bold block ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                  下载入库完成后小爱音箱轻声播报
                </span>
                <p className={`text-[11px] ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  单曲成功写入 NAS 并录入私有曲库后，音箱轻声提示“《歌名》已入库随时可播”
                </p>
              </div>
              <div className={`w-10 h-6 rounded-full transition-colors flex items-center p-1 ${
                config.notifySpeakerOnCompleted ? 'bg-amber-500' : 'bg-zinc-300 dark:bg-zinc-700'
              }`}>
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  config.notifySpeakerOnCompleted ? 'translate-x-4' : 'translate-x-0'
                }`} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Manual Add Task Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`w-full max-w-lg rounded-3xl border p-6 space-y-5 transition-all shadow-2xl ${
            isLight ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-white'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <Download className="w-5 h-5 text-amber-500" />
                <h4 className="text-base font-bold">新建音乐离线下载与入库任务</h4>
              </div>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Quick Presets */}
            <div className="space-y-2">
              <span className="text-[11px] font-semibold text-zinc-400 block">快捷测试经典曲目：</span>
              <div className="flex flex-wrap gap-1.5">
                {presets.map(p => (
                  <button
                    key={p.title}
                    type="button"
                    onClick={() => handleApplyPreset(p)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-medium border transition ${
                      newTitle === p.title
                        ? 'bg-amber-500 text-zinc-950 border-amber-400 font-bold'
                        : isLight
                        ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-200'
                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-white/5'
                    }`}
                  >
                    《{p.title}》 - {p.artist}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4 pt-1">
              <div>
                <label className="text-xs font-semibold text-zinc-400 block mb-1.5">
                  歌曲名称 <span className="text-amber-500">*</span>
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="例如：笑看风云、晴天、海阔天空"
                  className={`w-full px-3.5 py-2.5 rounded-xl text-xs border outline-none transition ${
                    isLight 
                      ? 'bg-zinc-50 border-zinc-200 focus:border-amber-500' 
                      : 'bg-zinc-950 border-zinc-800 focus:border-amber-500 text-white'
                  }`}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-zinc-400 block mb-1.5">歌手 / 艺术家</label>
                  <input
                    type="text"
                    value={newArtist}
                    onChange={e => setNewArtist(e.target.value)}
                    placeholder="例如：郑少秋、周杰伦"
                    className={`w-full px-3.5 py-2.5 rounded-xl text-xs border outline-none transition ${
                      isLight 
                        ? 'bg-zinc-50 border-zinc-200 focus:border-amber-500' 
                        : 'bg-zinc-950 border-zinc-800 focus:border-amber-500 text-white'
                    }`}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-zinc-400 block mb-1.5">专辑名称 (选填)</label>
                  <input
                    type="text"
                    value={newAlbum}
                    onChange={e => setNewAlbum(e.target.value)}
                    placeholder="例如：经典录音室母带"
                    className={`w-full px-3.5 py-2.5 rounded-xl text-xs border outline-none transition ${
                      isLight 
                        ? 'bg-zinc-50 border-zinc-200 focus:border-amber-500' 
                        : 'bg-zinc-950 border-zinc-800 focus:border-amber-500 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-zinc-400 block mb-1.5">音质规格目标</label>
                  <select
                    value={newQuality}
                    onChange={e => setNewQuality(e.target.value as any)}
                    className={`w-full px-3.5 py-2.5 rounded-xl text-xs border outline-none transition ${
                      isLight ? 'bg-zinc-50 border-zinc-200 text-zinc-900' : 'bg-zinc-950 border-zinc-800 text-white'
                    }`}
                  >
                    <option value="lossless">FLAC 24bit/96kHz 无损母带</option>
                    <option value="high">320kbps MP3 极高质量</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-zinc-400 block mb-1.5">检索下载驱动</label>
                  <select
                    value={newDriver}
                    onChange={e => setNewDriver(e.target.value as any)}
                    className={`w-full px-3.5 py-2.5 rounded-xl text-xs border outline-none transition ${
                      isLight ? 'bg-zinc-50 border-zinc-200 text-zinc-900' : 'bg-zinc-950 border-zinc-800 text-white'
                    }`}
                  >
                    <option value="smart_auto">智能自适应探针 (推荐)</option>
                    <option value="stream_probe">流媒体高保真探针</option>
                    <option value="ytdlp_engine">yt-dlp 开源抓轨引擎</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold border transition ${
                    isLight ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-200' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-white/5'
                  }`}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-zinc-950 transition shadow-md shadow-amber-500/20 disabled:opacity-50"
                >
                  {isSubmitting ? '正在加入...' : '立即加入下载并同步 NAS'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
