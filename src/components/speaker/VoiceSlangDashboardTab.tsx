import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  BarChart2,
  AlertCircle,
  CheckCircle2,
  Plus,
  Trash2,
  Search,
  RefreshCw,
  Zap,
  BookOpen,
  Volume2,
  X,
  HelpCircle,
  Layers,
  ArrowRight,
  TrendingDown,
  Terminal,
  Activity,
  Edit3
} from 'lucide-react';
import { XiaomiDevice, Song, Playlist } from '../../types';
import { apiFetch } from '../../utils/api';
import { useTheme } from '../../context/ThemeContext';

export interface VoiceSlangRule {
  id: string;
  slangTerm: string;
  targetType: 'song' | 'artist' | 'playlist' | 'command';
  targetValue: string;
  notes?: string;
  hitCount: number;
  createdAt: number;
}

export interface VoiceDialogueLog {
  id: string;
  timestamp: number;
  queryText: string;
  matchedRuleId?: string;
  matchedRuleName?: string;
  actionSummary?: string;
  status: 'matched' | 'ignored' | 'error';
  source?: string;
  deviceId?: string;
  deviceName?: string;
  slangApplied?: boolean;
  slangTerm?: string;
  missedReason?: string;
}

interface VoiceSlangDashboardTabProps {
  devices: XiaomiDevice[];
  activeDevice: XiaomiDevice | undefined;
  playlists?: Playlist[];
}

