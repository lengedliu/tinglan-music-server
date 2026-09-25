import React, { memo } from 'react';
import { Music2, Cast, Radio, Server, Mic2, Settings, Heart } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { XiaomiDevice } from '../types';

export interface MobileTabBarProps {
  activeTab: 'library' | 'lyrics' | 'xiaomi' | 'subsonic' | 'settings' | 'sponsor';
  setActiveTab: (tab: 'library' | 'lyrics' | 'xiaomi' | 'subsonic' | 'settings' | 'sponsor') => void;
  songCount: number;
  isCasting: boolean;
  activeDevice?: XiaomiDevice;
  securityAuthEnabled?: boolean;
}

export const MobileTabBar: React.FC<MobileTabBarProps> = memo(({
  activeTab,
  setActiveTab,
  songCount,
  isCasting,
  activeDevice,
  securityAuthEnabled
}) => {
  const { themeConfig, isLight: ctxIsLight } = useTheme();
  const isLight = Boolean(ctxIsLight ?? themeConfig?.isLight);

  const tabs: Array<{
    id: 'library' | 'xiaomi' | 'subsonic' | 'lyrics' | 'settings';
    label: string;
    icon: React.ReactNode;
    badge?: React.ReactNode;
  }> = [
    {
      id: 'library',
      label: '曲库',
      icon: <Music2 className="w-5 h-5" />,
      badge: songCount > 0 ? (
        <span className={`text-[9px] font-mono px-1 rounded-full font-bold leading-tight ${
          activeTab === 'library' 
            ? 'bg-[#FF6700] text-white' 
            : isLight ? 'bg-zinc-200 text-zinc-700' : 'bg-zinc-800 text-zinc-400'
        }`}>
          {songCount > 999 ? '999+' : songCount}
        </span>
      ) : null
    },
    {
      id: 'xiaomi',
      label: '音箱',
      icon: isCasting ? (
        <Radio className="w-5 h-5 text-[#FF6700] animate-pulse" />
      ) : (
        <Cast className="w-5 h-5" />
      ),
      badge: isCasting ? (
        <span className="w-2 h-2 rounded-full bg-[#FF6700] animate-ping" />
      ) : activeDevice?.isOnline ? (
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
      ) : null
    },
    {
      id: 'subsonic',
      label: '网关',
      icon: <Server className="w-5 h-5" />
    },
    {
      id: 'lyrics',
      label: '唱机',
      icon: <Mic2 className="w-5 h-5" />
    },
    {
      id: 'settings',
      label: '设置',
      icon: <Settings className="w-5 h-5" />,
      badge: securityAuthEnabled ? (
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="登录防护开启" />
      ) : null
    }
  ];

  return (
    <nav 
      aria-label="移动端底部主导航" 
      className={`md:hidden fixed bottom-0 left-0 right-0 z-40 pb-safe transition-colors duration-200 border-t ${
        isLight
          ? 'bg-white/95 border-zinc-200/90 text-zinc-700 shadow-[0_-2px_16px_rgba(0,0,0,0.06)] backdrop-blur-xl'
          : 'bg-zinc-950/95 border-white/10 text-zinc-300 shadow-[0_-4px_24px_rgba(0,0,0,0.6)] backdrop-blur-xl'
      }`}
    >
      <div className="grid grid-cols-5 h-14 items-center">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`mobile-tab-${tab.id}`}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center justify-center h-full min-h-[44px] min-w-[44px] relative transition-all active:scale-95 ${
                isActive
                  ? 'text-[#FF6700]'
                  : isLight
                    ? 'text-zinc-500 hover:text-zinc-900'
                    : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              {/* Active Tab Accent Glow / Line */}
              {isActive && (
                <div 
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-[#FF6700] shadow-[0_0_8px_rgba(255,103,0,0.8)]"
                />
              )}

              <div className="relative flex items-center justify-center">
                {tab.icon}
                {tab.badge && (
                  <div className="absolute -top-1.5 -right-3 flex items-center justify-center">
                    {tab.badge}
                  </div>
                )}
              </div>

              <span className={`text-[10px] tracking-tight mt-1 leading-none ${
                isActive ? 'font-bold text-[#FF6700]' : 'font-medium'
              }`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
});

MobileTabBar.displayName = 'MobileTabBar';
