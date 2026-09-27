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
  Scissors
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
    } catch (err) {
      alert('清空日志失败');
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
          alert(data.message || '日志修剪成功');
          fetchLogs();
        }
      }
    } catch {
      alert('日志修剪失败');
    }
  };

  const handleExportDiagnostics = () => {
    window.open('/api/logs/export', '_blank');
  };

  const categoryBadges = {
    cast: { label: '📡 投播/流诊断', bg: 'bg-sky-500/10 text-sky-400 border-sky-500/30' },
    audit: { label: '🛡️ 安全/操作审计', bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
    automation: { label: '⚙️ 自动化调度', bg: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
    system: { label: '💻 系统核心', bg: 'bg-purple-500/10 text-purple-400 border-purple-500/30' }
  };

  const levelBadges = {
    info: { label: 'INFO', icon: <Info className="w-3.5 h-3.5 text-blue-400" />, badge: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
    warn: { label: 'WARN', icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />, badge: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
    error: { label: 'ERROR', icon: <XCircle className="w-3.5 h-3.5 text-rose-400" />, badge: 'text-rose-400 bg-rose-500/10 border-rose-500/30' },
    debug: { label: 'DEBUG', icon: <Terminal className="w-3.5 h-3.5 text-zinc-400" />, badge: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/30' }
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 space-y-6 pb-24">
      {/* Header Title & Mode Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5 flex-wrap">
            <Terminal className="w-6 h-6" style={{ color: themeConfig.primaryColor }} />
            <span>全链路诊断与日志中心</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-medium flex items-center gap-1.5" title="SQLite 3 (WASM) 数据库持久化存储与 B-Tree 索引加速">
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              <span>SQLite 3 数据库驱动已生效 {stats.totalPersisted ? `(${stats.totalPersisted} 条持久化)` : ''}</span>
            </span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            融合全链路 SSE 诊断日志流、FFmpeg 转码信号量保护池、缓存 LRU 清理与智能音箱握手归因
          </p>
        </div>

        {/* View Mode Switcher Buttons */}
        <div className="flex items-center gap-1.5 bg-zinc-900/90 p-1.5 rounded-2xl border border-white/10 backdrop-blur-md">
          <button
            onClick={() => setViewMode('stream')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              viewMode === 'stream'
                ? 'bg-emerald-500 text-zinc-950 shadow-md'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
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
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              viewMode === 'speaker_terminal'
                ? 'bg-emerald-500 text-zinc-950 shadow-md'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <HardDrive className="w-4 h-4" />
            <span>音箱与转码诊断池 (FFmpeg Pool)</span>
          </button>
        </div>
      </div>

      {/* VIEW MODE 1: Full-link Stream Logs */}
      {viewMode === 'stream' && (
        <div className="space-y-6">
          {/* Action Toolbar */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-zinc-900/60 p-2.5 rounded-2xl border border-white/5 backdrop-blur-md">
            {/* Category Buttons */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setActiveCategory('all')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition whitespace-nowrap cursor-pointer ${
                  activeCategory === 'all'
                    ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
              >
                全部 ({stats.total})
              </button>
              <button
                onClick={() => setActiveCategory('cast')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium transition whitespace-nowrap cursor-pointer ${
                  activeCategory === 'cast'
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                    : 'text-zinc-400 hover:text-sky-400 hover:bg-zinc-800/50'
                }`}
              >
                <Radio className="w-3.5 h-3.5 text-sky-400" />
                <span>投播与流诊断 ({stats.cast})</span>
              </button>
              <button
                onClick={() => setActiveCategory('audit')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium transition whitespace-nowrap cursor-pointer ${
                  activeCategory === 'audit'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800/50'
                }`}
              >
                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                <span>安全审计 ({stats.audit})</span>
              </button>
              <button
                onClick={() => setActiveCategory('automation')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium transition whitespace-nowrap cursor-pointer ${
                  activeCategory === 'automation'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'text-zinc-400 hover:text-amber-400 hover:bg-zinc-800/50'
                }`}
              >
                <Cpu className="w-3.5 h-3.5 text-amber-400" />
                <span>自动化调度 ({stats.automation})</span>
              </button>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setAutoScroll(!autoScroll)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                  autoScroll
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                    : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
                }`}
                title={autoScroll ? '实时流模式 (新日志将自动展示)' : '已暂停自动更新'}
              >
                {autoScroll ? <Play className="w-3.5 h-3.5 fill-emerald-400" /> : <Pause className="w-3.5 h-3.5" />}
                <span>{autoScroll ? '实时接收' : '暂停'}</span>
              </button>

              <button
                onClick={fetchLogs}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 text-zinc-300 border border-zinc-700/80 hover:bg-zinc-800 transition cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>刷新</span>
              </button>

              <button
                onClick={handleExportDiagnostics}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-500/15 text-sky-400 border border-sky-500/30 hover:bg-sky-500/25 transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>导出报告</span>
              </button>

              <button
                onClick={handlePruneLogs}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 transition cursor-pointer"
                title="修剪老旧日志，保留最近 2000 条"
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>修剪归档</span>
              </button>

              <button
                onClick={handleClearLogs}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20 transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>清空</span>
              </button>
            </div>
          </div>

          {/* Level Filter & Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center bg-zinc-950 p-1 rounded-xl border border-zinc-800 text-xs w-fit">
              <Filter className="w-3.5 h-3.5 text-zinc-500 ml-2 mr-1" />
              <select
                value={activeLevel}
                onChange={(e) => setActiveLevel(e.target.value as any)}
                className="bg-transparent text-zinc-300 focus:outline-none pr-2 cursor-pointer font-medium"
              >
                <option value="all" className="bg-zinc-900">全部级别</option>
                <option value="info" className="bg-zinc-900 text-blue-400">INFO 信息</option>
                <option value="warn" className="bg-zinc-900 text-amber-400">WARN 警告</option>
                <option value="error" className="bg-zinc-900 text-rose-400">ERROR 错误</option>
              </select>
            </div>

            <div className="relative flex-1 sm:max-w-md">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索 Trace ID、IP、音箱名或关键字..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          {/* Log Console Window */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
            {/* Terminal Header Bar */}
            <div className="bg-zinc-900/80 px-4 py-2.5 border-b border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block" />
                <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
                <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
                <span className="font-mono text-zinc-400 ml-2 font-semibold">/var/log/tinglan_diagnostics.log</span>
              </div>
              <div className="font-mono text-[11px] text-zinc-500">
                显示 {filteredLogs.length} 条日志
              </div>
            </div>

            {/* Logs List Container */}
            <div ref={listContainerRef} className="divide-y divide-zinc-900/80 max-h-[680px] overflow-y-auto font-mono text-xs">
              {loading && logs.length === 0 ? (
                <div className="py-16 text-center text-zinc-500">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-zinc-600" />
                  <span>正在装载全链路诊断日志流...</span>
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="py-16 text-center text-zinc-500">
                  <FileText className="w-8 h-8 mx-auto mb-2 text-zinc-700" />
                  <span>暂无匹配的运行诊断与审计日志</span>
                </div>
              ) : (
                filteredLogs.map(log => {
                  const categoryInfo = categoryBadges[log.category] || { label: log.category, bg: 'bg-zinc-800 text-zinc-400 border-zinc-700' };
                  const levelInfo = levelBadges[log.level] || levelBadges.info;
                  const isExpanded = expandedLogId === log.id;

                  return (
                    <div 
                      key={log.id} 
                      className={`p-3 hover:bg-zinc-900/60 transition cursor-pointer ${
                        isExpanded ? 'bg-zinc-900/80' : ''
                      }`}
                      onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        {/* Left: Time, Level, Category, Title */}
                        <div className="flex items-center gap-2 flex-wrap font-mono">
                          <span className="text-zinc-500 text-[11px] select-none">{log.timeFormatted}</span>
                          
                          <span className={`px-1.5 py-0.5 text-[10px] rounded font-bold border ${levelInfo.badge}`}>
                            {levelInfo.label}
                          </span>

                          <span className={`px-2 py-0.5 text-[10px] rounded font-medium border ${categoryInfo.bg}`}>
                            {categoryInfo.label}
                          </span>

                          {log.traceId && (
                            <span 
                              onClick={(e) => {
                                e.stopPropagation();
                                setSearchQuery(log.traceId!);
                              }}
                              title="点击按此 Trace ID 过滤同一请求全链路日志"
                              className="px-1.5 py-0.5 text-[10px] rounded bg-zinc-900 text-zinc-400 hover:text-amber-300 hover:border-amber-500/50 border border-zinc-800 font-mono transition cursor-pointer"
                            >
                              #{log.traceId}
                            </span>
                          )}

                          <span className="font-semibold text-zinc-200 ml-1">{log.title}</span>
                        </div>

                        {/* Right: Meta Info Pills (Device, IP) & Accordion Chevron */}
                        <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                          {log.deviceName && (
                            <span className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 py-0.5 rounded text-[10px]">
                              📱 {log.deviceName}
                            </span>
                          )}
                          {log.clientIp && (
                            <span className="bg-zinc-900 border border-zinc-800 text-zinc-400 px-2 py-0.5 rounded text-[10px]">
                              🌐 {log.clientIp}
                            </span>
                          )}
                          <ChevronRight className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${isExpanded ? 'rotate-90 text-amber-400' : ''}`} />
                        </div>
                      </div>

                      {/* Message body */}
                      <p className="mt-1.5 text-zinc-300 font-sans leading-relaxed text-xs pl-1">
                        {log.message}
                      </p>

                      {/* Expanded JSON details */}
                      {isExpanded && log.details && (
                        <div className="mt-3 p-3 bg-black/80 rounded-xl border border-zinc-800 text-[11px] text-emerald-400 overflow-x-auto">
                          <div className="text-zinc-500 text-[10px] mb-1 font-semibold uppercase tracking-wider">
                            DEBUG METADATA / CONTEXT:
                          </div>
                          <pre className="font-mono whitespace-pre-wrap leading-relaxed">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
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