export const VoiceSlangDashboardTab: React.FC<VoiceSlangDashboardTabProps> = ({
  devices,
  activeDevice,
  playlists = []
}) => {
  const { themeConfig, isLight } = useTheme();

  // Active view mode: 'analytics' | 'dictionary' | 'test'
  const [activeView, setActiveView] = useState<'analytics' | 'dictionary' | 'test'>('analytics');

  // Slang Dictionary & Analytics State
  const [slangRules, setSlangRules] = useState<VoiceSlangRule[]>([]);
  const [analytics, setAnalytics] = useState<{
    totalLogs: number;
    matchedCount: number;
    missedCount: number;
    hitRatePercent: number;
    topMissed: Array<{ term: string; count: number; lastTime: number; devices: string[]; reason: string }>;
    reasonBreakdown: {
      homophone_mismatch: number;
      unknown_song: number;
      slang_hotword: number;
      no_rule_match: number;
      low_confidence: number;
    };
    recentMissedLogs: VoiceDialogueLog[];
  } | null>(null);

  const [isLoadingData, setIsLoadingData] = useState(true);
  const [searchFilter, setSearchFilter] = useState('');

  // Add/Edit Slang Modal
  const [isSlangModalOpen, setIsSlangModalOpen] = useState(false);
  const [editingSlangId, setEditingSlangId] = useState<string | null>(null);
  const [slangTermInput, setSlangTermInput] = useState('');
  const [targetTypeInput, setTargetTypeInput] = useState<'song' | 'artist' | 'playlist' | 'command'>('artist');
  const [targetValueInput, setTargetValueInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [isSavingSlang, setIsSavingSlang] = useState(false);

  // Live Test Sandbox State
  const [testQueryText, setTestQueryText] = useState('');
  const [isTestingQuery, setIsTestingQuery] = useState(false);
  const [testResult, setTestResult] = useState<{ matched: boolean; summary: string } | null>(null);

  // Status message
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchData = async () => {
    setIsLoadingData(true);
    try {
      const [slangRes, analyticsRes] = await Promise.all([
        apiFetch('/api/miot/voice/slang'),
        apiFetch('/api/miot/voice/missed-analytics')
      ]);

      if (slangRes.ok) {
        const slangData = await slangRes.json();
        if (slangData.success) {
          setSlangRules(slangData.slangRules || []);
        }
      }

      if (analyticsRes.ok) {
        const analyticsData = await analyticsRes.json();
        if (analyticsData.success) {
          setAnalytics(analyticsData.analytics);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch slang data:', err);
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSaveSlangRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slangTermInput || !targetValueInput) return;
    setIsSavingSlang(true);
    try {
      const res = await apiFetch('/api/miot/voice/slang', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingSlangId || undefined,
          slangTerm: slangTermInput,
          targetType: targetTypeInput,
          targetValue: targetValueInput,
          notes: notesInput
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setIsSlangModalOpen(false);
          setSlangTermInput('');
          setTargetValueInput('');
          setNotesInput('');
          setEditingSlangId(null);
          setStatusMsg({ text: data.message || '语音黑话词条已成功保存', type: 'success' });
          fetchData();
        }
      }
    } catch (err: any) {
      setStatusMsg({ text: `保存失败: ${err.message}`, type: 'error' });
    } finally {
      setIsSavingSlang(false);
    }
  };

  const handleDeleteSlangRule = async (id: string, term: string) => {
    if (!window.confirm(`确定要删除黑话词条「${term}」吗？`)) return;
    try {
      const res = await apiFetch(`/api/miot/voice/slang/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setStatusMsg({ text: `已删除黑话词条「${term}」`, type: 'success' });
        fetchData();
      }
    } catch (err: any) {
      setStatusMsg({ text: `删除失败: ${err.message}`, type: 'error' });
    }
  };

  const handleQuickConvertMissed = (term: string) => {
    // Pre-fill modal
    setSlangTermInput(term);
    setTargetTypeInput('artist');
    setTargetValueInput('');
    setNotesInput('从语音未命中看板一键转存');
    setEditingSlangId(null);
    setIsSlangModalOpen(true);
  };

  const handleRunLiveTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testQueryText.trim()) return;
    setIsTestingQuery(true);
    setTestResult(null);
    try {
      const res = await apiFetch('/api/miot/voice/test-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: testQueryText,
          did: activeDevice?.did
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.result) {
          setTestResult(data.result);
        }
      }
    } catch (err: any) {
      setTestResult({ matched: false, summary: `测试模拟异常: ${err.message}` });
    } finally {
      setIsTestingQuery(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      
      {/* Toast alert */}
      {statusMsg && (
        <div className={`p-3.5 rounded-xl flex items-center justify-between shadow-lg text-xs font-medium border ${
          statusMsg.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
        }`}>
          <div className="flex items-center gap-2">
            {statusMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
            <span>{statusMsg.text}</span>
          </div>
          <button onClick={() => setStatusMsg(null)} className="p-1 hover:bg-white/10 rounded cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Header & Sub-tab Switcher */}
      <div className={`p-5 rounded-2xl border shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition ${
        isLight ? 'bg-white border-zinc-200/80 text-zinc-900 shadow-sm' : 'bg-zinc-900/90 border-white/10 text-white'
      }`}>
        <div>
          <h2 className={`text-base font-bold flex items-center gap-2 ${isLight ? 'text-zinc-900' : 'text-white'}`}>
            <Zap className="w-4 h-4 text-amber-500" />
            <span>语音黑话与未命中自愈看板</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-mono">
              Slang Engine
            </span>
          </h2>
          <p className={`text-xs mt-0.5 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
            智能学习口音错别字、歌手别称与常用黑话，将识别未命中率转化为智能语意映射
          </p>
        </div>

        <div className={`flex items-center gap-1.5 p-1 rounded-xl border ${
          isLight ? 'bg-zinc-100 border-zinc-200' : 'bg-zinc-950 border-white/10'
        }`}>
          <button
            onClick={() => setActiveView('analytics')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeView === 'analytics'
                ? 'bg-amber-500 text-zinc-950 shadow-sm font-bold'
                : isLight ? 'text-zinc-600 hover:text-zinc-900' : 'text-zinc-400 hover:text-white'
            }`}
          >
            未命中看板
          </button>
          <button
            onClick={() => setActiveView('dictionary')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeView === 'dictionary'
                ? 'bg-amber-500 text-zinc-950 shadow-sm font-bold'
                : isLight ? 'text-zinc-600 hover:text-zinc-900' : 'text-zinc-400 hover:text-white'
            }`}
          >
            黑话词典库 ({slangRules.length})
          </button>
          <button
            onClick={() => setActiveView('test')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeView === 'test'
                ? 'bg-amber-500 text-zinc-950 shadow-sm font-bold'
                : isLight ? 'text-zinc-600 hover:text-zinc-900' : 'text-zinc-400 hover:text-white'
            }`}
          >
            黑话解析测试器
          </button>
        </div>
      </div>

      {/* --- VIEW 1: MISSED VOICE ANALYTICS & FEED --- */}
      {activeView === 'analytics' && (
        <div className="space-y-6">
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className={`p-4 rounded-xl border space-y-1 ${
              isLight ? 'bg-white border-zinc-200/80 shadow-sm' : 'bg-zinc-900/80 border-white/5'
            }`}>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>语音指令命中率</span>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-black text-emerald-500">{analytics?.hitRatePercent ?? 100}%</span>
                <span className="text-xs text-zinc-500 font-mono">共 {analytics?.totalLogs ?? 0} 条</span>
              </div>
            </div>

            <div className={`p-4 rounded-xl border space-y-1 ${
              isLight ? 'bg-white border-zinc-200/80 shadow-sm' : 'bg-zinc-900/80 border-white/5'
            }`}>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>未命中捕获频次</span>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-black text-rose-500">{analytics?.missedCount ?? 0}</span>
                <span className="text-xs text-rose-500/80 font-medium">需转存黑话</span>
              </div>
            </div>

            <div className={`p-4 rounded-xl border space-y-1 ${
              isLight ? 'bg-white border-zinc-200/80 shadow-sm' : 'bg-zinc-900/80 border-white/5'
            }`}>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>活跃黑话词条库</span>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-black text-amber-500">{slangRules.length}</span>
                <span className="text-xs text-amber-600 font-medium">词词对应</span>
              </div>
            </div>

            <div className={`p-4 rounded-xl border space-y-1 ${
              isLight ? 'bg-white border-zinc-200/80 shadow-sm' : 'bg-zinc-900/80 border-white/5'
            }`}>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>同音异形错字占比</span>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-black text-sky-500">
                  {analytics?.reasonBreakdown?.homophone_mismatch ?? 0}
                </span>
                <span className="text-xs text-zinc-500 font-mono">智能自愈</span>
              </div>
            </div>
          </div>

          {/* Top Missed Hotwords Table & Missed Logs Feed */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Top Missed Hotwords Table */}
            <div className={`p-5 rounded-2xl border space-y-4 ${
              isLight ? 'bg-white border-zinc-200/80 shadow-sm' : 'bg-zinc-900/80 border-white/10'
            }`}>
              <div className="flex items-center justify-between">
                <h3 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${
                  isLight ? 'text-zinc-900' : 'text-white'
                }`}>
                  <TrendingDown className="w-4 h-4 text-rose-500" />
                  <span>高频未命中黑话热词榜</span>
                </h3>
                <button
                  onClick={fetchData}
                  className={`p-1 rounded-lg transition cursor-pointer ${
                    isLight ? 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900' : 'text-zinc-400 hover:bg-white/10 hover:text-white'
                  }`}
                  title="刷新数据"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingData ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {!analytics || analytics.topMissed.length === 0 ? (
                <div className={`py-12 text-center text-xs border border-dashed rounded-xl ${
                  isLight ? 'bg-zinc-50 border-zinc-200 text-zinc-500' : 'border-white/5 text-zinc-500'
                }`}>
                  暂未捕获高频未命中词条，系统完美运行中
                </div>
              ) : (
                <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1">
                  {analytics.topMissed.map((item, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl border transition flex items-center justify-between gap-3 ${
                        isLight
                          ? 'bg-zinc-50 hover:bg-zinc-100 border-zinc-200/80'
                          : 'bg-zinc-950/80 hover:bg-zinc-950 border-white/5'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`w-4 h-4 rounded text-[10px] font-bold flex items-center justify-center shrink-0 ${
                            idx === 0 ? 'bg-amber-500 text-zinc-950' : idx === 1 ? 'bg-zinc-300 text-zinc-950' : idx === 2 ? 'bg-amber-700 text-white' : 'bg-zinc-800 text-zinc-400'
                          }`}>
                            {idx + 1}
                          </span>
                          <span className={`text-xs font-bold truncate ${isLight ? 'text-zinc-900' : 'text-white'}`}>“{item.term}”</span>
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-1 flex items-center gap-2">
                          <span>未命中 {item.count} 次</span>
                          <span>·</span>
                          <span>{item.devices.join(', ') || '小爱音箱'}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleQuickConvertMissed(item.term)}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition text-[11px] font-semibold cursor-pointer shrink-0 ${
                          isLight
                            ? 'bg-amber-500 text-zinc-950 shadow-sm hover:bg-amber-400'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20'
                        }`}
                      >
                        <Zap className="w-3 h-3" />
                        <span>存为黑话</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Missed Logs Feed */}
            <div className={`lg:col-span-2 p-5 rounded-2xl border space-y-4 ${
              isLight ? 'bg-white border-zinc-200/80 shadow-sm' : 'bg-zinc-900/80 border-white/10'
            }`}>
              <div className="flex items-center justify-between">
                <h3 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${
                  isLight ? 'text-zinc-900' : 'text-white'
                }`}>
                  <Terminal className="w-4 h-4 text-amber-500" />
                  <span>未命中语音点歌流水日志</span>
                </h3>
                <span className="text-[10px] text-zinc-500">实时捕捉未拦截对话</span>
              </div>

              {!analytics || analytics.recentMissedLogs.length === 0 ? (
                <div className={`py-20 text-center text-xs border border-dashed rounded-xl ${
                  isLight ? 'bg-zinc-50 border-zinc-200 text-zinc-500' : 'border-white/5 text-zinc-500'
                }`}>
                  暂无未命中的语音对话日志
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[450px] overflow-y-auto pr-1">
                  {analytics.recentMissedLogs.map(log => (
                    <div
                      key={log.id}
                      className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 transition ${
                        isLight
                          ? 'bg-zinc-50 hover:bg-amber-50/30 border-zinc-200/80'
                          : 'bg-zinc-950/80 border-white/5 hover:border-white/20'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold ${isLight ? 'text-zinc-900' : 'text-zinc-100'}`}>“{log.queryText}”</span>
                          {log.slangApplied && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 font-mono">
                              已应答黑话: {log.slangTerm}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-1 flex items-center gap-3">
                          <span>{new Date(log.timestamp).toLocaleTimeString('zh-CN')}</span>
                          <span>设备: {log.deviceName || '小爱音箱'}</span>
                          <span className={isLight ? 'text-zinc-600' : 'text-zinc-400'}>原因: {log.actionSummary || '未匹配规则'}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleQuickConvertMissed(log.queryText.replace(/^(小爱同学|小爱|给我|帮我|我想听|听|放|播)/i, '').trim())}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition text-xs font-semibold cursor-pointer shrink-0 ${
                          isLight
                            ? 'bg-amber-500 text-zinc-950 shadow-sm hover:bg-amber-400'
                            : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                        }`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>快捷转存黑话</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* --- VIEW 2: SLANG DICTIONARY MANAGER --- */}
      {activeView === 'dictionary' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-amber-400" />
              <span>语音黑话词典词条列表</span>
            </h3>

            <button
              onClick={() => {
                setEditingSlangId(null);
                setSlangTermInput('');
                setTargetTypeInput('artist');
                setTargetValueInput('');
                setNotesInput('');
                setIsSlangModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500 text-zinc-950 font-bold text-xs hover:bg-amber-400 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>新增黑话词条</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {slangRules.map(rule => (
              <div
                key={rule.id}
                className="p-4 rounded-xl bg-zinc-900/80 border border-white/10 hover:border-amber-500/30 transition-all space-y-3"
              >
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5" />
                    “{rule.slangTerm}”
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingSlangId(rule.id);
                        setSlangTermInput(rule.slangTerm);
                        setTargetTypeInput(rule.targetType);
                        setTargetValueInput(rule.targetValue);
                        setNotesInput(rule.notes || '');
                        setIsSlangModalOpen(true);
                      }}
                      className="p-1 text-zinc-400 hover:text-white transition cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteSlangRule(rule.id, rule.slangTerm)}
                      className="p-1 text-zinc-400 hover:text-rose-400 transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <ArrowRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  <span className="text-zinc-300 font-medium">
                    定位{rule.targetType === 'artist' ? '歌手' : rule.targetType === 'song' ? '曲目' : '歌单'}:
                  </span>
                  <span className="text-white font-bold bg-zinc-950 px-2 py-0.5 rounded border border-white/5">
                    {rule.targetValue}
                  </span>
                </div>

                <div className="text-[11px] text-zinc-400 pt-1 flex items-center justify-between">
                  <span>{rule.notes || '通用黑话映射'}</span>
                  <span className="text-zinc-500 font-mono text-[10px]">被调用 {rule.hitCount || 0} 次</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- VIEW 3: LIVE SLANG RESOLUTION SANDBOX --- */}
      {activeView === 'test' && (
        <div className="p-6 rounded-2xl bg-zinc-900/90 border border-white/10 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">语音黑话解析模拟测试沙箱</h3>
              <p className="text-xs text-zinc-400">测试输入带有口音错别字或黑话的语音，实时查看黑话引擎与音箱曲库的匹配过程</p>
            </div>
          </div>

          <form onSubmit={handleRunLiveTest} className="space-y-4">
            <div className="flex gap-3">
              <input
                type="text"
                required
                placeholder="例如: “我想听周节轮的页曲” 或 “放嗨歌”"
                value={testQueryText}
                onChange={e => setTestQueryText(e.target.value)}
                className="flex-1 bg-zinc-950 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500/50"
              />
              <button
                type="submit"
                disabled={isTestingQuery}
                className="px-6 py-2.5 rounded-xl bg-amber-500 text-zinc-950 font-bold text-xs hover:bg-amber-400 transition cursor-pointer disabled:opacity-50 shrink-0 flex items-center gap-2"
              >
                {isTestingQuery ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>解析中...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    <span>测试语音解析</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {testResult && (
            <div className={`p-4 rounded-xl border animate-fadeIn ${
              testResult.matched ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
            }`}>
              <div className="flex items-center gap-2 font-bold text-sm mb-1">
                {testResult.matched ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <HelpCircle className="w-4 h-4 text-amber-400" />}
                <span>{testResult.matched ? '黑话与指令匹配成功' : '尚未命中硬规则'}</span>
              </div>
              <p className="text-xs text-zinc-200 mt-1 font-mono">{testResult.summary}</p>
            </div>
          )}
        </div>
      )}

      {/* --- ADD / EDIT SLANG MODAL --- */}
      {isSlangModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-md p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-400" />
                <span>{editingSlangId ? '编辑语音黑话词条' : '新增语音黑话词条'}</span>
              </h3>
              <button
                onClick={() => setIsSlangModalOpen(false)}
                className="p-1 hover:bg-white/10 rounded-lg text-zinc-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSlangRule} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">口音/错字/黑话词汇 (Slang Term) *</label>
                <input
                  type="text"
                  required
                  placeholder="例如: 周节轮、周董、嗨歌"
                  value={slangTermInput}
                  onChange={e => setSlangTermInput(e.target.value)}
                  className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">定位目标类型</label>
                <select
                  value={targetTypeInput}
                  onChange={e => setTargetTypeInput(e.target.value as any)}
                  className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50"
                >
                  <option value="artist">歌手名称 (Artist)</option>
                  <option value="song">曲目名称 (Song Title)</option>
                  <option value="playlist">歌单目标 (Playlist)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">纠正目标真名/ID *</label>
                <input
                  type="text"
                  required
                  placeholder="例如: 周杰伦 (正确歌手真名) 或 对应歌单ID"
                  value={targetValueInput}
                  onChange={e => setTargetValueInput(e.target.value)}
                  className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">备注说明</label>
                <input
                  type="text"
                  placeholder="例如: 语音同音错字修正"
                  value={notesInput}
                  onChange={e => setNotesInput(e.target.value)}
                  className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSlangModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-zinc-400 hover:text-white cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSavingSlang}
                  className="px-5 py-2 rounded-xl bg-amber-500 text-zinc-950 font-bold text-xs hover:bg-amber-400 transition cursor-pointer disabled:opacity-50"
                >
                  {isSavingSlang ? '保存中...' : '保存词条'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
