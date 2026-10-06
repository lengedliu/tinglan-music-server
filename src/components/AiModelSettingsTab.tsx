import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Zap,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Save,
  Globe,
  Key,
  Layers,
  Sparkles,
  Bot,
  ExternalLink,
  ShieldCheck,
  Eye,
  EyeOff,
  Sliders,
  Radio,
  FileText,
  Music,
  Play,
  Send,
  Volume2,
  Database,
  Trash2,
  Link2,
  Code,
  ChevronDown,
  ChevronUp,
  Download
} from 'lucide-react';
import { apiFetch } from '../utils/api';
import { useTheme } from '../context/ThemeContext';

export type AiProviderId = 'deepseek' | 'qwen' | 'zhipu' | 'gemini' | 'custom';

export interface AiProviderConfig {
  id: AiProviderId;
  name: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
  defaultModel: string;
  defaultBaseUrl: string;
  description: string;
  badge: string;
  isConfigured?: boolean;
  isFromEnv?: boolean;
}

export interface AiServiceConfig {
  enabled: boolean;
  activeProvider: AiProviderId;
  providers: Record<AiProviderId, AiProviderConfig>;
  temperature: number;
  timeoutMs: number;
  enableSemanticVoiceSearch: boolean;
  enableLogDiagnostics: boolean;
  enableMusicInsight: boolean;
  aiSkillCallbackUrl?: string;
  aiSkillAuthToken?: string;
}

interface AiModelSettingsTabProps {
  onShowToast: (title: string, message: string, type?: 'success' | 'error' | 'info') => void;
}

const PROVIDER_METAS: Record<AiProviderId, {
  icon: string;
  accentColor: string;
  tag: string;
  officialDocUrl: string;
}> = {
  deepseek: {
    icon: '🐋',
    accentColor: '#0ea5e9',
    tag: '中文推理标杆 · 超低资费',
    officialDocUrl: 'https://platform.deepseek.com/'
  },
  qwen: {
    icon: '🔮',
    accentColor: '#f97316',
    tag: '阿里通义千问 · 音乐生活百事通',
    officialDocUrl: 'https://dashscope.console.aliyun.com/'
  },
  zhipu: {
    icon: '⚡',
    accentColor: '#a855f7',
    tag: '智谱 GLM-4 · 响应敏捷高速',
    officialDocUrl: 'https://open.bigmodel.cn/'
  },
  gemini: {
    icon: '✨',
    accentColor: '#3b82f6',
    tag: 'Google 原生 SDK · 毫秒级极速响应',
    officialDocUrl: 'https://aistudio.google.com/'
  },
  custom: {
    icon: '🏠',
    accentColor: '#10b981',
    tag: '家庭 NAS 私有化 · Ollama / vLLM / LM Studio',
    officialDocUrl: 'https://ollama.com/'
  }
};

