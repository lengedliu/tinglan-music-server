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
  Folder,
  Save
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { apiFetch } from '../../utils/api';

export interface NasConfig {
  enabled: boolean;
  type: 'webdav' | 'smb' | 'local_mount' | 'alist';
  serverUrl: string;
  basePath: string;
  shareName?: string;
  port?: number;
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
  const applyPreset = (preset: 'webdav' | 'smb' | 'alist' | 'local') => {
    setTestResult(null);
    if (preset === 'webdav') {
      setConfig(prev => ({
        ...prev,
        type: 'webdav',
        serverUrl: prev.serverUrl || 'http://192.168.1.100:5005',
        basePath: prev.basePath || '/music'
      }));
    } else if (preset === 'smb') {
      setConfig(prev => ({
        ...prev,
        type: 'smb',
        serverUrl: prev.serverUrl && !prev.serverUrl.startsWith('http') ? prev.serverUrl : '192.168.1.100',
        port: prev.port || 445,
        shareName: prev.shareName || 'music',
        basePath: '',
        domain: prev.domain || 'WORKGROUP'
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
      // 触发同步前自动保存最新配置
      await apiFetch('/api/nas/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

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

  const inputClass = isLight
    ? 'w-full rounded-xl px-3.5 py-2.5 text-xs bg-zinc-50 border border-zinc-200 text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-[#FF6700] focus:bg-white transition'
    : 'w-full rounded-xl px-3.5 py-2.5 text-xs bg-zinc-900 border border-white/10 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#FF6700] transition';

  const passwordInputClass = isLight
    ? 'w-full rounded-xl pl-3.5 pr-9 py-2.5 text-xs bg-zinc-50 border border-zinc-200 text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-[#FF6700] focus:bg-white transition'
    : 'w-full rounded-xl pl-3.5 pr-9 py-2.5 text-xs bg-zinc-900 border border-white/10 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#FF6700] transition';

  const labelClass = `text-xs ${isLight ? 'text-zinc-600 font-medium' : 'text-zinc-400'}`;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200">
      <div 
        className={`w-full max-w-3xl rounded-3xl border shadow-2xl flex flex-col max-h-[90vh] overflow-hidden ${
          isLight ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-zinc-950 border-white/10 text-zinc-100'
        }`}
      >
        {/* Modal Header */}
        <div className={`px-6 py-5 border-b flex items-center justify-between flex-shrink-0 ${
          isLight ? 'border-zinc-200' : 'border-white/5'
        }`}>
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-lg"
              style={{ backgroundColor: themeConfig.primaryColor }}
            >
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h2 className={`text-lg font-bold flex items-center gap-2 ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                NAS 远程存储挂载与定时自动同步
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20 font-medium">
                  WebDAV / Alist / 本地挂载
                </span>
              </h2>
              <p className={`text-xs mt-0.5 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                直接挂载家庭 NAS 无损曲库，按需流式读取，零占用服务器磁盘空间
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-xl transition cursor-pointer ${
              isLight ? 'text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100' : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Quick Preset Cards */}
          <div className="space-y-2">
            <label className={`text-xs font-semibold ${isLight ? 'text-zinc-700' : 'text-zinc-400'}`}>快速填入 NAS 预设配置：</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => applyPreset('webdav')}
                className={`p-3 rounded-2xl border text-left text-xs transition cursor-pointer flex flex-col gap-1 ${
                  config.type === 'webdav'
                    ? 'bg-blue-500/15 border-blue-500/40 text-blue-600 dark:text-blue-300 font-bold'
                    : isLight
                    ? 'bg-zinc-50 border-zinc-200 hover:bg-zinc-100 text-zinc-700'
                    : 'bg-white/[0.02] border-white/5 hover:bg-white/5 text-zinc-300'
                }`}
              >
                <div className="font-bold flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-blue-500" /> WebDAV 协议
                </div>
                <span className={`text-[10px] ${isLight ? 'text-zinc-500' : 'text-zinc-500'}`}>群晖 / 极空间 / 绿联</span>
              </button>

              <button
                type="button"
                onClick={() => applyPreset('smb')}
                className={`p-3 rounded-2xl border text-left text-xs transition cursor-pointer flex flex-col gap-1 ${
                  config.type === 'smb'
                    ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-600 dark:text-cyan-300 font-bold'
                    : isLight
                    ? 'bg-zinc-50 border-zinc-200 hover:bg-zinc-100 text-zinc-700'
                    : 'bg-white/[0.02] border-white/5 hover:bg-white/5 text-zinc-300'
                }`}
              >
                <div className="font-bold flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-cyan-500" /> SMB / 局域网
                </div>
                <span className={`text-[10px] ${isLight ? 'text-zinc-500' : 'text-zinc-500'}`}>Samba :445 共享</span>
              </button>

              <button
                type="button"
                onClick={() => applyPreset('alist')}
                className={`p-3 rounded-2xl border text-left text-xs transition cursor-pointer flex flex-col gap-1 ${
                  config.type === 'alist'
                    ? 'bg-purple-500/15 border-purple-500/40 text-purple-600 dark:text-purple-300 font-bold'
                    : isLight
                    ? 'bg-zinc-50 border-zinc-200 hover:bg-zinc-100 text-zinc-700'
                    : 'bg-white/[0.02] border-white/5 hover:bg-white/5 text-zinc-300'
                }`}
              >
                <div className="font-bold flex items-center gap-1.5">
                  <FolderSync className="w-3.5 h-3.5 text-purple-500" /> Alist 聚合网盘
                </div>
                <span className={`text-[10px] ${isLight ? 'text-zinc-500' : 'text-zinc-500'}`}>WebDAV :5244</span>
              </button>

              <button
                type="button"
                onClick={() => applyPreset('local')}
                className={`p-3 rounded-2xl border text-left text-xs transition cursor-pointer flex flex-col gap-1 ${
                  config.type === 'local_mount'
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-300 font-bold'
                    : isLight
                    ? 'bg-zinc-50 border-zinc-200 hover:bg-zinc-100 text-zinc-700'
                    : 'bg-white/[0.02] border-white/5 hover:bg-white/5 text-zinc-300'
                }`}
              >
                <div className="font-bold flex items-center gap-1.5">
                  <Folder className="w-3.5 h-3.5 text-amber-500" /> 本地卷映射
                </div>
                <span className={`text-[10px] ${isLight ? 'text-zinc-500' : 'text-zinc-500'}`}>Docker -v 挂载</span>
              </button>
            </div>
          </div>

          {/* Connection Parameters Form */}
          <div className={`p-5 rounded-2xl border space-y-4 ${
            isLight ? 'bg-zinc-50/70 border-zinc-200' : 'bg-white/[0.02] border-white/5'
          }`}>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-bold ${isLight ? 'text-zinc-800' : 'text-zinc-200'}`}>
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
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="space-y-1 sm:col-span-2">
                    <label className={labelClass}>SMB 共享主机 IP / 局域网主机名</label>
                    <input
                      type="text"
                      value={config.serverUrl}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val.includes(':') && !val.startsWith('http')) {
                          const [hostPart, portPart] = val.split(':');
                          const p = parseInt(portPart, 10);
                          if (!isNaN(p) && p > 0) {
                            setConfig({ ...config, serverUrl: hostPart.trim(), port: p });
                            return;
                          }
                        }
                        setConfig({ ...config, serverUrl: val });
                      }}
                      placeholder="192.168.1.100"
                      className={inputClass}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className={labelClass}>SMB 端口 (默认 445)</label>
                    <input
                      type="number"
                      value={config.port ?? 445}
                      onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value, 10) || 445 })}
                      placeholder="445 或 442"
                      className={inputClass}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className={labelClass}>共享名 (Share Name)</label>
                    <input
                      type="text"
                      value={config.shareName || config.basePath || 'music'}
                      onChange={(e) => setConfig({ ...config, shareName: e.target.value, basePath: e.target.value })}
                      placeholder="music 或 public"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className={labelClass}>工作组 (Domain，默认 WORKGROUP)</label>
                    <input
                      type="text"
                      value={config.domain || 'WORKGROUP'}
                      onChange={(e) => setConfig({ ...config, domain: e.target.value })}
                      placeholder="WORKGROUP"
                      className={inputClass}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className={labelClass}>SMB 登录用户名 (可选)</label>
                    <input
                      type="text"
                      value={config.username || ''}
                      onChange={(e) => setConfig({ ...config, username: e.target.value })}
                      placeholder="guest 或 admin"
                      className={inputClass}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className={labelClass}>SMB 登录密码 (可选)</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={config.password || ''}
                        onChange={(e) => setConfig({ ...config, password: e.target.value })}
                        placeholder="••••••••"
                        className={passwordInputClass}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className={`p-3.5 rounded-xl border text-[11px] leading-relaxed space-y-1.5 ${
                  isLight ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-amber-500/10 border-amber-500/20 text-amber-200/90'
                }`}>
                  <div className="font-bold flex items-center gap-1.5 text-amber-600 dark:text-amber-300">
                    <span>💡</span> SMB 连接失败常见原因排查与成功方案参考
                  </div>
                  <ul className={`list-disc pl-4 space-y-1 ${isLight ? 'text-zinc-700' : 'text-zinc-300'}`}>
                    <li><b>NTLMv1 身份验证（现代 NAS 最常见绊脚石）</b>：群晖 DSM 7.0+、TrueNAS、Windows 11 等出于安全策略<b>默认强制停用了 NTLMv1</b>。开源 SMB 客户端通常基于 NTLM 握手，若遇认证失败，请前往群晖【控制面板 → 文件服务 → SMB → 高级设置 → 其它】勾选 <b>「启用 NTLMv1 身份验证」</b> 并将最低协议设为 SMB2。</li>
                    <li><b>运营商封锁 445 端口（若为公网或云端测试）</b>：国内所有电信/联通/移动运营商均在家庭宽带入口<b>全面阻断 TCP 445 端口</b>以防止勒索病毒；云服务商公网也禁止 445 端口入站。若当前在 Web 预览环境跨公网连接 NAS，SMB 必然受阻，这正是为什么标准 HTTP 的 WebDAV 能连通而 SMB 无法打通的核心原因。</li>
                    <li><b>共享名格式</b>：请填写 NAS 上创建的共享文件夹名（如 <code>music</code>，支持填写 <code>music/jazz</code>），系统已自动剔除 <code>/volume1/</code> 底层卷名。</li>
                    <li><b>业界推荐方案</b>：如果您的 <b>WebDAV 已连接成功</b>，强烈建议直接采用 WebDAV！WebDAV 天然支持 HTTP Range 拖拽分片与小爱音箱直读；如果在本地 NAS Docker 环境运行，使用 <b>「本地卷映射」</b>（<code>-v /volume1/music:/music</code>）是零网络损耗的最优解。</li>
                  </ul>
                </div>
              </>
            ) : config.type !== 'local_mount' ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className={labelClass}>WebDAV 服务器地址 (含端口)</label>
                    <input
                      type="text"
                      value={config.serverUrl}
                      onChange={(e) => setConfig({ ...config, serverUrl: e.target.value })}
                      placeholder="http://192.168.1.100:5005"
                      className={inputClass}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className={labelClass}>远程音乐根目录路径</label>
                    <input
                      type="text"
                      value={config.basePath}
                      onChange={(e) => setConfig({ ...config, basePath: e.target.value })}
                      placeholder="/music 或 /我的音乐 (群晖直接填共享名如 /music，勿加 /volume1)"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className={labelClass}>WebDAV 登录用户名 (可选)</label>
                    <input
                      type="text"
                      value={config.username || ''}
                      onChange={(e) => setConfig({ ...config, username: e.target.value })}
                      placeholder="admin"
                      className={inputClass}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className={labelClass}>WebDAV 登录密码 (可选)</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={config.password || ''}
                        onChange={(e) => setConfig({ ...config, password: e.target.value })}
                        placeholder="••••••••"
                        className={passwordInputClass}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className={`p-3 rounded-xl border text-[11px] leading-relaxed space-y-1 ${
                  isLight ? 'bg-blue-50 border-blue-200 text-blue-900' : 'bg-blue-500/10 border-blue-500/20 text-blue-200/90'
                }`}>
                  <div className="font-bold flex items-center gap-1.5 text-blue-600 dark:text-blue-300">
                    <span>💡</span> WebDAV / Alist 连接注意事项与 HTTP 500 排查
                  </div>
                  <ul className={`list-disc pl-4 space-y-0.5 ${isLight ? 'text-zinc-700' : 'text-zinc-300'}`}>
                    <li><b>群晖 Synology</b>：远程根目录请直接填<b>共享文件夹名</b>（如 <code>/music</code> 或 <code>/media</code>），切勿加 <code>/volume1/</code> 等物理卷名；且需在 DSM【控制面板 → 应用程序权限 → WebDAV Server】中勾选允许该用户访问。</li>
                    <li><b>Alist 聚合网盘</b>：地址末尾必须带 <code>/dav</code>（例如 <code>http://IP:5244/dav</code>），且所填目录必须在 Alist 后台挂载且处于可用状态。</li>
                    <li><b>极空间 / 绿联</b>：直接填写设备 WebDAV 应用配置的共享目录（如 <code>/我的音乐</code>）和账号密码。</li>
                  </ul>
                </div>
              </>
            ) : (
              <div className="space-y-1">
                <label className={labelClass}>容器内挂载点路径</label>
                <input
                  type="text"
                  value={config.basePath}
                  onChange={(e) => setConfig({ ...config, basePath: e.target.value })}
                  placeholder="/music 或 /mnt/nas"
                  className={inputClass}
                />
              </div>
            )}

            {/* Automation Options */}
            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t ${
              isLight ? 'border-zinc-200' : 'border-white/5'
            }`}>
              <div className={`flex items-center justify-between p-3 rounded-xl ${
                isLight ? 'bg-white border border-zinc-200/80' : 'bg-black/20'
              }`}>
                <div className="space-y-0.5">
                  <div className={`text-xs font-semibold ${isLight ? 'text-zinc-800' : 'text-zinc-200'}`}>定时自动增量同步</div>
                  <div className={`text-[10px] ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>定期检测 NAS 新歌</div>
                </div>
                <select
                  value={config.autoSyncIntervalMinutes}
                  onChange={(e) => setConfig({ ...config, autoSyncIntervalMinutes: parseInt(e.target.value, 10) })}
                  className={`text-xs rounded-lg px-2.5 py-1 focus:outline-none ${
                    isLight ? 'bg-white border border-zinc-300 text-zinc-800' : 'bg-zinc-800 border border-white/10 text-zinc-200'
                  }`}
                >
                  <option value={0}>仅手动同步</option>
                  <option value={15}>每 15 分钟</option>
                  <option value={30}>每 30 分钟 (推荐)</option>
                  <option value={60}>每 1 小时</option>
                  <option value={360}>每 6 小时</option>
                </select>
              </div>

              <div className={`flex items-center justify-between p-3 rounded-xl ${
                isLight ? 'bg-white border border-zinc-200/80' : 'bg-black/20'
              }`}>
                <div className="space-y-0.5">
                  <div className={`text-xs font-semibold ${isLight ? 'text-zinc-800' : 'text-zinc-200'}`}>自动补全封面与歌词</div>
                  <div className={`text-[10px] ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>同步时自动联网刮削</div>
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
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 dark:text-emerald-300' 
                : 'bg-rose-500/10 border-rose-500/30 text-rose-500 dark:text-rose-300'
            }`}>
              <div className="flex items-center gap-2 font-bold">
                {testResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <AlertCircle className="w-4 h-4 text-rose-500" />}
                <span>{testResult.success ? 'NAS 挂载连接测试通过！' : 'NAS 挂载连接测试失败'}</span>
                {testResult.latencyMs !== undefined && (
                  <span className="font-mono text-[11px] opacity-80">({testResult.latencyMs}ms 延迟)</span>
                )}
              </div>
              <p className="mt-1 text-[11px] opacity-90 whitespace-pre-line leading-relaxed">{testResult.message || testResult.error}</p>
              {testResult.foundSampleFiles && testResult.foundSampleFiles.length > 0 && (
                <div className="mt-2 pt-2 border-t border-emerald-500/20">
                  <span className="text-[10px] opacity-70">探测到的音轨示例：</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {testResult.foundSampleFiles.map((f, i) => (
                      <span key={i} className="px-2 py-0.5 rounded bg-black/10 dark:bg-black/30 font-mono text-[10px]">
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
            <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-blue-500 dark:text-blue-300 text-xs space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between font-bold">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                  <span>正在增量扫描与同步 NAS 远程曲库...</span>
                </div>
                <span>{syncProgress.processed} / {syncProgress.totalFound || '扫描中'}</span>
              </div>
              <p className="text-[11px] opacity-80 truncate">当前文件: {syncProgress.currentPath || '准备解析中...'}</p>
              <div className="w-full bg-black/10 dark:bg-black/40 rounded-full h-1.5 overflow-hidden">
                <div 
                  className="bg-blue-500 h-full transition-all duration-300"
                  style={{
                    width: syncProgress.totalFound > 0 ? `${Math.min(100, (syncProgress.processed / syncProgress.totalFound) * 100)}%` : '20%'
                  }}
                />
              </div>
            </div>
          )}

          {/* Last Sync Result Stats */}
          {config.lastSyncResult && !syncProgress?.isSyncing && (
            <div className={`p-4 rounded-2xl border flex items-center justify-between text-xs ${
              isLight ? 'bg-zinc-50 border-zinc-200 text-zinc-600' : 'bg-zinc-900/60 border-white/5 text-zinc-400'
            }`}>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-zinc-500" />
                <span>上次同步: {config.lastSyncTime ? new Date(config.lastSyncTime).toLocaleString('zh-CN') : '暂无'}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-emerald-500 font-medium">+{config.lastSyncResult.added} 首新增</span>
                <span>⟳ {config.lastSyncResult.updated} 首更新</span>
                <span>耗时 {(config.lastSyncResult.durationMs / 1000).toFixed(1)}s</span>
              </div>
            </div>
          )}

          {saveSuccessMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 dark:text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span className="font-medium">{saveSuccessMsg}</span>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className={`px-6 py-4 border-t flex items-center justify-between flex-shrink-0 ${
          isLight ? 'border-zinc-200 bg-zinc-50/90' : 'border-white/5 bg-zinc-900/60'
        }`}>
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing}
            className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
              isLight
                ? 'bg-zinc-200/80 hover:bg-zinc-300 text-zinc-800 border border-zinc-300/60'
                : 'bg-white/5 hover:bg-white/10 text-zinc-200 border border-white/5'
            }`}
          >
            {testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-amber-500" />}
            <span>测试连接</span>
          </button>

          <div className="flex items-center gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={handleSaveConfig}
              disabled={loading}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm ${
                isLight
                  ? 'bg-zinc-900 text-white hover:bg-zinc-800'
                  : 'bg-zinc-100 text-zinc-900 hover:bg-white'
              }`}
            >
              {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>保存配置</span>
            </button>
            <button
              type="button"
              onClick={handleTriggerSync}
              disabled={syncing || syncProgress?.isSyncing}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-lg flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 hover:brightness-110 active:scale-95"
              style={{ backgroundColor: themeConfig.primaryColor }}
            >
              {syncing || syncProgress?.isSyncing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>正在同步中...</span>
                </>
              ) : (
                <>
                  <FolderSync className="w-3.5 h-3.5" />
                  <span>立即同步 NAS 曲库</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
