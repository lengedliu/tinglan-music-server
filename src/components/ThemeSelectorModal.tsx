import React, { useState } from 'react';
import { Palette, Check, Sparkles, X, Moon, Sun, Sliders, Music, Radio, Disc } from 'lucide-react';
import { useTheme, THEMES, ThemeId } from '../context/ThemeContext';

interface ThemeSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ThemeSelectorModal: React.FC<ThemeSelectorModalProps> = ({ isOpen, onClose }) => {
  const { theme, setTheme } = useTheme();
  const [filterMode, setFilterMode] = useState<'all' | 'light' | 'dark'>('all');

  if (!isOpen) return null;

  const filteredThemes = THEMES.filter(t => {
    if (filterMode === 'light') return t.isLight;
    if (filterMode === 'dark') return !t.isLight;
    return true;
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-4xl rounded-3xl p-6 sm:p-7 shadow-2xl space-y-6 relative overflow-hidden max-h-[90vh] flex flex-col border transition-all duration-300"
        style={{
          backgroundColor: 'var(--theme-card-bg)',
          borderColor: 'var(--theme-card-border)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)'
        }}
      >
        {/* Glow ambient accent */}
        <div 
          className="absolute -top-24 -right-24 w-72 h-72 rounded-full blur-3xl pointer-events-none transition-all duration-500" 
          style={{ backgroundColor: 'var(--theme-ambient-glow)' }}
        />

        {/* Modal Header */}
        <div 
          className="flex items-center justify-between pb-4 border-b relative z-10 shrink-0"
          style={{ borderColor: 'var(--theme-card-border)' }}
        >
          <div className="flex items-center gap-3.5">
            <div 
              className="p-3 rounded-2xl border flex items-center justify-center shadow-lg"
              style={{
                backgroundColor: 'var(--theme-card-hover)',
                borderColor: 'var(--theme-card-border)',
                color: 'var(--theme-primary)'
              }}
            >
              <Palette className="w-6 h-6 text-[#FF6700]" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 
                  className="text-lg sm:text-xl font-bold tracking-tight"
                  style={{ color: 'var(--theme-text-title)' }}
                >
                  个性化 UI 风格与主题配色
                </h3>
                <span 
                  className="px-2.5 py-0.5 rounded-full text-xs font-bold border"
                  style={{
                    backgroundColor: 'rgba(var(--theme-primary-rgb), 0.15)',
                    color: 'var(--theme-primary)',
                    borderColor: 'rgba(var(--theme-primary-rgb), 0.3)'
                  }}
                >
                  {THEMES.length} 款定制色系
                </span>
              </div>
              <p 
                className="text-xs sm:text-sm mt-0.5"
                style={{ color: 'var(--theme-text-muted)' }}
              >
                每个主题均经过专属色彩校准，涵盖卡片底色、边框光晕、对比度与专属渐变流光
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2.5 rounded-2xl border transition cursor-pointer hover:scale-105 active:scale-95"
            style={{
              backgroundColor: 'var(--theme-card-hover)',
              borderColor: 'var(--theme-card-border)',
              color: 'var(--theme-text-muted)'
            }}
            title="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Category Tabs */}
        <div 
          className="flex items-center gap-2 p-1.5 rounded-2xl border text-xs sm:text-sm shrink-0"
          style={{
            backgroundColor: 'var(--theme-card-subtle)',
            borderColor: 'var(--theme-card-border)'
          }}
        >
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`flex-1 py-2 px-3 rounded-xl font-medium transition cursor-pointer flex items-center justify-center gap-2 ${
              filterMode === 'all'
                ? 'bg-zinc-800/80 text-white font-bold shadow-md ring-1 ring-white/10'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Palette className="w-4 h-4" />
            <span>全部风格 ({THEMES.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterMode('dark')}
            className={`flex-1 py-2 px-3 rounded-xl font-medium transition cursor-pointer flex items-center justify-center gap-2 ${
              filterMode === 'dark'
                ? 'bg-indigo-500/25 text-indigo-300 border border-indigo-500/40 font-bold shadow-md'
                : 'text-zinc-400 hover:text-indigo-300'
            }`}
          >
            <Moon className="w-4 h-4 text-indigo-400" />
            <span>暗夜极客 Dark ({THEMES.filter(t => !t.isLight).length})</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterMode('light')}
            className={`flex-1 py-2 px-3 rounded-xl font-medium transition cursor-pointer flex items-center justify-center gap-2 ${
              filterMode === 'light'
                ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40 font-bold shadow-md'
                : 'text-zinc-400 hover:text-amber-300'
            }`}
          >
            <Sun className="w-4 h-4 text-amber-400" />
            <span>日间清爽 Light ({THEMES.filter(t => t.isLight).length})</span>
          </button>
        </div>

        {/* Themes Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto pr-1 flex-1 py-1">
          {filteredThemes.map((item) => {
            const isActive = theme === item.id;

            return (
              <div
                key={item.id}
                onClick={() => setTheme(item.id)}
                className={`group rounded-3xl p-4.5 border transition-all duration-200 cursor-pointer relative overflow-hidden flex flex-col justify-between space-y-3.5 select-none ${
                  isActive
                    ? 'ring-2 shadow-xl scale-[1.01]'
                    : 'hover:scale-[1.01] hover:shadow-lg'
                }`}
                style={{
                  backgroundColor: item.cardBg,
                  borderColor: isActive ? item.primaryColor : item.cardBorder,
                  boxShadow: isActive 
                    ? `0 10px 25px -5px rgba(${item.primaryRgb}, 0.35)` 
                    : '0 4px 12px rgba(0,0,0,0.1)'
                }}
              >
                {/* Background Ambient Glow inside preview card */}
                <div 
                  className="absolute -right-10 -bottom-10 w-32 h-32 rounded-full blur-2xl opacity-20 pointer-events-none transition-all group-hover:opacity-40" 
                  style={{ backgroundColor: item.primaryColor }}
                />

                {/* Card Header & Title */}
                <div className="space-y-2 relative z-10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      {/* Color Palette Circle */}
                      <div 
                        className="w-6 h-6 rounded-full shadow-md flex items-center justify-center border border-white/20 shrink-0"
                        style={{ backgroundColor: item.primaryColor }}
                      >
                        <div className="w-2 h-2 rounded-full bg-white/70" />
                      </div>

                      <div>
                        <h4 
                          className="font-bold text-sm flex items-center gap-1.5"
                          style={{ color: item.textTitle }}
                        >
                          {item.name}
                        </h4>
                      </div>
                    </div>

                    {isActive ? (
                      <span 
                        className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border shadow-sm"
                        style={{
                          backgroundColor: item.primaryColor,
                          color: '#ffffff',
                          borderColor: item.primaryColor
                        }}
                      >
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                        使用中
                      </span>
                    ) : (
                      <span 
                        className="px-2 py-0.5 rounded-full text-[10px] font-medium border"
                        style={{
                          backgroundColor: item.cardSubtle,
                          borderColor: item.cardBorder,
                          color: item.textMuted
                        }}
                      >
                        {item.isLight ? 'Light 亮色' : 'Dark 暗色'}
                      </span>
                    )}
                  </div>

                  <p 
                    className="text-xs leading-relaxed min-h-[36px]"
                    style={{ color: item.textMuted }}
                  >
                    {item.subtitle}
                  </p>
                </div>

                {/* Live Mini Card UI Simulation Component */}
                <div 
                  className="p-3 rounded-2xl border space-y-2 relative z-10 transition-all"
                  style={{
                    backgroundColor: item.cardSubtle,
                    borderColor: item.cardBorder
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-7 h-7 rounded-xl flex items-center justify-center shadow-sm"
                        style={{ backgroundColor: item.primaryColor, color: '#ffffff' }}
                      >
                        <Music className="w-3.5 h-3.5" />
                      </div>
                      <div className="space-y-0.5">
                        <div className="w-16 h-2.5 rounded-full" style={{ backgroundColor: item.textTitle, opacity: 0.8 }} />
                        <div className="w-10 h-2 rounded-full" style={{ backgroundColor: item.textMuted, opacity: 0.6 }} />
                      </div>
                    </div>

                    <div 
                      className="px-2 py-0.5 rounded-lg text-[10px] font-bold border"
                      style={{
                        backgroundColor: `rgba(${item.primaryRgb}, 0.15)`,
                        color: item.primaryColor,
                        borderColor: `rgba(${item.primaryRgb}, 0.3)`
                      }}
                    >
                      FLAC 96kHz
                    </div>
                  </div>

                  {/* Mini Progress Bar */}
                  <div 
                    className="w-full h-1.5 rounded-full overflow-hidden"
                    style={{ backgroundColor: item.cardBorder }}
                  >
                    <div 
                      className="h-full rounded-full w-2/3"
                      style={{ backgroundColor: item.primaryColor }}
                    />
                  </div>
                </div>

                {/* Color Swatch Preview Footer */}
                <div 
                  className="flex items-center justify-between pt-2.5 border-t text-[10px] font-mono relative z-10"
                  style={{ borderColor: item.cardBorder }}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex items-center -space-x-1">
                      <div className="w-3.5 h-3.5 rounded-full ring-1 ring-white/20" style={{ backgroundColor: item.primaryColor }} title="主题主色" />
                      <div className="w-3.5 h-3.5 rounded-full ring-1 ring-white/20" style={{ backgroundColor: item.secondaryColor }} title="辅色" />
                      <div className="w-3.5 h-3.5 rounded-full ring-1 ring-white/20" style={{ backgroundColor: item.cardBg }} title="卡片底色" />
                    </div>
                    <span style={{ color: item.textMuted }}>{item.primaryColor}</span>
                  </div>

                  <span 
                    className="font-sans font-medium text-[11px] group-hover:underline"
                    style={{ color: item.primaryColor }}
                  >
                    {isActive ? '● 当前生效' : '点击应用 →'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div 
          className="flex items-center justify-between pt-4 border-t text-xs relative z-10 shrink-0"
          style={{ borderColor: 'var(--theme-card-border)' }}
        >
          <div className="flex items-center gap-2" style={{ color: 'var(--theme-primary)' }}>
            <Sparkles className="w-4 h-4" />
            <span className="font-medium">点击任意主题立即无刷新生效，并自动持久化到本地偏好</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-2xl text-white font-bold transition shadow-lg cursor-pointer hover:scale-105 active:scale-95"
            style={{
              backgroundColor: 'var(--theme-primary)'
            }}
          >
            完成并关闭
          </button>
        </div>

      </div>
    </div>
  );
};
