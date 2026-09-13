import React, { createContext, useContext, useState, useEffect } from 'react';

export type ThemeId = 
  | 'xiaomi-orange' 
  | 'cyber-blue' 
  | 'emerald-forest' 
  | 'amethyst-purple' 
  | 'sunset-crimson' 
  | 'bright-day'
  | 'pure-light'
  | 'pearl-light'
  | 'nordic-sky'
  | 'matcha-light'
  | 'rose-blush';

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  subtitle: string;
  primaryColor: string;
  secondaryColor: string;
  primaryRgb: string;
  bgClass: string;
  isLight?: boolean;
  gradient: string;
  accentBadge: string;
  activeTabStyle: string;
  glowShadow: string;
}

export const THEMES: ThemeConfig[] = [
  // --- 亮色日间清爽主题系列 (Light Mode Themes) ---
  {
    id: 'bright-day',
    name: '明亮白昼 (Light)',
    subtitle: '高保真白昼面板，纯白卡片结合经典湛蓝高亮，高辨识度与极佳视效',
    primaryColor: '#2563eb',
    secondaryColor: '#3b82f6',
    primaryRgb: '37, 99, 235',
    bgClass: 'bg-slate-100',
    isLight: true,
    gradient: 'from-blue-600 to-cyan-500',
    accentBadge: 'bg-blue-50 text-blue-700 border-blue-200',
    activeTabStyle: 'bg-blue-500/10 text-blue-600 border-blue-500/30 shadow-sm font-bold',
    glowShadow: 'shadow-[0_4px_20px_rgba(37,99,235,0.15)]'
  },
  {
    id: 'pure-light',
    name: '明亮米橙 (Light)',
    subtitle: '极简通透纯白画布，高对比度高亮米橙，纯净爽朗',
    primaryColor: '#FF6700',
    secondaryColor: '#f97316',
    primaryRgb: '255, 103, 0',
    bgClass: 'bg-slate-50',
    isLight: true,
    gradient: 'from-[#FF6700] to-orange-500',
    accentBadge: 'bg-orange-50 text-orange-700 border-orange-200',
    activeTabStyle: 'bg-orange-500/10 text-orange-600 border-orange-500/30 shadow-sm font-bold',
    glowShadow: 'shadow-[0_4px_20px_rgba(255,103,0,0.15)]'
  },
  {
    id: 'pearl-light',
    name: '暖白珍珠 (Light)',
    subtitle: '温润舒适的暖白珍珠质感，清晰易读，全天候不伤眼',
    primaryColor: '#ea580c',
    secondaryColor: '#f97316',
    primaryRgb: '234, 88, 12',
    bgClass: 'bg-zinc-100',
    isLight: true,
    gradient: 'from-orange-500 to-amber-500',
    accentBadge: 'bg-amber-50 text-amber-700 border-amber-200',
    activeTabStyle: 'bg-amber-500/10 text-amber-600 border-amber-500/30 shadow-sm font-bold',
    glowShadow: 'shadow-[0_4px_20px_rgba(234,88,12,0.15)]'
  },
  {
    id: 'nordic-sky',
    name: '北欧晴空 (Light)',
    subtitle: '淡蓝晴空与蔚蓝海岸，清新凉爽的亮白视效',
    primaryColor: '#0284c7',
    secondaryColor: '#38bdf8',
    primaryRgb: '2, 132, 199',
    bgClass: 'bg-sky-50/90',
    isLight: true,
    gradient: 'from-sky-600 to-cyan-500',
    accentBadge: 'bg-sky-50 text-sky-700 border-sky-200',
    activeTabStyle: 'bg-sky-500/10 text-sky-600 border-sky-500/30 shadow-sm font-bold',
    glowShadow: 'shadow-[0_4px_20px_rgba(2,132,199,0.15)]'
  },
  {
    id: 'matcha-light',
    name: '抹茶清爽 (Light)',
    subtitle: '清澈宜人的抹茶浅绿与森林气息，自然舒缓',
    primaryColor: '#16a34a',
    secondaryColor: '#4ade80',
    primaryRgb: '22, 163, 74',
    bgClass: 'bg-emerald-50/90',
    isLight: true,
    gradient: 'from-emerald-600 to-teal-500',
    accentBadge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    activeTabStyle: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 shadow-sm font-bold',
    glowShadow: 'shadow-[0_4px_20px_rgba(22,163,74,0.15)]'
  },
  {
    id: 'rose-blush',
    name: '柔霞樱粉 (Light)',
    subtitle: '柔美优雅的樱花粉白暖调，温馨精致',
    primaryColor: '#e11d48',
    secondaryColor: '#fb7185',
    primaryRgb: '225, 29, 72',
    bgClass: 'bg-rose-50/90',
    isLight: true,
    gradient: 'from-rose-600 to-pink-500',
    accentBadge: 'bg-rose-50 text-rose-700 border-rose-200',
    activeTabStyle: 'bg-rose-500/10 text-rose-700 border-rose-500/30 shadow-sm font-bold',
    glowShadow: 'shadow-[0_4px_20px_rgba(225,29,72,0.15)]'
  },

  // --- 深色极客与暗夜氛围主题 ---
  {
    id: 'xiaomi-orange',
    name: '米橙经典 (Dark)',
    subtitle: '小米米家官方经典极客风，标志性米橙高亮',
    primaryColor: '#FF6700',
    secondaryColor: '#f97316',
    primaryRgb: '255, 103, 0',
    bgClass: 'bg-zinc-950',
    gradient: 'from-[#FF6700] to-amber-500',
    accentBadge: 'bg-[#FF6700]/10 text-[#FF6700] border-[#FF6700]/30',
    activeTabStyle: 'bg-[#FF6700]/15 text-[#FF6700] border-[#FF6700]/40 shadow-[0_0_12px_rgba(255,103,0,0.2)]',
    glowShadow: 'shadow-[0_0_20px_rgba(255,103,0,0.3)]'
  },
  {
    id: 'cyber-blue',
    name: '赛博极光 (Dark)',
    subtitle: '沉浸式深蓝与电子青紫霓虹，科技流光质感',
    primaryColor: '#06b6d4',
    secondaryColor: '#3b82f6',
    primaryRgb: '6, 182, 212',
    bgClass: 'bg-slate-950',
    gradient: 'from-cyan-500 to-blue-600',
    accentBadge: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
    activeTabStyle: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.2)]',
    glowShadow: 'shadow-[0_0_20px_rgba(6,182,212,0.3)]'
  },
  {
    id: 'emerald-forest',
    name: '翡翠极光 (Dark)',
    subtitle: '自然宁静的墨绿夜色，搭配清新薄荷绿荧光',
    primaryColor: '#10b981',
    secondaryColor: '#34d399',
    primaryRgb: '16, 185, 129',
    bgClass: 'bg-emerald-950/80',
    gradient: 'from-emerald-500 to-teal-400',
    accentBadge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    activeTabStyle: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.2)]',
    glowShadow: 'shadow-[0_0_20px_rgba(16,185,129,0.3)]'
  },
  {
    id: 'amethyst-purple',
    name: '紫罗兰晶 (Dark)',
    subtitle: '高贵魅惑的紫罗兰水晶主题，音效氛围沉浸',
    primaryColor: '#a855f7',
    secondaryColor: '#c084fc',
    primaryRgb: '168, 85, 247',
    bgClass: 'bg-purple-950/80',
    gradient: 'from-purple-500 to-indigo-500',
    accentBadge: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    activeTabStyle: 'bg-purple-500/15 text-purple-400 border-purple-500/40 shadow-[0_0_12px_rgba(168,85,247,0.2)]',
    glowShadow: 'shadow-[0_0_20px_rgba(168,85,247,0.3)]'
  },
  {
    id: 'sunset-crimson',
    name: '日落绯红 (Dark)',
    subtitle: '浓郁深邃的晚霞绯红与红宝石光泽',
    primaryColor: '#f43f5e',
    secondaryColor: '#fb7185',
    primaryRgb: '244, 63, 94',
    bgClass: 'bg-rose-950/80',
    gradient: 'from-rose-500 to-red-600',
    accentBadge: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
    activeTabStyle: 'bg-rose-500/15 text-rose-400 border-rose-500/40 shadow-[0_0_12px_rgba(244,63,94,0.2)]',
    glowShadow: 'shadow-[0_0_20px_rgba(244,63,94,0.3)]'
  }
];

