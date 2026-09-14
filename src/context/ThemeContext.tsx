import React, { createContext, useContext, useState, useEffect } from 'react';

export type ThemeId = 
  // Dark Themes
  | 'xiaomi-orange' 
  | 'cyber-blue' 
  | 'emerald-forest' 
  | 'amethyst-purple' 
  | 'sunset-crimson' 
  | 'titanium-slate'
  | 'obsidian-oled'
  // Light Themes
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
  bgColor: string;
  cardBg: string;
  cardHover: string;
  cardSubtle: string;
  cardBorder: string;
  cardBorderHover: string;
  textTitle: string;
  textBody: string;
  textMuted: string;
  isLight?: boolean;
  gradient: string;
  accentBadge: string;
  activeTabStyle: string;
  glowShadow: string;
  ambientGlow: string;
}

export const THEMES: ThemeConfig[] = [
  // ==================== 1. 深色极客与暗夜氛围主题系列 (Dark Themes) ====================
  {
    id: 'xiaomi-orange',
    name: '米橙经典 (Dark)',
    subtitle: '小米官方极客风，深邃石墨黑卡片搭配经典米橙高亮，温润沉稳',
    primaryColor: '#FF6700',
    secondaryColor: '#f97316',
    primaryRgb: '255, 103, 0',
    bgClass: 'bg-[#0e0e11]',
    bgColor: '#0e0e11',
    cardBg: '#17181c',
    cardHover: '#1f2026',
    cardSubtle: '#111215',
    cardBorder: 'rgba(255, 103, 0, 0.16)',
    cardBorderHover: 'rgba(255, 103, 0, 0.35)',
    textTitle: '#ffffff',
    textBody: '#e4e4e7',
    textMuted: '#9ca3af',
    isLight: false,
    gradient: 'from-[#FF6700] to-amber-500',
    accentBadge: 'bg-[#FF6700]/15 text-[#FF6700] border-[#FF6700]/30',
    activeTabStyle: 'bg-[#FF6700]/15 text-[#FF6700] border-[#FF6700]/40 shadow-[0_0_12px_rgba(255,103,0,0.25)]',
    glowShadow: 'shadow-[0_0_20px_rgba(255,103,0,0.3)]',
    ambientGlow: 'rgba(255, 103, 0, 0.12)'
  },
  {
    id: 'cyber-blue',
    name: '赛博深蓝 (Dark)',
    subtitle: '深海暗夜与电光青蓝，深钢蓝卡片与赛博光效，科技感拉满',
    primaryColor: '#06b6d4',
    secondaryColor: '#3b82f6',
    primaryRgb: '6, 182, 212',
    bgClass: 'bg-[#060c18]',
    bgColor: '#060c18',
    cardBg: '#0d182b',
    cardHover: '#13233e',
    cardSubtle: '#091020',
    cardBorder: 'rgba(6, 182, 212, 0.18)',
    cardBorderHover: 'rgba(6, 182, 212, 0.4)',
    textTitle: '#f0f9ff',
    textBody: '#cbd5e1',
    textMuted: '#64748b',
    isLight: false,
    gradient: 'from-cyan-500 to-blue-600',
    accentBadge: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
    activeTabStyle: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.25)]',
    glowShadow: 'shadow-[0_0_20px_rgba(6,182,212,0.3)]',
    ambientGlow: 'rgba(6, 182, 212, 0.12)'
  },
  {
    id: 'emerald-forest',
    name: '翡翠幽境 (Dark)',
    subtitle: '幽深松绿暗夜，深苔卡片与清澈翡翠薄荷荧光，护眼静心',
    primaryColor: '#10b981',
    secondaryColor: '#34d399',
    primaryRgb: '16, 185, 129',
    bgClass: 'bg-[#05140e]',
    bgColor: '#05140e',
    cardBg: '#0c2219',
    cardHover: '#123023',
    cardSubtle: '#071811',
    cardBorder: 'rgba(16, 185, 129, 0.18)',
    cardBorderHover: 'rgba(16, 185, 129, 0.4)',
    textTitle: '#ecfdf5',
    textBody: '#cbd5e1',
    textMuted: '#6ee7b7',
    isLight: false,
    gradient: 'from-emerald-500 to-teal-400',
    accentBadge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    activeTabStyle: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.25)]',
    glowShadow: 'shadow-[0_0_20px_rgba(16,185,129,0.3)]',
    ambientGlow: 'rgba(16, 185, 129, 0.12)'
  },
  {
    id: 'amethyst-purple',
    name: '星云紫晶 (Dark)',
    subtitle: '深邃宇宙天鹅绒紫，紫晶矿石卡片与霓虹星芒，神秘沉浸',
    primaryColor: '#a855f7',
    secondaryColor: '#ec4899',
    primaryRgb: '168, 85, 247',
    bgClass: 'bg-[#0e0719]',
    bgColor: '#0e0719',
    cardBg: '#180e2b',
    cardHover: '#23153d',
    cardSubtle: '#110920',
    cardBorder: 'rgba(168, 85, 247, 0.2)',
    cardBorderHover: 'rgba(168, 85, 247, 0.45)',
    textTitle: '#faf5ff',
    textBody: '#e9d5ff',
    textMuted: '#a855f7',
    isLight: false,
    gradient: 'from-purple-500 to-pink-500',
    accentBadge: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    activeTabStyle: 'bg-purple-500/15 text-purple-300 border-purple-500/40 shadow-[0_0_12px_rgba(168,85,247,0.25)]',
    glowShadow: 'shadow-[0_0_20px_rgba(168,85,247,0.3)]',
    ambientGlow: 'rgba(168, 85, 247, 0.12)'
  },
  {
    id: 'sunset-crimson',
    name: '落日晚霞 (Dark)',
    subtitle: '深黑红宝石底色，晚霞绯红与落日流金，热情浪漫',
    primaryColor: '#f43f5e',
    secondaryColor: '#fb923c',
    primaryRgb: '244, 63, 94',
    bgClass: 'bg-[#15070c]',
    bgColor: '#15070c',
    cardBg: '#230c14',
    cardHover: '#30121c',
    cardSubtle: '#19080e',
    cardBorder: 'rgba(244, 63, 94, 0.2)',
    cardBorderHover: 'rgba(244, 63, 94, 0.45)',
    textTitle: '#fff1f2',
    textBody: '#fecdd3',
    textMuted: '#fb7185',
    isLight: false,
    gradient: 'from-rose-500 to-orange-500',
    accentBadge: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    activeTabStyle: 'bg-rose-500/15 text-rose-300 border-rose-500/40 shadow-[0_0_12px_rgba(244,63,94,0.25)]',
    glowShadow: 'shadow-[0_0_20px_rgba(244,63,94,0.3)]',
    ambientGlow: 'rgba(244, 63, 94, 0.12)'
  },
  {
    id: 'titanium-slate',
    name: '钛金极客 (Dark)',
    subtitle: '拉丝钛金与冷钢灰蓝，工业级冷峻极简，专业声学发烧质感',
    primaryColor: '#38bdf8',
    secondaryColor: '#94a3b8',
    primaryRgb: '56, 189, 248',
    bgClass: 'bg-[#0a0e17]',
    bgColor: '#0a0e17',
    cardBg: '#141c2c',
    cardHover: '#1c273d',
    cardSubtle: '#0e1422',
    cardBorder: 'rgba(148, 163, 184, 0.18)',
    cardBorderHover: 'rgba(56, 189, 248, 0.35)',
    textTitle: '#f8fafc',
    textBody: '#cbd5e1',
    textMuted: '#94a3b8',
    isLight: false,
    gradient: 'from-sky-400 to-slate-400',
    accentBadge: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    activeTabStyle: 'bg-sky-500/15 text-sky-300 border-sky-500/40 shadow-[0_0_12px_rgba(56,189,248,0.25)]',
    glowShadow: 'shadow-[0_0_20px_rgba(56,189,248,0.3)]',
    ambientGlow: 'rgba(56, 189, 248, 0.1)'
  },
  {
    id: 'obsidian-oled',
    name: '黑胶OLED (Dark)',
    subtitle: '纯黑无限深邃画布，高对比度黑胶炭黑卡片与明澈浅绿荧光',
    primaryColor: '#22c55e',
    secondaryColor: '#a3e635',
    primaryRgb: '34, 197, 94',
    bgClass: 'bg-[#000000]',
    bgColor: '#000000',
    cardBg: '#0c0c0e',
    cardHover: '#161619',
    cardSubtle: '#060608',
    cardBorder: 'rgba(255, 255, 255, 0.1)',
    cardBorderHover: 'rgba(34, 197, 94, 0.4)',
    textTitle: '#ffffff',
    textBody: '#e4e4e7',
    textMuted: '#71717a',
    isLight: false,
    gradient: 'from-green-500 to-lime-400',
    accentBadge: 'bg-green-500/15 text-green-400 border-green-500/30',
    activeTabStyle: 'bg-green-500/15 text-green-400 border-green-500/40 shadow-[0_0_12px_rgba(34,197,94,0.25)]',
    glowShadow: 'shadow-[0_0_20px_rgba(34,197,94,0.3)]',
    ambientGlow: 'rgba(34, 197, 94, 0.1)'
  },

  // ==================== 2. 日间清爽亮色系列 (Light Themes) ====================
  {
    id: 'bright-day',
    name: '明亮白昼 (Light)',
    subtitle: '高保真白昼面板，纯白高光卡片结合经典湛蓝高亮，高辨识度与极佳视效',
    primaryColor: '#2563eb',
    secondaryColor: '#3b82f6',
    primaryRgb: '37, 99, 235',
    bgClass: 'bg-[#f1f5f9]',
    bgColor: '#f1f5f9',
    cardBg: '#ffffff',
    cardHover: '#f8fafc',
    cardSubtle: '#e2e8f0',
    cardBorder: '#e2e8f0',
    cardBorderHover: '#cbd5e1',
    textTitle: '#0f172a',
    textBody: '#334155',
    textMuted: '#64748b',
    isLight: true,
    gradient: 'from-blue-600 to-cyan-500',
    accentBadge: 'bg-blue-50 text-blue-700 border-blue-200',
    activeTabStyle: 'bg-blue-500/10 text-blue-600 border-blue-500/30 shadow-sm font-bold',
    glowShadow: 'shadow-[0_4px_20px_rgba(37,99,235,0.15)]',
    ambientGlow: 'rgba(37, 99, 235, 0.08)'
  },
  {
    id: 'pure-light',
    name: '明亮米橙 (Light)',
    subtitle: '温暖纯净米白画布，活力米橙点缀，温和通透',
    primaryColor: '#FF6700',
    secondaryColor: '#f97316',
    primaryRgb: '255, 103, 0',
    bgClass: 'bg-[#fcf8f4]',
    bgColor: '#fcf8f4',
    cardBg: '#ffffff',
    cardHover: '#fffaf5',
    cardSubtle: '#f5ebe1',
    cardBorder: '#f0dfd2',
    cardBorderHover: '#fdba74',
    textTitle: '#1c1917',
    textBody: '#44403c',
    textMuted: '#78716c',
    isLight: true,
    gradient: 'from-[#FF6700] to-orange-500',
    accentBadge: 'bg-orange-50 text-orange-700 border-orange-200',
    activeTabStyle: 'bg-orange-500/10 text-orange-600 border-orange-500/30 shadow-sm font-bold',
    glowShadow: 'shadow-[0_4px_20px_rgba(255,103,0,0.15)]',
    ambientGlow: 'rgba(255, 103, 0, 0.08)'
  },
  {
    id: 'pearl-light',
    name: '暖白珍珠 (Light)',
    subtitle: '温润舒适的暖白珍珠质感与香槟金光泽，清晰易读全天不累眼',
    primaryColor: '#ea580c',
    secondaryColor: '#d97706',
    primaryRgb: '234, 88, 12',
    bgClass: 'bg-[#f7f5f0]',
    bgColor: '#f7f5f0',
    cardBg: '#ffffff',
    cardHover: '#faf8f3',
    cardSubtle: '#eae6db',
    cardBorder: '#e5e0d3',
    cardBorderHover: '#d6cdbd',
    textTitle: '#292524',
    textBody: '#44403c',
    textMuted: '#78716c',
    isLight: true,
    gradient: 'from-orange-500 to-amber-500',
    accentBadge: 'bg-amber-50 text-amber-700 border-amber-200',
    activeTabStyle: 'bg-amber-500/10 text-amber-600 border-amber-500/30 shadow-sm font-bold',
    glowShadow: 'shadow-[0_4px_20px_rgba(234,88,12,0.15)]',
    ambientGlow: 'rgba(234, 88, 12, 0.08)'
  },
  {
    id: 'nordic-sky',
    name: '北欧晴空 (Light)',
    subtitle: '淡蓝晴空与峡湾冰川晨雾，清新凉爽，视野通透澄净',
    primaryColor: '#0284c7',
    secondaryColor: '#06b6d4',
    primaryRgb: '2, 132, 199',
    bgClass: 'bg-[#eef5fc]',
    bgColor: '#eef5fc',
    cardBg: '#ffffff',
    cardHover: '#f4f9fd',
    cardSubtle: '#dbeafe',
    cardBorder: '#cfe0f2',
    cardBorderHover: '#93c5fd',
    textTitle: '#0c2340',
    textBody: '#1e3a5f',
    textMuted: '#476788',
    isLight: true,
    gradient: 'from-sky-600 to-cyan-500',
    accentBadge: 'bg-sky-50 text-sky-700 border-sky-200',
    activeTabStyle: 'bg-sky-500/10 text-sky-600 border-sky-500/30 shadow-sm font-bold',
    glowShadow: 'shadow-[0_4px_20px_rgba(2,132,199,0.15)]',
    ambientGlow: 'rgba(2, 132, 199, 0.08)'
  },
  {
    id: 'matcha-light',
    name: '抹茶清爽 (Light)',
    subtitle: '清澈宜人的抹茶浅绿与草木清香，自然舒缓，宛如置身庭院',
    primaryColor: '#16a34a',
    secondaryColor: '#10b981',
    primaryRgb: '22, 163, 74',
    bgClass: 'bg-[#eff7f1]',
    bgColor: '#eff7f1',
    cardBg: '#ffffff',
    cardHover: '#f4faf5',
    cardSubtle: '#dcfce7',
    cardBorder: '#d0e8d5',
    cardBorderHover: '#86efac',
    textTitle: '#143521',
    textBody: '#1f4e30',
    textMuted: '#437d57',
    isLight: true,
    gradient: 'from-emerald-600 to-teal-500',
    accentBadge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    activeTabStyle: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 shadow-sm font-bold',
    glowShadow: 'shadow-[0_4px_20px_rgba(22,163,74,0.15)]',
    ambientGlow: 'rgba(22, 163, 74, 0.08)'
  },
  {
    id: 'rose-blush',
    name: '柔霞樱粉 (Light)',
    subtitle: '柔美优雅的樱花粉白暖调，轻盈明快，温馨精致',
    primaryColor: '#e11d48',
    secondaryColor: '#db2777',
    primaryRgb: '225, 29, 72',
    bgClass: 'bg-[#fdf2f4]',
    bgColor: '#fdf2f4',
    cardBg: '#ffffff',
    cardHover: '#fff5f7',
    cardSubtle: '#ffe4e6',
    cardBorder: '#fbcfe8',
    cardBorderHover: '#f472b6',
    textTitle: '#3f1523',
    textBody: '#5c1d34',
    textMuted: '#8b3855',
    isLight: true,
    gradient: 'from-rose-600 to-pink-500',
    accentBadge: 'bg-rose-50 text-rose-700 border-rose-200',
    activeTabStyle: 'bg-rose-500/10 text-rose-700 border-rose-500/30 shadow-sm font-bold',
    glowShadow: 'shadow-[0_4px_20px_rgba(225,29,72,0.15)]',
    ambientGlow: 'rgba(225, 29, 72, 0.08)'
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

    // Dynamic CSS Custom Properties for theme tokens
    root.style.setProperty('--theme-primary', themeConfig.primaryColor);
    root.style.setProperty('--theme-primary-rgb', themeConfig.primaryRgb);
    root.style.setProperty('--theme-secondary', themeConfig.secondaryColor);
    root.style.setProperty('--theme-bg', themeConfig.bgColor);
    root.style.setProperty('--theme-card-bg', themeConfig.cardBg);
    root.style.setProperty('--theme-card-hover', themeConfig.cardHover);
    root.style.setProperty('--theme-card-subtle', themeConfig.cardSubtle);
    root.style.setProperty('--theme-card-border', themeConfig.cardBorder);
    root.style.setProperty('--theme-card-border-hover', themeConfig.cardBorderHover);
    root.style.setProperty('--theme-text-title', themeConfig.textTitle);
    root.style.setProperty('--theme-text-body', themeConfig.textBody);
    root.style.setProperty('--theme-text-muted', themeConfig.textMuted);
    root.style.setProperty('--theme-ambient-glow', themeConfig.ambientGlow);
    
    // Also set document background
    document.body.style.backgroundColor = themeConfig.bgColor;
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
