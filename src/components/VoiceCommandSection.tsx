import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  Play,
  Pause,
  RefreshCw,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  Volume2,
  Music,
  Terminal,
  Activity,
  AlertCircle,
  Sparkles,
  HelpCircle,
  Radio,
  Sliders,
  CheckCircle2,
  Search,
  MessageSquare,
  ShieldCheck,
  Send,
  Zap,
  ListMusic,
  CloudLightning,
  VolumeX,
  Info
} from 'lucide-react';
import { XiaomiDevice, VoiceListenerConfig, VoiceListenerStatus, VoiceDialogueLog, VoiceCommandRule, Playlist } from '../types';
import { apiFetch } from '../utils/api';

interface VoiceCommandSectionProps {
  devices: XiaomiDevice[];
  activeDevice: XiaomiDevice | undefined;
  onSelectDevice: (did: string) => void;
  playlists?: Playlist[];
}

export const VoiceCommandSection: React.FC<VoiceCommandSectionProps> = ({
  devices,
  activeDevice,
  onSelectDevice,
  playlists = []
}) => {
  const [status, setStatus] = useState<VoiceListenerStatus | null>(null);
  const [config, setConfig] = useState<VoiceListenerConfig | null>(null);
  const [logs, setLogs] = useState<VoiceDialogueLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isPollingNow, setIsPollingNow] = useState(false);
  const [pollNowMessage, setPollNowMessage] = useState<{ text: string; type: 'success' | 'warning' | 'error' } | null>(null);

  // Test Query Simulator state
  const [testQueryText, setTestQueryText] = useState('');
  const [isTestingQuery, setIsTestingQuery] = useState(false);
  const [testResult, setTestResult] = useState<{ matched: boolean; summary: string } | null>(null);

  // Edit / Add Rule Modal state
  const [editingRule, setEditingRule] = useState<VoiceCommandRule | null>(null);
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [rulePhrasesText, setRulePhrasesText] = useState('');

  // Guide accordion state
  const [showTrainingGuide, setShowTrainingGuide] = useState(false);

  // Polling for voice listener logs & status
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchVoiceStatus = async () => {
    try {
      const res = await apiFetch('/api/miot/voice/status');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setStatus(data.status);
          setConfig(data.config);
          setLogs(data.logs || []);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch voice status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchVoiceStatus();
    // Refresh status & logs every 3 seconds
    pollTimerRef.current = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchVoiceStatus();
    }, 12000);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  const handleToggleListener = async () => {
    if (!status && !config) return;
    const willEnable = !status?.isRunning;
    setIsUpdating(true);
    try {
      const res = await apiFetch('/api/miot/voice/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: willEnable })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setStatus(data.status);
          setConfig(data.config);
        }
      }
    } catch (err: any) {
      console.error('Toggle voice listener error:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdateConfig = async (partial: Partial<VoiceListenerConfig>) => {
    setIsUpdating(true);
    try {
      const res = await apiFetch('/api/miot/voice/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setStatus(data.status);
          setConfig(data.config);
        }
      }
    } catch (err: any) {
      console.error('Update voice config error:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleClearLogs = async () => {
    try {
      await apiFetch('/api/miot/voice/logs/clear', { method: 'POST' });
      setLogs([]);
    } catch (err) {
      console.error('Clear logs error:', err);
    }
  };

  const handleToggleRule = (ruleId: string) => {
    if (!config) return;
    const newRules = config.rules.map(r => r.id === ruleId ? { ...r, enabled: !r.enabled } : r);
    handleUpdateConfig({ rules: newRules });
  };

  const handleDeleteRule = (ruleId: string) => {
    if (!config) return;
    const newRules = config.rules.filter(r => r.id !== ruleId);
    handleUpdateConfig({ rules: newRules });
  };

  const handleOpenEditRule = (rule?: VoiceCommandRule) => {
    if (rule) {
      setEditingRule({ ...rule });
      setRulePhrasesText(rule.triggerPhrases.join('，'));
    } else {
      setEditingRule({
        id: `rule_${Date.now()}`,
        name: '新建语音口令',
        triggerPhrases: ['放点轻音乐'],
        actionType: 'play_playlist',
        targetPlaylistId: playlists[0]?.id || 'default',
        ttsFeedback: '好的，正在播放',
        enabled: true
      });
      setRulePhrasesText('放点轻音乐，播放轻音乐');
    }
    setIsRuleModalOpen(true);
  };

  const handleSaveRule = () => {
    if (!editingRule || !config) return;
    const phrases = rulePhrasesText
      .split(/[,，\n|]/)
      .map(s => s.trim())
      .filter(Boolean);

    const updatedRule: VoiceCommandRule = {
      ...editingRule,
      triggerPhrases: phrases.length > 0 ? phrases : ['点歌']
    };

    const exists = config.rules.some(r => r.id === updatedRule.id);
    const newRules = exists
      ? config.rules.map(r => r.id === updatedRule.id ? updatedRule : r)
      : [...config.rules, updatedRule];

    handleUpdateConfig({ rules: newRules });
    setIsRuleModalOpen(false);
  };

  const [isRestoringDefaults, setIsRestoringDefaults] = useState(false);
  const handleRestoreDefaultRules = async () => {
    if (!window.confirm('确定要恢复全部官方默认语音口令与触发规则吗？')) return;
    setIsRestoringDefaults(true);
    try {
      const res = await apiFetch('/api/miot/voice/rules/restore-defaults', {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.config) {
          setConfig(data.config);
        }
      }
    } catch (err: any) {
      console.warn('Failed to restore default rules:', err);
    } finally {
      setIsRestoringDefaults(false);
    }
  };

  const executeTestQuery = async (queryText: string) => {
    const clean = queryText.trim();
    if (!clean) return;

    setIsTestingQuery(true);
    setTestResult(null);
    try {
      const res = await apiFetch('/api/miot/voice/test-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: clean,
          did: config?.targetDeviceId || activeDevice?.did
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setTestResult(data.result);
          if (data.logs) {
            setLogs(data.logs);
          }
        }
      }
    } catch (err: any) {
      setTestResult({ matched: false, summary: `请求异常: ${err.message}` });
    } finally {
      setIsTestingQuery(false);
    }
  };

  const handleTestQuery = (e: React.FormEvent) => {
    e.preventDefault();
    executeTestQuery(testQueryText);
  };

  const handlePollNow = async () => {
    setIsPollingNow(true);
    setPollNowMessage(null);
    try {
      const res = await apiFetch('/api/miot/voice/poll-now', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setPollNowMessage({
          text: data.message || `同步成功 (获取到 ${data.recordsFound} 条对话记录)`,
          type: 'success'
        });
        if (data.logs) setLogs(data.logs);
        if (data.status) setStatus(data.status);
      } else {
        setPollNowMessage({
          text: data.error || data.message || '从音箱云端同步对话记录失败',
          type: 'warning'
        });
      }
    } catch (err: any) {
      setPollNowMessage({
        text: `同步请求异常: ${err.message}`,
        type: 'error'
      });
    } finally {
      setIsPollingNow(false);
      setTimeout(() => setPollNowMessage(null), 6000);
    }
  };

  const QUICK_TEST_PRESETS = [
    { label: '🎵 点播月半小夜曲', query: '放一首月半小夜曲' },
    { label: '🎤 歌手+歌名搜索', query: '放一首周杰伦的夜的第七章' },
    { label: '❤️ 播放我喜欢的音乐', query: '播放我喜欢的歌' },
    { label: '⏭️ 语音切歌 (下一首)', query: '换一首' },
    { label: '⏮️ 语音切歌 (上一首)', query: '上一首' },
    { label: '🔊 调大音量', query: '大点声' },
    { label: '🔉 调小音量', query: '小点声' },
    { label: '⏸️ 暂停播放', query: '暂停音乐' },
    { label: '▶️ 继续播放', query: '继续播放' },
    { label: '🎲 随便放点歌', query: '随便放点歌' }
  ];

  return (
    <div className="space-y-6">
      {/* ---------------- 1. Top Master Control Panel ---------------- */}
      <div className="p-6 rounded-3xl bg-zinc-900/60 border border-white/10 backdrop-blur-md relative overflow-hidden shadow-xl">
        <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-gradient-to-br from-[#FF6700]/10 to-amber-500/5 blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-2xl border transition-all ${
                status?.isRunning 
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.2)]' 
                  : 'bg-zinc-800/80 border-white/5 text-zinc-400'
              }`}>
                <Mic className="w-6 h-6" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-bold text-white tracking-tight">小爱音箱语音口令与点歌引擎</h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border transition ${
                    status?.isRunning
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 animate-pulse'
                      : 'bg-zinc-800 text-zinc-400 border-white/10'
                  }`}>
                    {status?.isRunning ? '● 语音捕获运行中' : '○ 已停止'}
                  </span>
                  {status?.isRunning && (
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                      status.pollingMode === 'burst'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                        : status.pollingMode === 'idle' || status.pollingMode === 'standby'
                        ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                        : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    }`}>
                      {status.pollingMode === 'burst'
                        ? `⚡ 极速捕获 (800ms${status.burstRemainingSec ? ` · 剩${status.burstRemainingSec}s` : ''})`
                        : status.pollingMode === 'idle'
                        ? '💤 闲时节流巡检 (4.5s)'
                        : status.pollingMode === 'standby'
                        ? '🌙 深度待机 (6.5s)'
                        : `常规巡检 (${((status.pollIntervalMs || 2500) / 1000).toFixed(1)}s)`}
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                    拼音/同音错别字容错
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-1 max-w-2xl leading-relaxed">
                  实时捕获小爱音箱对话（对音箱说“小爱同学，来首稻香”），自适应解析歌手与曲目，智能抢播熔断并投播至私有高保真曲库。
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <button
              type="button"
              onClick={handleToggleListener}
              disabled={isUpdating}
              className={`px-5 py-2.5 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer flex-1 sm:flex-initial shadow-lg ${
                status?.isRunning
                  ? 'bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-amber-500/20'
                  : 'bg-[#FF6700] hover:bg-[#e55c00] text-white shadow-[#FF6700]/20'
              }`}
            >
              {status?.isRunning ? (
                <>
                  <Pause className="w-4 h-4" />
                  <span>暂停监听</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>开启语音监听</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handlePollNow}
              disabled={isPollingNow}
              className="px-4 py-2.5 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-medium border border-white/10 flex items-center justify-center gap-2 transition cursor-pointer shrink-0"
              title="立即向小爱云端发起对话查询并激活动态加速"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#FF6700] ${isPollingNow ? 'animate-spin' : ''}`} />
              <span>{isPollingNow ? '正在拉取...' : '立即同步音箱对话'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowTrainingGuide(!showTrainingGuide)}
              className="px-4 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-medium border border-white/10 flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0"
            >
              <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
              <span>使用说明</span>
            </button>
          </div>
        </div>

        {/* Sync result banner */}
        {pollNowMessage && (
          <div className={`mt-4 p-3 rounded-2xl border text-xs flex items-center gap-2.5 transition animate-fadeIn ${
            pollNowMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : pollNowMessage.type === 'warning'
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}>
            <Info className="w-4 h-4 shrink-0" />
            <span>{pollNowMessage.text}</span>
          </div>
        )}

        {/* Cloud Login Warning Banner if not logged in */}
        {status && !status.isLoggedIn && (
          <div className="mt-4 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold">提示：尚未绑定小米云端账号 (Mina Cloud Token)</span>
              <p className="text-zinc-300 text-[11px] leading-relaxed">
                小爱音箱的真实语音捕获需要调用小米云端对话接口或长连接。如果语音对话捕获未显示数据，请前往顶部导航的<b>【设备与连接】</b>中登录小米账号。在此期间，您依然可以使用下方的<b>快捷测试按钮</b>测试私有曲库的所有搜歌和播控逻辑。
              </p>
            </div>
          </div>
        )}

        {/* Settings Bar */}
        <div className="mt-6 pt-5 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          {/* Target Speaker Selector */}
          <div className="space-y-1.5">
            <label className="text-zinc-400 font-medium flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-[#FF6700]" />
              <span>监听绑定音箱</span>
            </label>
            <select
              value={config?.targetDeviceId || activeDevice?.did || ''}
              onChange={(e) => {
                const did = e.target.value;
                handleUpdateConfig({ targetDeviceId: did });
                onSelectDevice(did);
              }}
              className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-[#FF6700] cursor-pointer"
            >
              {devices.map(dev => (
                <option key={dev.did} value={dev.did}>
                  {dev.name} ({dev.model || '小爱音箱'})
                </option>
              ))}
            </select>
          </div>

          {/* Adaptive Dynamic Polling Switch */}
          <div className="space-y-1.5">
            <label className="text-zinc-400 font-medium flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-blue-400" />
              <span>自适应动态调频 (降载75%)</span>
            </label>
            <button
              type="button"
              onClick={() => handleUpdateConfig({ adaptivePollingEnabled: !(config?.adaptivePollingEnabled !== false) })}
              className={`w-full py-2 px-3 rounded-xl border flex items-center justify-between transition cursor-pointer ${
                config?.adaptivePollingEnabled !== false
                  ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                  : 'bg-zinc-950 border-white/10 text-zinc-400'
              }`}
            >
              <span>{config?.adaptivePollingEnabled !== false ? '已开启 (突发800ms/闲时退避)' : '固定频率模式'}</span>
              <span className={`w-2 h-2 rounded-full ${config?.adaptivePollingEnabled !== false ? 'bg-blue-400 animate-pulse' : 'bg-zinc-600'}`} />
            </button>
          </div>

          {/* Early Interception */}
          <div className="space-y-1.5">
            <label className="text-zinc-400 font-medium flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>抢播快速熔断 (截断官方音源)</span>
            </label>
            <button
              type="button"
              onClick={() => handleUpdateConfig({ earlyInterceptionEnabled: !(config?.earlyInterceptionEnabled !== false) })}
              className={`w-full py-2 px-3 rounded-xl border flex items-center justify-between transition cursor-pointer ${
                config?.earlyInterceptionEnabled !== false
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  : 'bg-zinc-950 border-white/10 text-zinc-400'
              }`}
              title="命中私有音乐指令时立即静音/暂停官方音频，避免声音打架重叠"
            >
              <span>{config?.earlyInterceptionEnabled !== false ? '已启用 (防双音重叠)' : '关闭快速截断'}</span>
              <span className={`w-2 h-2 rounded-full ${config?.earlyInterceptionEnabled !== false ? 'bg-amber-400' : 'bg-zinc-600'}`} />
            </button>
          </div>

          {/* TTS Response Toggle */}
          <div className="space-y-1.5">
            <label className="text-zinc-400 font-medium flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>命中后音箱语音应答</span>
            </label>
            <button
              type="button"
              onClick={() => handleUpdateConfig({ ttsFeedbackEnabled: !config?.ttsFeedbackEnabled })}
              className={`w-full py-2 px-3 rounded-xl border flex items-center justify-between transition cursor-pointer ${
                config?.ttsFeedbackEnabled
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-zinc-950 border-white/10 text-zinc-400'
              }`}
            >
              <span>{config?.ttsFeedbackEnabled ? '已开启应答朗读' : '静默点歌 (不应答)'}</span>
              <span className={`w-2 h-2 rounded-full ${config?.ttsFeedbackEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
            </button>
          </div>
        </div>

        {/* Training Accordion */}
        {showTrainingGuide && (
          <div className="mt-5 p-4 rounded-2xl bg-zinc-950/90 border border-[#FF6700]/20 text-xs space-y-3 animate-fadeIn">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#FF6700]" />
                <span>小爱音箱私有曲库语音交互指南</span>
              </h4>
              <button
                type="button"
                onClick={() => setShowTrainingGuide(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-zinc-300">
              <div className="p-3 rounded-xl bg-zinc-900/80 border border-white/5 space-y-1">
                <span className="text-[#FF6700] font-bold block">1. 智能搜歌点播</span>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  对音箱说：<b>“小爱同学，来首稻香”</b>、<b>“小爱同学，放一首周杰伦的晴天”</b>。系统将自动提取歌名与歌手并在本地曲库中模糊匹配投播。
                </p>
              </div>
              <div className="p-3 rounded-xl bg-zinc-900/80 border border-white/5 space-y-1">
                <span className="text-blue-400 font-bold block">2. 歌单与随机播放</span>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  对音箱说：<b>“播放我喜欢的歌”</b>、<b>“播放本地歌单”</b>、<b>“随便放点歌”</b>。即可一键投播收藏夹或整个曲库。
                </p>
              </div>
              <div className="p-3 rounded-xl bg-zinc-900/80 border border-white/5 space-y-1">
                <span className="text-emerald-400 font-bold block">3. 语音播控指令</span>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  对音箱说：<b>“换一首”</b>、<b>“下一曲”</b>、<b>“调大音量”</b>、<b>“暂停音乐”</b>、<b>“继续播放”</b>。即刻联动音箱与网页端播放队列。
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ---------------- 2. Instant Voice Query Simulator & Debugger ---------------- */}
      <div className="p-5 rounded-3xl bg-zinc-900/40 border border-white/10 backdrop-blur-md space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" />
            <h4 className="text-sm font-bold text-white">
              语音口令调试与模拟测试
            </h4>
            <span className="text-[11px] text-zinc-400">（无需开嗓，直接输入文字模拟小爱音箱捕获的对话）</span>
          </div>
        </div>

        <form onSubmit={handleTestQuery} className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={testQueryText}
              onChange={(e) => setTestQueryText(e.target.value)}
              placeholder="例如：放一首月半小夜曲、播放我喜欢的歌、换一首、调大音量..."
              className="w-full bg-zinc-950/80 border border-white/10 rounded-2xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF6700]/60 transition"
            />
          </div>

          <button
            type="submit"
            disabled={isTestingQuery || !testQueryText.trim()}
            className="w-full sm:w-auto px-5 py-2.5 rounded-2xl bg-[#FF6700] hover:bg-[#e55c00] text-white text-xs font-bold transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shrink-0"
          >
            {isTestingQuery ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span>测试指令匹配与执行</span>
          </button>
        </form>

        {/* Quick Test Presets Chips */}
        <div className="space-y-1.5 pt-1">
          <span className="text-[11px] text-zinc-500 font-medium block">快捷指令测试推荐（点击即可立即运行验证）：</span>
          <div className="flex flex-wrap gap-2">
            {QUICK_TEST_PRESETS.map((preset, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setTestQueryText(preset.query);
                  executeTestQuery(preset.query);
                }}
                className="px-3 py-1.5 rounded-xl bg-zinc-800/70 hover:bg-zinc-700/90 text-zinc-300 hover:text-white border border-white/5 hover:border-[#FF6700]/40 text-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <span>{preset.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Test Result Feedback */}
        {testResult && (
          <div className={`p-4 rounded-2xl border text-xs flex items-start gap-3 animate-fadeIn ${
            testResult.matched
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-zinc-800/80 border-white/10 text-zinc-300'
          }`}>
            {testResult.matched ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            )}
            <div className="space-y-0.5">
              <strong className="block font-bold">
                {testResult.matched ? '✓ 指令成功匹配并执行' : '✕ 未匹配到私有音乐口令'}
              </strong>
              <p className="text-[11px] opacity-90">{testResult.summary}</p>
            </div>
          </div>
        )}
      </div>

      {/* ---------------- 3. Voice Rules Configuration Section ---------------- */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-base font-bold text-white flex items-center gap-2">
              <Sliders className="w-5 h-5 text-[#FF6700]" />
              语音口令触发规则清单 ({config?.rules.length || 0})
            </h4>
            <p className="text-xs text-zinc-400 mt-0.5">
              已预装智能搜歌、歌单投播、播控切歌及音量调节规则，支持自由增改触发词
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRestoreDefaultRules}
              disabled={isRestoringDefaults}
              className="px-3.5 py-2 rounded-2xl bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 border border-white/10 text-xs font-medium transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="一键恢复系统内置的 10 条官方默认语音口令与播控规则"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRestoringDefaults ? 'animate-spin' : ''}`} />
              <span>恢复默认规则</span>
            </button>
            <button
              type="button"
              onClick={() => handleOpenEditRule()}
              className="px-4 py-2 rounded-2xl bg-[#FF6700]/20 hover:bg-[#FF6700]/30 text-[#FF6700] border border-[#FF6700]/30 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>新建语音规则</span>
            </button>
          </div>
        </div>

        {/* Rules Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {config?.rules.map((rule) => {
            const isSongSearch = rule.actionType === 'play_song_search';
            const isPlaylist = rule.actionType === 'play_playlist';
            const isRandom = rule.actionType === 'play_random_all';

            const controlLabels: Record<string, string> = {
              next: '下一首',
              prev: '上一首',
              pause: '暂停播放',
              stop: '停止播放',
              resume: '继续播放',
              volume_up: '调大音量',
              volume_down: '调小音量'
            };

            return (
              <div
                key={rule.id}
                className={`p-5 rounded-3xl border transition-all ${
                  rule.enabled
                    ? 'bg-zinc-900/50 border-white/10 hover:border-white/20'
                    : 'bg-zinc-950/40 border-white/5 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`p-1.5 rounded-xl text-xs ${
                        isSongSearch ? 'bg-purple-500/20 text-purple-300' :
                        isPlaylist ? 'bg-blue-500/20 text-blue-300' :
                        isRandom ? 'bg-amber-500/20 text-amber-300' :
                        'bg-emerald-500/20 text-emerald-300'
                      }`}>
                        {isSongSearch ? <Search className="w-3.5 h-3.5" /> :
                         isPlaylist ? <ListMusic className="w-3.5 h-3.5" /> :
                         isRandom ? <Sparkles className="w-3.5 h-3.5" /> :
                         <Sliders className="w-3.5 h-3.5" />}
                      </span>
                      <h5 className="font-bold text-sm text-white">{rule.name}</h5>
                    </div>

                    <div className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                      <span>动作类型:</span>
                      <span className="font-semibold text-zinc-200">
                        {isSongSearch ? '模糊搜歌并起播' :
                         isPlaylist ? `投播歌单 (${rule.targetPlaylistId === 'favorites' ? '我喜欢的音乐' : (rule.targetPlaylistId === 'default' ? '默认歌单' : rule.targetPlaylistId)})` :
                         isRandom ? '曲库全随机起播' :
                         `播控指令 (${controlLabels[rule.controlAction || 'next'] || rule.controlAction})`}
                      </span>
                    </div>
                  </div>

                  {/* Actions & Switch */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleToggleRule(rule.id)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition ${
                        rule.enabled
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-zinc-800 text-zinc-400 border-white/5'
                      }`}
                    >
                      {rule.enabled ? '已启用' : '已停用'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEditRule(rule)}
                      className="p-1.5 rounded-xl hover:bg-white/10 text-zinc-400 hover:text-white transition"
                      title="编辑规则"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteRule(rule.id)}
                      className="p-1.5 rounded-xl hover:bg-rose-500/20 text-zinc-500 hover:text-rose-400 transition"
                      title="删除规则"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Trigger Phrases Chips */}
                <div className="mt-4 pt-3 border-t border-white/5 space-y-2">
                  <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">
                    触发词库 ({rule.triggerPhrases.length} 个):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {rule.triggerPhrases.map((phrase, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-xl bg-zinc-950/80 border border-white/10 text-xs font-mono text-[#FF6700]"
                      >
                        “{phrase}”
                      </span>
                    ))}
                  </div>
                  {rule.ttsFeedback && (
                    <div className="text-[11px] text-zinc-400 flex items-center gap-1.5 pt-1">
                      <Volume2 className="w-3 h-3 text-amber-400 shrink-0" />
                      <span className="truncate">应答: {rule.ttsFeedback}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---------------- 4. Real-time Dialogue Logs Stream ---------------- */}
      <div className="p-6 rounded-3xl bg-zinc-900/40 border border-white/10 backdrop-blur-md space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Terminal className="w-5 h-5 text-purple-400" />
            <h4 className="text-base font-bold text-white">
              小爱音箱语音对话捕获日志 ({logs.length})
            </h4>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePollNow}
              disabled={isPollingNow}
              className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white transition text-xs flex items-center gap-1.5"
              title="立即向小爱云端发起同步"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#FF6700] ${isPollingNow ? 'animate-spin' : ''}`} />
              <span>{isPollingNow ? '同步中...' : '同步音箱'}</span>
            </button>
            <button
              type="button"
              onClick={fetchVoiceStatus}
              className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition text-xs flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>刷新</span>
            </button>
            <button
              type="button"
              onClick={handleClearLogs}
              className="p-2 rounded-xl bg-zinc-800/80 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-300 transition text-xs flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>清空</span>
            </button>
          </div>
        </div>

        <div className="max-h-[380px] overflow-y-auto space-y-2.5 pr-1">
          {logs.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 text-xs space-y-2">
              <Mic className="w-8 h-8 text-zinc-600 mx-auto" />
              <p>暂无捕获到的语音对话记录</p>
              <p className="text-[11px] text-zinc-600 max-w-md mx-auto">
                您可对真实小爱音箱说出：“小爱同学，来首稻香”，或点击上方的快捷测试按钮模拟对话。
              </p>
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="p-3.5 rounded-2xl bg-zinc-950/70 border border-white/5 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 hover:border-white/10 transition"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white font-mono text-sm">
                      “{log.queryText}”
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      log.status === 'matched'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : log.status === 'error'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : 'bg-zinc-800 text-zinc-400'
                    }`}>
                      {log.status === 'matched' ? '已命中口令' : log.status === 'error' ? '执行失败' : '未命中规则'}
                    </span>

                    {/* Source Tag */}
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-white/5 text-zinc-400 border border-white/5">
                      {log.source === 'speaker_mina_poll' ? '云端轮询捕获' :
                       log.source === 'speaker_mina_ws' ? '长连实时推送' : '模拟测试'}
                    </span>
                  </div>

                  <div className="text-zinc-400 text-[11px] flex flex-wrap items-center gap-x-3">
                    <span>{log.actionSummary || '无动作'}</span>
                    {log.matchedRuleName && (
                      <span className="text-purple-300 font-medium">规则: {log.matchedRuleName}</span>
                    )}
                    {log.deviceName && (
                      <span className="text-zinc-500">设备: {log.deviceName}</span>
                    )}
                  </div>
                </div>

                <div className="text-right text-[10px] font-mono text-zinc-500 shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ---------------- 5. Edit / Add Rule Modal ---------------- */}
      {isRuleModalOpen && editingRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-lg bg-zinc-900 border border-white/10 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-[#FF6700]" />
                {editingRule.id.startsWith('rule_') ? '配置语音口令规则' : '编辑语音口令规则'}
              </h3>
              <button
                type="button"
                onClick={() => setIsRuleModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-white/10 text-zinc-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Rule Name */}
              <div className="space-y-1.5">
                <label className="text-zinc-400 font-medium block">规则名称</label>
                <input
                  type="text"
                  value={editingRule.name}
                  onChange={(e) => setEditingRule({ ...editingRule, name: e.target.value })}
                  placeholder="例如：智能搜歌点播"
                  className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-[#FF6700]"
                />
              </div>

              {/* Action Type */}
              <div className="space-y-1.5">
                <label className="text-zinc-400 font-medium block">命中后执行动作</label>
                <select
                  value={editingRule.actionType}
                  onChange={(e: any) => setEditingRule({ ...editingRule, actionType: e.target.value })}
                  className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-[#FF6700] cursor-pointer"
                >
                  <option value="play_song_search">智能搜歌点歌 (自动提取关键词模糊匹配本地歌曲)</option>
                  <option value="play_random_all">随机播放全部音乐 (曲库全随机起播)</option>
                  <option value="play_playlist">投播指定歌单 (投播整个歌单到音箱)</option>
                  <option value="control_command">执行播控动作 (下一首/上一首/暂停/音量调节等)</option>
                </select>
              </div>

              {/* Target Playlist (if play_playlist) */}
              {editingRule.actionType === 'play_playlist' && (
                <div className="space-y-1.5">
                  <label className="text-zinc-400 font-medium block">目标投播歌单</label>
                  <select
                    value={editingRule.targetPlaylistId || 'default'}
                    onChange={(e) => setEditingRule({ ...editingRule, targetPlaylistId: e.target.value })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-[#FF6700] cursor-pointer"
                  >
                    <option value="default">默认主歌单</option>
                    <option value="favorites">我喜欢的音乐 (收藏夹)</option>
                    {playlists.map(pl => (
                      <option key={pl.id} value={pl.id}>{pl.name} ({pl.songIds.length} 首)</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Control Action (if control_command) */}
              {editingRule.actionType === 'control_command' && (
                <div className="space-y-1.5">
                  <label className="text-zinc-400 font-medium block">控制动作</label>
                  <select
                    value={editingRule.controlAction || 'next'}
                    onChange={(e: any) => setEditingRule({ ...editingRule, controlAction: e.target.value })}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-[#FF6700] cursor-pointer"
                  >
                    <option value="next">下一首 (Next)</option>
                    <option value="prev">上一首 (Prev)</option>
                    <option value="pause">暂停/停止播放 (Pause)</option>
                    <option value="resume">继续播放/恢复 (Resume)</option>
                    <option value="volume_up">调大音量 +10% (Volume Up)</option>
                    <option value="volume_down">调小音量 -10% (Volume Down)</option>
                  </select>
                </div>
              )}

              {/* Trigger Phrases Textarea */}
              <div className="space-y-1.5">
                <label className="text-zinc-400 font-medium block">
                  触发口令词库（多个词用逗号或换行分隔）
                </label>
                <textarea
                  rows={3}
                  value={rulePhrasesText}
                  onChange={(e) => setRulePhrasesText(e.target.value)}
                  placeholder="例如：点歌, 来一首, 想听, 播放"
                  className="w-full bg-zinc-950 border border-white/10 rounded-xl p-3 text-white focus:outline-none focus:border-[#FF6700] font-mono text-xs"
                />
              </div>

              {/* TTS Feedback template */}
              <div className="space-y-1.5">
                <label className="text-zinc-400 font-medium block">
                  命中后音箱语音应答（留空则不朗读）
                </label>
                <input
                  type="text"
                  value={editingRule.ttsFeedback || ''}
                  onChange={(e) => setEditingRule({ ...editingRule, ttsFeedback: e.target.value })}
                  placeholder="好的，为您播放 {title}"
                  className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-[#FF6700]"
                />
                <span className="text-[11px] text-zinc-500 block">
                  支持占位符：<code className="text-[#FF6700] font-mono">&#123;title&#125;</code> (歌名), <code className="text-[#FF6700] font-mono">&#123;playlist&#125;</code> (歌单名)
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsRuleModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveRule}
                className="px-5 py-2 rounded-xl bg-[#FF6700] hover:bg-[#e55c00] text-white font-bold transition flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>保存规则</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
