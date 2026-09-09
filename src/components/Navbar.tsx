import React from 'react';
import { 
  Radio, 
  Music2, 
  Mic2, 
  ChevronRight,
  Settings,
  Server,
  Cast
} from 'lucide-react';
import { XiaomiDevice, MiotConfig, User } from '../types';
import { UserHeader } from './UserHeader';

interface NavbarProps {
  activeTab: 'library' | 'lyrics' | 'xiaomi' | 'subsonic' | 'settings';
  setActiveTab: (tab: 'library' | 'lyrics' | 'xiaomi' | 'subsonic' | 'settings') => void;
  activeDevice: XiaomiDevice | undefined;
  miotConfig: MiotConfig;
  isCasting: boolean;
  songCount: number;
  user: User | null;
  securityAuthEnabled?: boolean;
  onOpenAuthModal: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  activeDevice,
  miotConfig,
  isCasting,
  songCount,
  user,
  securityAuthEnabled,
  onOpenAuthModal,
  onLogout
}) => {
  return (
    <header className="sticky top-0 z-40 bg-zinc-950/80 backdrop-blur-md border-b border-white/5 text-zinc-100">
      {/* Top Row: Brand on left, status indicators & user controls on right */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-3">
        
        {/* Brand */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="w-8 h-8 bg-[#FF6700] rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(255,103,0,0.4)] text-white flex-shrink-0">
            <Radio className="w-4.5 h-4.5" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight text-white flex items-center gap-1.5">
              <span className="font-extrabold tracking-wider">TINGLAN</span>
              <span className="text-xs font-normal text-zinc-400 font-serif">听澜</span>
            </span>
            <span className="text-[10px] uppercase tracking-[0.15em] bg-[#FF6700]/10 text-[#FF6700] px-2 py-0.5 rounded text-zinc-300 border border-[#FF6700]/30 font-semibold hidden sm:inline-block">
              Home Music Hub
            </span>
          </div>
        </div>

        {/* Right Status Badges & Controls */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          
          {/* Online System Status Indicator */}
          <div className="hidden md:flex flex-col items-end">
            <span className="text-[9px] text-zinc-500 font-medium uppercase tracking-wider">HUB ARCHITECTURE</span>
            <span className="text-[10px] text-emerald-400 font-medium flex items-center">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full mr-1.5 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.7)]"></span>
              Subsonic + Cast Protocols
            </span>
          </div>

          {/* Active Speaker Capsule Button */}
          <button
            id="btn-active-speaker-status"
            onClick={() => setActiveTab('xiaomi')}
            title="点击管理播放协议与音频设备路由"
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900/90 hover:bg-zinc-800/90 border border-white/10 hover:border-[#FF6700]/40 transition text-left backdrop-blur-sm shadow-sm"
          >
            <span className={`w-2 h-2 rounded-full ${activeDevice?.isOnline ? 'bg-[#FF6700] shadow-[0_0_8px_rgba(255,103,0,0.7)]' : 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]'}`} />
            <div className="hidden sm:block text-xs">
              <span className="text-zinc-100 font-semibold block truncate max-w-[120px] leading-tight">
                {activeDevice?.name || '小爱智能音箱Pro'}
              </span>
              <span className="text-zinc-400 text-[10px] block leading-none pt-0.5">
                {isCasting ? '协议串流中' : `音量: ${activeDevice?.status?.volume ?? 45}%`}
              </span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
          </button>

          {/* User Auth Header Controls */}
          <UserHeader
            user={user}
            onOpenAuthModal={onOpenAuthModal}
            onLogout={onLogout}
          />

        </div>

      </div>

      {/* Bottom Row (中枢导航): 音乐曲库, 播放协议控制, Subsonic API, 歌词播放, 设置 */}
      <div className="border-t border-white/5 bg-zinc-950/50 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-12 flex items-center justify-between">
          <nav className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-1">
            <button
              id="nav-tab-library"
              onClick={() => setActiveTab('library')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === 'library'
                  ? 'bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/40 shadow-[0_0_12px_rgba(255,103,0,0.15)] font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border border-transparent'
              }`}
            >
              <Music2 className="w-4 h-4" />
              <span>音乐曲库 ({songCount})</span>
            </button>

            <button
              id="nav-tab-xiaomi"
              onClick={() => setActiveTab('xiaomi')}
              className={`relative flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === 'xiaomi'
                  ? 'bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/40 shadow-[0_0_14px_rgba(255,103,0,0.2)] font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border border-transparent'
              }`}
            >
              <Cast className="w-4 h-4 text-[#FF6700]" />
              <span>播放协议控制</span>
              {isCasting && (
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF6700] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#FF6700] shadow-[0_0_8px_rgba(255,103,0,0.8)]"></span>
                </span>
              )}
            </button>

            <button
              id="nav-tab-subsonic"
              onClick={() => setActiveTab('subsonic')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === 'subsonic'
                  ? 'bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/40 shadow-[0_0_12px_rgba(255,103,0,0.15)] font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border border-transparent'
              }`}
            >
              <Server className="w-4 h-4 text-amber-400" />
              <span>Subsonic 服务端</span>
            </button>

            <button
              id="nav-tab-lyrics"
              onClick={() => setActiveTab('lyrics')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === 'lyrics'
                  ? 'bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/40 shadow-[0_0_12px_rgba(255,103,0,0.15)] font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border border-transparent'
              }`}
            >
              <Mic2 className="w-4 h-4" />
              <span>歌词唱机</span>
            </button>

            {/* 设置 (整合成完整页面，涵盖安全防护与数据库管理) */}
            <button
              id="nav-tab-settings"
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === 'settings'
                  ? 'bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/40 shadow-[0_0_12px_rgba(255,103,0,0.15)] font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border border-transparent'
              }`}
              title="系统设置、安全保护与数据库管理"
            >
              <Settings className={`w-4 h-4 ${activeTab === 'settings' ? 'text-[#FF6700]' : 'text-zinc-400'}`} />
              <span>设置</span>
              {securityAuthEnabled && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" title="已开启登录防护" />
              )}
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
};


