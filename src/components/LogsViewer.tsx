import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  FileText, 
  Search, 
  Trash2, 
  Download, 
  RefreshCw, 
  Pause, 
  Play, 
  Shield, 
  Radio, 
  Cpu, 
  AlertTriangle, 
  Info, 
  XCircle, 
  ChevronRight, 
  Terminal,
  Filter,
  Activity,
  Layers,
  Bug,
  HardDrive,
  Database,
  Scissors,
  CheckCircle2,
  AlertCircle,
  Clock,
  Copy
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAppEvents } from '../context/AppEventsContext';
import { apiFetch } from '../utils/api';
import { LogTerminalTab } from './speaker/LogTerminalTab';
import { CloudSnapshotModal } from './speaker/CloudSnapshotModal';
import { CastLog, XiaomiDevice } from '../types';

export interface LogEntry {
  id: string;
  timestamp: number;
  timeFormatted: string;
  category: 'cast' | 'audit' | 'automation' | 'system';
  level: 'info' | 'warn' | 'error' | 'debug';
  traceId?: string;
  title: string;
  message: string;
  details?: Record<string, any>;
  clientIp?: string;
  targetDid?: string;
  deviceName?: string;
  songId?: string;
}

export const LogsViewer: React.FC = () => {
  const { themeConfig, isLight } = useTheme();
  const { subscribe } = useAppEvents();

  // Mode Switcher: 'stream' (全链路日志流) vs 'speaker_terminal' (音箱与转码诊断池)
  const [viewMode, setViewMode] = useState<'stream' | 'speaker_terminal'>('stream');

  // Stream Log Engine State
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeCategory, setActiveCategory] = useState<'all' | 'cast' | 'audit' | 'automation' | 'system'>('all');
  const [activeLevel, setActiveLevel] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    total: number;
    cast: number;
    audit: number;
    automation: number;
    system: number;
    info: number;
    warn: number;
    error: number;
    storageEngine?: string;
    dbAvailable?: boolean;
    totalPersisted?: number;
    retentionLimit?: number;
  }>({
    total: 0, cast: 0, audit: 0, automation: 0, system: 0, info: 0, warn: 0, error: 0
  });

  // Speaker Terminal Data State (for embedded LogTerminalTab)
  const [castLogs, setCastLogs] = useState<CastLog[]>([]);
  const [devices, setDevices] = useState<XiaomiDevice[]>([]);
  const [isSnapshotModalOpen, setIsSnapshotModalOpen] = useState(false);

  // Floating Toast Notification state
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const showToast = (type: 'success' | 'error' | 'info', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const listContainerRef = useRef<HTMLDivElement>(null);

  // Fetch initial LogEngine entries & Stats
  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/logs?limit=300');
      if (res.ok) {
        const data = await res.json();
        if (data && data.success && Array.isArray(data.logs)) {
          setLogs(data.logs);
        }
      }
      const statsRes = await apiFetch('/api/logs/stats');
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        if (statsData && statsData.success && statsData.stats) {
          setStats(statsData.stats);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch logs:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch Speaker Cast Logs & Devices
  const fetchSpeakerTerminalData = async () => {
    try {
      const [logsRes, devRes] = await Promise.all([
        apiFetch('/api/miot/logs'),
        apiFetch('/api/miot/devices')
      ]);
      if (logsRes.ok) {
        const logsData = await logsRes.json();
        if (Array.isArray(logsData)) {
          setCastLogs(logsData);
        } else if (logsData && Array.isArray(logsData.logs)) {
          setCastLogs(logsData.logs);
        }
      }
      if (devRes.ok) {
        const devData = await devRes.json();
        if (Array.isArray(devData)) {
          setDevices(devData);
        } else if (devData && Array.isArray(devData.devices)) {
          setDevices(devData.devices);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch speaker terminal data:', err);
    }
  };

  useEffect(() => {
    fetchLogs();
    fetchSpeakerTerminalData();
  }, []);

  // Listen for real-time SSE new log events
  useEffect(() => {
    const unsubscribe = subscribe('log:new', (newLog: LogEntry) => {
      setLogs(prev => [newLog, ...prev.slice(0, 500)]);
      setStats(prev => ({
        ...prev,
        total: prev.total + 1,
        [newLog.category]: (prev[newLog.category] || 0) + 1,
        [newLog.level]: (prev[newLog.level] || 0) + 1
      }));
    });
    return () => unsubscribe();
  }, [subscribe]);

  // Filtered logs for Stream mode
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      if (activeCategory !== 'all' && log.category !== activeCategory) return false;
      if (activeLevel !== 'all' && log.level !== activeLevel) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          log.title.toLowerCase().includes(q) ||
          log.message.toLowerCase().includes(q) ||
          (log.traceId && log.traceId.toLowerCase().includes(q)) ||
          (log.deviceName && log.deviceName.toLowerCase().includes(q)) ||
          (log.clientIp && log.clientIp.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [logs, activeCategory, activeLevel, searchQuery]);

  const handleClearLogs = async () => {
    if (!window.confirm('确定要清空所有运行诊断与审计日志吗？')) return;
    try {
      await apiFetch('/api/logs', { method: 'DELETE' });
      setLogs([]);
      setStats(prev => ({ ...prev, total: 0, cast: 0, audit: 0, automation: 0, system: 0, info: 0, warn: 0, error: 0, totalPersisted: 0 }));
      showToast('success', '已清空所有运行诊断与审计日志');
    } catch (err) {
      showToast('error', '清空日志失败');
    }
  };

  const handlePruneLogs = async () => {
    if (!window.confirm('确认执行日志数据库修剪归档吗？系统将保留最近 2,000 条关键诊断记录并清理历史老旧数据以释放空间。')) return;
    try {
      const res = await apiFetch('/api/logs/prune', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keep: 2000 })
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.success) {
          showToast('success', data.message || '日志修剪成功');
          fetchLogs();
        }
      }
    } catch {
      showToast('error', '日志修剪失败');
    }
  };

  const handleExportDiagnostics = () => {
    window.open('/api/logs/export', '_blank');
  };

  const categoryBadges = {
    cast: { 
      label: '📡 投播/流诊断', 
      bg: isLight ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-sky-500/10 text-sky-400 border-sky-500/30' 
    },
    audit: { 
      label: '🛡️ 安全/操作审计', 
      bg: isLight ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
    },
    automation: { 
      label: '⚙️ 自动化调度', 
      bg: isLight ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-amber-500/10 text-amber-400 border-amber-500/30' 
    },
    system: { 
      label: '💻 系统核心', 
      bg: isLight ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-purple-500/10 text-purple-400 border-purple-500/30' 
    }
  };

  const levelBadges = {
    info: { 
      label: 'INFO', 
      icon: <Info className="w-3.5 h-3.5" />, 
      badge: isLight ? 'text-blue-700 bg-blue-50 border-blue-200' : 'text-blue-400 bg-blue-500/10 border-blue-500/30' 
    },
    warn: { 
      label: 'WARN', 
      icon: <AlertTriangle className="w-3.5 h-3.5" />, 
      badge: isLight ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-amber-400 bg-amber-500/10 border-amber-500/30' 
    },
    error: { 
      label: 'ERROR', 
      icon: <XCircle className="w-3.5 h-3.5" />, 
      badge: isLight ? 'text-rose-700 bg-rose-50 border-rose-200' : 'text-rose-400 bg-rose-500/10 border-rose-500/30' 
    },
    debug: { 
      label: 'DEBUG', 
      icon: <Terminal className="w-3.5 h-3.5" />, 
      badge: isLight ? 'text-zinc-700 bg-zinc-100 border-zinc-200' : 'text-zinc-400 bg-zinc-500/10 border-zinc-500/30' 
    }
  };

  return (
    <div className="w-full space-y-3.5 pb-2 relative">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-2xl border shadow-2xl flex items-center gap-3 transition-all duration-300 backdrop-blur-xl ${
          toastMessage.type === 'success'
            ? 'bg-emerald-950/90 text-emerald-100 border-emerald-500/50 shadow-emerald-950/50'
            : toastMessage.type === 'error'
            ? 'bg-rose-950/90 text-rose-100 border-rose-500/50 shadow-rose-950/50'
            : 'bg-amber-950/90 text-amber-100 border-amber-500/50 shadow-amber-950/50'
        }`}>
          <div className="p-1.5 rounded-xl bg-white/10 shrink-0">
            {toastMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-300" /> :
             toastMessage.type === 'error' ? <AlertCircle className="w-5 h-5 text-rose-300" /> :
             <RefreshCw className="w-5 h-5 text-amber-300 animate-spin" />}
          </div>
          <span className="text-xs font-semibold leading-relaxed">{toastMessage.text}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="p-1 hover:bg-white/10 rounded-lg transition text-xs opacity-70 hover:opacity-100 cursor-pointer ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header Title & Mode Switcher */}
      <div className={`flex flex-col md:flex-row md:items-center justify-between gap-3 border-b pb-3.5 ${
        isLight ? 'border-zinc-200' : 'border-white/10'
      }`}>
        <div>
          <h1 className={`text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2.5 flex-wrap ${
            isLight ? 'text-zinc-900' : 'text-white'
          }`}>
            <Terminal className="w-6 h-6" style={{ color: themeConfig.primaryColor }} />
            <span>全链路诊断与日志中心</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-medium flex items-center gap-1.5" title="SQLite 3 (WASM) 数据库持久化存储与 B-Tree 索引加速">
              <Database className="w-3.5 h-3.5 text-emerald-500" />
              <span>SQLite 3 数据库驱动已生效 {stats.totalPersisted ? `(${stats.totalPersisted} 条持久化)` : ''}</span>
            </span>
          </h1>
          <p className={`text-xs mt-0.5 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
            融合全链路 SSE 诊断日志流、FFmpeg 转码信号量保护池、缓存 LRU 清理与智能音箱握手归因
          </p>
        </div>

        {/* View Mode Switcher Buttons */}
        <div className={`flex items-center gap-1.5 p-1.5 rounded-2xl border backdrop-blur-md shrink-0 ${
          isLight ? 'bg-zinc-100 border-zinc-200' : 'bg-zinc-900/90 border-white/10'
        }`}>
          <button
            onClick={() => setViewMode('stream')}
            className={`flex items-center gap-2 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              viewMode === 'stream'
                ? 'bg-emerald-500 text-zinc-950 shadow-md'
                : isLight ? 'text-zinc-600 hover:text-zinc-900 hover:bg-white/60' : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>全链路日志流 (LogEngine)</span>
          </button>

          <button
            onClick={() => {
              setViewMode('speaker_terminal');
              fetchSpeakerTerminalData();
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              viewMode === 'speaker_terminal'
                ? 'bg-emerald-500 text-zinc-950 shadow-md'
                : isLight ? 'text-zinc-600 hover:text-zinc-900 hover:bg-white/60' : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <HardDrive className="w-4 h-4" />
            <span>音箱与转码诊断池 (FFmpeg Pool)</span>
          </button>
        </div>
      </div>

      {/* VIEW MODE 1: Full-link Stream Logs */}
      {viewMode === 'stream' && (
        <div className="space-y-3">
          {/* Action Toolbar */}
          <div className={`flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-2 rounded-2xl border backdrop-blur-md transition-colors ${
            isLight ? 'bg-white/90 border-zinc-200 shadow-sm' : 'bg-zinc-900/60 border-white/5'
          }`}>
            {/* Category Buttons */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setActiveCategory('all')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition whitespace-nowrap cursor-pointer ${
                  activeCategory === 'all'
                    ? isLight ? 'bg-zinc-900 text-white shadow-sm' : 'bg-zinc-800 text-white shadow-sm border border-zinc-700'
                    : isLight ? 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
              >
                全部 ({stats.total})
              </button>
              <button
                onClick={() => setActiveCategory('cast')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium transition whitespace-nowrap cursor-pointer ${
                  activeCategory === 'cast'
                    ? isLight ? 'bg-sky-50 text-sky-700 border border-sky-300 font-semibold' : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                    : isLight ? 'text-zinc-600 hover:text-sky-600 hover:bg-sky-50/50' : 'text-zinc-400 hover:text-sky-400 hover:bg-zinc-800/50'
                }`}
              >
                <Radio className="w-3.5 h-3.5 text-sky-500" />
                <span>投播与流诊断 ({stats.cast})</span>
              </button>
              <button
                onClick={() => setActiveCategory('audit')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium transition whitespace-nowrap cursor-pointer ${
                  activeCategory === 'audit'
                    ? isLight ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 font-semibold' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : isLight ? 'text-zinc-600 hover:text-emerald-600 hover:bg-emerald-50/50' : 'text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800/50'
                }`}
              >
                <Shield className="w-3.5 h-3.5 text-emerald-500" />
                <span>安全审计 ({stats.audit})</span>
              </button>
              <button
                onClick={() => setActiveCategory('automation')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium transition whitespace-nowrap cursor-pointer ${
                  activeCategory === 'automation'
                    ? isLight ? 'bg-amber-50 text-amber-700 border border-amber-300 font-semibold' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : isLight ? 'text-zinc-600 hover:text-amber-600 hover:bg-amber-50/50' : 'text-zinc-400 hover:text-amber-400 hover:bg-zinc-800/50'
                }`}
              >
                <Cpu className="w-3.5 h-3.5 text-amber-500" />
                <span>自动化调度 ({stats.automation})</span>
              </button>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setAutoScroll(!autoScroll)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                  autoScroll
                    ? isLight ? 'bg-emerald-50 text-emerald-700 border-emerald-300 font-semibold' : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                    : isLight ? 'bg-zinc-100 text-zinc-700 border-zinc-200 hover:bg-zinc-200' : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
                }`}
                title={autoScroll ? '实时流模式 (新日志将自动展示)' : '已暂停自动更新'}
              >
                {autoScroll ? <Play className="w-3.5 h-3.5 fill-emerald-500 text-emerald-500" /> : <Pause className="w-3.5 h-3.5" />}
                <span>{autoScroll ? '实时接收' : '暂停'}</span>
              </button>

              <button
                onClick={fetchLogs}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                  isLight ? 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50' : 'bg-zinc-900 text-zinc-300 border-zinc-700/80 hover:bg-zinc-800'
                }`}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>刷新</span>
              </button>

              <button
                onClick={handleExportDiagnostics}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                  isLight ? 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100' : 'bg-sky-500/15 text-sky-400 border-sky-500/30 hover:bg-sky-500/25'
                }`}
              >
                <Download className="w-3.5 h-3.5" />
                <span>导出报告</span>
              </button>

              <button
                onClick={handlePruneLogs}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                  isLight ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' : 'bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25'
                }`}
                title="修剪老旧日志，保留最近 2000 条"
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>修剪归档</span>
              </button>

              <button
                onClick={handleClearLogs}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                  isLight ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100' : 'bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>清空</span>
              </button>
            </div>
          </div>

          {/* Level Filter & Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className={`flex items-center p-1 rounded-xl border text-xs w-fit ${
              isLight ? 'bg-white border-zinc-200 shadow-sm' : 'bg-zinc-950 border-zinc-800'
            }`}>
              <Filter className="w-3.5 h-3.5 text-zinc-500 ml-2 mr-1" />
              <select
                value={activeLevel}
                onChange={(e) => setActiveLevel(e.target.value as any)}
                className={`bg-transparent focus:outline-none pr-2 cursor-pointer font-medium ${
                  isLight ? 'text-zinc-800' : 'text-zinc-300'
                }`}
              >
                <option value="all" className={isLight ? 'bg-white text-zinc-900' : 'bg-zinc-900'}>全部级别</option>
                <option value="info" className={isLight ? 'bg-white text-blue-600' : 'bg-zinc-900 text-blue-400'}>INFO 信息</option>
                <option value="warn" className={isLight ? 'bg-white text-amber-600' : 'bg-zinc-900 text-amber-400'}>WARN 警告</option>
                <option value="error" className={isLight ? 'bg-white text-rose-600' : 'bg-zinc-900 text-rose-400'}>ERROR 错误</option>
              </select>
            </div>

            <div className="relative flex-1 sm:max-w-md">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索 Trace ID、IP、音箱名或关键字..."
                className={`w-full border rounded-xl pl-8 pr-3 py-1.5 text-xs focus:outline-none transition-colors ${
                  isLight
                    ? 'bg-white border-zinc-200 text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 shadow-sm'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-200 placeholder-zinc-500 focus:border-zinc-700'
                }`}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 ${isLight ? 'text-zinc-400 hover:text-zinc-600' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  ×
                </button>
              )}
            </div>
          </div>

          {/* Log Console Window - Matches LogTerminalTab styling */}
          <div className={`rounded-2xl overflow-hidden border flex flex-col transition-colors duration-200 ${
            isLight
              ? 'bg-white/90 border-zinc-200 shadow-sm'
              : 'bg-zinc-900/40 border-white/10 shadow-2xl backdrop-blur-md'
          }`}>
            {/* Terminal Header Bar */}
            <div className={`px-4 py-2.5 border-b flex items-center justify-between text-xs shrink-0 transition-colors ${
              isLight
                ? 'bg-zinc-50/90 border-zinc-200 text-zinc-600'
                : 'bg-zinc-900/80 border-white/10 text-zinc-400'
            }`}>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block shadow-sm" />
                <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block shadow-sm" />
                <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block shadow-sm" />
                <span className={`font-mono ml-2 font-semibold ${isLight ? 'text-zinc-700' : 'text-zinc-300'}`}>
                  /var/log/tinglan_diagnostics.log
                </span>
              </div>
              <div className={`font-mono text-[11px] ${isLight ? 'text-zinc-500 font-medium' : 'text-zinc-500'}`}>
                显示 {filteredLogs.length} 条日志
              </div>
            </div>

            {/* Logs List Container - Stretches dynamically down to bottom player */}
            <div ref={listContainerRef} className={`p-2 sm:p-3 space-y-2.5 h-[calc(100vh-365px)] min-h-[480px] overflow-y-auto font-sans text-xs ${
              isLight ? 'bg-zinc-50/50' : 'bg-transparent'
            }`}>
              {loading && logs.length === 0 ? (
                <div className={`h-full min-h-[300px] flex flex-col items-center justify-center py-16 text-center ${
                  isLight ? 'text-zinc-500' : 'text-zinc-500'
                }`}>
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-zinc-400" />
                  <span>正在装载全链路诊断日志流...</span>
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className={`h-full min-h-[300px] flex flex-col items-center justify-center py-16 text-center ${
                  isLight ? 'text-zinc-500' : 'text-zinc-500'
                }`}>
                  <FileText className="w-8 h-8 mx-auto mb-2 text-zinc-400" />
                  <span>暂无匹配的运行诊断与审计日志</span>
                </div>
              ) : (
                filteredLogs.map(log => {
                  const categoryInfo = categoryBadges[log.category] || { label: log.category, bg: 'bg-zinc-800 text-zinc-400 border-zinc-700' };
                  const levelInfo = levelBadges[log.level] || levelBadges.info;
                  const isExpanded = expandedLogId === log.id;

                  // Left accent indicator color
                  const accentColor = 
                    log.level === 'error' ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]' :
                    log.level === 'warn' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]' :
                    log.level === 'debug' ? 'bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.6)]' :
                    'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]';

                  // Card styling - light and dark modes
                  const cardBg = isExpanded
                    ? isLight
                      ? 'bg-amber-500/5 border-amber-500/40 shadow-md ring-1 ring-amber-500/20'
                      : 'bg-zinc-900/90 border-amber-500/40 shadow-lg ring-1 ring-amber-500/20'
                    : log.level === 'error'
                    ? isLight
                      ? 'bg-rose-50/80 border-rose-200 hover:border-rose-400 hover:bg-rose-50 shadow-sm'
                      : 'bg-rose-950/15 border-rose-500/30 hover:border-rose-500/50 hover:bg-rose-950/25'
                    : log.level === 'warn'
                    ? isLight
                      ? 'bg-amber-50/80 border-amber-200 hover:border-amber-400 hover:bg-amber-50 shadow-sm'
                      : 'bg-amber-950/15 border-amber-500/30 hover:border-amber-500/50 hover:bg-amber-950/25'
                    : isLight
                    ? 'bg-white border-zinc-200 hover:border-zinc-300 hover:shadow-md shadow-sm'
                    : 'bg-zinc-900/50 border-white/5 hover:bg-zinc-900/80 hover:border-white/10';

                  // Structured parameter pills parsing from message
                  const hasPipes = log.message.includes(' | ');
                  const pills = hasPipes ? log.message.split(' | ').map(p => p.trim()).filter(Boolean) : [];

                  return (
                    <div 
                      key={log.id} 
                      className={`relative rounded-xl border transition-all duration-200 cursor-pointer overflow-hidden group p-3.5 sm:p-4 pl-4 sm:pl-5 ${cardBg}`}
                      onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                    >
                      {/* 1. Left Vertical Status Accent Bar */}
                      <div className={`absolute left-0 top-0 bottom-0 w-1 sm:w-1.5 ${accentColor}`} />

                      {/* Tier 1: Meta Header Row */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        {/* Left: Time, Level, Category, TraceID */}
                        <div className="flex items-center gap-2 flex-wrap font-mono">
                          <span className={`text-xs font-medium select-none flex items-center gap-1 ${
                            isLight ? 'text-zinc-500' : 'text-zinc-400'
                          }`}>
                            <Clock className={`w-3 h-3 shrink-0 ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`} />
                            <span className={isLight ? 'text-zinc-700 font-semibold' : 'text-zinc-200'}>
                              {log.timeFormatted.split('.')[0] || log.timeFormatted}
                            </span>
                            {log.timeFormatted.includes('.') && (
                              <span className={`text-[10px] ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`}>
                                .{log.timeFormatted.split('.')[1]}
                              </span>
                            )}
                          </span>
                          
                          <span className={`px-2 py-0.5 text-[10px] rounded font-bold border flex items-center gap-1 ${levelInfo.badge}`}>
                            {levelInfo.icon}
                            <span>{levelInfo.label}</span>
                          </span>

                          <span className={`px-2.5 py-0.5 text-[10px] rounded font-medium border ${categoryInfo.bg}`}>
                            {categoryInfo.label}
                          </span>

                          {log.traceId && (
                            <span 
                              onClick={(e) => {
                                e.stopPropagation();
                                setSearchQuery(log.traceId!);
                              }}
                              title="点击按此 Trace ID 过滤同一请求全链路日志"
                              className={`px-2 py-0.5 text-[10px] rounded border font-mono transition cursor-pointer ${
                                isLight
                                  ? 'bg-zinc-100 text-zinc-600 hover:text-amber-600 hover:border-amber-400 border-zinc-200'
                                  : 'bg-zinc-950/80 text-zinc-400 hover:text-amber-300 hover:border-amber-500/50 border-zinc-800'
                              }`}
                            >
                              #{log.traceId}
                            </span>
                          )}
                        </div>

                        {/* Right: Device Name, IP, Quick Copy & Expand Chevron */}
                        <div className="flex items-center gap-2 text-xs text-zinc-400 shrink-0">
                          {log.deviceName && (
                            <span className={`border px-2.5 py-0.5 rounded text-[11px] font-medium flex items-center gap-1 ${
                              isLight ? 'bg-zinc-100 border-zinc-200 text-zinc-700' : 'bg-zinc-950/80 border-white/5 text-zinc-300'
                            }`}>
                              📱 {log.deviceName}
                            </span>
                          )}
                          {log.clientIp && (
                            <span className={`border px-2 py-0.5 rounded text-[10px] font-mono ${
                              isLight ? 'bg-zinc-100 border-zinc-200 text-zinc-600' : 'bg-zinc-950/80 border-white/5 text-zinc-400'
                            }`}>
                              🌐 {log.clientIp}
                            </span>
                          )}

                          {/* Quick Copy Button on Hover */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard?.writeText(`[${log.timeFormatted}] [${log.level.toUpperCase()}] ${log.title}\n${log.message}`);
                              showToast('success', '已复制日志到剪贴板');
                            }}
                            title="复制本条日志"
                            className={`p-1 rounded transition opacity-70 group-hover:opacity-100 cursor-pointer ${
                              isLight ? 'hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700' : 'hover:bg-white/10 text-zinc-500 hover:text-zinc-200'
                            }`}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>

                          <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${
                            isExpanded ? 'rotate-90 text-amber-500' : isLight ? 'text-zinc-400 group-hover:text-zinc-700' : 'text-zinc-500 group-hover:text-zinc-300'
                          }`} />
                        </div>
                      </div>

                      {/* Tier 2: Event Title */}
                      <div className={`mt-2 text-sm tracking-tight flex items-center gap-2 ${
                        isLight ? 'text-zinc-900 font-semibold' : 'text-zinc-100 font-semibold'
                      }`}>
                        <span>{log.title}</span>
                      </div>

                      {/* Tier 3: Body & Structured Parameter Pills */}
                      {hasPipes ? (
                        <div className="mt-2.5 flex flex-wrap gap-1.5 items-center">
                          {pills.map((pill, idx) => {
                            const isSuccess = pill.includes('成功') || pill.includes('200') || pill.includes('OK');
                            const isFailure = pill.includes('失败') || pill.includes('异常') || pill.includes('错误') || pill.includes('超时');
                            const isWarning = pill.includes('重试') || pill.includes('警告') || pill.includes('提示');
                            
                            const pillStyle = 
                              isFailure ? (isLight ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-rose-500/10 border-rose-500/30 text-rose-300') :
                              isWarning ? (isLight ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-amber-500/10 border-amber-500/30 text-amber-300') :
                              isSuccess ? (isLight ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300') :
                              (isLight ? 'bg-zinc-100 border-zinc-200 text-zinc-700' : 'bg-zinc-950/70 border-white/5 text-zinc-300');

                            return (
                              <span
                                key={idx}
                                className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono leading-tight ${pillStyle}`}
                              >
                                {pill}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <p className={`mt-2 font-sans leading-relaxed text-xs ${
                          isLight ? 'text-zinc-600' : 'text-zinc-300'
                        }`}>
                          {log.message}
                        </p>
                      )}

                      {/* Expanded JSON Context Drawer */}
                      {isExpanded && log.details && (
                        <div className={`mt-3.5 pt-3 border-t animate-fade-in ${isLight ? 'border-zinc-200' : 'border-white/5'}`}>
                          <div className={`p-3 rounded-xl border text-[11px] overflow-x-auto relative ${
                            isLight ? 'bg-zinc-900 text-emerald-400 border-zinc-800' : 'bg-black/90 text-emerald-400 border-zinc-800'
                          }`}>
                            <div className="flex items-center justify-between text-zinc-500 text-[10px] mb-1.5 font-semibold uppercase tracking-wider">
                              <span>DEBUG METADATA / CONTEXT:</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard?.writeText(JSON.stringify(log.details, null, 2));
                                  showToast('success', '已复制 JSON 元数据');
                                }}
                                className="hover:text-zinc-200 transition text-[10px] flex items-center gap-1 font-mono cursor-pointer"
                              >
                                <Copy className="w-3 h-3" />
                                <span>复制 JSON</span>
                              </button>
                            </div>
                            <pre className="font-mono whitespace-pre-wrap leading-relaxed">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* VIEW MODE 2: Speaker & Transcode Terminal (LogTerminalTab embedded) */}
      {viewMode === 'speaker_terminal' && (
        <div className="animate-fade-in">
          <LogTerminalTab
            castLogs={castLogs}
            devices={devices}
            onOpenSnapshotModal={() => setIsSnapshotModalOpen(true)}
            onSwitchToDevicesTab={() => setViewMode('stream')}
          />
        </div>
      )}

      {/* Cloud Device Query Raw Snapshots Inspector Modal */}
      <CloudSnapshotModal
        isOpen={isSnapshotModalOpen}
        onClose={() => setIsSnapshotModalOpen(false)}
      />
    </div>
  );
};
