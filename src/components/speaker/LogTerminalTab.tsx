import React, { useState, useEffect } from 'react';
import { 
  Terminal, 
  Bug, 
  Download, 
  X, 
  Check, 
  Copy, 
  Radio, 
  ExternalLink, 
  Plus,
  Cpu,
  ShieldCheck,
  Zap,
  Activity,
  Trash2,
  RefreshCw
} from 'lucide-react';
import { CastLog, XiaomiDevice } from '../../types';
import { useTheme } from '../../context/ThemeContext';

interface LogTerminalTabProps {
  castLogs: CastLog[];
  devices: XiaomiDevice[];
  onAddDevice?: (dev: { name: string; ip: string; did?: string; model?: string; hardware?: string; token?: string }) => void;
  onOpenSnapshotModal: () => void;
  onSwitchToDevicesTab: () => void;
}

export const LogTerminalTab: React.FC<LogTerminalTabProps> = ({
  castLogs,
  devices,
  onAddDevice,
  onOpenSnapshotModal,
  onSwitchToDevicesTab
}) => {
  const { isLight } = useTheme();
  const [logTypeFilter, setLogTypeFilter] = useState<'all' | 'cast' | 'sync' | 'error'>('all');
  const [logSearchTerm, setLogSearchTerm] = useState('');
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [transcodeInfo, setTranscodeInfo] = useState<{
    semaphore?: {
      maxConcurrency: number;
      activeCount: number;
      queuedCount: number;
      totalAcquired: number;
      totalDirectPassThrough: number;
      totalReapedZombies: number;
      systemCores: number;
      activeSessions: Array<{
        sessionId: string;
        pid: number;
        runningSeconds: number;
        clientIp?: string;
        sourcePath: string;
        hasConsumer: boolean;
        isZombiePending: boolean;
      }>;
    };
    cache?: {
      count: number;
      totalSizeMb: string;
    };
  } | null>(null);
  const [isUpdatingConcurrency, setIsUpdatingConcurrency] = useState(false);

  const fetchTranscodeStatus = async () => {
    try {
      const res = await fetch('/api/transcode/status');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setTranscodeInfo(data);
        }
      }
    } catch {}
  };

  useEffect(() => {
    fetchTranscodeStatus();
    const timer = setInterval(fetchTranscodeStatus, 4000);
    return () => clearInterval(timer);
  }, []);

  const handleSetConcurrency = async (val: number) => {
    setIsUpdatingConcurrency(true);
    try {
      await fetch('/api/transcode/concurrency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxConcurrency: val })
      });
      await fetchTranscodeStatus();
    } catch {} finally {
      setIsUpdatingConcurrency(false);
    }
  };

  const handleClearCache = async () => {
    try {
      await fetch('/api/transcode/cache/clear', { method: 'POST' });
      await fetchTranscodeStatus();
    } catch {}
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const filteredLogs = castLogs.filter(log => {
    if (logTypeFilter === 'cast' && log.type !== 'cast') return false;
    if (logTypeFilter === 'sync' && log.type !== 'sync') return false;
    if (logTypeFilter === 'error' && log.success) return false;
    if (!logSearchTerm) return true;
    const q = logSearchTerm.toLowerCase();
    return (
      (log.message && log.message.toLowerCase().includes(q)) ||
      (log.detail && log.detail.toLowerCase().includes(q)) ||
      (log.did && log.did.toLowerCase().includes(q)) ||
      (log.ip && log.ip.toLowerCase().includes(q)) ||
      (log.model && log.model.toLowerCase().includes(q)) ||
      (log.protocol && log.protocol.toLowerCase().includes(q)) ||
      (log.requestMethod && log.requestMethod.toLowerCase().includes(q)) ||
      (log.minaStatus && log.minaStatus.toLowerCase().includes(q)) ||
      (log.miioStatus && log.miioStatus.toLowerCase().includes(q)) ||
      (log.streamUrl && log.streamUrl.toLowerCase().includes(q)) ||
      (log.httpStatus && String(log.httpStatus).includes(q))
    );
  });

  return (
    <div className={`p-6 sm:p-8 rounded-3xl backdrop-blur-md border space-y-6 ${
      isLight ? 'bg-white/90 border-zinc-200 shadow-sm' : 'bg-zinc-900/40 border-white/5'
    }`}>
      {/* Header & Meta */}
      <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b ${
        isLight ? 'border-zinc-200' : 'border-white/10'
      }`}>
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`text-lg font-bold flex items-center gap-2 ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                全链路投播与音频流诊断日志系统 (Diagnostic Live Logs)
              </h3>
              <p className={`text-xs mt-0.5 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                实时捕获 Mina 云端 UBUS、miIO 局域网 UDP、HTTP 206 串流响应与耗时节点，秒级归因诊断
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenSnapshotModal}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-700 dark:text-purple-300 border border-purple-500/30 text-xs font-semibold transition cursor-pointer"
          >
            <Bug className="w-3.5 h-3.5 text-purple-500" />
            <span>云端抓包/原始数据快照</span>
          </button>
          <a
            href="/api/miot/cloud/export-debug"
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border text-xs font-semibold transition ${
              isLight ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border-zinc-200' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-white/10'
            }`}
          >
            <Download className="w-3.5 h-3.5 text-emerald-500" />
            <span>导出完整诊断包</span>
          </a>
          <span className={`text-xs font-mono px-3 py-1.5 rounded-xl border ${
            isLight ? 'bg-zinc-50 border-zinc-200 text-zinc-600' : 'bg-zinc-950/80 border-white/10 text-zinc-400'
          }`}>
            记录数: <strong className="text-emerald-500">{castLogs.length}</strong> 条
          </span>
        </div>
      </div>

      {/* Transcode Semaphore Pool & Hardware Resource Protection Card */}
      {transcodeInfo?.semaphore && (
        <div className={`p-4 sm:p-5 rounded-2xl border transition-all ${
          isLight ? 'bg-gradient-to-r from-amber-500/5 via-orange-500/5 to-zinc-50 border-amber-500/20' : 'bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-zinc-950/80 border-amber-500/30'
        }`}>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-500 border border-amber-500/30 mt-0.5">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className={`text-sm font-bold ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                    FFmpeg 转码并发信号量与低算力硬件保护 (Transcode Semaphore Pool)
                  </h4>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-500 border border-emerald-500/30">
                    运行正常 · 僵尸进程收割 (Zombie Reaper 5s) 启用
                  </span>
                </div>
                <p className={`text-xs mt-1 ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                  系统检测 CPU 核心数: <span className="font-mono font-bold text-amber-500">{transcodeInfo.semaphore.systemCores}核</span> | 超限策略: <span className="font-bold text-blue-400">策略A (3s队列)</span> + <span className="font-bold text-purple-400">策略B (无损硬件直通)</span>
                </p>
              </div>
            </div>

            {/* Metrics pills */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 ${
                transcodeInfo.semaphore.activeCount > 0 ? 'bg-amber-500/20 border-amber-500/40 text-amber-500 font-bold' : isLight ? 'bg-white border-zinc-200 text-zinc-700' : 'bg-zinc-900 border-white/10 text-zinc-300'
              }`}>
                <Activity className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                <span>实时转码:</span>
                <strong>{transcodeInfo.semaphore.activeCount} / {transcodeInfo.semaphore.maxConcurrency}</strong>
              </div>

              <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 ${
                transcodeInfo.semaphore.queuedCount > 0 ? 'bg-blue-500/20 border-blue-500/40 text-blue-400 font-bold' : isLight ? 'bg-white border-zinc-200 text-zinc-700' : 'bg-zinc-900 border-white/10 text-zinc-300'
              }`}>
                <span>排队等待:</span>
                <strong>{transcodeInfo.semaphore.queuedCount}</strong>
              </div>

              <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 ${
                isLight ? 'bg-white border-zinc-200 text-zinc-700' : 'bg-zinc-900 border-white/10 text-zinc-300'
              }`}>
                <Zap className="w-3.5 h-3.5 text-purple-400" />
                <span>策略B直通:</span>
                <strong className="text-purple-400">{transcodeInfo.semaphore.totalDirectPassThrough} 次</strong>
              </div>

              <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 ${
                isLight ? 'bg-white border-zinc-200 text-zinc-700' : 'bg-zinc-900 border-white/10 text-zinc-300'
              }`}>
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>收割僵尸进程:</span>
                <strong className="text-rose-400">{transcodeInfo.semaphore.totalReapedZombies} 个</strong>
              </div>

              {/* Dynamic Concurrency Control */}
              <div className="flex items-center gap-1 ml-auto">
                <span className="text-[11px] text-zinc-500">并发限制:</span>
                <select
                  disabled={isUpdatingConcurrency}
                  value={transcodeInfo.semaphore.maxConcurrency}
                  onChange={(e) => handleSetConcurrency(parseInt(e.target.value, 10))}
                  aria-label="全局最大转码并发数"
                  className={`text-xs px-2 py-1 rounded-lg border font-mono font-bold focus:outline-none ${
                    isLight ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-zinc-800 border-white/10 text-amber-400'
                  }`}
                >
                  <option value={1}>1 (极低功耗)</option>
                  <option value={2}>2 (推荐 NAS/树莓派)</option>
                  <option value={3}>3 (多核服务器)</option>
                  <option value={4}>4 (高性能主机)</option>
                  <option value={6}>6 (专用转码机)</option>
                </select>

                <button
                  type="button"
                  onClick={handleClearCache}
                  title="清空已转码的标准 MP3 缓存"
                  className={`p-1.5 rounded-lg border text-xs text-zinc-400 hover:text-rose-400 transition ml-1 cursor-pointer ${
                    isLight ? 'bg-white border-zinc-200 hover:bg-zinc-100' : 'bg-zinc-800 border-white/10 hover:bg-zinc-700'
                  }`}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter Toolbar & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Quick Type Filter Pills */}
        <div className={`flex items-center gap-1.5 p-1 rounded-2xl border overflow-x-auto scrollbar-none ${
          isLight ? 'bg-zinc-100 border-zinc-200' : 'bg-zinc-950/80 border-white/10'
        }`}>
          <button
            onClick={() => setLogTypeFilter('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
              logTypeFilter === 'all'
                ? isLight ? 'bg-white text-zinc-900 shadow-sm' : 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            全部日志 ({castLogs.length})
          </button>
          <button
            onClick={() => setLogTypeFilter('cast')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
              logTypeFilter === 'cast'
                ? 'bg-[#FF6700]/20 text-[#FF6700] border border-[#FF6700]/30 font-bold'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            投播指令 ({castLogs.filter(l => l.type === 'cast').length})
          </button>
          <button
            onClick={() => setLogTypeFilter('sync')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
              logTypeFilter === 'sync'
                ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30 font-bold'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            音频流拉取 / 账号同步 ({castLogs.filter(l => l.type === 'sync').length})
          </button>
          <button
            onClick={() => setLogTypeFilter('error')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
              logTypeFilter === 'error'
                ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 font-bold'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            异常失败 ({castLogs.filter(l => !l.success).length})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative min-w-[240px]">
          <input
            type="text"
            value={logSearchTerm}
            onChange={e => setLogSearchTerm(e.target.value)}
            placeholder="搜索 DID / IP / 状态码 / 协议 / 错误..."
            className={`w-full border rounded-2xl px-4 py-2 text-xs placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 ${
              isLight ? 'bg-zinc-50 border-zinc-200 text-zinc-900' : 'bg-zinc-950/80 border-white/10 text-zinc-200'
            }`}
          />
          {logSearchTerm && (
            <button
              onClick={() => setLogSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Detailed Log Entries Stream */}
      <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
        {filteredLogs.length === 0 ? (
          <div className={`p-12 text-center rounded-2xl border space-y-2 ${
            isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-950/40 border-white/5'
          }`}>
            <Terminal className="w-8 h-8 text-zinc-400 dark:text-zinc-600 mx-auto" />
            <p className={`text-sm font-semibold ${isLight ? 'text-zinc-700' : 'text-zinc-400'}`}>未找到符合条件的诊断日志</p>
            <p className="text-xs text-zinc-500">可以尝试更换筛选条件或向小爱音箱下发一次投播操作</p>
          </div>
        ) : (
          filteredLogs.map(log => (
            <div
              key={log.id}
              className={`p-4 rounded-2xl border transition-all ${
                !log.success
                  ? 'bg-rose-950/20 border-rose-500/30 hover:border-rose-500/50'
                  : log.type === 'cast'
                  ? isLight ? 'bg-white border-zinc-200 hover:border-[#FF6700]/30 shadow-sm' : 'bg-zinc-950/80 border-white/10 hover:border-[#FF6700]/30'
                  : isLight ? 'bg-white border-zinc-200 hover:border-blue-500/30 shadow-sm' : 'bg-zinc-950/80 border-white/10 hover:border-blue-500/30'
              }`}
            >
              {/* Item Header */}
              <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b ${
                isLight ? 'border-zinc-100' : 'border-white/5'
              }`}>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className={`text-xs font-mono font-bold px-2.5 py-1 rounded-lg border ${
                    isLight ? 'bg-zinc-100 text-zinc-600 border-zinc-200' : 'bg-zinc-900 text-zinc-400 border-white/5'
                  }`}>
                    [{log.timestamp}]
                  </span>

                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase ${
                    log.type === 'cast' ? 'bg-[#FF6700]/20 text-[#FF6700] border border-[#FF6700]/30' :
                    (log.id.startsWith('log-stream') || log.message.includes('拉取音频流') || log.message.includes('请求音频流')) ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' :
                    log.type === 'sync' ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30' :
                    isLight ? 'bg-zinc-100 text-zinc-700 border border-zinc-200' : 'bg-zinc-800 text-zinc-300 border border-white/10'
                  }`}>
                    {log.type === 'cast' ? '投播指令' : (log.id.startsWith('log-stream') || log.message.includes('拉取音频流') || log.message.includes('请求音频流')) ? '音频拉流' : log.type === 'sync' ? '设备/账号同步' : log.type}
                  </span>

                  {log.protocol && (
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono border ${
                      isLight ? 'bg-zinc-100 text-zinc-600 border-zinc-200' : 'bg-zinc-800 text-zinc-300 border-white/5'
                    }`}>
                      {log.protocol}
                    </span>
                  )}

                  <h4 className={`text-xs font-bold min-w-0 ${isLight ? 'text-zinc-900' : 'text-zinc-100'}`}>
                    {log.message}
                  </h4>
                </div>

                <div className="flex items-center gap-2">
                  {log.responseTimeMs !== undefined && (
                    <span className="text-[11px] font-mono text-zinc-400 flex items-center gap-1">
                      ⚡ {log.responseTimeMs} ms
                    </span>
                  )}

                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border ${
                    log.success
                      ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-600 dark:text-rose-300 border-rose-500/30'
                  }`}>
                    {log.httpStatus ? `HTTP ${log.httpStatus}` : (log.success ? '✓ 200 OK' : '✕ ERROR')}
                  </span>

                  <button
                    onClick={() => {
                      const fullJson = JSON.stringify(log, null, 2);
                      navigator.clipboard.writeText(fullJson);
                      setCopiedLogId(log.id);
                      setTimeout(() => setCopiedLogId(null), 2000);
                    }}
                    className={`p-1.5 rounded-lg border transition cursor-pointer ${
                      isLight ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-600 border-zinc-200' : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border-white/5'
                    }`}
                    title="复制完整诊断日志 (JSON)"
                  >
                    {copiedLogId === log.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Summary / Detail info */}
              {log.detail && (
                <div className={`text-[11px] font-mono px-3 py-1.5 rounded-xl border break-all mt-2.5 flex items-center gap-2 ${
                  isLight ? 'bg-zinc-50 border-zinc-200 text-zinc-700' : 'bg-black/40 border-white/5 text-zinc-300'
                }`}>
                  <span className="text-zinc-500 text-[10px] font-sans uppercase font-bold flex-shrink-0">详情:</span>
                  <span className="truncate">{log.detail}</span>
                </div>
              )}

              {/* Comprehensive Parameters Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-xs font-mono">
                <div className={`p-2 rounded-xl border ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900/60 border-white/5'}`}>
                  <span className="text-[10px] text-zinc-500 block uppercase font-sans font-semibold">设备 DID</span>
                  <span className={`truncate block ${isLight ? 'text-zinc-800' : 'text-zinc-200'}`}>{log.did || '未知/全局'}</span>
                </div>

                <div className={`p-2 rounded-xl border ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900/60 border-white/5'}`}>
                  <span className="text-[10px] text-zinc-500 block uppercase font-sans font-semibold">设备 IP</span>
                  <span className={`truncate block ${isLight ? 'text-zinc-800' : 'text-zinc-200'}`}>{log.ip || '未检测局域网IP'}</span>
                </div>

                <div className={`p-2 rounded-xl border ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900/60 border-white/5'}`}>
                  <span className="text-[10px] text-zinc-500 block uppercase font-sans font-semibold">设备型号</span>
                  <span className={`truncate block ${isLight ? 'text-zinc-800' : 'text-zinc-200'}`}>{log.model || 'wifispeaker'}</span>
                </div>

                <div className={`p-2 rounded-xl border ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900/60 border-white/5'}`}>
                  <span className="text-[10px] text-zinc-500 block uppercase font-sans font-semibold">请求方法</span>
                  <span className={`truncate block ${isLight ? 'text-zinc-800' : 'text-zinc-200'}`}>{log.requestMethod || 'POST'}</span>
                </div>

                <div className={`p-2 rounded-xl border ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900/60 border-white/5'}`}>
                  <span className="text-[10px] text-zinc-500 block uppercase font-sans font-semibold">Mina 状态</span>
                  <span className={`truncate block ${log.minaStatus?.includes('ERROR') ? 'text-rose-500 font-bold' : isLight ? 'text-zinc-800' : 'text-zinc-200'}`}>
                    {log.minaStatus || 'N/A'}
                  </span>
                </div>

                <div className={`p-2 rounded-xl border ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900/60 border-white/5'}`}>
                  <span className="text-[10px] text-zinc-500 block uppercase font-sans font-semibold">miIO 状态</span>
                  <span className={`truncate block ${log.miioStatus?.includes('ERROR') ? 'text-rose-500 font-bold' : isLight ? 'text-zinc-800' : 'text-zinc-200'}`}>
                    {log.miioStatus || 'N/A'}
                  </span>
                </div>

                <div className={`p-2 rounded-xl border ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900/60 border-white/5'}`}>
                  <span className="text-[10px] text-zinc-500 block uppercase font-sans font-semibold">错误代码</span>
                  <span className={`truncate block ${!log.success ? 'text-rose-500 font-bold' : 'text-emerald-500'}`}>
                    {log.errorCode ?? 0}
                  </span>
                </div>

                <div className={`p-2 rounded-xl border ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900/60 border-white/5'}`}>
                  <span className="text-[10px] text-zinc-500 block uppercase font-sans font-semibold">协议模式</span>
                  <span className={`truncate block ${isLight ? 'text-zinc-800' : 'text-zinc-200'}`}>{log.protocol || 'MIoT / DLNA'}</span>
                </div>

                {/* Dedicated Full Width Stream URL Bar */}
                {(() => {
                  const effectiveStreamUrl = log.streamUrl ||
                    (log.detail?.match(/(?:串流源|拉流URL|http[s]?:\/\/)[：:]\s*(https?:\/\/[^\s|]+)/i)?.[1]) ||
                    (log.detail?.match(/(https?:\/\/[^\s|]+)/)?.[1]);
                  return (
                    <div className={`p-2.5 sm:p-3 rounded-xl border col-span-2 sm:col-span-4 space-y-1.5 ${
                      isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900/90 border-white/10'
                    }`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-[#FF6700] uppercase font-sans font-bold flex items-center gap-1.5">
                          <Radio className="w-3.5 h-3.5 text-[#FF6700]" />
                          <span>下发给音箱的音频拉流 / 串流 URL (Stream URL)</span>
                        </span>
                        {effectiveStreamUrl && (
                          <div className="flex items-center gap-2">
                            <a
                              href={effectiveStreamUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] text-zinc-500 hover:text-emerald-500 transition"
                              title="在新标签页中打开试听此音频流"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>浏览器试听</span>
                            </a>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(effectiveStreamUrl, `log-url-${log.id}`)}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition cursor-pointer ${
                                isLight ? 'bg-zinc-200 hover:bg-zinc-300 text-zinc-700' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                              }`}
                            >
                              {copiedKey === `log-url-${log.id}` ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-500" />
                                  <span className="text-emerald-500 font-semibold">已复制</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>复制 URL</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                      <div className={`px-2.5 py-1.5 rounded-lg border font-mono text-[11px] text-emerald-600 dark:text-emerald-300 break-all select-all flex items-center justify-between gap-2 ${
                        isLight ? 'bg-white border-zinc-200' : 'bg-black/60 border-white/5'
                      }`}>
                        <span>{effectiveStreamUrl || '未记录拉流地址 (N/A)'}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* One-Glance Timeline Chain Sequence */}
              <div className={`mt-3 pt-2.5 border-t flex items-center gap-1.5 overflow-x-auto scrollbar-none ${
                isLight ? 'border-zinc-100' : 'border-white/5'
              }`}>
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider flex-shrink-0">
                  诊断链路:
                </span>

                {(log.steps && log.steps.length > 0 ? log.steps : [
                  { timestamp: log.timestamp, step: 'MINA', status: log.minaStatus?.includes('OK') ? 'OK' : 'INFO', message: log.minaStatus || 'Mina' },
                  { timestamp: log.timestamp, step: 'MIIO', status: log.miioStatus?.includes('OK') ? 'OK' : 'INFO', message: log.miioStatus || 'miIO' },
                  { timestamp: log.timestamp, step: 'SPEAKER', status: log.success ? 'OK' : 'ERROR', message: log.success ? '200 OK' : '502 Rejected' }
                ]).map((s, idx) => (
                  <React.Fragment key={idx}>
                    {idx > 0 && <span className="text-zinc-500 text-[10px]">➔</span>}
                    <div className={`px-2 py-1 rounded-lg text-[10px] font-mono border flex items-center gap-1 flex-shrink-0 ${
                      s.status === 'OK'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-300'
                        : s.status === 'ERROR'
                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-300'
                        : isLight ? 'bg-zinc-100 border-zinc-200 text-zinc-600' : 'bg-zinc-900 border-white/5 text-zinc-400'
                    }`}>
                      <span className="font-bold">{s.step}</span>
                      <span className="opacity-75">→ {s.message}</span>
                    </div>
                  </React.Fragment>
                ))}
              </div>

              {/* Inline One-Click Add Action if IP is not yet in devices */}
              {log.ip && log.ip !== '127.0.0.1' && !devices.some(d => d.ip === log.ip) && (
                <div className={`mt-3 pt-2.5 border-t flex items-center justify-between flex-wrap gap-2 ${
                  isLight ? 'border-zinc-100' : 'border-white/5'
                }`}>
                  <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>检测到局域网音箱活跃 IP: <strong className="text-emerald-600 dark:text-emerald-300 font-mono">{log.ip}</strong></span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onAddDevice?.({
                        name: `小爱音箱 (${log.ip})`,
                        ip: log.ip!,
                        model: log.model || 'wifispeaker',
                        hardware: 'XiaoAi Smart Speaker'
                      });
                      onSwitchToDevicesTab();
                    }}
                    className="px-3 py-1 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-600 dark:text-emerald-300 text-xs font-semibold border border-emerald-500/30 flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>一键添加此音箱至列表</span>
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