export const AiModelSettingsTab: React.FC<AiModelSettingsTabProps> = ({ onShowToast }) => {
  const { isLight } = useTheme();
  const [config, setConfig] = useState<AiServiceConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState<AiProviderId>('deepseek');

  // Input states for active editing provider
  const [editBaseUrl, setEditBaseUrl] = useState('');
  const [editModel, setEditModel] = useState('');
  const [editApiKey, setEditApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

  // Fetch available models state
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchedModelsMap, setFetchedModelsMap] = useState<Record<string, string[]>>({});

  const handleFetchModels = async () => {
    if (!selectedProvider) return;
    setFetchingModels(true);
    try {
      const res = await apiFetch('/api/ai/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: selectedProviderId,
          baseUrl: editBaseUrl.trim(),
          apiKey: editApiKey.trim()
        })
      });

      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.models) && data.models.length > 0) {
        setFetchedModelsMap(prev => ({
          ...prev,
          [selectedProviderId]: data.models
        }));
        // Auto-select first model if current editModel is empty or not in fetched list
        if (!editModel || !data.models.includes(editModel)) {
          setEditModel(data.models[0]);
        }
        onShowToast('模型自动拉取成功', `从 ${selectedProvider.name} API 成功获取到 ${data.models.length} 个可用模型标识`, 'success');
      } else {
        onShowToast('获取模型失败', data.error || '未能读取到模型列表，请确认 API URL 与 Key 是否填写无误', 'error');
      }
    } catch (err: any) {
      onShowToast('拉取异常', err.message || '网络通讯超时', 'error');
    } finally {
      setFetchingModels(false);
    }
  };

  // Test connection state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    latencyMs: number;
    reply?: string;
    modelUsed?: string;
    error?: string;
  } | null>(null);

  // Voice semantic playground state (Two-stage + Mood Queue verification)
  const [testVoiceQuery, setTestVoiceQuery] = useState('放几首适合下雨天看书的歌');
  const [voiceParsing, setVoiceParsing] = useState(false);
  const [voiceParseResult, setVoiceParseResult] = useState<any>(null);

  const handleRunVoiceTest = async (overrideQuery?: string) => {
    const q = overrideQuery || testVoiceQuery;
    if (!q.trim()) return;
    setVoiceParsing(true);
    setVoiceParseResult(null);
    try {
      const res = await apiFetch('/api/ai/voice-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success && data.result) {
        setVoiceParseResult(data.result);
        fetchCacheStats();
        if (data.result.matched) {
          onShowToast('命中成功', data.result.fromCache ? '⚡ 命中语义缓存 (0ms 极速响应)' : (data.result.ttsResponse || '成功生成心境电台与队列'), 'success');
        } else {
          onShowToast('未命中', data.result.reason || '曲库未匹配到相关曲目', 'info');
        }
      } else {
        onShowToast('测试失败', data.error || '解析失败，请检查当前模型配置', 'error');
      }
    } catch (e: any) {
      onShowToast('请求异常', e.message || '网络通讯超时', 'error');
    } finally {
      setVoiceParsing(false);
    }
  };

  // Item 3: Semantic Cache stats state
  const [cacheStats, setCacheStats] = useState<{
    totalEntries: number;
    totalHits: number;
    estimatedTokensSaved: number;
    topQueries: Array<{ query: string; hits: number; lastHit: number }>;
  } | null>(null);
  const [clearingCache, setClearingCache] = useState(false);

  // AI Skill Webhook / Callback configuration state
  const [skillCallbackUrl, setSkillCallbackUrl] = useState('');
  const [skillAuthToken, setSkillAuthToken] = useState('');
  const [savingSkillConfig, setSavingSkillConfig] = useState(false);
  const [skillTestLoading, setSkillTestLoading] = useState(false);
  const [skillTestResult, setSkillTestResult] = useState<{
    success: boolean;
    status?: number;
    latencyMs?: number;
    responseSample?: string;
    error?: string;
    payloadSent?: any;
  } | null>(null);
  const [showPayloadSchema, setShowPayloadSchema] = useState(false);
  const [resolvedServerHost, setResolvedServerHost] = useState('http://localhost:3000');
  const [lanIps, setLanIps] = useState<string[]>([]);

  const fetchCacheStats = async () => {
    try {
      const res = await apiFetch('/api/ai/cache-stats');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.stats) {
          setCacheStats(data.stats);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch cache stats:', e);
    }
  };

  const handleClearCache = async () => {
    setClearingCache(true);
    try {
      const res = await apiFetch('/api/ai/clear-cache', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setCacheStats(data.stats);
        onShowToast('缓存已清空', '语义缓存池已全部重置', 'success');
      }
    } catch (e: any) {
      onShowToast('清空失败', e.message, 'error');
    } finally {
      setClearingCache(false);
    }
  };

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/ai/config');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.config) {
          setConfig(data.config);
          setSelectedProviderId(data.config.activeProvider || 'deepseek');

          const effectiveHost = (data.resolvedServerHost && !data.resolvedServerHost.includes('localhost') && !data.resolvedServerHost.includes('127.0.0.1'))
            ? data.resolvedServerHost
            : (typeof window !== 'undefined' && !window.location.origin.includes('localhost') ? window.location.origin : (data.resolvedServerHost || 'http://localhost:3000'));

          setResolvedServerHost(effectiveHost);
          if (data.lanIps && Array.isArray(data.lanIps)) setLanIps(data.lanIps);

          let initialCallbackUrl = data.config.aiSkillCallbackUrl || '';
          if (!initialCallbackUrl || initialCallbackUrl.includes('localhost:3000') || initialCallbackUrl.includes('127.0.0.1:3000')) {
            initialCallbackUrl = `${effectiveHost}/api/nas/sync`;
          } else if (initialCallbackUrl && (initialCallbackUrl.includes('localhost') || initialCallbackUrl.includes('127.0.0.1'))) {
            initialCallbackUrl = initialCallbackUrl.replace(/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i, effectiveHost);
          }
          setSkillCallbackUrl(initialCallbackUrl);
          setSkillAuthToken(data.config.aiSkillAuthToken || '');
          
          const cur = data.config.providers[data.config.activeProvider || 'deepseek'];
          if (cur) {
            setEditBaseUrl(cur.baseUrl || cur.defaultBaseUrl || '');
            setEditModel(cur.model || cur.defaultModel || '');
            setEditApiKey(cur.apiKey || '');
          }
        }
      }
    } catch (err: any) {
      console.error('Failed to load AI config:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
    fetchCacheStats();
  }, []);

  // When selected provider changes, sync form fields
  const handleSelectProvider = (pid: AiProviderId) => {
    setSelectedProviderId(pid);
    setTestResult(null);
    if (!config) return;
    const p = config.providers[pid];
    if (p) {
      setEditBaseUrl(p.baseUrl || p.defaultBaseUrl || '');
      setEditModel(p.model || p.defaultModel || '');
      setEditApiKey(p.apiKey || '');
      setShowApiKey(false);
    }
  };

  const handleSaveProviderConfig = async (activateImmediately = false) => {
    if (!config) return;
    setSaving(true);
    try {
      const updatedProviders = {
        ...config.providers,
        [selectedProviderId]: {
          ...config.providers[selectedProviderId],
          baseUrl: editBaseUrl.trim(),
          model: editModel.trim(),
          apiKey: editApiKey.trim()
        }
      };

      const payload: Partial<AiServiceConfig> = {
        providers: updatedProviders,
        activeProvider: activateImmediately ? selectedProviderId : config.activeProvider
      };

      const res = await apiFetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.config) {
          setConfig(data.config);
          onShowToast('保存成功', activateImmediately ? `已启用「${config.providers[selectedProviderId].name}」为当前活跃模型` : '模型配置已更新', 'success');
        }
      } else {
        const data = await res.json().catch(() => ({}));
        onShowToast('保存失败', data.error || '无法更新模型设置', 'error');
      }
    } catch (err: any) {
      onShowToast('保存异常', err.message || '网络通讯错误', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleGlobalEnable = async () => {
    if (!config) return;
    const nextState = !config.enabled;
    try {
      const res = await apiFetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextState })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setConfig(prev => prev ? { ...prev, enabled: nextState } : null);
          onShowToast('状态更新', nextState ? '已开启全局 AI 大模型中枢' : '已暂停 AI 功能服务', 'info');
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleFeature = async (featureKey: 'enableSemanticVoiceSearch' | 'enableLogDiagnostics' | 'enableMusicInsight') => {
    if (!config) return;
    const nextVal = !config[featureKey];
    try {
      const res = await apiFetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [featureKey]: nextVal })
      });
      if (res.ok) {
        setConfig(prev => prev ? { ...prev, [featureKey]: nextVal } : null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveSkillCallback = async () => {
    if (!config) return;
    setSavingSkillConfig(true);
    try {
      const res = await apiFetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiSkillCallbackUrl: skillCallbackUrl.trim(),
          aiSkillAuthToken: skillAuthToken.trim()
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.config) {
          setConfig(data.config);
          onShowToast('保存成功', 'AI Skill 外部回调地址与鉴权已更新', 'success');
        }
      } else {
        onShowToast('保存失败', '无法保存回调地址', 'error');
      }
    } catch (err: any) {
      onShowToast('保存异常', err.message, 'error');
    } finally {
      setSavingSkillConfig(false);
    }
  };

  const handleTestSkillCallback = async () => {
    if (!skillCallbackUrl.trim()) {
      onShowToast('请输入回调地址', '请先输入有效的 AI Skill 回调 URL (如 http://nas-ip:8080/skill/download)', 'error');
      return;
    }
    setSkillTestLoading(true);
    setSkillTestResult(null);
    try {
      const res = await apiFetch('/api/ai/test-skill-callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callbackUrl: skillCallbackUrl.trim(),
          authToken: skillAuthToken.trim()
        })
      });
      const data = await res.json();
      setSkillTestResult(data);
      if (data.success) {
        onShowToast('回调通信正常', `HTTP ${data.status} · 耗时 ${data.latencyMs}ms`, 'success');
      } else {
        onShowToast('回调测试失败', data.error || `HTTP ${data.status}`, 'error');
      }
    } catch (err: any) {
      setSkillTestResult({ success: false, error: err.message });
      onShowToast('网络异常', err.message, 'error');
    } finally {
      setSkillTestLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    // First auto-save any unsaved form inputs for this provider so test uses updated values
    if (config) {
      try {
        await apiFetch('/api/ai/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            providers: {
              ...config.providers,
              [selectedProviderId]: {
                ...config.providers[selectedProviderId],
                baseUrl: editBaseUrl.trim(),
                model: editModel.trim(),
                apiKey: editApiKey.trim()
              }
            }
          })
        });
      } catch {}
    }

    try {
      const res = await apiFetch('/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: selectedProviderId })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({
          success: true,
          latencyMs: data.latencyMs,
          reply: data.reply,
          modelUsed: data.modelUsed
        });
        onShowToast('连接成功', `${config?.providers[selectedProviderId].name} 连通正常 (延迟: ${data.latencyMs}ms)`, 'success');
      } else {
        setTestResult({
          success: false,
          latencyMs: 0,
          error: data.error || '连通性测试未通过，请检查 API Key 或端点地址'
        });
        onShowToast('测试失败', data.error || '连接大模型失败', 'error');
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        latencyMs: 0,
        error: err.message || '网络请求超时'
      });
      onShowToast('测试异常', err.message || '连接失败', 'error');
    } finally {
      setTesting(false);
    }
  };

  if (loading || !config) {
    return (
      <div className={`p-12 rounded-3xl border text-center flex flex-col items-center justify-center space-y-3 ${
        isLight ? 'bg-white border-zinc-200 text-zinc-500' : 'bg-zinc-900/40 border-white/5 text-zinc-400'
      }`}>
        <RefreshCw className="w-8 h-8 animate-spin text-purple-500" />
        <p className="text-sm font-medium">正在读取 AI 大模型中枢配置...</p>
      </div>
    );
  }

  const selectedProvider = config.providers[selectedProviderId];
  const activeProvider = config.providers[config.activeProvider];
  const meta = PROVIDER_METAS[selectedProviderId];
  const isSelectedActive = config.activeProvider === selectedProviderId;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* 1. Header Banner & Status Bar */}
      <div className={`p-6 sm:p-7 rounded-3xl border transition-all ${
        isLight
          ? 'bg-gradient-to-r from-purple-500/5 via-sky-500/5 to-white border-zinc-200 shadow-sm'
          : 'bg-gradient-to-r from-purple-500/10 via-sky-500/10 to-zinc-900/60 border-white/10'
      }`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-sky-500 flex items-center justify-center text-white shadow-lg shadow-purple-500/20 shrink-0">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className={`text-lg sm:text-xl font-bold ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                  AI 大模型中枢 (AI Intelligence Hub)
                </h3>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border flex items-center gap-1.5 ${
                  config.enabled
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                    : 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${config.enabled ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400'}`} />
                  <span>{config.enabled ? 'AI 引擎运行中' : 'AI 引擎已停用'}</span>
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-500/20">
                  当前生效: {activeProvider?.name || config.activeProvider}
                </span>
              </div>
              <p className={`text-xs mt-1 leading-relaxed ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                预设集成 <strong>DeepSeek</strong>、<strong>阿里通义千问 (Qwen)</strong>、<strong>智谱 GLM</strong> 与 <strong>Google Gemini</strong>，并支持无缝接入家庭 NAS 本地私有化模型 (Ollama / vLLM)。
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleToggleGlobalEnable}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-sm ${
                config.enabled
                  ? isLight
                    ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-300'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
              }`}
            >
              <Cpu className="w-4 h-4" />
              <span>{config.enabled ? '暂停 AI 服务' : '启用 AI 引擎'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Provider Navigation Cards (4 Defaults + Custom) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {(Object.keys(config.providers) as AiProviderId[]).map((pid) => {
          const p = config.providers[pid];
          const m = PROVIDER_METAS[pid];
          const isSelected = selectedProviderId === pid;
          const isActive = config.activeProvider === pid;

          return (
            <div
              key={pid}
              onClick={() => handleSelectProvider(pid)}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between group ${
                isSelected
                  ? isLight
                    ? 'bg-white border-purple-500/60 shadow-md ring-2 ring-purple-500/20'
                    : 'bg-zinc-900 border-purple-500/60 shadow-lg ring-2 ring-purple-500/20'
                  : isLight
                  ? 'bg-white/80 border-zinc-200 hover:border-zinc-300 hover:shadow-sm'
                  : 'bg-zinc-900/40 border-white/5 hover:border-white/10 hover:bg-zinc-900/60'
              }`}
            >
              {/* Active Badge */}
              {isActive && (
                <div className="absolute top-2 right-2">
                  <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500 text-zinc-950 flex items-center gap-1 shadow-sm">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>生效中</span>
                  </span>
                </div>
              )}

              <div>
                <div className="text-2xl mb-1">{m.icon}</div>
                <h4 className={`text-xs sm:text-sm font-bold truncate ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                  {p.name.split(' ')[0]}
                </h4>
                <p className={`text-[10px] font-mono mt-0.5 truncate ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  {p.model}
                </p>
              </div>

              <div className="mt-3 pt-2 border-t border-zinc-100 dark:border-white/5 flex items-center justify-between text-[10px]">
                <span className={`font-medium ${
                  p.isConfigured
                    ? 'text-emerald-500'
                    : isLight ? 'text-zinc-400' : 'text-zinc-500'
                }`}>
                  {p.isConfigured ? '● 已配置密钥' : (pid === 'custom' ? '○ 本地无需密钥' : '○ 待填密钥')}
                </span>
                <span className={`text-[9px] px-1.5 py-0.2 rounded border ${
                  isSelected
                    ? 'bg-purple-500/10 text-purple-600 dark:text-purple-300 border-purple-500/30'
                    : 'border-transparent text-zinc-400'
                }`}>
                  {isSelected ? '编辑中' : '点击配置'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Provider Configuration Workspace */}
      <div className={`p-6 sm:p-7 rounded-3xl border space-y-6 transition-colors ${
        isLight ? 'bg-white border-zinc-200 shadow-sm' : 'bg-zinc-900/40 border-white/10'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-100 dark:border-white/5">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{meta.icon}</span>
            <div>
              <div className="flex items-center gap-2">
                <h4 className={`text-base sm:text-lg font-bold ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                  {selectedProvider.name}
                </h4>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-500/20">
                  {meta.tag}
                </span>
              </div>
              <p className={`text-xs mt-0.5 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                {selectedProvider.description}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {meta.officialDocUrl && (
              <a
                href={meta.officialDocUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition ${
                  isLight
                    ? 'bg-zinc-50 hover:bg-zinc-100 text-zinc-600 border-zinc-200'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-white/5'
                }`}
              >
                <span>获取 Key / 官网</span>
                <ExternalLink className="w-3 h-3 text-zinc-400" />
              </a>
            )}

            {!isSelectedActive ? (
              <button
                type="button"
                onClick={() => handleSaveProviderConfig(true)}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-600/20"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>设为活跃模型</span>
              </button>
            ) : (
              <span className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>当前全局默认模型</span>
              </span>
            )}
          </div>
        </div>

        {/* Form Fields Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Base URL */}
          <div className="space-y-1.5">
            <label className={`text-xs font-semibold flex items-center gap-1.5 ${isLight ? 'text-zinc-700' : 'text-zinc-300'}`}>
              <Globe className="w-3.5 h-3.5 text-sky-500" />
              <span>API 端点 (Base URL)</span>
            </label>
            <input
              type="text"
              value={editBaseUrl}
              onChange={(e) => setEditBaseUrl(e.target.value)}
              placeholder={selectedProvider.defaultBaseUrl || 'https://...'}
              className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-mono border focus:outline-none transition ${
                isLight
                  ? 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-purple-500 focus:bg-white'
                  : 'bg-zinc-950/80 border-white/10 text-zinc-200 focus:border-purple-500'
              }`}
            />
            <p className={`text-[11px] ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`}>
              标准 OpenAI 兼容端点。本地 Ollama 通常为 <code className="font-mono text-purple-500">http://192.168.x.x:11434/v1</code>
            </p>
          </div>

          {/* Model ID */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className={`text-xs font-semibold flex items-center gap-1.5 ${isLight ? 'text-zinc-700' : 'text-zinc-300'}`}>
                <Layers className="w-3.5 h-3.5 text-purple-500" />
                <span>模型标识 (Model ID)</span>
              </label>

              <button
                type="button"
                onClick={handleFetchModels}
                disabled={fetchingModels}
                className={`text-[11px] font-medium flex items-center gap-1 px-2.5 py-1 rounded-lg border transition cursor-pointer ${
                  isLight
                    ? 'bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-200'
                    : 'bg-purple-900/30 text-purple-300 hover:bg-purple-900/50 border-purple-500/30'
                }`}
                title="根据当前输入的 API URL 与 Key，从 API 接口自动获取支持的全部可用模型列表"
              >
                <RefreshCw className={`w-3 h-3 ${fetchingModels ? 'animate-spin text-purple-500' : ''}`} />
                <span>{fetchingModels ? '拉取中...' : '🔄 自动拉取可用模型'}</span>
              </button>
            </div>

            {/* Render Dropdown if models are fetched for current provider */}
            {(fetchedModelsMap[selectedProviderId] && fetchedModelsMap[selectedProviderId].length > 0) ? (
              <div className="space-y-1">
                <select
                  value={editModel}
                  onChange={(e) => setEditModel(e.target.value)}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-mono border focus:outline-none transition cursor-pointer ${
                    isLight
                      ? 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-purple-500 focus:bg-white'
                      : 'bg-zinc-950/80 border-white/10 text-zinc-200 focus:border-purple-500'
                  }`}
                >
                  {/* If user typed a custom model not in the list, keep it as selected */}
                  {editModel && !fetchedModelsMap[selectedProviderId].includes(editModel) && (
                    <option value={editModel}>✏️ 自定义模型: {editModel}</option>
                  )}
                  {fetchedModelsMap[selectedProviderId].map(m => (
                    <option key={m} value={m}>
                      {m} {m === selectedProvider.defaultModel ? '⭐ (官方默认)' : ''}
                    </option>
                  ))}
                </select>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-emerald-500 font-medium">
                    ✓ 已自动加载 {fetchedModelsMap[selectedProviderId].length} 个可用模型，下拉选择即可
                  </span>
                  <button
                    type="button"
                    onClick={() => setFetchedModelsMap(prev => ({ ...prev, [selectedProviderId]: [] }))}
                    className="text-zinc-400 hover:text-purple-500 hover:underline cursor-pointer"
                  >
                    切换手动文本输入
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <input
                  type="text"
                  value={editModel}
                  onChange={(e) => setEditModel(e.target.value)}
                  placeholder={selectedProvider.defaultModel}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-mono border focus:outline-none transition ${
                    isLight
                      ? 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-purple-500 focus:bg-white'
                      : 'bg-zinc-950/80 border-white/10 text-zinc-200 focus:border-purple-500'
                  }`}
                />
                <p className={`text-[11px] mt-1 ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`}>
                  官方推荐: <strong className="font-mono text-purple-500">{selectedProvider.defaultModel}</strong>。可点击右上角 <span className="text-purple-400 font-medium">“🔄 自动拉取”</span> 自动生成下拉列表。
                </p>
              </div>
            )}
          </div>

          {/* API Key */}
          <div className="space-y-1.5 md:col-span-2">
            <div className="flex items-center justify-between">
              <label className={`text-xs font-semibold flex items-center gap-1.5 ${isLight ? 'text-zinc-700' : 'text-zinc-300'}`}>
                <Key className="w-3.5 h-3.5 text-amber-500" />
                <span>API 授权密钥 (API Key)</span>
              </label>
              {selectedProvider.isFromEnv && (
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-mono">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>已通过服务端环境变量自动注入</span>
                </span>
              )}
            </div>

            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={editApiKey}
                onChange={(e) => setEditApiKey(e.target.value)}
                placeholder={selectedProvider.id === 'custom' ? '本地私有模型如 Ollama 可留空' : 'sk-••••••••••••••••'}
                className={`w-full pl-3.5 pr-10 py-2.5 rounded-xl text-xs font-mono border focus:outline-none transition ${
                  isLight
                    ? 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-purple-500 focus:bg-white'
                    : 'bg-zinc-950/80 border-white/10 text-zinc-200 focus:border-purple-500'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition cursor-pointer`}
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className={`text-[11px] ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`}>
              密钥仅保存于系统安全的本地数据目录或环境变量中，前端仅脱敏掩码显示，绝不会泄露。
            </p>
          </div>
        </div>

        {/* Action Controls & Connectivity Test Result */}
        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition flex items-center gap-2 cursor-pointer ${
                isLight
                  ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border-zinc-300'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-white/10'
              }`}
            >
              <Zap className={`w-3.5 h-3.5 text-amber-500 ${testing ? 'animate-bounce' : ''}`} />
              <span>{testing ? '正在测试并测速...' : '测试连接并测速'}</span>
            </button>

            <button
              type="button"
              onClick={() => handleSaveProviderConfig(false)}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-purple-600/20"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? '保存中...' : '保存配置'}</span>
            </button>
          </div>

          {/* Test connection report pill */}
          {testResult && (
            <div className={`p-2.5 px-3.5 rounded-xl text-xs font-mono border flex items-center gap-2 animate-fadeIn ${
              testResult.success
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
            }`}>
              {testResult.success ? (
                <>
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                  <span>连通正常 (延迟: <strong>{testResult.latencyMs}ms</strong>, 模型: {testResult.modelUsed})</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span className="truncate max-w-sm">{testResult.error}</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 4. Functional Integration Switches */}
      <div className={`p-6 sm:p-7 rounded-3xl border space-y-4 transition-colors ${
        isLight ? 'bg-white border-zinc-200 shadow-sm' : 'bg-zinc-900/40 border-white/10'
      }`}>
        <div className="flex items-center gap-2 pb-2 border-b border-zinc-100 dark:border-white/5">
          <Sliders className="w-4 h-4 text-purple-500" />
          <h4 className={`text-sm font-bold ${isLight ? 'text-zinc-900' : 'text-white'}`}>
            AI 大模型应用场景与系统联动
          </h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* Feature 1 */}
          <div 
            onClick={() => handleToggleFeature('enableSemanticVoiceSearch')}
            className={`p-4 rounded-2xl border transition cursor-pointer flex flex-col justify-between ${
              config.enableSemanticVoiceSearch
                ? isLight
                  ? 'bg-purple-50/60 border-purple-200 shadow-sm'
                  : 'bg-purple-950/20 border-purple-500/30'
                : isLight
                ? 'bg-zinc-50 border-zinc-200 opacity-70'
                : 'bg-zinc-900/20 border-white/5 opacity-60'
            }`}
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-lg">🎙️</span>
                <span className={`w-3 h-3 rounded-full ${config.enableSemanticVoiceSearch ? 'bg-purple-500' : 'bg-zinc-300 dark:bg-zinc-700'}`} />
              </div>
              <h5 className={`text-xs font-bold ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                小爱音箱语义理解与模糊点歌
              </h5>
              <p className={`text-[11px] leading-relaxed ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                当本地死板规则未命中时，自动调用大模型识别“放点适合下雨天听的歌”等情绪场景，从本地曲库唤起播放。
              </p>
            </div>
            <span className={`text-[10px] font-semibold mt-2.5 ${config.enableSemanticVoiceSearch ? 'text-purple-600 dark:text-purple-400' : 'text-zinc-400'}`}>
              {config.enableSemanticVoiceSearch ? '● 已启用' : '○ 已关闭'}
            </span>
          </div>

          {/* Feature 2 */}
          <div 
            onClick={() => handleToggleFeature('enableLogDiagnostics')}
            className={`p-4 rounded-2xl border transition cursor-pointer flex flex-col justify-between ${
              config.enableLogDiagnostics
                ? isLight
                  ? 'bg-sky-50/60 border-sky-200 shadow-sm'
                  : 'bg-sky-950/20 border-sky-500/30'
                : isLight
                ? 'bg-zinc-50 border-zinc-200 opacity-70'
                : 'bg-zinc-900/20 border-white/5 opacity-60'
            }`}
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-lg">🩺</span>
                <span className={`w-3 h-3 rounded-full ${config.enableLogDiagnostics ? 'bg-sky-500' : 'bg-zinc-300 dark:bg-zinc-700'}`} />
              </div>
              <h5 className={`text-xs font-bold ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                全链路日志与故障 AI 一键归因
              </h5>
              <p className={`text-[11px] leading-relaxed ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                在诊断日志中心提供「AI 智能归因诊断」按钮，毫秒级汇总串流中断、网络握手及转码错误并给出人话建议。
              </p>
            </div>
            <span className={`text-[10px] font-semibold mt-2.5 ${config.enableLogDiagnostics ? 'text-sky-600 dark:text-sky-400' : 'text-zinc-400'}`}>
              {config.enableLogDiagnostics ? '● 已启用' : '○ 已关闭'}
            </span>
          </div>

          {/* Feature 3 */}
          <div 
            onClick={() => handleToggleFeature('enableMusicInsight')}
            className={`p-4 rounded-2xl border transition cursor-pointer flex flex-col justify-between ${
              config.enableMusicInsight
                ? isLight
                  ? 'bg-amber-50/60 border-amber-200 shadow-sm'
                  : 'bg-amber-950/20 border-amber-500/30'
                : isLight
                ? 'bg-zinc-50 border-zinc-200 opacity-70'
                : 'bg-zinc-900/20 border-white/5 opacity-60'
            }`}
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-lg">🎵</span>
                <span className={`w-3 h-3 rounded-full ${config.enableMusicInsight ? 'bg-amber-500' : 'bg-zinc-300 dark:bg-zinc-700'}`} />
              </div>
              <h5 className={`text-xs font-bold ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                曲目深度风格与情绪乐评鉴赏
              </h5>
              <p className={`text-[11px] leading-relaxed ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                为正在播放的本地曲目生成 80 字富有诗意的鉴赏语与情绪共鸣分析，化身家庭专属的电台音乐主持人。
              </p>
            </div>
            <span className={`text-[10px] font-semibold mt-2.5 ${config.enableMusicInsight ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-400'}`}>
              {config.enableMusicInsight ? '● 已启用' : '○ 已关闭'}
            </span>
          </div>
        </div>
      </div>

      {/* 4. AI Skill External Webhook & Callback Config */}
      <div className={`p-6 sm:p-7 rounded-3xl border space-y-5 transition-colors ${
        isLight ? 'bg-white border-zinc-200 shadow-sm' : 'bg-zinc-900/40 border-white/10'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100 dark:border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className={`text-sm font-bold ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                  AI Skill 外部回调地址与 Webhook 调度
                </h4>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-medium">
                  调度中心关闭时直连生效
                </span>
              </div>
              <p className={`text-xs mt-0.5 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                当下载调度中心关闭时，系统检测到未收录歌曲将自动通过此回调地址向 AI 外部 Skill 探针派发结构化参数与落盘指令
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
            <button
              type="button"
              onClick={() => setShowPayloadSchema(prev => !prev)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                isLight ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-200' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-white/5'
              }`}
            >
              <Code className="w-3.5 h-3.5 text-amber-500" />
              <span>{showPayloadSchema ? '收起参数字典' : '查看参数协议'}</span>
              {showPayloadSchema ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            <button
              type="button"
              onClick={handleTestSkillCallback}
              disabled={skillTestLoading}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition border cursor-pointer ${
                isLight ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300' : 'bg-amber-950/40 hover:bg-amber-900/50 text-amber-300 border-amber-500/30'
              } disabled:opacity-50`}
            >
              {skillTestLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>{skillTestLoading ? '正在通信...' : '测试回调连通性'}</span>
            </button>
            <button
              type="button"
              onClick={handleSaveSkillCallback}
              disabled={savingSkillConfig}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-zinc-950 transition shadow-sm shadow-amber-500/20 disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savingSkillConfig ? '保存中...' : '保存回调配置'}</span>
            </button>
          </div>
        </div>

        {/* Input fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className={`text-xs font-bold flex items-center justify-between ${isLight ? 'text-zinc-700' : 'text-zinc-300'}`}>
              <span className="flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-amber-500" />
                AI Skill 回调接口 URL (Webhook)
              </span>
              <span className="text-[10px] text-zinc-400 font-normal">支持 HTTP / HTTPS</span>
            </label>
            <input
              type="text"
              value={skillCallbackUrl}
              onChange={e => setSkillCallbackUrl(e.target.value)}
              placeholder={`例如：${resolvedServerHost}/api/skill/download`}
              className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-mono border outline-none transition ${
                isLight 
                  ? 'bg-zinc-50 border-zinc-200 focus:border-amber-500 focus:bg-white text-zinc-900' 
                  : 'bg-zinc-950/60 border-zinc-800 focus:border-amber-500 text-white'
              }`}
            />
          </div>

          <div className="space-y-1.5">
            <label className={`text-xs font-bold flex items-center justify-between ${isLight ? 'text-zinc-700' : 'text-zinc-300'}`}>
              <span className="flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-amber-500" />
                回调鉴权 Bearer Token (可选)
              </span>
              <span className="text-[10px] text-zinc-400 font-normal">如不需要鉴权可留空</span>
            </label>
            <input
              type="password"
              value={skillAuthToken}
              onChange={e => setSkillAuthToken(e.target.value)}
              placeholder="Authorization: Bearer sk-..."
              className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-mono border outline-none transition ${
                isLight 
                  ? 'bg-zinc-50 border-zinc-200 focus:border-amber-500 focus:bg-white text-zinc-900' 
                  : 'bg-zinc-950/60 border-zinc-800 focus:border-amber-500 text-white'
              }`}
            />
          </div>
        </div>

        {/* Test Result Display */}
        {skillTestResult && (
          <div className={`p-3.5 rounded-2xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            skillTestResult.success
              ? isLight ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
              : isLight ? 'bg-red-50 border-red-200 text-red-900' : 'bg-red-950/30 border-red-500/30 text-red-300'
          }`}>
            <div className="flex items-center gap-2">
              {skillTestResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
              <div>
                <span className="font-bold">
                  {skillTestResult.success ? `回调连通成功 (HTTP ${skillTestResult.status})` : '回调通信失败'}
                </span>
                <span className="ml-2 font-mono text-[11px] opacity-80">耗时: {skillTestResult.latencyMs}ms</span>
                {skillTestResult.error && <p className="text-[11px] mt-0.5 opacity-90">{skillTestResult.error}</p>}
              </div>
            </div>
            {skillTestResult.responseSample && (
              <span className="text-[10px] font-mono opacity-70 truncate max-w-xs">
                响应预览: {skillTestResult.responseSample}
              </span>
            )}
          </div>
        )}

        {/* Parameter Protocol Schema Accordion */}
        {showPayloadSchema && (
          <div className={`p-4 rounded-2xl border space-y-3 ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-950/80 border-white/5'}`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-bold text-amber-500 flex items-center gap-1.5">
                <Code className="w-4 h-4" />
                系统派发给 AI Skill 探针的 JSON 回调参数协议：
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-400">局域网串流 Host:</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold border border-amber-500/20">
                  {resolvedServerHost}
                </span>
              </div>
            </div>
            <pre className="text-[11px] font-mono leading-relaxed p-3.5 rounded-xl bg-zinc-900 text-zinc-200 overflow-x-auto border border-white/5">
{`{
  "event": "ai_skill_music_download_requested",
  "timestamp": ${Date.now()},
  "serverHost": "${resolvedServerHost}",
  "track": {
    "title": "笑看风云",
    "artist": "郑少秋",
    "album": "经典大碟",
    "genre": "粤语流行 / 经典"
  },
  "storage": {
    "targetDirectory": "/app/music",
    "targetFilePath": "/app/music/郑少秋/经典大碟/郑少秋 - 笑看风云.flac",
    "companionLrcPath": "/app/music/郑少秋/经典大碟/郑少秋 - 笑看风云.lrc"
  },
  "syncCallback": {
    "method": "POST",
    "url": "${resolvedServerHost}/api/nas/sync",
    "scanEndpoint": "${resolvedServerHost}/api/music/scan"
  },
  "clientContext": {
    "requestedBy": "voice_ai",
    "mode": "ai_skill_direct"
  }
}`}
            </pre>
            <p className="text-[10px] text-zinc-400">
              💡 说明：AI Skill 探针执行完音频下载并存入 <code className="text-amber-400">storage.targetDirectory</code>（即系统本地 <code className="text-amber-400">app/music</code>）后，主动向 <code className="text-amber-400">{resolvedServerHost}/api/nas/sync</code> 发送 POST 请求即可自动完成曲库入库。
            </p>
          </div>
        )}
      </div>

      {/* 5. Voice Semantic Playground & Mood Queue Live Simulation (Items 1 & 2) */}
      <div className={`p-6 sm:p-7 rounded-3xl border space-y-5 transition-colors ${
        isLight ? 'bg-white border-zinc-200 shadow-sm' : 'bg-zinc-900/40 border-white/10'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100 dark:border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h4 className={`text-sm font-bold flex items-center gap-2 ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                两阶段意图提炼与动态心境电台演练
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-medium">
                  全库检索 + 5~10首连续播放
                </span>
              </h4>
              <p className={`text-xs mt-0.5 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                输入任意模糊/情绪/场景口令，验证大模型意图提取与本地曲库加权匹配生成的连续播放队列
              </p>
            </div>
          </div>
        </div>

        {/* Preset quick test pills */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className={`text-[11px] font-semibold ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
            推荐测试语:
          </span>
          {[
            '放几首适合下雨天看书的歌',
            '来一首周董前几年有古风味道的歌',
            '歌词里有天青色等烟雨的歌',
            '放点轻松解压的纯音乐',
            '来点热血劲爆的摇滚乐'
          ].map((preset, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setTestVoiceQuery(preset);
                handleRunVoiceTest(preset);
              }}
              className={`px-2.5 py-1 rounded-lg border text-[11px] transition cursor-pointer ${
                isLight
                  ? 'bg-zinc-50 hover:bg-purple-50 hover:border-purple-200 text-zinc-700'
                  : 'bg-zinc-800/80 hover:bg-purple-950/40 hover:border-purple-500/40 text-zinc-300 border-white/5'
              }`}
            >
              {preset}
            </button>
          ))}
        </div>

        {/* Input & Action */}
        <div className="flex items-center gap-2.5">
          <input
            type="text"
            value={testVoiceQuery}
            onChange={(e) => setTestVoiceQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRunVoiceTest(); }}
            placeholder="输入自然语言点歌口令..."
            className={`flex-1 px-4 py-2.5 rounded-xl text-xs border focus:outline-none transition ${
              isLight
                ? 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-purple-500 focus:bg-white'
                : 'bg-zinc-950/80 border-white/10 text-zinc-200 focus:border-purple-500'
            }`}
          />
          <button
            type="button"
            onClick={() => handleRunVoiceTest()}
            disabled={voiceParsing}
            className="px-5 py-2.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-purple-600/20 shrink-0"
          >
            <Send className={`w-3.5 h-3.5 ${voiceParsing ? 'animate-spin' : ''}`} />
            <span>{voiceParsing ? 'AI 意图解析中...' : '模拟小爱点歌'}</span>
          </button>
        </div>

        {/* Result Card */}
        {voiceParseResult && (
          <div className={`p-4 rounded-2xl border space-y-4 animate-fadeIn ${
            voiceParseResult.matched
              ? isLight ? 'bg-purple-50/40 border-purple-200' : 'bg-purple-950/20 border-purple-500/30'
              : isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900/40 border-white/5'
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-zinc-100 dark:border-white/5">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${voiceParseResult.matched ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                <span className={`text-xs font-bold ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                  {voiceParseResult.matched ? '意图理解成功 · 命中心境电台' : '未匹配到本地曲目'}
                </span>
              </div>
              {voiceParseResult.matched && (
                <span className="text-[11px] font-mono text-purple-600 dark:text-purple-300 font-semibold">
                  电台主题: 《{voiceParseResult.queueTitle}》
                </span>
              )}
            </div>

            {/* TTS Box */}
            {voiceParseResult.ttsResponse && (
              <div className={`p-3 rounded-xl border flex items-start gap-2.5 ${
                isLight ? 'bg-white border-purple-100 text-zinc-800' : 'bg-zinc-900/80 border-purple-500/20 text-zinc-200'
              }`}>
                <Volume2 className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
                <div>
                  <div className="text-[10px] font-semibold text-purple-500 uppercase tracking-wider">小爱音箱专属 TTS 播报词</div>
                  <div className="text-xs font-medium mt-0.5">{voiceParseResult.ttsResponse}</div>
                </div>
              </div>
            )}

            {/* Continuous Playlist Queue Preview */}
            {voiceParseResult.playlistSongs && voiceParseResult.playlistSongs.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className={`font-bold flex items-center gap-1.5 ${isLight ? 'text-zinc-800' : 'text-zinc-200'}`}>
                    <Radio className="w-3.5 h-3.5 text-purple-500" />
                    <span>连续播放队列 (共 {voiceParseResult.playlistSongs.length} 首)</span>
                  </span>
                  <span className={`text-[10px] ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    {voiceParseResult.reason}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {voiceParseResult.playlistSongs.map((s: any, idx: number) => (
                    <div
                      key={s.id || idx}
                      className={`p-2.5 rounded-xl border flex items-center gap-2.5 transition ${
                        idx === 0
                          ? isLight ? 'bg-purple-100/70 border-purple-300 font-semibold' : 'bg-purple-900/40 border-purple-500/40 font-semibold'
                          : isLight ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-white/5'
                      }`}
                    >
                      <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-mono shrink-0 ${
                        idx === 0
                          ? 'bg-purple-600 text-white font-bold'
                          : isLight ? 'bg-zinc-100 text-zinc-500' : 'bg-zinc-800 text-zinc-400'
                      }`}>
                        {idx + 1}
                      </span>
                      <div className="truncate flex-1 min-w-0">
                        <div className={`text-xs truncate ${idx === 0 ? 'text-purple-700 dark:text-purple-300' : isLight ? 'text-zinc-800' : 'text-zinc-200'}`}>
                          {s.title}
                        </div>
                        <div className={`text-[10px] truncate ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`}>
                          {s.artist || '未知艺术家'} {s.genre ? `· ${s.genre}` : ''}
                        </div>
                      </div>
                      {idx === 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-600 dark:text-purple-300 shrink-0 font-medium">
                          首曲
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 6. Semantic Memory Cache Monitor (Item 3) */}
      <div className={`p-6 sm:p-7 rounded-3xl border space-y-5 transition-colors ${
        isLight ? 'bg-white border-zinc-200 shadow-sm' : 'bg-zinc-900/40 border-white/10'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100 dark:border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h4 className={`text-sm font-bold flex items-center gap-2 ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                高速语义缓存池 (Semantic Memory Cache)
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-medium">
                  0ms 响应 · 零 Token 消耗
                </span>
              </h4>
              <p className={`text-xs mt-0.5 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                自动记忆家庭常点口令、场景与曲目映射关系，重复或同义点歌 0 毫秒即刻开播
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClearCache}
              disabled={clearingCache}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 cursor-pointer ${
                isLight
                  ? 'bg-zinc-50 hover:bg-rose-50 hover:border-rose-200 text-zinc-700 hover:text-rose-600'
                  : 'bg-zinc-800 hover:bg-rose-950/40 hover:border-rose-500/40 text-zinc-300 hover:text-rose-300 border-white/5'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{clearingCache ? '清空中...' : '清空语义缓存'}</span>
            </button>
          </div>
        </div>

        {/* 3 Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className={`p-4 rounded-2xl border ${
            isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-950/60 border-white/5'
          }`}>
            <span className={`text-[11px] font-semibold ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
              📦 活跃语义词条
            </span>
            <div className={`text-xl font-bold font-mono mt-1 ${isLight ? 'text-zinc-900' : 'text-white'}`}>
              {cacheStats?.totalEntries || 0} <span className="text-xs font-normal opacity-70">条</span>
            </div>
          </div>

          <div className={`p-4 rounded-2xl border ${
            isLight ? 'bg-emerald-50/60 border-emerald-200' : 'bg-emerald-950/20 border-emerald-500/30'
          }`}>
            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              ⚡ 0ms 极速命中
            </span>
            <div className="text-xl font-bold font-mono mt-1 text-emerald-600 dark:text-emerald-300">
              {cacheStats?.totalHits || 0} <span className="text-xs font-normal opacity-70">次</span>
            </div>
          </div>

          <div className={`p-4 rounded-2xl border ${
            isLight ? 'bg-purple-50/60 border-purple-200' : 'bg-purple-950/20 border-purple-500/30'
          }`}>
            <span className="text-[11px] font-semibold text-purple-600 dark:text-purple-400">
              💰 预估节省 Token 消耗
            </span>
            <div className="text-xl font-bold font-mono mt-1 text-purple-600 dark:text-purple-300">
              ~{(cacheStats?.estimatedTokensSaved || 0).toLocaleString()} <span className="text-xs font-normal opacity-70">Tokens</span>
            </div>
          </div>
        </div>

        {/* Top Cached Queries List */}
        {cacheStats && cacheStats.topQueries && cacheStats.topQueries.length > 0 && (
          <div className="space-y-2 pt-1">
            <span className={`text-xs font-bold ${isLight ? 'text-zinc-700' : 'text-zinc-300'}`}>
              🔥 高频缓存指令与命中频次:
            </span>
            <div className="flex flex-wrap gap-2">
              {cacheStats.topQueries.map((item, idx) => (
                <div
                  key={idx}
                  className={`px-3 py-1.5 rounded-xl border text-xs flex items-center gap-2 ${
                    isLight ? 'bg-zinc-50 border-zinc-200 text-zinc-800' : 'bg-zinc-800/80 border-white/5 text-zinc-200'
                  }`}
                >
                  <span>{item.query}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-mono font-bold">
                    {item.hits} 次
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
