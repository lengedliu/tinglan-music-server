import React from 'react';
import { LogIn, LogOut } from 'lucide-react';
import { User } from '../types';
import { getUserAvatar } from '../utils/avatar';

interface UserHeaderProps {
  user: User | null;
  onOpenAuthModal: () => void;
  onLogout: () => void;
}

export const UserHeader: React.FC<UserHeaderProps> = ({
  user,
  onOpenAuthModal,
  onLogout
}) => {
  return (
    <div className="flex items-center gap-2">
      {/* User Status Badge or Login Button */}
      {user ? (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-zinc-900/90 border border-white/10 rounded-full px-2.5 py-1">
            <img
              src={getUserAvatar(user)}
              alt={user.username}
              className="w-6 h-6 rounded-full object-cover border border-[#FF6700]/40 shadow-sm"
              referrerPolicy="no-referrer"
              onError={(e) => {
                // Fallback to text initials if image fails
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <div className="flex flex-col max-w-[70px] sm:max-w-[120px]">
              <span className="text-xs font-semibold text-white leading-tight truncate">
                {user.username}
              </span>
              <span className="text-[9px] text-[#FF6700] font-mono leading-none hidden sm:inline">
                {user.role === 'admin' ? '管理员' : '普通会员'}
              </span>
            </div>
          </div>

          <button
            id="btn-user-logout"
            onClick={onLogout}
            className="p-1.5 rounded-full text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer min-w-[32px] min-h-[32px] flex items-center justify-center"
            title="退出登录"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          id="btn-open-auth-modal"
          onClick={onOpenAuthModal}
          className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-full bg-[#FF6700] hover:bg-[#e55c00] text-white text-xs font-semibold shadow-[0_2px_10px_rgba(255,103,0,0.3)] transition active:scale-95 cursor-pointer min-h-[36px]"
        >
          <LogIn className="w-3.5 h-3.5" />
          <span>登录<span className="hidden sm:inline"> / 注册</span></span>
        </button>
      )}

    </div>
  );
};
