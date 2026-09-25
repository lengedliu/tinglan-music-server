import React, { useState } from 'react';
import { ShieldAlert, KeyRound, Lock, Eye, EyeOff, CheckCircle2, AlertCircle, X, ShieldCheck } from 'lucide-react';
import { apiFetch } from '../utils/api';
import { useTheme } from '../context/ThemeContext';

interface ForceChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPasswordChanged: () => void;
  username?: string;
}

export const ForceChangePasswordModal: React.FC<ForceChangePasswordModalProps> = ({
  isOpen,
  onClose,
  onPasswordChanged,
  username = 'admin'
}) => {
  const { themeConfig } = useTheme();
  const isLight = !!themeConfig?.isLight;

  const [oldPassword, setOldPassword] = useState('admin123');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  // Password strength calculation
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: '未输入', color: 'bg-zinc-600' };
    let score = 0;
    if (pass.length >= 6) score += 1;
    if (pass.length >= 10) score += 1;
    if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;

    if (score <= 1) return { score: 1, label: '弱 (建议更长)', color: 'bg-rose-500' };
    if (score <= 3) return { score: 2, label: '中等', color: 'bg-amber-500' };
    return { score: 3, label: '强 (高安全)', color: 'bg-emerald-500' };
  };

  const strength = getPasswordStrength(newPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!newPassword || newPassword.length < 6) {
      setErrorMsg('新密码长度不能少于 6 位');
      return;
    }

    if (newPassword === 'admin123') {
      setErrorMsg('新密码不能与默认密码 admin123 相同，请设置更安全的密码');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('两次输入的新密码不一致，请重新确认');
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          oldPassword,
          newPassword
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || '修改密码失败，请检查原密码是否正确');
      }

      setSuccessMsg('管理员密码已成功更新！系统已加固。');
      setTimeout(() => {
        onPasswordChanged();
        onClose();
      }, 900);
    } catch (err: any) {
      setErrorMsg(err.message || '网络请求异常，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div 
        className={`relative w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl border transition-all ${
          isLight 
            ? 'bg-white border-amber-300 text-zinc-900 shadow-amber-500/10' 
            : 'bg-zinc-900 border-amber-500/30 text-zinc-100 shadow-amber-500/20'
        }`}
      >
        {/* Top Warning Ribbon */}
        <div className="bg-gradient-to-r from-amber-600 via-rose-600 to-amber-600 px-6 py-3.5 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-black/20 backdrop-blur-sm animate-pulse">
              <ShieldAlert className="w-5 h-5 text-amber-200" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-wide flex items-center gap-1.5">
                <span>首次部署安全强提醒</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 font-mono uppercase">P0 High Priority</span>
              </h3>
              <p className="text-[11px] text-amber-100/90 font-normal">检测到管理员正使用初始弱密码</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition"
            title="稍后提醒（暂不修改）"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-7 space-y-5">
          {/* Detailed Alert Message */}
          <div className={`p-4 rounded-xl border flex items-start gap-3.5 text-xs ${
            isLight
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-amber-500/10 border-amber-500/20 text-amber-200'
          }`}>
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-500 mt-0.5" />
            <div className="space-y-1 leading-relaxed">
              <p className="font-semibold text-xs">
                当前管理员账号 <code className="px-1.5 py-0.5 rounded bg-black/10 font-mono text-amber-600 dark:text-amber-300 font-bold">admin</code> 仍在使用默认密码 <code className="px-1.5 py-0.5 rounded bg-black/10 font-mono text-rose-500 font-bold">admin123</code>。
              </p>
              <p className={isLight ? 'text-amber-800' : 'text-amber-300/80'}>
                在公网端口映射、DDNS 或内网开放环境中，默认口令极易遭到全网扫描与恶意字典爆破，可能导致曲库被篡改或音箱被越权播发。请立即设置新的强密码以加固系统。
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Old Password */}
            <div>
              <label className={`block text-xs font-semibold mb-1.5 ${isLight ? 'text-zinc-700' : 'text-zinc-300'}`}>
                当前原密码 (默认已填)
              </label>
              <div className="relative">
                <input
                  type={showOldPassword ? 'text' : 'password'}
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  required
                  className={`w-full px-3.5 py-2.5 pl-10 pr-10 rounded-xl text-sm font-mono border transition outline-none ${
                    isLight
                      ? 'bg-zinc-50 border-zinc-300 focus:border-amber-500 focus:bg-white text-zinc-900'
                      : 'bg-zinc-800/80 border-white/10 focus:border-amber-500 focus:bg-zinc-800 text-zinc-100'
                  }`}
                  placeholder="admin123"
                />
                <Lock className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
                <button
                  type="button"
                  onClick={() => setShowOldPassword(!showOldPassword)}
                  className="absolute right-3 top-3 text-zinc-400 hover:text-zinc-200 transition"
                  tabIndex={-1}
                >
                  {showOldPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={`text-xs font-semibold ${isLight ? 'text-zinc-700' : 'text-zinc-300'}`}>
                  设置新管理员密码
                </label>
                {newPassword && (
                  <span className="text-[11px] font-medium flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${strength.color}`} />
                    <span className={isLight ? 'text-zinc-600' : 'text-zinc-400'}>强度: {strength.label}</span>
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoFocus
                  minLength={6}
                  className={`w-full px-3.5 py-2.5 pl-10 pr-10 rounded-xl text-sm font-mono border transition outline-none ${
                    isLight
                      ? 'bg-zinc-50 border-zinc-300 focus:border-amber-500 focus:bg-white text-zinc-900'
                      : 'bg-zinc-800/80 border-white/10 focus:border-amber-500 focus:bg-zinc-800 text-zinc-100'
                  }`}
                  placeholder="请输入 6 位以上新密码"
                />
                <KeyRound className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-3 text-zinc-400 hover:text-zinc-200 transition"
                  tabIndex={-1}
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div>
              <label className={`block text-xs font-semibold mb-1.5 ${isLight ? 'text-zinc-700' : 'text-zinc-300'}`}>
                再次确认新密码
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className={`w-full px-3.5 py-2.5 pl-10 pr-10 rounded-xl text-sm font-mono border transition outline-none ${
                    isLight
                      ? 'bg-zinc-50 border-zinc-300 focus:border-amber-500 focus:bg-white text-zinc-900'
                      : 'bg-zinc-800/80 border-white/10 focus:border-amber-500 focus:bg-zinc-800 text-zinc-100'
                  }`}
                  placeholder="再次输入以确认"
                />
                <Lock className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
              </div>
            </div>

            {/* Error / Success Feedback */}
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition border ${
                  isLight
                    ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-300'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-white/10'
                }`}
              >
                稍后提醒我
              </button>

              <button
                type="submit"
                disabled={loading || !newPassword || newPassword.length < 6}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-amber-600 via-[#FF6700] to-rose-600 hover:opacity-95 active:scale-95 transition shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>正在更新密码...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>立即修改并加固安全</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