interface ThemeContextType {
  theme: ThemeId;
  themeConfig: ThemeConfig;
  setTheme: (themeId: ThemeId) => void;
  themesList: ThemeConfig[];
  isThemeModalOpen: boolean;
  setIsThemeModalOpen: (open: boolean) => void;
  toggleDarkLight: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    try {
      const saved = localStorage.getItem('tinglan_theme') as ThemeId;
      if (saved && THEMES.some(t => t.id === saved)) {
        return saved;
      }
    } catch {}
    return 'xiaomi-orange';
  });

  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);

  const themeConfig = THEMES.find(t => t.id === theme) || THEMES[0];

  const setTheme = (newTheme: ThemeId) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem('tinglan_theme', newTheme);
    } catch {}
  };

  const toggleDarkLight = () => {
    if (themeConfig.isLight) {
      setTheme('xiaomi-orange');
    } else {
      setTheme('bright-day');
    }
  };

  useEffect(() => {
    // Apply dataset attribute and CSS root variables
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);

    if (themeConfig.isLight) {
      root.classList.add('theme-light');
      root.classList.remove('theme-dark');
    } else {
      root.classList.add('theme-dark');
      root.classList.remove('theme-light');
    }

    root.style.setProperty('--theme-primary', themeConfig.primaryColor);
    root.style.setProperty('--theme-primary-rgb', themeConfig.primaryRgb);
    root.style.setProperty('--theme-secondary', themeConfig.secondaryColor);
  }, [theme, themeConfig]);

  return (
    <ThemeContext.Provider value={{
      theme,
      themeConfig,
      setTheme,
      themesList: THEMES,
      isThemeModalOpen,
      setIsThemeModalOpen,
      toggleDarkLight
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
