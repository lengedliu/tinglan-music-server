import React from 'react';
import { Keyboard, X, Sparkles, Command } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  keys: string[];
  label: string;
  description: string;
  category: 'playback' | 'navigation' | 'audio';
}

const SHORTCUTS: ShortcutItem[] = [
  {
    keys: ['Space'],
    label: '播放 / 暂停',
    description: '控制当前歌曲播放或暂停 (音箱串流模式下控制音箱)',
    category: 'playback'
  },
  {
    keys: ['←', '→'],
    label: '快退 / 快进 5秒',
    description: '调整当前曲目播放进度 (按住 Shift 配合左右键可快退/快进 15秒)',
    category: 'playback'
  },
  {
    keys: ['↑', '↓'],
    label: '音量调节 ±5%',
    description: '调大或调小播放音量 (音箱串流模式下直接调节音箱硬件音量)',
    category: 'audio'
  },
  {
    keys: ['M'],
    label: '静音切换',
    description: '一键静音或恢复此前音量',
    category: 'audio'
  },
  {
    keys: ['C'],
    label: '切换输出通道',
    description: '一键在【电脑本地播放】与【小爱音箱串流】之间切换',
    category: 'playback'
  },
  {
    keys: ['S'],
    label: '随机播放开关',
    description: '开启或关闭播放列表随机乱序',
    category: 'playback'
  },
  {
    keys: ['R'],
    label: '循环模式切换',
    description: '在列表循环、单曲循环、关闭循环之间轮询切换',
    category: 'playback'
  },
  {
    keys: ['L'],
    label: '动态歌词界面',
    description: '一键展开或收起全屏沉浸式滚动歌词',
    category: 'navigation'
  },
  {
    keys: ['V'],
    label: '黑胶唱片 / CD 模式',
    description: '切换至全屏拟物黑胶 / CD 唱机沉浸播放空间',
    category: 'navigation'
  },
  {
    keys: ['Q'],
    label: '播放队列抽屉',
    description: '展开或收起当前等待播放的歌曲队列列表',
    category: 'navigation'
  },
  {
    keys: ['T'],
    label: '睡眠定时器',
    description: '打开定时休眠设定弹窗，伴歌入眠',
    category: 'playback'
  },
  {
    keys: ['E'],
    label: '10段专业均衡器 (EQ)',
    description: '打开硬件级均衡器调音面板',
    category: 'audio'
  },
  {
    keys: ['?'],
    label: '快捷键速查帮助',
    description: '随时按 Shift + / 查看本快捷键指南',
    category: 'navigation'
  },
  {
    keys: ['Esc'],
    label: '关闭窗口',
    description: '关闭任何当前打开的浮窗、抽屉或对话框',
    category: 'navigation'
  }
];

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose
}) => {
  const { themeConfig } = useTheme();
  const isLight = !!themeConfig?.isLight;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className={`w-full max-w-2xl rounded-3xl border shadow-2xl p-6 sm:p-8 relative overflow-hidden transition-all max-h-[90vh] flex flex-col ${
        isLight
          ? 'bg-white border-zinc-200 text-zinc-900'
          : 'bg-zinc-950 border-white/10 text-zinc-100 shadow-[0_0_60px_rgba(0,0,0,0.85)]'
      }`}>
        
        {/* Ambient Top Glow */}
        <div 
          className="absolute -top-24 -right-24 w-60 h-60 rounded-full blur-3xl pointer-events-none opacity-20"
          style={{ backgroundColor: themeConfig.primaryColor }}
        />

        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-5 relative z-10 shrink-0">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-md"
              style={{ backgroundColor: themeConfig.primaryColor }}
            >
              <Keyboard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold tracking-tight">
                全局键盘快捷键速查 (Shortcuts)
              </h3>
              <p className={`text-xs ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                支持任意界面一键掌控听澜播放中枢
              </p>
            </div>
          </div>

          <button
            id="btn-close-shortcuts-modal"
            onClick={onClose}
            className={`p-2 rounded-full transition ${
              isLight ? 'hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700' : 'hover:bg-white/10 text-zinc-400 hover:text-white'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Shortcuts List */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-zinc-800 relative z-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SHORTCUTS.map((item, index) => (
              <div
                key={index}
                className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 transition-colors ${
                  isLight
                    ? 'bg-zinc-50 hover:bg-zinc-100 border-zinc-200'
                    : 'bg-zinc-900/60 hover:bg-zinc-900 border-white/5'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold tracking-tight truncate">
                    {item.label}
                  </div>
                  <div className={`text-[11px] truncate mt-0.5 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    {item.description}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {item.keys.map((k, kIdx) => (
                    <kbd
                      key={kIdx}
                      className={`px-2 py-1 rounded-lg text-xs font-mono font-bold shadow-sm border ${
                        isLight
                          ? 'bg-white border-zinc-300 text-zinc-800'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-200'
                      }`}
                    >
                      {k}
                    </kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-xs shrink-0">
          <span className={`${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
            提示：在输入框或搜索栏中输入时快捷键会自动避让，不会误触发
          </span>
          <button
            id="btn-done-shortcuts"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#FF6700] hover:bg-[#e55c00] text-white font-bold transition shadow-sm"
          >
            知道了
          </button>
        </div>

      </div>
    </div>
  );
};
