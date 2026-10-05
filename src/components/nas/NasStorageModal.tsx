import React, { useState, useEffect } from 'react';
import {
  X,
  HardDrive,
  Server,
  FolderSync,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  ShieldCheck,
  Zap,
  Play,
  ArrowRight,
  HelpCircle,
  Eye,
  EyeOff,
  Folder
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { apiFetch } from '../../utils/api';

export interface NasConfig {
  enabled: boolean;
  type: 'webdav' | 'smb' | 'local_mount' | 'alist';
  serverUrl: string;
  basePath: string;
  shareName?: string;
  domain?: string;
  username?: string;
  password?: string;
  autoSyncIntervalMinutes: number;
  autoScrapeMetadata: boolean;
  lastSyncTime?: number;
  lastSyncResult?: {
    success: boolean;
    added: number;
    updated: number;
    removed: number;
    total: number;
    error?: string;
    durationMs: number;
  };
}

interface NasStorageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncComplete?: () => void;
}

export const NasStorageModal: React.FC<NasStorageModalProps> = ({
  isOpen,
  onClose,
  onSyncComplete
}) => {
  const { themeConfig, isLight } = useTheme();

  const [config, setConfig] = useState<NasConfig>({
    enabled: false,
    type: 'webdav',
    serverUrl: '',
    basePath: '/music',
    username: '',
    password: '',
    autoSyncIntervalMinutes: 30,
    autoScrapeMetadata: true
  });

  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    latencyMs?: number;
    foundSampleFiles?: string[];
    totalFilesCount?: number;
    message?: string;
    error?: string;
  } | null>(null);

  const [syncProgress, setSyncProgress] = useState<any>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/nas/config');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.config) {
          setConfig(data.config);
          if (data.progress) setSyncProgress(data.progress);
        }
      }
    } catch (err) {
      console.error('Failed to load NAS config:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchConfig();
      setTestResult(null);
      setSaveSuccessMsg(null);
    }
  }, [isOpen]);

  // Poll sync progress if syncing
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isOpen && (syncing || syncProgress?.isSyncing)) {
      timer = setInterval(async () => {
        try {
          const res = await apiFetch('/api/nas/status');
          if (res.ok) {
            const data = await res.json();
            if (data.progress) {
              setSyncProgress(data.progress);
              if (!data.progress.isSyncing && syncing) {
                setSyncing(false);
                fetchConfig();
                if (onSyncComplete) onSyncComplete();
              }
            }
          }
        } catch {}
      }, 1500);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isOpen, syncing, syncProgress?.isSyncing]);

  if (!isOpen) return null;

  // Preset Template Selectors
  const applyPreset = (preset: 'synology' | 'zspace' | 'smb' | 'alist' | 'local') => {
    setTestResult(null);
    if (preset === 'synology') {
      setConfig(prev => ({
        ...prev,
        type: 'webdav',
        serverUrl: prev.serverUrl || 'http://192.168.1.100:5005',
        basePath: '/music'
      }));
    } else if (preset === 'smb') {
      setConfig(prev => ({
        ...prev,
        type: 'smb',
        serverUrl: '192.168.1.100',
        shareName: 'music',
        basePath: '',
        domain: 'WORKGROUP'
      }));
    } else if (preset === 'zspace') {
      setConfig(prev => ({
        ...prev,
        type: 'webdav',
        serverUrl: prev.serverUrl || 'http://192.168.1.100:5005',
        basePath: '/我的音乐'
      }));
    } else if (preset === 'alist') {
      setConfig(prev => ({
        ...prev,
        type: 'alist',
        serverUrl: prev.serverUrl || 'http://192.168.1.100:5244/dav',
        basePath: '/阿里云盘/音乐'
      }));
    } else if (preset === 'local') {
      setConfig(prev => ({
        ...prev,
        type: 'local_mount',
        serverUrl: '',
        basePath: '/music'
      }));
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    setSaveSuccessMsg(null);
    try {
      const res = await apiFetch('/api/nas/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult(data.result);
      } else {
        setTestResult({
          success: false,
          error: data.error || '连接测试未通过，请核对地址与凭据'
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        error: err.message || '连接服务器超时或失败'
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveConfig = async () => {
    setLoading(true);
    setSaveSuccessMsg(null);
    try {
      const res = await apiFetch('/api/nas/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSaveSuccessMsg('NAS 挂载配置已成功保存！');
        setTimeout(() => setSaveSuccessMsg(null), 3000);
      }
    } catch (err: any) {
      alert('保存失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerSync = async () => {
    setSyncing(true);
    try {
      const res = await apiFetch('/api/nas/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSyncProgress({ isSyncing: true, totalFound: 0, processed: 0, added: 0, updated: 0 });
      }
    } catch (err: any) {
      alert('启动同步失败: ' + err.message);
      setSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200">
      <div 
        className={`w-full max-w-3xl rounded-3xl border shadow-2xl flex flex-col max-h-[90vh] overflow-hidden ${
          isLight ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-zinc-950 border-white/10 text-zinc-100'
        }`}
      >
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-lg"
              style={{ backgroundColor: themeConfig.primaryColor }}
            >
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                NAS 远程存储挂载与定时自动同步
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
                  WebDAV / Alist / 本地挂载
                </span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                直接挂载家庭 NAS 无损曲库，按需流式读取，零占用服务器磁盘空间
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Quick Preset Cards */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-400">快速填入 NAS 预设配置：</label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <button
                type="button"
                onClick={() => applyPreset('synology')}
                className={`p-3 rounded-2xl border text-left text-xs transition cursor-pointer flex flex-col gap-1 ${
                  config.type === 'webdav' && config.basePath === '/music'
                    ? 'bg-blue-500/15 border-blue-500/40 text-blue-300'
                    : 'bg-white/[0.02] border-white/5 hover:bg-white/5 text-zinc-300'
                }`}
              >
                <div className="font-bold flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-blue-400" /> 群晖 Synology
                </div>
                <span className="text-[10px] text-zinc-500">WebDAV :5005</span>
              </button>

              <button
                type="button"
                onClick={() => applyPreset('zspace')}
                className={`p-3 rounded-2xl border text-left text-xs transition cursor-pointer flex flex-col gap-1 ${
                  config.type === 'webdav' && config.basePath === '/我的音乐'
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-white/[0.02] border-white/5 hover:bg-white/5 text-zinc-300'
                }`}
              >
                <div className="font-bold flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-emerald-400" /> 极空间 / 绿联
                </div>
                <span className="text-[10px] text-zinc-500">WebDAV 服务</span>
              </button>

              <button
                type="button"
                onClick={() => applyPreset('smb')}
                className={`p-3 rounded-2xl border text-left text-xs transition cursor-pointer flex flex-col gap-1 ${
                  config.type === 'smb'
                    ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                    : 'bg-white/[0.02] border-white/5 hover:bg-white/5 text-zinc-300'
                }`}
              >
                <div className="font-bold flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-cyan-400" /> SMB / 局域网
                </div>
                <span className="text-[10px] text-zinc-500">Samba :445</span>
              </button>

              <button
                type="button"
                onClick={() => applyPreset('alist')}
                className={`p-3 rounded-2xl border text-left text-xs transition cursor-pointer flex flex-col gap-1 ${
                  config.type === 'alist'
                    ? 'bg-purple-500/15 border-purple-500/40 text-purple-300'
                    : 'bg-white/[0.02] border-white/5 hover:bg-white/5 text-zinc-300'
                }`}
              >
                <div className="font-bold flex items-center gap-1.5">
                  <FolderSync className="w-3.5 h-3.5 text-purple-400" /> Alist 聚合网盘
                </div>
                <span className="text-[10px] text-zinc-500">WebDAV :5244</span>
              </button>

              <button
                type="button"
                onClick={() => applyPreset('local')}
                className={`p-3 rounded-2xl border text-left text-xs transition cursor-pointer flex flex-col gap-1 ${
                  config.type === 'local_mount'
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                    : 'bg-white/[0.02] border-white/5 hover:bg-white/5 text-zinc-300'
                }`}
              >
                <div className="font-bold flex items-center gap-1.5">
                  <Folder className="w-3.5 h-3.5 text-amber-400" /> 本地卷映射
                </div>
                <span className="text-[10px] text-zinc-500">Docker -v 挂载</span>
              </button>
            </div>
          </div>

          {/* Connection Parameters Form */}
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-200">
                {config.type === 'smb' ? 'SMB / Samba (Windows 共享) 连接参数' : '存储协议与服务连接参数'}
              </span>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                  className="rounded accent-[#FF6700]"
                />
                <span className="text-xs font-bold text-[#FF6700]">启用 NAS 远程存储同步</span>
              </label>
            </div>

            {config.type === 'smb' ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs text-zinc-400">SMB 共享主机 IP / 局域网主机名</label>
                    <input
                      type="text"
                      value={config.serverUrl}
                      onChange={(e) => setConfig({ ...config, serverUrl: e.target.value })}
                      placeholder="192.168.1.100"
                      className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#FF6700]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400">共享文件夹名 (Share Name)</label>
                    <input
                      type="text"
                      value={config.shareName || config.basePath || 'music'}
                      onChange={(e) => setConfig({ ...config, shareName: e.target.value, basePath: e.target.value })}
                      placeholder="music 或 public"
                      className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#FF6700]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400">工作组 (Domain，默认 WORKGROUP)</label>
                    <input
                      type="text"
                      value={config.domain || 'WORKGROUP'}
                      onChange={(e) => setConfig({ ...config, domain: e.target.value })}
                      placeholder="WORKGROUP"
                      className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#FF6700]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400">SMB 登录用户名 (可选)</label>
                    <input
                      type="text"
                      value={config.username || ''}
                      onChange={(e) => setConfig({ ...config, username: e.target.value })}
                      placeholder="guest 或 admin"
                      className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#FF6700]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400">SMB 登录密码 (可选)</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={config.password || ''}
                        onChange={(e) => setConfig({ ...config, password: e.target.value })}
                        placeholder="••••••••"
                        className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-3.5 pr-9 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#FF6700]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-300"
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : config.type !== 'local_mount' ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400">WebDAV 服务器地址 (含端口)</label>
                    <input
                      type="text"
                      value={config.serverUrl}
                      onChange={(e) => setConfig({ ...config, serverUrl: e.target.value })}
                      placeholder="http://192.168.1.100:5005"
                      className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#FF6700]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400">远程音乐根目录路径</label>
                    <input
                      type="text"
                      value={config.basePath}
                      onChange={(e) => setConfig({ ...config, basePath: e.target.value })}
                      placeholder="/music 或 /volume1/music"
                      className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#FF6700]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400">WebDAV 登录用户名 (可选)</label>
                    <input
                      type="text"
                      value={config.username || ''}
                      onChange={(e) => setConfig({ ...config, username: e.target.value })}
                      placeholder="admin"
                      className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#FF6700]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400">WebDAV 登录密码 (可选)</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={config.password || ''}
                        onChange={(e) => setConfig({ ...config, password: e.target.value })}
                        placeholder="••••••••"
                        className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-3.5 pr-9 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#FF6700]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-300"
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-1">
                <label className="text-xs text-zinc-400">容器内挂载点路径</label>
                <input
                  type="text"
                  value={config.basePath}
                  onChange={(e) => setConfig({ ...config, basePath: e.target.value })}
                  placeholder="/music 或 /mnt/nas"
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#FF6700]"
                />
              </div>
            )}

            {/* Automation Options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/5">
              <div className="flex items-center justify-between p-3 rounded-xl bg-black/20">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-zinc-200">定时自动增量同步</div>
                  <div className="text-[10px] text-zinc-400">定期检测 NAS 新歌</div>
                </div>
                <select
                  value={config.autoSyncIntervalMinutes}
                  onChange={(e) => setConfig({ ...config, autoSyncIntervalMinutes: parseInt(e.target.value, 10) })}
                  className="bg-zinc-800 border border-white/10 text-xs rounded-lg px-2.5 py-1 text-zinc-200 focus:outline-none"
                >
                  <option value={0}>仅手动同步</option>
                  <option value={15}>每 15 分钟</option>
                  <option value={30}>每 30 分钟 (推荐)</option>
                  <option value={60}>每 1 小时</option>
                  <option value={360}>每 6 小时</option>
                </select>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-black/20">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-zinc-200">自动补全封面与歌词</div>
                  <div className="text-[10px] text-zinc-400">同步时自动联网刮削</div>
                </div>
                <input
                  type="checkbox"
                  checked={config.autoScrapeMetadata}
                  onChange={(e) => setConfig({ ...config, autoScrapeMetadata: e.target.checked })}
                  className="rounded accent-[#FF6700] w-4 h-4 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Test Connection Results Card */}
          {testResult && (
            <div className={`p-4 rounded-2xl border text-xs animate-in fade-in ${
              testResult.success 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}>
              <div className="flex items-center gap-2 font-bold">
                {testResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
                <span>{testResult.success ? 'NAS 挂载连接测试通过！' : 'NAS 挂载连接测试失败'}</span>
                {testResult.latencyMs !== undefined && (
                  <span className="font-mono text-[11px] opacity-80">({testResult.latencyMs}ms 延迟)</span>
                )}
              </div>
              <p className="mt-1 text-[11px] opacity-90">{testResult.message || testResult.error}</p>
              {testResult.foundSampleFiles && testResult.foundSampleFiles.length > 0 && (
                <div className="mt-2 pt-2 border-t border-emerald-500/20">
                  <span className="text-[10px] opacity-70">探测到的音轨示例：</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {testResult.foundSampleFiles.map((f, i) => (
                      <span key={i} className="px-2 py-0.5 rounded bg-black/30 font-mono text-[10px]">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sync Progress Card */}
          {syncProgress?.isSyncing && (
            <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between font-bold">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                  <span>正在增量扫描与同步 NAS 远程曲库...</span>
                </div>
                <span>{syncProgress.processed} / {syncProgress.totalFound || '扫描中'}</span>
              </div>
              <p className="text-[11px] opacity-80 truncate">当前文件: {syncProgress.currentPath || '准备解析中...'}</p>
              <div className="w-full bg-black/40 rounded-full h-1.5 overflow-hidden">
                <div 
                  className="bg-blue-400 h-full transition-all duration-300"
                  style={{
                    width: syncProgress.totalFound > 0 ? `${Math.min(100, (syncProgress.processed / syncProgress.totalFound) * 100)}%` : '20%'
                  }}
                />
              </div>
            </div>
          )}

          {/* Last Sync Result Stats */}
          {config.lastSyncResult && !syncProgress?.isSyncing && (
            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/5 flex items-center justify-between text-xs text-zinc-400">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-zinc-500" />
                <span>上次同步: {config.lastSyncTime ? new Date(config.lastSyncTime).toLocaleString('zh-CN') : '暂无'}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-emerald-400">+{config.lastSyncResult.added} 首新增</span>
                <span>⟳ {config.lastSyncResult.updated} 首更新</span>
                <span>耗时 {(config.lastSyncResult.durationMs / 1000).toFixed(1)}s</span>
              </div>
            </div>
          )}

          {saveSuccessMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{saveSuccessMsg}</span>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="px-6 py-4 border-t border-white/5 bg-zinc-900/40 flex items-center justify-between flex-shrink-0">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 text-zinc-200 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-amber-400" />}
            <span>测试连接</span>
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSaveConfig}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white transition cursor-pointer disabled:opacity-50"
            >
              保存配置
            </button>
            <button
              type="button"
              onClick={handleTriggerSync}
              disabled={syncing || syncProgress?.isSyncing}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white shadow-lg flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              style={{ backgroundColor: themeConfig.primaryColor }}
            >
              {syncing || syncProgress?.isSyncing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  正在同步中...
                </>
              ) : (
                <>
                  <FolderSync className="w-3.5 h-3.5" />
                  立即同步 NAS 曲库
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
