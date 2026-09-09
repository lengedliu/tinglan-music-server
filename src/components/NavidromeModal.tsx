import React, { useState, useEffect } from 'react';
import { Server, Wifi, Check, AlertCircle, RefreshCw, Database, Download, Lock, ExternalLink, X, ShieldCheck, Music2 } from 'lucide-react';
import { apiFetch } from '../utils/api';

interface NavidromeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSongsSynced?: () => void;
}

export const NavidromeModal: React.FC<NavidromeModalProps> = ({
  isOpen,
  onClose,
  onSongsSynced,
}) => {
  const [serverUrl, setServerUrl] = useState<string>('http://192.168.1.100:4533');
  const [username, setUsername] = useState<string>('admin');
  const [password, setPassword] = useState<string>('');
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; version?: string } | null>(null);
  const [syncResult, setSyncResult] = useState<{ success: boolean; count?: number; message?: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      apiFetch('/api/navidrome/config')
        .then(res => res.json())
        .then(data => {
          if (data) {
            if (data.serverUrl) setServerUrl(data.serverUrl);
            if (data.username) setUsername(data.username);
            if (data.password) setPassword(data.password);
          }
        })
        .catch(err => console.warn('Load Navidrome config err:', err));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await apiFetch('/api/navidrome/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverUrl, username, password }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || '网络连接失败，请检查 URL 或内网穿透设置' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSyncNavidrome = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const res = await apiFetch('/api/navidrome/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverUrl, username, password }),
      });
      const data = await res.json();
      setSyncResult(data);
      if (data.success && onSongsSynced) {
        onSongsSynced();
      }
    } catch (err: any) {
      setSyncResult({ success: false, message: err.message || '同步曲库失败' });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-zinc-950 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden space-y-6">
        
        {/* Background Ambient Light */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-[#FF6700]/10 blur-[90px] pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/30 shadow-[0_0_12px_rgba(255,103,0,0.3)]">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                连接 Navidrome 远程曲库
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#FF6700]/20 text-[#FF6700] border border-[#FF6700]/30 font-mono">
                  Subsonic API
                </span>
              </h3>
              <p className="text-xs text-zinc-400">
                支持直接绑定私有 NAS / Docker 中的 Navidrome 音乐服务器
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Server Input Form */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-[#FF6700]" />
              Navidrome 服务器地址 (Server URL)
            </label>
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="例如 http://192.168.1.100:4533 或 https://music.yourdomain.com"
              className="w-full px-4 py-2.5 rounded-xl bg-zinc-900 border border-white/10 text-white placeholder-zinc-500 text-xs font-mono focus:outline-none focus:border-[#FF6700] transition"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300">
                用户名 (Username)
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Navidrome 登录账号"
                className="w-full px-4 py-2.5 rounded-xl bg-zinc-900 border border-white/10 text-white placeholder-zinc-500 text-xs font-mono focus:outline-none focus:border-[#FF6700] transition"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1">
                <Lock className="w-3 h-3 text-zinc-400" />
                密码 (Password)
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Navidrome 登录密码"
                className="w-full px-4 py-2.5 rounded-xl bg-zinc-900 border border-white/10 text-white placeholder-zinc-500 text-xs font-mono focus:outline-none focus:border-[#FF6700] transition"
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
          <button
            onClick={handleTestConnection}
            disabled={isTesting || !serverUrl || !username}
            className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-xs font-semibold text-white transition disabled:opacity-50"
          >
            <Wifi className={`w-4 h-4 ${isTesting ? 'animate-pulse text-[#FF6700]' : 'text-zinc-400'}`} />
            <span>{isTesting ? '正在测试连接...' : '测试服务器连通性'}</span>
          </button>

          <button
            onClick={handleSyncNavidrome}
            disabled={isSyncing || !serverUrl || !username}
            className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#FF6700] hover:bg-[#FF6700]/90 text-xs font-bold text-white shadow-[0_0_15px_rgba(255,103,0,0.3)] transition disabled:opacity-50"
          >
            <Download className={`w-4 h-4 ${isSyncing ? 'animate-bounce' : ''}`} />
            <span>{isSyncing ? '正在拉取 Navidrome 曲库...' : '同步 Navidrome 曲库'}</span>
          </button>
        </div>

        {/* Test Result Alert */}
        {testResult && (
          <div className={`p-4 rounded-2xl border text-xs flex items-start gap-3 animate-in fade-in ${
            testResult.success 
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}>
            {testResult.success ? (
              <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
            )}
            <div className="space-y-0.5">
              <p className="font-bold">{testResult.success ? 'Navidrome 连接成功！' : '连接测试未通过'}</p>
              <p className="opacity-90 font-mono text-[11px]">{testResult.message}</p>
              {testResult.version && (
                <p className="text-[10px] text-emerald-400 font-mono">Server Version: {testResult.version}</p>
              )}
            </div>
          </div>
        )}

        {/* Sync Result Alert */}
        {syncResult && (
          <div className={`p-4 rounded-2xl border text-xs flex items-start gap-3 animate-in fade-in ${
            syncResult.success 
              ? 'bg-[#FF6700]/10 border-[#FF6700]/30 text-amber-200' 
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}>
            <Music2 className="w-5 h-5 text-[#FF6700] flex-shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold">{syncResult.success ? `成功导入 ${syncResult.count || 0} 首 Navidrome 歌曲！` : '曲库同步失败'}</p>
              <p className="opacity-90 text-[11px]">{syncResult.message || '已成功将 Navidrome 音乐库引入听蓝音乐播放器，并支持即时投播至小米音箱。'}</p>
            </div>
          </div>
        )}

        {/* Info Note */}
        <div className="p-4 rounded-2xl bg-zinc-900/40 border border-white/5 space-y-2 text-left">
          <h5 className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-[#FF6700]" />
            连接模式说明
          </h5>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            听蓝音乐支持通过 OpenSubsonic / Subsonic v1.16.1 认证规范连接您的私有 Navidrome 实例。导入后，所有歌曲可直接播放、查看同步歌词，并以高保真音质推送到小米小爱音箱播放。
          </p>
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-white/5 text-center text-[11px] text-zinc-500">
          基于 Subsonic REST 协议兼容层
        </div>

      </div>
    </div>
  );
};
