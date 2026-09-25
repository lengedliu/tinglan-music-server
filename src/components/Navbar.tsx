import React from 'react';
import { 
  Radio, 
  Music2, 
  Mic2, 
  ChevronRight,
  Settings,
  Server,
  Cast,
  Palette,
  Sun,
  Moon,
  Heart,
  Speaker,
  Laptop,
  Rss
} from 'lucide-react';
import { XiaomiDevice, MiotConfig, User } from '../types';
import { UserHeader } from './UserHeader';
import { useTheme } from '../context/ThemeContext';

interface NavbarProps {
  activeTab: 'library' | 'radio' | 'lyrics' | 'xiaomi' | 'subsonic' | 'settings' | 'sponsor';
  setActiveTab: (tab: 'library' | 'radio' | 'lyrics' | 'xiaomi' | 'subsonic' | 'settings' | 'sponsor') => void;
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
  const { themeConfig, setIsThemeModalOpen, toggleDarkLight } = useTheme();

  return (
    <header className="sticky top-0 z-40 bg-zinc-950/80 backdrop-blur-md border-b border-white/5 text-zinc-100">
      {/* Top Row: Brand on left, status indicators & user controls on right */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-2 sm:gap-3 overflow-x-hidden">
        
        {/* Brand */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <div 
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-white flex-shrink-0 shadow-md"
            style={{ backgroundColor: themeConfig.primaryColor }}
          >
            <Radio className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="text-base sm:text-xl font-bold tracking-tight text-white flex items-center gap-1 sm:gap-1.5">
              <span className="font-extrabold tracking-wider">TINGLAN</span>
              <span className="text-[11px] sm:text-xs font-normal text-zinc-400 font-serif">听澜</span>
            </span>
            <span 
              className="text-[10px] uppercase tracking-[0.15em] px-2 py-0.5 rounded border font-semibold hidden sm:inline-block"
              style={{
                backgroundColor: `rgba(${themeConfig.primaryRgb}, 0.1)`,
                color: themeConfig.primaryColor,
                borderColor: `rgba(${themeConfig.primaryRgb}, 0.3)`
              }}
            >
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

          {/* Theme Quick Switcher Button */}
          <div className="flex items-center gap-1 bg-zinc-900/90 p-1 rounded-full border border-white/10 backdrop-blur-sm">
            <button
              id="btn-toggle-light-dark"
              onClick={toggleDarkLight}
              title={themeConfig.isLight ? '切换为极客暗夜模式 (Dark Mode)' : '切换为清爽日间亮色 (Light Mode)'}
              className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-full hover:bg-white/10 text-amber-400 transition cursor-pointer"
            >
              {themeConfig.isLight ? (
                <Sun className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-zinc-400 hover:text-white" />
              )}
            </button>

            <button
              id="btn-theme-switcher"
              onClick={() => setIsThemeModalOpen(true)}
              title={`选择更多 UI 主题 (当前: ${themeConfig.name})`}
              className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full hover:bg-white/10 transition text-xs cursor-pointer"
            >
              <Palette className="w-3.5 h-3.5 text-amber-400" />
              <div 
                className="w-2.5 h-2.5 rounded-full border border-white/20"
                style={{ backgroundColor: themeConfig.primaryColor }}
              />
              <span className="hidden lg:inline text-[11px] text-zinc-300 font-medium">
                {themeConfig.name}
              </span>
            </button>
          </div>

          {/* Active Speaker Capsule Button */}
          <button
            id="btn-active-speaker-status"
            onClick={() => setActiveTab('xiaomi')}
            title="点击管理播放协议与音频设备路由"
            className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-full bg-zinc-900/90 hover:bg-zinc-800/90 border border-white/10 transition text-left backdrop-blur-sm shadow-sm cursor-pointer min-h-[36px]"
            style={{
              borderColor: isCasting ? '#FF6700' : `rgba(${themeConfig.primaryRgb}, 0.2)`
            }}
          >
            <span 
              className="w-2 h-2 rounded-full shrink-0"
              style={{ 
                backgroundColor: isCasting ? '#FF6700' : (activeDevice?.isOnline ? themeConfig.primaryColor : '#34d399'),
                boxShadow: isCasting ? '0 0 10px rgba(255,103,0,0.8)' : `0 0 8px rgba(${themeConfig.primaryRgb}, 0.7)` 
              }} 
            />
            {isCasting ? (
              <Speaker className="w-3.5 h-3.5 text-[#FF6700] sm:hidden" />
            ) : (
              <Laptop className="w-3.5 h-3.5 text-zinc-400 sm:hidden" />
            )}
            <div className="hidden sm:block text-xs">
              <span className="text-zinc-100 font-semibold flex items-center gap-1 leading-tight">
                {isCasting ? (
                  <>
                    <Speaker className="w-3 h-3 text-[#FF6700]" />
                    <span className="truncate max-w-[110px] text-[#FF6700]">
                      {activeDevice?.name || '小爱音箱'}
                    </span>
                  </>
                ) : (
                  <>
                    <Laptop className="w-3 h-3 text-zinc-400" />
                    <span className="truncate max-w-[110px] text-zinc-300">
                      本地设备
                    </span>
                  </>
                )}
              </span>
              <span className="text-zinc-400 text-[10px] block leading-none pt-0.5 font-medium">
                {isCasting ? `音箱: ${activeDevice?.status?.volume ?? 40}%` : `待命: ${activeDevice?.name || '小爱音箱'}`}
              </span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-zinc-400 hidden sm:inline" />
          </button>

          {/* User Auth Header Controls */}
          <UserHeader
            user={user}
            onOpenAuthModal={onOpenAuthModal}
            onLogout={onLogout}
          />

        </div>

      </div>


      {/* Bottom Row (中枢导航): 仅在平板和桌面端展示，手机端采用触控底部导航栏 */}
      <div className="hidden md:block border-t border-white/5 bg-transparent backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-12 flex items-center justify-between">
          <nav className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-1">
            <button
              id="nav-tab-library"
              onClick={() => setActiveTab('library')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === 'library'
                  ? themeConfig.activeTabStyle
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
                  ? themeConfig.activeTabStyle
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border border-transparent'
              }`}
            >
              <Cast className="w-4 h-4" style={{ color: activeTab === 'xiaomi' ? themeConfig.primaryColor : undefined }} />
              <span>智能音箱</span>
              {isCasting && (
                <span className="flex h-2 w-2 relative">
                  <span 
                    className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                    style={{ backgroundColor: themeConfig.primaryColor }}
                  />
                  <span 
                    className="relative inline-flex rounded-full h-2 w-2"
                    style={{ backgroundColor: themeConfig.primaryColor, boxShadow: `0 0 8px rgba(${themeConfig.primaryRgb}, 0.8)` }}
                  />
                </span>
              )}
            </button>

            <button
              id="nav-tab-radio"
              onClick={() => setActiveTab('radio')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === 'radio'
                  ? themeConfig.activeTabStyle
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border border-transparent'
              }`}
              title="广播电台直播流与播客 RSS 订阅"
            >
              <Rss className="w-4 h-4 text-amber-400" />
              <span>广播与播客</span>
            </button>

            <button
              id="nav-tab-subsonic"
              onClick={() => setActiveTab('subsonic')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === 'subsonic'
                  ? themeConfig.activeTabStyle
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
                  ? themeConfig.activeTabStyle
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border border-transparent'
              }`}
            >
              <Mic2 className="w-4 h-4" />
              <span>歌词唱机</span>
            </button>

            {/* 设置 */}
            <button
              id="nav-tab-settings"
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === 'settings'
                  ? themeConfig.activeTabStyle
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border border-transparent'
              }`}
              title="系统设置、界面主题与安全防护"
            >
              <Settings className="w-4 h-4" style={{ color: activeTab === 'settings' ? themeConfig.primaryColor : undefined }} />
              <span>设置</span>
              {securityAuthEnabled && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" title="已开启登录防护" />
              )}
            </button>

            {/* 赞助支持 */}
            <button
              id="nav-tab-sponsor"
              onClick={() => setActiveTab('sponsor')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === 'sponsor'
                  ? 'bg-rose-500/15 text-rose-400 border border-rose-500/40 shadow-sm'
                  : 'text-rose-400/80 hover:text-rose-300 hover:bg-rose-500/10 border border-transparent'
              }`}
              title="请作者喝杯咖啡，支持 Tinglan 持续迭代与硬件适配"
            >
              <Heart className={`w-4 h-4 ${activeTab === 'sponsor' ? 'fill-rose-500/40 text-rose-400' : 'text-rose-400'}`} />
              <span className="font-semibold">赞助支持</span>
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse shadow-[0_0_6px_rgba(244,63,94,0.9)]" />
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
};


