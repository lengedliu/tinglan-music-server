import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  ShieldCheck, 
  ShieldAlert, 
  Globe, 
  Wifi, 
  Lock, 
  Unlock, 
  Key, 
  Check, 
  AlertCircle, 
  X, 
  Eye, 
  EyeOff, 
  RefreshCw, 
  Server,
  Info,
  Settings
} from 'lucide-react';
import { SecuritySettings, SecurityStatus, User } from '../types';
import { apiFetch } from '../utils/api';

interface SecuritySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onOpenAuthModal?: () => void;
  onSecurityUpdated?: () => void;
}

export const SecuritySettingsModal: React.FC<SecuritySettingsModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onOpenAuthModal,
  onSecurityUpdated
}) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  
  // Settings form state
  const [requireAuth, setRequireAuth] = useState(false);
  const [authScope, setAuthScope] = useState<'all' | 'wan_only'>('all');
  const [allowUserMiotControl, setAllowUserMiotControl] = useState(true);
  const [allowUserMiotTts, setAllowUserMiotTts] = useState(false);
  
  // Change password state
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Status feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchSecurityStatus();
    }
  }, [isOpen]);

  const fetchSecurityStatus = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await apiFetch('/api/auth/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        setRequireAuth(Boolean(data.globalRequireAuth ?? data.authRequired));
        setAuthScope(data.authScope || 'all');
        setAllowUserMiotControl(data.allowUserMiotControl !== false);
        setAllowUserMiotTts(Boolean(data.allowUserMiotTts));
      }
    } catch (err: any) {
      console.error('Failed to fetch security status:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const res = await apiFetch('/api/system/security', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requireAuth,
          authScope,
          allowUserMiotControl,
          allowUserMiotTts
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '保存安全设置失败');
      }

      setFeedback({ type: 'success', message: '安全防护配置已成功保存并立即生效！' });
      fetchSecurityStatus();
      if (onSecurityUpdated) onSecurityUpdated();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || '更新设置异常' });
    } finally {
      setSaving(false);
    }
  };

  const handleChangeAdminPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordSuccess('');
    setPasswordError('');

    if (newPassword.length < 6) {
      setPasswordError('密码长度不能少于 6 位');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('两次输入的密码不一致');
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await apiFetch('/api/auth/change-admin-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '修改管理员密码失败');
      }

      setPasswordSuccess('管理员密码已成功更新！请妥善保管新密码。');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setShowPasswordChange(false), 2000);
    } catch (err: any) {
      setPasswordError(err.message || '修改密码异常');
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-zinc-900/95 border border-white/10 rounded-3xl p-6 sm:p-8 w-full max-w-2xl shadow-2xl backdrop-blur-xl relative overflow-hidden my-8 space-y-6">
        
        {/* Subtle accent glow */}
        <div className="absolute top-0 right-0 w-[240px] h-[240px] bg-[#FF6700]/10 rounded-full blur-[80px] pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#FF6700]/15 border border-[#FF6700]/30 text-[#FF6700] flex items-center justify-center flex-shrink-0">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white tracking-tight">
                系统设置与安全防护
              </h2>
              <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium ${
                requireAuth 
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}>
                {requireAuth ? '登录保护已开启' : '登录保护未开启'}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              防止将听澜音乐服务通过公网 IP、DDNS 动态域名、内网穿透（FRP / NPS / Cloudflare）暴露到外网时被他人未授权操作。
            </p>
          </div>
        </div>

        {/* Feedback Message Banner */}
        {feedback && (
          <div className={`p-3.5 rounded-2xl text-xs flex items-center gap-2.5 border ${
            feedback.type === 'success' 
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' 
              : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
          }`}>
            {feedback.type === 'success' ? <Check className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
            <span className="font-medium">{feedback.message}</span>
          </div>
        )}

        {/* Network & Client Detection Card */}
        <div className="p-4 rounded-2xl bg-zinc-950/60 border border-white/5 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-zinc-900 flex items-center justify-center text-zinc-400 border border-white/5">
              <Server className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 font-medium block">当前访客客户端 IP</span>
              <span className="text-xs font-mono text-zinc-200 font-semibold">{status?.clientIp || '127.0.0.1'}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-zinc-900 flex items-center justify-center text-zinc-400 border border-white/5">
              {status?.isLan ? <Wifi className="w-4 h-4 text-emerald-400" /> : <Globe className="w-4 h-4 text-[#FF6700]" />}
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 font-medium block">当前网络归属</span>
              <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1">
                {status?.isLan ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    局域网内网 (LAN)
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#FF6700]" />
                    外部互联网 (WAN)
                  </>
                )}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-zinc-900 flex items-center justify-center text-zinc-400 border border-white/5">
              {status?.authRequired ? <Lock className="w-4 h-4 text-emerald-400" /> : <Unlock className="w-4 h-4 text-zinc-400" />}
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 font-medium block">访问拦截状态</span>
              <span className="text-xs font-semibold text-zinc-200">
                {status?.authRequired ? '须输入账号登录' : '当前客户端免密访问'}
              </span>
            </div>
          </div>
        </div>

        {/* Security Settings Form */}
        <form onSubmit={handleSaveSettings} className="space-y-5">
          
          {/* Main Toggle Switch */}
          <div className="p-4 sm:p-5 rounded-2xl bg-zinc-950/80 border border-white/10 flex items-center justify-between gap-4">
            <div className="space-y-1 pr-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">开启系统登录保护认证</span>
                <span className="text-[10px] bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded font-mono">
                  REQUIRE_AUTH
                </span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                开启后，所有访问 Web 界面、控制小爱音箱、管理曲库的请求均须使用账号与密码验证。
              </p>
            </div>

            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
              <input
                id="toggle-require-auth"
                type="checkbox"
                checked={requireAuth}
                onChange={(e) => setRequireAuth(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-14 h-8 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-[#FF6700]"></div>
            </label>
          </div>

          {/* Scope Options (enabled when requireAuth is true) */}
          <div className={`space-y-3 transition-opacity duration-200 ${requireAuth ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider">
              防护生效范围策略
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Option 1: All networks */}
              <div
                onClick={() => requireAuth && setAuthScope('all')}
                className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                  authScope === 'all'
                    ? 'bg-[#FF6700]/10 border-[#FF6700]/50 shadow-[0_0_15px_rgba(255,103,0,0.15)]'
                    : 'bg-zinc-950/60 border-white/5 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Shield className={`w-4 h-4 ${authScope === 'all' ? 'text-[#FF6700]' : 'text-zinc-400'}`} />
                    <span className="text-xs font-bold text-white">全域强制登录 (最高安全)</span>
                  </div>
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                    authScope === 'all' ? 'border-[#FF6700] bg-[#FF6700]' : 'border-zinc-600'
                  }`}>
                    {authScope === 'all' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  无论是家庭局域网还是公网外网，所有访客均必须登录后方可操作。建议用于公网部署。
                </p>
              </div>

              {/* Option 2: WAN only (LAN exempt) */}
              <div
                onClick={() => requireAuth && setAuthScope('wan_only')}
                className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                  authScope === 'wan_only'
                    ? 'bg-[#FF6700]/10 border-[#FF6700]/50 shadow-[0_0_15px_rgba(255,103,0,0.15)]'
                    : 'bg-zinc-950/60 border-white/5 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Wifi className={`w-4 h-4 ${authScope === 'wan_only' ? 'text-[#FF6700]' : 'text-zinc-400'}`} />
                    <span className="text-xs font-bold text-white">仅外网强制登录 (局域网免登)</span>
                  </div>
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                    authScope === 'wan_only' ? 'border-[#FF6700] bg-[#FF6700]' : 'border-zinc-600'
                  }`}>
                    {authScope === 'wan_only' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  局域网内设备（192.168.x.x 等）免登录秒开体验；一旦通过公网 IP / 穿透域名访问，则强制拦截并要求登录。
                </p>
              </div>
            </div>
          </div>

          {/* Speaker Stream Whitelist Notice */}
          <div className="p-3.5 rounded-2xl bg-zinc-950/60 border border-white/5 flex items-start gap-3 text-xs text-zinc-400">
            <Info className="w-4 h-4 text-[#FF6700] flex-shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="text-zinc-200 font-semibold">硬件音箱串流白名单：</span>
              小米音箱与 DLNA 设备通过 <code className="text-[#FF6700] font-mono">/api/stream/*</code> 获取音频流采用硬件直通机制，开启登录保护完全不会影响小爱音箱拉取并播放音乐。
            </div>
          </div>

          {/* Smart Speaker Granular Authorization (Dual Toggles) */}
          <div className="space-y-3.5 pt-4 border-t border-white/5">
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider">
              音箱授权控制策略 (Smart Speaker Access Controls)
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Playback Control Permission */}
              <div className="p-4 rounded-2xl bg-zinc-950/80 border border-white/10 flex items-center justify-between gap-4">
                <div className="space-y-0.5 pr-2">
                  <span className="text-xs font-bold text-white block">允许普通用户切歌点歌</span>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    开启后，家庭普通成员也有权控制音箱的播放、暂停和调整音量。关闭则仅管理员可操作。
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={allowUserMiotControl}
                    onChange={(e) => setAllowUserMiotControl(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#FF6700]"></div>
                </label>
              </div>

              {/* TTS Announcement Permission */}
              <div className="p-4 rounded-2xl bg-zinc-950/80 border border-white/10 flex items-center justify-between gap-4">
                <div className="space-y-0.5 pr-2">
                  <span className="text-xs font-bold text-white block">允许普通用户发送 TTS 播报</span>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    开启后，普通成员可以向音箱发起语音文字广播。建议默认关闭，避免非管理员进行夜间骚扰。
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={allowUserMiotTts}
                    onChange={(e) => setAllowUserMiotTts(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#FF6700]"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Save Settings Button */}
          <div className="flex items-center justify-between pt-4 border-t border-white/5">
            <div className="text-xs text-zinc-400">
              {currentUser ? (
                <span>当前操作身份: <strong className="text-white">{currentUser.username}</strong> ({currentUser.role === 'admin' ? '管理员' : '普通用户'})</span>
              ) : (
                <span className="text-amber-400/90">提示: 开启后建议立即使用管理员账号登录</span>
              )}
            </div>

            <button
              id="btn-save-security-settings"
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-full bg-[#FF6700] hover:bg-[#e55c00] text-white text-xs font-semibold shadow-[0_2px_12px_rgba(255,103,0,0.3)] transition active:scale-95 disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
              <span>保存安全配置</span>
            </button>
          </div>
        </form>

        {/* Change Admin Password Collapsible Section */}
        <div className="pt-4 border-t border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-white">默认管理员密码保护</span>
              <span className="text-[10px] text-zinc-500 font-mono">账号: admin</span>
            </div>
            
            <button
              type="button"
              onClick={() => setShowPasswordChange(!showPasswordChange)}
              className="text-xs text-[#FF6700] hover:underline"
            >
              {showPasswordChange ? '收起修改表单' : '修改管理员密码'}
            </button>
          </div>

          {showPasswordChange && (
            <form onSubmit={handleChangeAdminPassword} className="mt-4 p-4 rounded-2xl bg-zinc-950/80 border border-white/10 space-y-3">
              <p className="text-xs text-zinc-400">
                初始默认密码为 <code className="text-amber-400 font-mono bg-white/5 px-1.5 py-0.5 rounded">admin123</code>。为了防止外网撞库，建议修改为强密码：
              </p>

              {passwordError && (
                <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{passwordError}</span>
                </div>
              )}

              {passwordSuccess && (
                <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{passwordSuccess}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1 font-medium">新管理员密码</label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      placeholder="设置 6 位以上新密码"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-900 border border-white/10 rounded-xl text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#FF6700]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                    >
                      {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1 font-medium">确认新密码</label>
                  <input
                    type="password"
                    required
                    placeholder="再次输入新密码"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-900 border border-white/10 rounded-xl text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#FF6700]"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-black text-xs font-bold transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {passwordLoading && <RefreshCw className="w-3 h-3 animate-spin" />}
                  <span>确认修改密码</span>
                </button>
              </div>
            </form>
          )}
        </div>

      </div>
    </div>
  );
};
