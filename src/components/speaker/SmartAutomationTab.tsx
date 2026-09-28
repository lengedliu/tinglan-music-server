import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  Play, 
  Plus, 
  Trash2, 
  RefreshCw, 
  Zap, 
  Send, 
  Volume2, 
  Radio, 
  Power, 
  Download, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Terminal, 
  FileJson,
  Layers
} from 'lucide-react';
import { XiaomiDevice, Playlist } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import { apiFetch } from '../../utils/api';

export interface AutomationScene {
  id: string;
  name: string;
  description: string;
  cronExpr: string;
  enabled: boolean;
  actionType: 'play_playlist' | 'play_radio' | 'tts_announce' | 'group_cast' | 'stop_playback';
  targetType: 'single_device' | 'group' | 'all_devices';
  targetId?: string;
  payload: {
    playlistId?: string;
    radioUrl?: string;
    radioTitle?: string;
    ttsText?: string;
    volume?: number;
  };
  lastRunTime?: string;
  lastRunStatus?: 'success' | 'failed';
  lastRunMessage?: string;
}

export interface AutomationLog {
  id: string;
  sceneId: string;
  sceneName: string;
  timestamp: string;
  status: 'success' | 'failed';
  message: string;
}

interface SmartAutomationTabProps {
  devices: XiaomiDevice[];
  playlists: Playlist[];
  onSendTts?: (did: string, text: string) => void;
  activeDeviceDid?: string;
}

const SCENE_TEMPLATES: Array<{
  name: string;
  cronExpr: string;
  description: string;
  actionType: 'play_playlist' | 'play_radio' | 'tts_announce' | 'group_cast' | 'stop_playback';
  targetType: 'single_device' | 'group' | 'all_devices';
  payload: {
    playlistId?: string;
    radioUrl?: string;
    radioTitle?: string;
    ttsText?: string;
    volume?: number;
  };
}> = [
  {
    name: '☀️ 智能早安晨曲唤醒 (渐进音量)',
    cronExpr: '00 07 * * *',
    description: '每天 07:00 自动开启全屋音箱，从 20% 渐进上升至 50% 音量，播报早安问候并播放常听金曲与晨间电台',
    actionType: 'tts_announce',
    targetType: 'all_devices',
    payload: {
      ttsText: '早上好！今天是全新的一天，为您播报早安问候与晨间舒缓曲目，祝您一天好心情！',
      volume: 35
    }
  },
  {
    name: '🌙 晚安助眠与定时关机',
    cronExpr: '30 22 * * *',
    description: '每天 22:30 自动调低音量至 15%，播报柔和晚安问候并播放 Chill Lofi 助眠广播，半小时后自动打关机',
    actionType: 'play_radio',
    targetType: 'all_devices',
    payload: {
      radioUrl: 'https://stream.zeno.fm/f3wvbbqmdg8uv',
      radioTitle: 'Lofi Sleep & Chill',
      ttsText: '夜深了，为您降低音量并播放助眠旋律，祝您晚安好梦！',
      volume: 15
    }
  },
  {
    name: '⏰ 每日高分音乐闹钟',
    cronExpr: '30 06 * * *',
    description: '每天 06:30 准时打响智能音乐闹钟，以渐进高保真音量播放常听榜首单曲，助您元气满满起床',
    actionType: 'tts_announce',
    targetType: 'all_devices',
    payload: {
      ttsText: '起床时间到！该刷牙洗脸准备迎新的一天啦！',
      volume: 45
    }
  },
  {
    name: '🍱 午休放松与餐饮提示',
    cronExpr: '00 12 * * *',
    description: '每天 12:00 播报开饭广播，调至舒适音乐氛围，提醒大家好好享受午餐与午休',
    actionType: 'tts_announce',
    targetType: 'all_devices',
    payload: {
      ttsText: '午休时间到了！开饭啦，好好享用午餐，放松休息一下吧！',
      volume: 30
    }
  }
];

