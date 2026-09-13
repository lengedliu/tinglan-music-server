import React, { useState } from 'react';
import { Palette, Check, Sparkles, X, Moon, Sun } from 'lucide-react';
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
      <div className="w-full max-w-2xl bg-zinc-900 border border-white/10 rounded-3xl p-6 shadow-2xl space-y-5 relative overflow-hidden">
        
        {/* Glow ambient accent */}
        <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-gradient-to-br from-[#FF6700]/10 to-purple-500/10 blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-2 border-b border-white/10 relative z-10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-br from-amber-500/20 via-purple-500/20 to-cyan-500/20 border border-white/10 text-white">
              <Palette className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                个性化 UI 主题与界面外观
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {THEMES.length} 款主题
                </span>
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                实时切换整站色彩风格，支持极客暗夜模式与清爽日间亮色主题 (Light Mode)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-zinc-800/80 hover:bg-white/10 text-zinc-400 hover:text-white transition cursor-pointer"
            title="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Category Tabs */}
        <div className="flex items-center gap-2 bg-zinc-950/80 p-1.5 rounded-2xl border border-white/10 text-xs">
          <button
            onClick={() => setFilterMode('all')}
            className={`flex-1 py-1.5 px-3 rounded-xl font-medium transition cursor-pointer flex items-center justify-center gap-1.5 ${
              filterMode === 'all'
                ? 'bg-zinc-800 text-white font-bold shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            全部主题 ({THEMES.length})
          </button>

          <button
            onClick={() => setFilterMode('light')}
            className={`flex-1 py-1.5 px-3 rounded-xl font-medium transition cursor-pointer flex items-center justify-center gap-1.5 ${
              filterMode === 'light'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold shadow-sm'
                : 'text-zinc-400 hover:text-amber-300'
            }`}
          >
            <Sun className="w-3.5 h-3.5 text-amber-400" />
            日间亮色 Light ({THEMES.filter(t => t.isLight).length})
          </button>

          <button
            onClick={() => setFilterMode('dark')}
            className={`flex-1 py-1.5 px-3 rounded-xl font-medium transition cursor-pointer flex items-center justify-center gap-1.5 ${
              filterMode === 'dark'
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-bold shadow-sm'
                : 'text-zinc-400 hover:text-indigo-300'
            }`}
          >
            <Moon className="w-3.5 h-3.5 text-indigo-400" />
            暗夜极客 Dark ({THEMES.filter(t => !t.isLight).length})
          </button>
        </div>

        {/* Themes Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-h-[55vh] overflow-y-auto pr-1">
          {filteredThemes.map((item) => {
            const isActive = theme === item.id;

            return (
              <div
                key={item.id}
                onClick={() => setTheme(item.id)}
                className={`group p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between space-y-3 ${
                  isActive
                    ? 'bg-zinc-800/90 border-amber-500/70 shadow-[0_0_20px_rgba(255,103,0,0.15)] ring-1 ring-amber-500/40'
                    : 'bg-zinc-950/60 hover:bg-zinc-800/50 border-white/10 hover:border-white/20'
                }`}
              >
                {/* Background Glow */}
                <div 
                  className="absolute -right-10 -bottom-10 w-28 h-28 rounded-full blur-2xl opacity-20 pointer-events-none transition-all group-hover:opacity-40" 
                  style={{ backgroundColor: item.primaryColor }}
                />

                <div className="space-y-2 relative z-10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      {/* Color Circle Badge */}
                      <div 
                        className="w-5 h-5 rounded-full shadow-md flex items-center justify-center border border-white/20"
                        style={{ backgroundColor: item.primaryColor }}
                      />
                      <h4 className="font-bold text-sm text-white flex items-center gap-1.5">
                        {item.name}
                        {item.isLight ? (
                          <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-500/20 text-amber-300 font-normal flex items-center gap-0.5">
                            <Sun className="w-2.5 h-2.5" />
                            Light
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded text-[9px] bg-zinc-800 text-zinc-400 font-normal flex items-center gap-0.5">
                            <Moon className="w-2.5 h-2.5" />
                            Dark
                          </span>
                        )}
                      </h4>
                    </div>

                    {isActive && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-bold">
                        <Check className="w-3 h-3" />
                        当前主题
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-zinc-400 leading-relaxed min-h-[32px]">
                    {item.subtitle}
                  </p>
                </div>

                {/* Color Swatch Preview Bar */}
                <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[10px] text-zinc-500 relative z-10">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.primaryColor }} title="主色" />
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.secondaryColor }} title="辅色" />
                    <div className={`w-3 h-3 rounded-full ${item.bgClass}`} title="背景" />
                  </div>

                  <span className="font-mono text-zinc-400">
                    {item.primaryColor}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-white/10 text-xs text-zinc-400">
          <div className="flex items-center gap-1.5 text-amber-400">
            <Sparkles className="w-4 h-4" />
            <span>修改后将即时生效并自动保存偏好</span>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#FF6700] hover:bg-[#e55c00] text-white font-bold transition shadow-md cursor-pointer"
          >
            完成
          </button>
        </div>

      </div>
    </div>
  );
};
