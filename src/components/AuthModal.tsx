import React, { useState, useEffect } from 'react';
import { User, Lock, Mail, UserPlus, LogIn, Sparkles, X, Shield, KeyRound, Check, AlertCircle } from 'lucide-react';
import { User as UserType } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: UserType, token: string) => void;
  isSecurityRequired?: boolean;
  allowRegistration?: boolean;
}

export const AuthModal: React.FC<AuthModalProps> = ({ 
  isOpen, 
  onClose, 
  onLoginSuccess,
  isSecurityRequired = false,
  allowRegistration = true
}) => {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('admin123');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      setErrorMsg('');
      setSuccessMsg('');
      setLoading(false);
      if (!allowRegistration && isRegister) {
        setIsRegister(false);
      }
      if (!isRegister && !username) {
        setUsername('admin');
        setPassword('admin123');
      }
    }
  }, [isOpen, isRegister, allowRegistration]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    // If security is required (mandatory blocking), never allow backdrop dismissal
    if (isSecurityRequired) return;
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (isRegister && password !== confirmPassword) {
      setErrorMsg('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    try {
      const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
      const body = isRegister 
        ? { username, email, password }
        : { usernameOrEmail: username, password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || '操作失败，请重试');
      }

      if (isRegister) {
        setSuccessMsg('账号注册成功！正在为您自动登录...');
        setTimeout(() => {
          onLoginSuccess(data.user, data.token);
          onClose();
        }, 800);
      } else {
        onLoginSuccess(data.user, data.token);
        onClose();
      }
    } catch (err: any) {
      setErrorMsg(err.message || '连接服务器异常');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminQuickLogin = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: 'admin', password: 'admin123' })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onLoginSuccess(data.user, data.token);
        onClose();
      } else {
        setErrorMsg('管理员账号初始登录失败，请手动登录');
      }
    } catch (err: any) {
      setErrorMsg('网络连接异常');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 pointer-events-auto select-auto"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="bg-[#18181b] border-2 border-zinc-700 rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] relative overflow-hidden space-y-6 animate-in fade-in zoom-in-95 duration-200"
      >
        
        {/* Decorative Background glow */}
        <div className="absolute top-[-20%] right-[-10%] w-[200px] h-[200px] bg-[#FF6700]/15 rounded-full blur-[60px] pointer-events-none" />

        {/* Close Button - Only show if NOT mandatory */}
        {!isSecurityRequired && (
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
            title="关闭窗口"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Mandatory Security Banner when protected */}
        {isSecurityRequired && (
          <div className="p-3.5 rounded-2xl bg-amber-950/80 border-2 border-amber-500/60 text-amber-100 text-xs flex items-start gap-3 shadow-sm">
            <div className="p-1.5 rounded-xl bg-amber-500/30 text-amber-300 flex-shrink-0 mt-0.5">
              <Shield className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <div className="font-bold text-amber-200 text-xs tracking-wide">已开启安全登录防护（全网 / 公网限制）</div>
              <div className="text-[12px] text-amber-100/90 leading-relaxed font-normal">
                系统当前受密码保护，请登录管理员账号或授权账号方可解锁并操作音乐控制中心。
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="space-y-2 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#FF6700]/20 border-2 border-[#FF6700]/40 text-[#FF6700] mx-auto flex items-center justify-center shadow-lg shadow-[#FF6700]/10">
            {isRegister ? <UserPlus className="w-7 h-7" /> : <LogIn className="w-7 h-7" />}
          </div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight">
            {isRegister ? '注册听澜音乐账号' : '登录听澜音乐系统'}
          </h2>
          <p className="text-xs text-zinc-300 font-medium">
            {isRegister ? '创建个人账号，解锁专属曲库与小爱音箱投放偏好' : '输入管理员或用户凭证，解锁曲库与音箱控制'}
          </p>
        </div>

        {/* Error / Success Toast inside modal */}
        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-950/80 border-2 border-rose-500/60 text-rose-200 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="p-3 rounded-xl bg-emerald-950/80 border-2 border-emerald-500/60 text-emerald-200 text-xs font-semibold flex items-center gap-2">
            <Check className="w-4 h-4 flex-shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-zinc-200 mb-1.5">
              用户名或电子邮箱
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                required
                placeholder={isRegister ? '自定义用户名 (如: admin)' : '输入用户名 (默认: admin) 或邮箱'}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-[#09090b] border-2 border-zinc-600 focus:border-[#FF6700] rounded-xl text-sm font-medium text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#FF6700]/30 transition"
              />
            </div>
          </div>

          {isRegister && (
            <div>
              <label className="block text-xs font-bold text-zinc-200 mb-1.5">
                电子邮箱 (用于找回密码)
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-[#09090b] border-2 border-zinc-600 focus:border-[#FF6700] rounded-xl text-sm font-medium text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#FF6700]/30 transition"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-zinc-200 mb-1.5">
              密码
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="password"
                required
                placeholder={isRegister ? '设置 6 位以上安全密码' : '输入密码 (默认: admin123)'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-[#09090b] border-2 border-zinc-600 focus:border-[#FF6700] rounded-xl text-sm font-medium text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#FF6700]/30 transition"
              />
            </div>
          </div>

          {isRegister && (
            <div>
              <label className="block text-xs font-bold text-zinc-200 mb-1.5">
                确认密码
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="password"
                  required
                  placeholder="再次输入密码"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-[#09090b] border-2 border-zinc-600 focus:border-[#FF6700] rounded-xl text-sm font-medium text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#FF6700]/30 transition"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-[#FF6700] hover:bg-[#e55c00] text-white text-base font-bold shadow-[0_4px_20px_rgba(255,103,0,0.4)] transition-all active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              <span className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <span>{isRegister ? '立即注册并登录' : '立即登录'}</span>
            )}
          </button>
        </form>

        {/* Quick Admin Login Preset */}
        {!isRegister && (
          <div className="pt-2 border-t border-zinc-700/80 space-y-2">
            <button
              type="button"
              onClick={handleAdminQuickLogin}
              disabled={loading}
              className="w-full py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700/90 border-2 border-zinc-600 text-amber-300 hover:text-amber-200 text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
            >
              <Shield className="w-4 h-4 text-amber-400" />
              <span>一键填入默认管理员并登录 (admin / admin123)</span>
            </button>
          </div>
        )}

        {/* Switch Login / Register Footer */}
        <div className="text-center pt-2">
          {allowRegistration ? (
            <button
              type="button"
              onClick={() => {
                setIsRegister(!isRegister);
                setErrorMsg('');
                setSuccessMsg('');
              }}
              className="text-xs font-semibold text-zinc-300 hover:text-[#FF6700] transition inline-flex items-center gap-1 cursor-pointer"
            >
              {isRegister ? (
                <>已有账号？<span className="text-[#FF6700] underline">点击登录</span></>
              ) : (
                <>还没有账号？<span className="text-[#FF6700] underline">免费注册新账号</span></>
              )}
            </button>
          ) : (
            <div className="text-[11px] text-zinc-400 flex items-center justify-center gap-1.5 bg-zinc-900/60 py-2 px-3 rounded-xl border border-white/5">
              <Lock className="w-3.5 h-3.5 text-zinc-400" />
              <span>系统当前已关闭开放注册功能，新账号请联系管理员在后台创建</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