const TTS_PRESET_CATEGORIES = [
  {
    category: '🍽️ 生活与用餐',
    items: [
      { text: '开饭啦，大家快来吃饭！', defaultCron: '00 12 * * *', name: '🍱 每日午餐提醒广播' },
      { text: '快去接孩子放学啦！', defaultCron: '30 17 * * *', name: '🏫 每日接孩子提醒广播' },
      { text: '出门记得带钥匙、手机与手环！', defaultCron: '10 08 * * *', name: '🔑 每日出门检查提醒' },
      { text: '要下雨啦，赶紧收衣服吧！', defaultCron: '00 18 * * *', name: '🌧️ 收衣服提醒广播' }
    ]
  },
  {
    category: '🌙 作息与关怀',
    items: [
      { text: '该睡觉啦，手机放下，晚安好梦！', defaultCron: '30 22 * * *', name: '🌙 晚安睡前提醒' },
      { text: '半小时后准备关灯，睡个好觉。', defaultCron: '00 23 * * *', name: '😴 睡前关灯打铃' },
      { text: '工作久了，站起来活动活动筋骨吧！', defaultCron: '00 15 * * *', name: '🧘 下午伸展活动提醒' },
      { text: '多喝水，保持身体水分充沛！', defaultCron: '30 10 * * *', name: '💧 补充水分关怀' }
    ]
  },
  {
    category: '⏰ 学习与工作',
    items: [
      { text: '番茄钟时间到，休息 5 分钟！', defaultCron: '25 * * * *', name: '🍅 番茄钟休息提醒' },
      { text: '会议即将开始，请准备好发言材料。', defaultCron: '55 09 * * *', name: '💼 晨会准时提醒' },
      { text: '快递已送到，记得出门拿取！', defaultCron: '00 16 * * *', name: '📦 快递领取播报' }
    ]
  }
];

export const SmartAutomationTab: React.FC<SmartAutomationTabProps> = ({
  devices,
  playlists,
  onSendTts,
  activeDeviceDid
}) => {
  const { currentTheme } = useTheme();
  const isLight = currentTheme === 'light';

  const [scenes, setScenes] = useState<AutomationScene[]>([]);
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeSubView, setActiveSubView] = useState<'scenes' | 'logs' | 'backup'>('scenes');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingScene, setEditingScene] = useState<Partial<AutomationScene>>({
    name: '',
    cronExpr: '30 07 * * *',
    description: '',
    actionType: 'tts_announce',
    targetType: 'all_devices',
    payload: { ttsText: '早上好！今天也是元气满满的一天。', volume: 40 },
    enabled: true
  });

  // Backup & Restore state
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);

  const fetchAutomationData = async () => {
    setIsLoading(true);
    try {
      const [scenesRes, logsRes] = await Promise.all([
        apiFetch('/api/automation/scenes'),
        apiFetch('/api/automation/logs')
      ]);
      const scenesData = await scenesRes.json();
      const logsData = await logsRes.json();

      if (scenesData.success && Array.isArray(scenesData.scenes)) {
        setScenes(scenesData.scenes);
      }
      if (logsData.success && Array.isArray(logsData.logs)) {
        setLogs(logsData.logs);
      }
    } catch (err) {
      console.error('Failed to fetch automation data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAutomationData();
  }, []);

  const handleToggleScene = async (id: string, currentEnabled: boolean) => {
    try {
      const res = await apiFetch(`/api/automation/scenes/${id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !currentEnabled })
      });
      if (res.ok) {
        setScenes(prev => prev.map(s => s.id === id ? { ...s, enabled: !currentEnabled } : s));
      }
    } catch (err) {
      console.error('Failed to toggle scene', err);
    }
  };

  const handleTriggerScene = async (id: string) => {
    try {
      const res = await apiFetch(`/api/automation/scenes/${id}/trigger`, { method: 'POST' });
      const data = await res.json();
      fetchAutomationData();
      alert(data.message || '指令已下发');
    } catch (err: any) {
      alert('触发失败: ' + err.message);
    }
  };

  const handleDeleteScene = async (id: string) => {
    if (!confirm('确定要删除该自动化场景吗？')) return;
    try {
      const res = await apiFetch(`/api/automation/scenes/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setScenes(prev => prev.filter(s => s.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete scene', err);
    }
  };

  const handleSaveSceneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingScene.name || !editingScene.cronExpr) return;

    try {
      const res = await apiFetch('/api/automation/scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingScene)
      });
      if (res.ok) {
        setIsModalOpen(false);
        fetchAutomationData();
      }
    } catch (err: any) {
      alert('保存场景失败: ' + err.message);
    }
  };

  const handleRestoreFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsRestoring(true);
    setRestoreMessage(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      
      const res = await apiFetch('/api/system/cluster-backup/restore-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json)
      });
      const data = await res.json();
      if (data.success) {
        setRestoreMessage(`✅ ${data.message}`);
        fetchAutomationData();
      } else {
        setRestoreMessage(`❌ 还原失败: ${data.error}`);
      }
    } catch (err: any) {
      setRestoreMessage(`❌ 解析文件失败: ${err.message}`);
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Banner & Navigation */}
      <div className={`p-5 rounded-2xl border shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition ${
        isLight ? 'bg-white border-zinc-200/80 text-zinc-900 shadow-sm' : 'bg-zinc-900/90 border-white/10 text-white'
      }`}>
        <div>
          <h2 className={`text-base font-bold flex items-center gap-2 ${isLight ? 'text-zinc-900' : 'text-white'}`}>
            <Clock className="w-4.5 h-4.5 text-amber-500" />
            <span>智能自动化与定时场景引擎 (Phase 3)</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-mono">
              Cron Engine
            </span>
          </h2>
          <p className={`text-xs mt-0.5 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
            配置早安晨曲唤醒、夜间广播、定点打铃播报与全屋智能编组自动化
          </p>
        </div>

        <div className={`flex items-center gap-1.5 p-1 rounded-xl border ${
          isLight ? 'bg-zinc-100 border-zinc-200' : 'bg-zinc-950 border-white/10'
        }`}>
          <button
            onClick={() => setActiveSubView('scenes')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeSubView === 'scenes'
                ? 'bg-amber-500 text-zinc-950 shadow-sm font-bold'
                : isLight ? 'text-zinc-600 hover:text-zinc-900' : 'text-zinc-400 hover:text-white'
            }`}
          >
            场景规则 ({scenes.length})
          </button>
          <button
            onClick={() => setActiveSubView('logs')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeSubView === 'logs'
                ? 'bg-amber-500 text-zinc-950 shadow-sm font-bold'
                : isLight ? 'text-zinc-600 hover:text-zinc-900' : 'text-zinc-400 hover:text-white'
            }`}
          >
            场景执行日志
          </button>
          <button
            onClick={() => setActiveSubView('backup')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeSubView === 'backup'
                ? 'bg-amber-500 text-zinc-950 shadow-sm font-bold'
                : isLight ? 'text-zinc-600 hover:text-zinc-900' : 'text-zinc-400 hover:text-white'
            }`}
          >
            集群全量备份 & 还原
          </button>
        </div>
      </div>

      {/* SubView 1: Scenes List */}
      {activeSubView === 'scenes' && (
        <div className="space-y-6">

          {/* 1-Click Smart Scene Templates Shelf */}
          <div className={`p-5 rounded-2xl border space-y-3.5 backdrop-blur-md ${
            isLight ? 'bg-amber-50/60 border-amber-300/80 shadow-sm' : 'bg-zinc-900/90 border-white/10'
          }`}>
            <div className="flex items-center justify-between">
              <h3 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${
                isLight ? 'text-amber-900' : 'text-amber-300'
              }`}>
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>1-键加载经典智能场景模版 (早安唤醒 / 晚安助眠 / 音乐闹钟 / 午休提醒)</span>
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {SCENE_TEMPLATES.map((tmpl, idx) => (
                <div
                  key={idx}
                  className={`p-3.5 rounded-xl border transition flex flex-col justify-between space-y-3 ${
                    isLight ? 'bg-white border-zinc-200 hover:border-amber-400 shadow-xs' : 'bg-zinc-950 border-white/10 hover:border-amber-500/40'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-1">
                      <h4 className={`text-xs font-bold truncate ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                        {tmpl.name}
                      </h4>
                      <span className="text-[10px] font-mono font-semibold shrink-0 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20">
                        {tmpl.cronExpr}
                      </span>
                    </div>
                    <p className={`text-[11px] leading-relaxed line-clamp-2 ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                      {tmpl.description}
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setEditingScene({
                        ...tmpl,
                        enabled: true
                      });
                      setIsModalOpen(true);
                    }}
                    className="w-full py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs transition cursor-pointer shadow-xs flex items-center justify-center gap-1"
                  >
                    <Zap className="w-3.5 h-3.5 fill-current" />
                    <span>应用并创建场景</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Preset TTS Phrase Library & Scheduled Broadcast Conversion */}
          <div className={`p-5 rounded-2xl border space-y-4 backdrop-blur-md ${
            isLight ? 'bg-white border-zinc-200/80 shadow-sm' : 'bg-zinc-900/90 border-white/10'
          }`}>
            <div className="flex items-center justify-between">
              <h3 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${
                isLight ? 'text-zinc-900' : 'text-white'
              }`}>
                <Volume2 className="w-4 h-4 text-amber-500" />
                <span>常用 TTS 快捷语录预设库与 1-键转定时广播</span>
              </h3>
              {activeDeviceDid && (
                <span className="text-[11px] text-amber-600 font-semibold font-mono">
                  当前目标音箱: {activeDeviceDid}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {TTS_PRESET_CATEGORIES.map((cat, cIdx) => (
                <div key={cIdx} className={`p-3.5 rounded-xl border space-y-3 ${
                  isLight ? 'bg-zinc-50/80 border-zinc-200' : 'bg-zinc-950/80 border-white/5'
                }`}>
                  <h4 className={`text-xs font-bold ${isLight ? 'text-zinc-800' : 'text-zinc-200'}`}>
                    {cat.category}
                  </h4>
                  <div className="space-y-2">
                    {cat.items.map((item, iIdx) => (
                      <div key={iIdx} className={`p-2.5 rounded-lg border flex flex-col gap-1.5 ${
                        isLight ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-white/5'
                      }`}>
                        <span className={`text-xs font-medium ${isLight ? 'text-zinc-900' : 'text-zinc-100'}`}>
                          “{item.text}”
                        </span>
                        <div className="flex items-center justify-between pt-1 border-t border-dashed border-zinc-200 dark:border-white/5">
                          <button
                            onClick={() => {
                              if (onSendTts && activeDeviceDid) {
                                onSendTts(activeDeviceDid, item.text);
                                alert(`已向当前音箱发送 TTS 播报: “${item.text}”`);
                              } else {
                                alert('请先在顶部选中一台小爱音箱设备');
                              }
                            }}
                            className="text-[10px] px-2 py-1 rounded bg-zinc-200 dark:bg-zinc-800 hover:bg-amber-500 hover:text-zinc-950 font-semibold transition cursor-pointer flex items-center gap-1"
                          >
                            <Send className="w-3 h-3" />
                            <span>▶ 立即播报</span>
                          </button>

                          <button
                            onClick={() => {
                              setEditingScene({
                                name: item.name,
                                cronExpr: item.defaultCron,
                                description: `定时自动广播语录: “${item.text}”`,
                                actionType: 'tts_announce',
                                targetType: 'all_devices',
                                payload: { ttsText: item.text, volume: 40 },
                                enabled: true
                              });
                              setIsModalOpen(true);
                            }}
                            className="text-[10px] px-2 py-1 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500 hover:text-zinc-950 font-semibold transition cursor-pointer flex items-center gap-1"
                          >
                            <Clock className="w-3 h-3" />
                            <span>⏰ 定为定时广播</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Scenes Section Title */}
          <div className="flex items-center justify-between pt-2">
            <span className={`text-xs font-bold uppercase tracking-wider ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
              已启用的 Cron 规则清单 ({scenes.length})
            </span>

            <button
              onClick={() => {
                setEditingScene({
                  name: '☀️ 智能早安晨曲唤醒',
                  cronExpr: '00 07 * * *',
                  description: '每天 07:00 自动播报早安语音并播放晨间电台',
                  actionType: 'tts_announce',
                  targetType: 'all_devices',
                  payload: { ttsText: '早上好，为你播报今日晨间旋律！', volume: 35 },
                  enabled: true
                });
                setIsModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500 text-zinc-950 font-bold text-xs hover:bg-amber-400 transition cursor-pointer shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>新建自定义场景</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {scenes.map(sc => (
              <div
                key={sc.id}
                className={`p-5 rounded-2xl border transition shadow-sm flex flex-col justify-between space-y-4 ${
                  isLight
                    ? 'bg-white border-zinc-200 hover:border-amber-500/50'
                    : 'bg-zinc-900/80 border-white/5 hover:border-amber-500/30'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-xl ${
                        sc.enabled 
                          ? 'bg-amber-500/15 text-amber-600 border border-amber-500/30' 
                          : isLight ? 'bg-zinc-100 text-zinc-400' : 'bg-zinc-800 text-zinc-500'
                      }`}>
                        <Clock className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className={`text-sm font-bold ${isLight ? 'text-zinc-900' : 'text-white'}`}>{sc.name}</h3>
                        <span className="text-[11px] font-mono font-bold text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                          {sc.cronExpr}
                        </span>
                      </div>
                    </div>

                    {/* Toggle Switch */}
                    <button
                      onClick={() => handleToggleScene(sc.id, sc.enabled)}
                      className={`px-2.5 py-1 rounded-full text-xs font-bold transition cursor-pointer ${
                        sc.enabled
                          ? 'bg-emerald-500/20 text-emerald-600 border border-emerald-500/40'
                          : isLight ? 'bg-zinc-200 text-zinc-500' : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {sc.enabled ? '已开启' : '已禁用'}
                    </button>
                  </div>

                  <p className={`text-xs leading-relaxed ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                    {sc.description || '自动触发全屋智能音箱播控指令'}
                  </p>

                  <div className={`p-2.5 rounded-xl text-[11px] font-mono space-y-1 ${
                    isLight ? 'bg-zinc-50 border border-zinc-200 text-zinc-700' : 'bg-zinc-950/80 border border-white/5 text-zinc-300'
                  }`}>
                    <div>动作类型: <strong>{sc.actionType}</strong></div>
                    {sc.payload.ttsText && <div>语音文本: “{sc.payload.ttsText}”</div>}
                    {sc.payload.radioTitle && <div>电台: {sc.payload.radioTitle}</div>}
                    {sc.payload.volume !== undefined && <div>音量设定: {sc.payload.volume}%</div>}
                  </div>
                </div>

                <div className={`pt-3 border-t flex items-center justify-between text-xs ${
                  isLight ? 'border-zinc-100' : 'border-white/5'
                }`}>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    {sc.lastRunTime ? `上次触发: ${new Date(sc.lastRunTime).toLocaleTimeString('zh-CN')}` : '尚未触发'}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleTriggerScene(sc.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1 ${
                        isLight
                          ? 'bg-amber-500 text-zinc-950 font-bold hover:bg-amber-400'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20'
                      }`}
                      title="立即测试手动触发"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>测试触发</span>
                    </button>
                    <button
                      onClick={() => handleDeleteScene(sc.id)}
                      className="p-1.5 text-zinc-400 hover:text-rose-500 transition cursor-pointer"
                      title="删除场景"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SubView 2: Logs */}
      {activeSubView === 'logs' && (
        <div className={`p-5 rounded-2xl border space-y-4 ${
          isLight ? 'bg-white border-zinc-200/80 shadow-sm' : 'bg-zinc-900/80 border-white/10'
        }`}>
          <div className="flex items-center justify-between">
            <h3 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${
              isLight ? 'text-zinc-900' : 'text-white'
            }`}>
              <Terminal className="w-4 h-4 text-amber-500" />
              <span>Cron 自动化执行事件流水日志</span>
            </h3>
            <button
              onClick={fetchAutomationData}
              className="p-1.5 hover:bg-zinc-100 dark:hover:bg-white/10 rounded-lg text-zinc-400 transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {logs.length === 0 ? (
            <div className={`py-16 text-center text-xs border border-dashed rounded-xl ${
              isLight ? 'bg-zinc-50 border-zinc-200 text-zinc-500' : 'border-white/5 text-zinc-500'
            }`}>
              暂无 Cron 场景触发日志
            </div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {logs.map(lg => (
                <div
                  key={lg.id}
                  className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                    isLight ? 'bg-zinc-50 border-zinc-200/80' : 'bg-zinc-950/80 border-white/5'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${lg.status === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                      <strong className={isLight ? 'text-zinc-900' : 'text-white'}>{lg.sceneName}</strong>
                    </div>
                    <p className={`text-[11px] mt-1 ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                      {lg.message}
                    </p>
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono shrink-0">
                    {new Date(lg.timestamp).toLocaleString('zh-CN')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SubView 3: Backup & Restore */}
      {activeSubView === 'backup' && (
        <div className={`p-6 rounded-2xl border space-y-6 ${
          isLight ? 'bg-white border-zinc-200/80 shadow-sm' : 'bg-zinc-900/80 border-white/10'
        }`}>
          <div>
            <h3 className={`text-base font-bold flex items-center gap-2 ${isLight ? 'text-zinc-900' : 'text-white'}`}>
              <Layers className="w-5 h-5 text-amber-500" />
              <span>集群配置全量 JSON 一键导出与还原</span>
            </h3>
            <p className={`text-xs mt-1 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
              包含绑定的音箱设备、音箱策略 Profile、语音黑话词库、播客 RSS 订阅、自定义电台及自动化 Cron 场景
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Export Card */}
            <div className={`p-5 rounded-xl border space-y-3 ${
              isLight ? 'bg-amber-50/50 border-amber-200' : 'bg-zinc-950 border-white/10'
            }`}>
              <div className="flex items-center gap-2">
                <Download className="w-5 h-5 text-amber-600" />
                <h4 className="text-sm font-bold">导出集群配置 JSON</h4>
              </div>
              <p className={`text-xs ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                生成包含系统全部规则与配置的备份文件，支持跨节点/容器迁移恢复。
              </p>
              <a
                href="/api/system/cluster-backup/export-backup"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-zinc-950 font-bold text-xs hover:bg-amber-400 transition shadow-sm"
              >
                <FileJson className="w-4 h-4" />
                <span>立即下载集群备份 (.json)</span>
              </a>
            </div>

            {/* Restore Card */}
            <div className={`p-5 rounded-xl border space-y-3 ${
              isLight ? 'bg-sky-50/50 border-sky-200' : 'bg-zinc-950 border-white/10'
            }`}>
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-sky-600" />
                <h4 className="text-sm font-bold">导入恢复配置 JSON</h4>
              </div>
              <p className={`text-xs ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                选择之前导出的 JSON 备份文件，一键全量恢复系统状态。
              </p>
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 text-white font-bold text-xs hover:bg-sky-400 transition cursor-pointer shadow-sm">
                <Upload className="w-4 h-4" />
                <span>{isRestoring ? '正在还原中...' : '选择备份文件导入'}</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleRestoreFileChange}
                  className="hidden"
                  disabled={isRestoring}
                />
              </label>

              {restoreMessage && (
                <div className="text-xs font-bold font-mono pt-2">
                  {restoreMessage}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Scene Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
          <div className={`w-full max-w-lg p-6 rounded-2xl border shadow-2xl space-y-5 ${
            isLight ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-zinc-900 border-white/10 text-white'
          }`}>
            <h3 className="text-base font-bold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>新建 / 编辑自动化场景</span>
            </h3>

            <form onSubmit={handleSaveSceneSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold mb-1">场景名称</label>
                <input
                  type="text"
                  value={editingScene.name || ''}
                  onChange={e => setEditingScene({ ...editingScene, name: e.target.value })}
                  placeholder="例: ☀️ 智能早安晨曲"
                  required
                  className={`w-full px-3 py-2 rounded-xl border ${
                    isLight ? 'bg-zinc-100 border-zinc-300' : 'bg-zinc-950 border-white/10'
                  }`}
                />
              </div>

              <div>
                <label className="block font-bold mb-1">Cron 调度表达式 (分 时 * * *)</label>
                <input
                  type="text"
                  value={editingScene.cronExpr || ''}
                  onChange={e => setEditingScene({ ...editingScene, cronExpr: e.target.value })}
                  placeholder="30 07 * * * (每天 07:30)"
                  required
                  className={`w-full px-3 py-2 rounded-xl border font-mono ${
                    isLight ? 'bg-zinc-100 border-zinc-300' : 'bg-zinc-950 border-white/10'
                  }`}
                />
              </div>

              <div>
                <label className="block font-bold mb-1">场景说明描述</label>
                <input
                  type="text"
                  value={editingScene.description || ''}
                  onChange={e => setEditingScene({ ...editingScene, description: e.target.value })}
                  placeholder="简述该自动化场景的用途"
                  className={`w-full px-3 py-2 rounded-xl border ${
                    isLight ? 'bg-zinc-100 border-zinc-300' : 'bg-zinc-950 border-white/10'
                  }`}
                />
              </div>

              <div>
                <label className="block font-bold mb-1">执行动作</label>
                <select
                  value={editingScene.actionType}
                  onChange={e => setEditingScene({ ...editingScene, actionType: e.target.value as any })}
                  className={`w-full px-3 py-2 rounded-xl border ${
                    isLight ? 'bg-zinc-100 border-zinc-300' : 'bg-zinc-950 border-white/10'
                  }`}
                >
                  <option value="tts_announce">🗣️ 播报 TTS 提示文本</option>
                  <option value="play_radio">📻 播放网络电台直播流</option>
                  <option value="stop_playback">⏸️ 暂停/关闭播放</option>
                </select>
              </div>

              {editingScene.actionType === 'tts_announce' && (
                <div>
                  <label className="block font-bold mb-1">TTS 播报文本</label>
                  <textarea
                    rows={2}
                    value={editingScene.payload?.ttsText || ''}
                    onChange={e => setEditingScene({
                      ...editingScene,
                      payload: { ...editingScene.payload, ttsText: e.target.value }
                    })}
                    placeholder="输入要播报的内容..."
                    className={`w-full px-3 py-2 rounded-xl border ${
                      isLight ? 'bg-zinc-100 border-zinc-300' : 'bg-zinc-950 border-white/10'
                    }`}
                  />
                </div>
              )}

              {editingScene.actionType === 'play_radio' && (
                <div>
                  <label className="block font-bold mb-1">电台直播流 URL</label>
                  <input
                    type="text"
                    value={editingScene.payload?.radioUrl || ''}
                    onChange={e => setEditingScene({
                      ...editingScene,
                      payload: { ...editingScene.payload, radioUrl: e.target.value, radioTitle: '早安广播' }
                    })}
                    placeholder="例: https://stream.zeno.fm/f3wvbbqmdg8uv"
                    className={`w-full px-3 py-2 rounded-xl border font-mono ${
                      isLight ? 'bg-zinc-100 border-zinc-300' : 'bg-zinc-950 border-white/10'
                    }`}
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className={`px-4 py-2 rounded-xl border ${
                    isLight ? 'bg-zinc-100 border-zinc-300' : 'bg-zinc-800 border-white/10'
                  }`}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-500 text-zinc-950 font-bold shadow-sm hover:bg-amber-400"
                >
                  保存场景
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
