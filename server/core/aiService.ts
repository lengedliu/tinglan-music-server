import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { computeSongMatchScore } from '../pinyinHelper.js';
import { aiSemanticCache } from './aiSemanticCache.js';

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
}

export interface AiTestResult {
  success: boolean;
  latencyMs: number;
  reply?: string;
  modelUsed?: string;
  error?: string;
}

export interface AiVoiceMatchResult {
  matched: boolean;
  isMoodQueue?: boolean;
  queueTitle?: string;
  primarySong?: any;
  playlistSongs?: any[];
  songId?: string;
  songTitle?: string;
  artist?: string;
  reason?: string;
  ttsResponse?: string;
  confidence?: number;
  fromCache?: boolean;
  cacheHits?: number;
}

export interface AiAutomationResult {
  name: string;
  description: string;
  cronExpr: string;
  cronExplanation: string;
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
}

export interface AiDiagnosisResult {
  success: boolean;
  latencyMs: number;
  modelUsed: string;
  summary: string;
  rootCause: string;
  recommendations: string[];
  severity: 'normal' | 'warning' | 'critical';
}

const DEFAULT_AI_CONFIG: AiServiceConfig = {
  enabled: true,
  activeProvider: process.env.GEMINI_API_KEY ? 'gemini' : 'deepseek',
  providers: {
    deepseek: {
      id: 'deepseek',
      name: 'DeepSeek (深度求索)',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      apiKey: '',
      defaultModel: 'deepseek-chat',
      defaultBaseUrl: 'https://api.deepseek.com/v1',
      description: '超高性价比与中文强意图推理，支持 deepseek-chat 及 deepseek-reasoner',
      badge: '深度求索'
    },
    qwen: {
      id: 'qwen',
      name: '通义千问 (Qwen)',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: 'qwen-plus',
      apiKey: '',
      defaultModel: 'qwen-plus',
      defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      description: '阿里云通义千问，极强中文流行音乐与口语习惯理解，支持 qwen-plus / qwen-turbo',
      badge: '通义千问'
    },
    zhipu: {
      id: 'zhipu',
      name: '智谱 GLM',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      model: 'glm-4-flash',
      apiKey: '',
      defaultModel: 'glm-4-flash',
      defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      description: '智谱清言大模型，支持 glm-4-flash / glm-4-plus，响应迅速、免费额度充沛',
      badge: '智谱清言'
    },
    gemini: {
      id: 'gemini',
      name: 'Google Gemini',
      baseUrl: 'https://generativelanguage.googleapis.com',
      model: 'gemini-3.8-flash',
      apiKey: '',
      defaultModel: 'gemini-3.8-flash',
      defaultBaseUrl: 'https://generativelanguage.googleapis.com',
      description: 'Google 原生大语言模型，极速推理 (~200ms)，支持 gemini-3.8-flash',
      badge: 'Gemini'
    },
    custom: {
      id: 'custom',
      name: '自定义接入 / 本地 Ollama',
      baseUrl: 'http://localhost:11434/v1',
      model: 'qwen2.5:7b',
      apiKey: '',
      defaultModel: 'qwen2.5:7b',
      defaultBaseUrl: 'http://localhost:11434/v1',
      description: '家庭 NAS / 局域网本地私有化模型或任何 OpenAI 协议兼容端点（如 LM Studio, vLLM, OneAPI）',
      badge: '自定义/私有'
    }
  },
  temperature: 0.3,
  timeoutMs: 6000,
  enableSemanticVoiceSearch: true,
  enableLogDiagnostics: true,
  enableMusicInsight: true
};

const AI_CONFIG_FILE = path.join(process.cwd(), 'data', 'ai-config.json');

export class AiService {
  private static instance: AiService;
  private config: AiServiceConfig = { ...DEFAULT_AI_CONFIG };

  private constructor() {
    this.loadConfig();
  }

  public static getInstance(): AiService {
    if (!AiService.instance) {
      AiService.instance = new AiService();
    }
    return AiService.instance;
  }

  private loadConfig() {
    try {
      if (fs.existsSync(AI_CONFIG_FILE)) {
        const raw = fs.readFileSync(AI_CONFIG_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          this.config = {
            ...DEFAULT_AI_CONFIG,
            ...parsed,
            providers: {
              ...DEFAULT_AI_CONFIG.providers,
              ...(parsed.providers || {})
            }
          };
        }
      }
    } catch (err: any) {
      console.warn('[AiService] Failed to load ai-config.json, using defaults:', err.message);
    }
  }

  public saveConfig() {
    try {
      const dir = path.dirname(AI_CONFIG_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(AI_CONFIG_FILE, JSON.stringify(this.config, null, 2), 'utf8');
    } catch (err: any) {
      console.warn('[AiService] Failed to save ai-config.json:', err.message);
    }
  }

  public getConfig(): AiServiceConfig {
    return { ...this.config };
  }

  public getMaskedConfig() {
    const raw = this.getConfig();
    const maskedProviders: Record<string, any> = {};

    for (const [key, p] of Object.entries(raw.providers)) {
      const resolvedKey = this.resolveApiKey(p.id as AiProviderId);
      let maskedKey = '';
      if (resolvedKey) {
        if (resolvedKey.length <= 8) {
          maskedKey = '••••••••';
        } else {
          maskedKey = `${resolvedKey.slice(0, 3)}••••••••${resolvedKey.slice(-4)}`;
        }
      }

      maskedProviders[key] = {
        ...p,
        apiKey: maskedKey,
        isConfigured: Boolean(resolvedKey),
        isFromEnv: Boolean(!p.apiKey && resolvedKey)
      };
    }

    return {
      ...raw,
      providers: maskedProviders
    };
  }

  public updateConfig(partial: Partial<AiServiceConfig>) {
    if (partial.providers) {
      // Merge providers carefully so we don't accidentally overwrite with empty keys
      const mergedProviders = { ...this.config.providers };
      for (const [pKey, pVal] of Object.entries(partial.providers)) {
        const existing = mergedProviders[pKey as AiProviderId];
        if (existing) {
          mergedProviders[pKey as AiProviderId] = {
            ...existing,
            ...pVal,
            // If user passed masked key or left empty, keep existing key
            apiKey: (pVal.apiKey && !pVal.apiKey.includes('••••')) ? pVal.apiKey.trim() : existing.apiKey
          };
        }
      }
      partial.providers = mergedProviders;
    }

    this.config = {
      ...this.config,
      ...partial
    };
    this.saveConfig();
    return this.getMaskedConfig();
  }

  public resolveApiKey(providerId: AiProviderId): string {
    const provider = this.config.providers[providerId];
    if (provider?.apiKey && provider.apiKey.trim()) {
      return provider.apiKey.trim();
    }

    // Fallback to environment variables
    switch (providerId) {
      case 'deepseek':
        return process.env.DEEPSEEK_API_KEY || '';
      case 'qwen':
        return process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || '';
      case 'zhipu':
        return process.env.ZHIPU_API_KEY || process.env.GLM_API_KEY || '';
      case 'gemini':
        return process.env.GEMINI_API_KEY || '';
      case 'custom':
        return process.env.CUSTOM_AI_API_KEY || '';
      default:
        return '';
    }
  }

  /**
   * Fetch available model list from target provider's API
   */
  public async fetchAvailableModels(params: {
    providerId?: AiProviderId;
    baseUrl?: string;
    apiKey?: string;
  }): Promise<{ success: boolean; models: string[]; error?: string }> {
    const providerId = params.providerId || this.config.activeProvider;
    const providerConfig = this.config.providers[providerId];

    let baseUrl = (params.baseUrl || providerConfig?.baseUrl || providerConfig?.defaultBaseUrl || '').trim();
    let apiKey = params.apiKey ? params.apiKey.trim() : '';

    // If apiKey is empty or masked ("sk-••••"), resolve effective key
    if (!apiKey || apiKey.includes('••••')) {
      apiKey = this.resolveApiKey(providerId);
    }

    try {
      // 1. Gemini Models List
      if (providerId === 'gemini' || baseUrl.includes('generativelanguage.googleapis.com')) {
        if (!apiKey) {
          throw new Error('未配置 Gemini API Key，请先输入密钥或在环境变量中配置');
        }
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Gemini 模型列表接口响应错误 (${res.status}): ${errText.slice(0, 150)}`);
        }
        const json = await res.json();
        const rawList = Array.isArray(json.models) ? json.models : [];
        const modelsList: string[] = rawList
          .filter((m: any) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
          .map((m: any) => (m.name || '').replace(/^models\//, ''))
          .filter(Boolean)
          .sort();

        return {
          success: true,
          models: modelsList.length > 0 ? modelsList : ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-flash']
        };
      }

      // 2. OpenAI-compatible Models List (/v1/models)
      let modelsUrl = baseUrl.replace(/\/+$/, '');
      if (!modelsUrl.endsWith('/models')) {
        modelsUrl = `${modelsUrl}/models`;
      }

      const headers: Record<string, string> = {
        'Accept': 'application/json'
      };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      let res = await fetch(modelsUrl, { headers, signal: AbortSignal.timeout(10000) });

      // Fallback for Ollama /api/tags if /v1/models fails
      if (!res.ok && (providerId === 'custom' || baseUrl.includes('11434'))) {
        const ollamaTagsUrl = baseUrl.replace(/\/v1\/?$/, '') + '/api/tags';
        try {
          const ollamaRes = await fetch(ollamaTagsUrl, { signal: AbortSignal.timeout(5000) });
          if (ollamaRes.ok) {
            const ollamaJson = await ollamaRes.json();
            const ollamaModels = (ollamaJson.models || []).map((m: any) => m.name).filter(Boolean);
            if (ollamaModels.length > 0) {
              return { success: true, models: ollamaModels.sort() };
            }
          }
        } catch {}
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`请求 API 模型列表失败 (${res.status}): ${errText.slice(0, 200)}`);
      }

      const json = await res.json();
      let rawList: any[] = json.data || json.models || json;
      if (!Array.isArray(rawList)) {
        rawList = [];
      }

      const models: string[] = rawList
        .map((item: any) => typeof item === 'string' ? item : item?.id || item?.name)
        .filter((id: any) => typeof id === 'string' && id.trim().length > 0)
        .sort();

      if (models.length === 0) {
        throw new Error('接口返回成功，但未解析到可用模型标识');
      }

      return { success: true, models };
    } catch (err: any) {
      return {
        success: false,
        models: [],
        error: err.message || '获取模型列表超时或失败'
      };
    }
  }

  /**
   * Universal text completion dispatcher
   */
  public async generateCompletion(params: {
    prompt: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    providerId?: AiProviderId;
  }): Promise<{ text: string; modelUsed: string; latencyMs: number }> {
    const providerId = params.providerId || this.config.activeProvider;
    const provider = this.config.providers[providerId] || this.config.providers.gemini;
    const apiKey = this.resolveApiKey(providerId);

    const startTime = Date.now();

    // 1. Google Gemini SDK Path
    if (providerId === 'gemini') {
      if (!apiKey) {
        throw new Error('未配置 GEMINI_API_KEY，请在环境变量或 AI 设置中填写');
      }

      const ai = new GoogleGenAI({ apiKey });
      const model = provider.model || 'gemini-3.8-flash';
      
      const contents = params.systemPrompt 
        ? `${params.systemPrompt}\n\nUser Request: ${params.prompt}`
        : params.prompt;

      try {
        const response = await ai.models.generateContent({
          model,
          contents,
          config: {
            temperature: params.temperature ?? this.config.temperature,
            maxOutputTokens: params.maxTokens ?? 1024
          }
        });

        const latencyMs = Date.now() - startTime;
        return {
          text: response.text || '',
          modelUsed: model,
          latencyMs
        };
      } catch (err: any) {
        // High-availability automatic retry with gemini-flash-latest on transient 503/load spikes
        if (err.message?.includes('503') || err.message?.includes('high demand') || err.message?.includes('UNAVAILABLE')) {
          const fallbackModel = 'gemini-flash-latest';
          const fallbackResp = await ai.models.generateContent({
            model: fallbackModel,
            contents,
            config: {
              temperature: params.temperature ?? this.config.temperature,
              maxOutputTokens: params.maxTokens ?? 1024
            }
          });
          const latencyMs = Date.now() - startTime;
          return {
            text: fallbackResp.text || '',
            modelUsed: `${fallbackModel} (自动故障转移)`,
            latencyMs
          };
        }
        throw err;
      }
    }

    // 2. OpenAI-compatible REST API Path (DeepSeek, Qwen, Zhipu, Custom / Ollama)
    if (providerId !== 'custom' && !apiKey) {
      const hasGemini = Boolean(this.resolveApiKey('gemini'));
      throw new Error(`当前模型「${provider.name}」尚未配置 API Key。请在「系统设置 -> AI 大模型中枢」填入 Key${hasGemini ? '，或直接切换为已就绪的 Google Gemini 模型' : ''}。`);
    }

    let baseUrl = provider.baseUrl || provider.defaultBaseUrl;
    // Clean trailing slashes
    baseUrl = baseUrl.replace(/\/+$/, '');
    if (!baseUrl.endsWith('/chat/completions')) {
      baseUrl = `${baseUrl}/chat/completions`;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const messages = [];
    if (params.systemPrompt) {
      messages.push({ role: 'system', content: params.systemPrompt });
    }
    messages.push({ role: 'user', content: params.prompt });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs || 8000);

    try {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model: provider.model || provider.defaultModel,
          messages,
          temperature: params.temperature ?? this.config.temperature,
          max_tokens: params.maxTokens ?? 1024
        })
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errorBody = await res.text().catch(() => '');
        throw new Error(`API 响应错误 HTTP ${res.status}: ${errorBody.slice(0, 300)}`);
      }

      const data = await res.json();
      const latencyMs = Date.now() - startTime;
      const text = data?.choices?.[0]?.message?.content || '';

      return {
        text,
        modelUsed: provider.model || provider.defaultModel,
        latencyMs
      };
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        throw new Error(`请求大模型超时 (${this.config.timeoutMs}ms)，请检查网络连接或更换模型`);
      }
      throw err;
    }
  }

  /**
   * Test connection to a specific provider
   */
  public async testConnection(providerId: AiProviderId): Promise<AiTestResult> {
    try {
      const res = await this.generateCompletion({
        providerId,
        prompt: '请严格仅回复一句：“听澜AI已就绪”，不要输出任何其他文字。',
        systemPrompt: '你是一个严格执行测试指令的测试探针。',
        maxTokens: 50,
        temperature: 0.1
      });

      return {
        success: true,
        latencyMs: res.latencyMs,
        reply: res.text.trim(),
        modelUsed: res.modelUsed
      };
    } catch (err: any) {
      return {
        success: false,
        latencyMs: 0,
        error: err.message || '连接失败'
      };
    }
  }

  /**
   * Two-Stage Semantic Voice Search & Dynamic Mood Queue Engine:
   * Stage 1: Ultra-fast LLM intent extraction (artists, aliases, mood, keywords, genres, lyrics).
   * Stage 2: In-memory / database multi-criteria scoring across 100% of the song library,
   *          building a 5~10 song dynamic mood queue for continuous uninterrupted playback!
   */
  public async parseVoiceIntent(
    queryText: string,
    songs: Array<{ id: string; title: string; artist: string; album?: string; genre?: string; lyrics?: string; isFavorite?: boolean }>
  ): Promise<AiVoiceMatchResult> {
    if (!this.config.enabled || !this.config.enableSemanticVoiceSearch) {
      return { matched: false };
    }

    if (!songs || songs.length === 0) {
      return { matched: false, reason: '曲库为空' };
    }

    // Item 3: Check Semantic Cache first (0ms latency, zero tokens)
    const cached = aiSemanticCache.get(queryText);
    if (cached && cached.songId) {
      const exists = songs.some(s => s.id === cached.songId);
      if (exists) {
        return {
          ...cached,
          fromCache: true
        };
      }
    }

    // Stage 1: Intent Extraction via LLM
    const systemPrompt = `你是一个精通中国流行音乐、华语歌手别名黑话、歌词常识及音乐流派的意图提炼专家。
你的任务是将用户的口语化、情绪化、模糊点歌指令，提炼成结构化的音乐检索参数，用于在家庭局域网本地曲库中秒级搜库。

注意：
1. 歌手别名必须规范化，例如：“周董”/“杰伦” -> “周杰伦”，“E神” -> “陈奕迅”，“阿信” -> “五月天”，“力宏” -> “王力宏”。
2. 模糊歌词请直接推测出原歌曲名与歌手，例如：“天青色等烟雨” -> 歌名“青花瓷”，歌手“周杰伦”；“陪你去看流星雨” -> 歌名“流星雨”，歌手“F4”。
3. 场景/情绪点歌时（如“下雨天看书”、“睡觉轻音乐”、“开车热血摇滚”），设定 isMoodOrScene 为 true，生成优美的大气电台标题，并提供 4~6 个流派或风格相关的中英文关键词（如 ["纯音乐", "钢琴", "轻音乐", "治愈", "Instrumental", "Piano"]）。
4. suggestedTts 应自然亲切（如：“好的，为您开启雨天阅读心境电台”、“好的，为您播放周杰伦的青花瓷”）。

输出必须严格为 JSON 格式，不要包含任何 markdown 代码块或额外文字：
{
  "isMoodOrScene": true 或 false,
  "moodSceneTitle": "场景或电台名称",
  "keywords": ["关键词1", "关键词2"],
  "targetArtist": "规范化歌手名（若无则填空字符串）",
  "targetSongTitle": "推测的准确歌名（若无则填空字符串）",
  "targetGenre": "流派（如 Pop / Rock / Classical / Folk / Jazz 等，若无填空字符串）",
  "targetLyricsSnippet": "核心歌词片段（若无填空字符串）",
  "suggestedTts": "给小爱音箱的应答播报语",
  "queueTitle": "连续播放心境电台歌单标题"
}`;

    const prompt = `用户语音指令: "${queryText}"\n请提炼音乐检索结构化参数并输出 JSON:`;

    let intent: any = null;
    try {
      const res = await this.generateCompletion({
        prompt,
        systemPrompt,
        temperature: 0.2,
        maxTokens: 300
      });

      let cleanJson = res.text.trim();
      if (cleanJson.startsWith('```json')) {
        cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      intent = JSON.parse(cleanJson);
    } catch (llmErr: any) {
      console.warn('[AiService] LLM unavailable, using intelligent local heuristic fallback:', llmErr.message);
      // Local Heuristic Intent Extraction for 100% High-Availability
      const isMood = /(雨|书|轻松|解压|睡觉|助眠|安静|热血|轻音乐|纯音乐|运动|开车|漫游|古风|经典|流行|民谣|摇滚)/.test(queryText);
      const extractedKeywords: string[] = [];
      const moodWords = ['下雨', '雨天', '看书', '阅读', '轻松', '解压', '治愈', '纯音乐', '轻音乐', '钢琴', '吉他', '古典', '流行', '摇滚', '民谣', '港乐', '粤语', '古风', '经典'];
      for (const w of moodWords) {
        if (queryText.includes(w)) extractedKeywords.push(w);
      }
      
      let targetArtist = '';
      const commonArtists = ['周杰伦', '李克勤', '陈奕迅', '王菲', '林俊杰', '张学友', '莫文蔚', '孙燕姿', '梁静茹', '张惠妹', '薛之谦', '朴树', '许巍', '汪峰', '赵雷', '毛不易'];
      for (const a of commonArtists) {
        if (queryText.includes(a) || (a === '周杰伦' && queryText.includes('周董'))) {
          targetArtist = a;
          break;
        }
      }

      let targetSongTitle = '';
      if (queryText.includes('天青色') || queryText.includes('烟雨')) {
        targetSongTitle = '青花瓷';
        targetArtist = '周杰伦';
      }

      const isSpecificSong = Boolean(targetSongTitle);
      const isMoodScene = isMood && !isSpecificSong;

      intent = {
        isMoodOrScene: isMoodScene,
        moodSceneTitle: isMoodScene ? `${extractedKeywords[0] || '心境'}随心听电台` : '',
        keywords: extractedKeywords.length > 0 ? extractedKeywords : [queryText.slice(0, 4)],
        targetArtist,
        targetSongTitle,
        targetGenre: isMoodScene ? 'Instrumental / Acoustic' : '',
        suggestedTts: isMoodScene ? `好的，为您开启${extractedKeywords[0] || '专属'}心境电台` : '',
        queueTitle: isMoodScene ? `${extractedKeywords[0] || '心境'}随心听电台` : `${targetArtist || '音乐'}专属推荐电台`
      };
    }

    if (!intent || typeof intent !== 'object') {
      return { matched: false, reason: '意图提取未完成' };
    }

      // Stage 2: Local High-Performance Multi-Criteria Matching across 100% of library
      const scoredSongs = songs.map(song => {
        let score = 0;
        const title = (song.title || '').toLowerCase().trim();
        const artist = (song.artist || '').toLowerCase().trim();
        const album = (song.album || '').toLowerCase().trim();
        const genre = (song.genre || '').toLowerCase().trim();
        const lyrics = (song.lyrics || '').toLowerCase().trim();

        // 1. Target Song Title (Exact, Contains, or Pinyin)
        if (intent.targetSongTitle && intent.targetSongTitle.trim()) {
          const tTitle = intent.targetSongTitle.toLowerCase().trim();
          if (title === tTitle) {
            score += 200;
          } else if (title.includes(tTitle) || tTitle.includes(title)) {
            score += 130;
          } else {
            const pScore = computeSongMatchScore(song as any, tTitle);
            if (pScore >= 80) score += pScore;
          }
        }

        // 2. Target Artist (Exact, Contains, or Pinyin)
        if (intent.targetArtist && intent.targetArtist.trim()) {
          const tArtist = intent.targetArtist.toLowerCase().trim();
          if (artist === tArtist) {
            score += 160;
          } else if (artist.includes(tArtist) || tArtist.includes(artist)) {
            score += 110;
          } else {
            const pScore = computeSongMatchScore(song as any, tArtist);
            if (pScore >= 75) score += pScore * 0.8;
          }
        }

        // 3. Lyrics Snippet Match
        if (intent.targetLyricsSnippet && intent.targetLyricsSnippet.trim() && lyrics) {
          const snippet = intent.targetLyricsSnippet.toLowerCase().trim();
          if (lyrics.includes(snippet)) {
            score += 150;
          }
        }

        // 4. Genre / Style Match
        if (intent.targetGenre && intent.targetGenre.trim() && genre) {
          const tGenre = intent.targetGenre.toLowerCase().trim();
          if (genre.includes(tGenre) || tGenre.includes(genre)) {
            score += 60;
          }
        }

        // 5. Keyword Matches (across Title, Artist, Album, Genre, Lyrics)
        if (Array.isArray(intent.keywords) && intent.keywords.length > 0) {
          for (const kw of intent.keywords) {
            const kwLower = (kw || '').toLowerCase().trim();
            if (!kwLower) continue;
            if (title.includes(kwLower)) score += 40;
            if (artist.includes(kwLower)) score += 30;
            if (genre.includes(kwLower)) score += 45;
            if (album.includes(kwLower)) score += 20;
            if (lyrics && lyrics.includes(kwLower)) score += 30;

            // Character-level affinity for Chinese mood words (e.g. '雨' in 'Rainy' / '微雨' / '雨声')
            if (kwLower.includes('雨')) {
              if (title.includes('rain') || title.includes('雨') || lyrics.includes('雨')) score += 35;
            }
            if (kwLower.includes('书') || kwLower.includes('读') || kwLower.includes('静') || kwLower.includes('松') || kwLower.includes('眠')) {
              if (genre.includes('relax') || genre.includes('lofi') || genre.includes('lo-fi') || genre.includes('ambient') || genre.includes('acoustic')) score += 30;
            }
          }
        }

        // 6. Generic Ambient Mood Boost
        if (intent.isMoodOrScene) {
          if (genre.includes('relax') || genre.includes('lofi') || genre.includes('lo-fi') || genre.includes('ambient') || genre.includes('acoustic') || genre.includes('soundtrack')) {
            score += 20;
          }
        }

        return { song, score };
      });

      const matchedList = scoredSongs
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score);

      if (matchedList.length === 0) {
        return {
          matched: false,
          reason: `已理解意图为【${intent.targetSongTitle || intent.targetArtist || intent.moodSceneTitle || '特定风格'}】，但在本地曲库中未检索到匹配曲目`
        };
      }

      const primary = matchedList[0].song;

      // Check if user specifically requested a song, but we had to substitute another song by the artist
      const requestedTargetTitle = (intent.targetSongTitle || '').trim();
      const isMood = Boolean(intent.isMoodOrScene) && !requestedTargetTitle;
      const queueTitle = intent.queueTitle || intent.moodSceneTitle || (isMood ? '心境电台' : `${primary.title} 专属电台`);

      let queueSongs: any[] = [];
      if (isMood) {
        // Take up to 10 top scoring mood songs
        queueSongs = matchedList.slice(0, 10).map(m => m.song);
        // If fewer than 5 songs matched, supplement from same genre or favorite songs
        if (queueSongs.length < 5) {
          const existingIds = new Set(queueSongs.map(s => s.id));
          const supplements = songs.filter(s => !existingIds.has(s.id) && (s.genre === primary.genre || s.isFavorite)).slice(0, 5 - queueSongs.length);
          queueSongs.push(...supplements);
        }
      } else {
        // Specific song requested: place primary song first, then append other songs by same artist or genre
        queueSongs = [primary];
        const existingIds = new Set([primary.id]);
        
        // Find other songs by same artist
        const sameArtistSongs = songs.filter(s => !existingIds.has(s.id) && s.artist && s.artist === primary.artist).slice(0, 5);
        sameArtistSongs.forEach(s => {
          existingIds.add(s.id);
          queueSongs.push(s);
        });

        // If still fewer than 8, add same genre or favorite songs
        if (queueSongs.length < 8) {
          const sameGenreSongs = songs.filter(s => !existingIds.has(s.id) && s.genre && s.genre === primary.genre).slice(0, 8 - queueSongs.length);
          sameGenreSongs.forEach(s => {
            existingIds.add(s.id);
            queueSongs.push(s);
          });
        }
      }

      const primaryTitle = (primary.title || '').trim();
      const isTargetSongMatched = !requestedTargetTitle || 
        primaryTitle.toLowerCase().includes(requestedTargetTitle.toLowerCase()) || 
        requestedTargetTitle.toLowerCase().includes(primaryTitle.toLowerCase());

      let tts = intent.suggestedTts;

      if (!isMood && requestedTargetTitle && !isTargetSongMatched) {
        // The requested song was NOT found in local library, but we found other songs by the artist
        const artistName = primary.artist || intent.targetArtist || '该歌手';
        tts = `未找到您想要的歌曲《${requestedTargetTitle}》，为您播放${artistName}的其它歌曲《${primaryTitle}》`;
      } else if (!tts) {
        tts = isMood
          ? `好的，为您开启${queueTitle}，首曲播放${primary.artist}的《${primary.title}》`
          : `好的，为您播放${primary.artist}的《${primary.title}》`;
      }

      const result: AiVoiceMatchResult = {
        matched: true,
        isMoodQueue: true,
        queueTitle,
        primarySong: primary,
        playlistSongs: queueSongs,
        songId: primary.id,
        songTitle: primary.title,
        artist: primary.artist,
        reason: (!isMood && requestedTargetTitle && !isTargetSongMatched)
          ? `曲库未收录《${requestedTargetTitle}》，已智能为您推荐播放歌手【${primary.artist}】的其它歌曲《${primary.title}》`
          : isMood
          ? `命中心境标签【${intent.moodSceneTitle || intent.keywords?.slice(0, 3).join('/')}】(已创建 ${queueSongs.length} 首心境队列)`
          : `精准匹配: 歌手《${primary.artist}》/ 曲目《${primary.title}》(已附带 ${queueSongs.length} 首连续电台)`,
        ttsResponse: tts
      };

      // Save to semantic cache for future instant 0ms hits
      aiSemanticCache.set(queryText, result);

      return result;
  }

  /**
   * Natural Language to Scheduled Automation Scene Generator (Item 5)
   */
  public async generateAutomationScene(
    userPrompt: string,
    devices: Array<{ did: string; name: string; model?: string }>,
    playlists: Array<{ id: string; name: string }>
  ): Promise<AiAutomationResult> {
    const devicesContext = (devices || []).map(d => ({ did: d.did, name: d.name })).slice(0, 10);
    const playlistsContext = (playlists || []).map(p => ({ id: p.id, name: p.name })).slice(0, 10);

    const systemPrompt = `你是一个智能家居与家庭自动化场景编排专家。
用户的自然语言指令（例如：“工作日早上7点30分客厅音箱以35%音量播放早安轻音乐”、“每天晚上11点停止全屋播放”、“周末下午2点随机播放我的红心收藏歌单”），将其转化为标准的听澜家庭音乐系统自动化场景配置。

系统支持的可用设备列表:
${JSON.stringify(devicesContext, null, 2)}

系统支持的可用歌单列表:
${JSON.stringify(playlistsContext, null, 2)}

注意：
1. cronExpr 必须为标准 5 位 Cron 表达式 (分 时 日 月 周)，例如:
   - 每天 07:30 -> "30 07 * * *"
   - 工作日 (周一至周五) 07:30 -> "30 07 * * 1-5"
   - 周末 (周六周日) 22:00 -> "00 22 * * 0,6"
   - 每天晚上 23:00 -> "00 23 * * *"
2. actionType 仅支持: "play_playlist" | "play_radio" | "tts_announce" | "group_cast" | "stop_playback"
3. targetType 仅支持: "single_device" | "all_devices"
4. 若用户提到具体音箱（如客厅、主卧），从设备列表中匹配对应的 did。若未指定或提到“全屋”，设 targetType 为 "all_devices"。
5. volume 推荐 10 ~ 100 之间的整数（晨间推荐 30~40，助眠推荐 15~25）。

输出必须严格为 JSON 格式，不要包含任何 markdown 标记：
{
  "name": "场景名称 (带合适 emoji，如 ☀️ 工作日清晨唤醒)",
  "description": "场景详细功能描述",
  "cronExpr": "标准5段Cron表达式",
  "cronExplanation": "用自然语言解释触发周期 (如: 工作日 (周一至周五) 每天 07:30 触发)",
  "actionType": "play_playlist" 或 "play_radio" 或 "stop_playback" 或 "tts_announce",
  "targetType": "single_device" 或 "all_devices",
  "targetId": "匹配的设备did (单设备模式时填写，全屋模式可留空)",
  "payload": {
    "playlistId": "匹配的歌单id",
    "radioUrl": "音频流地址 (若为play_radio，可选用https://stream.zeno.fm/f3wvbbqmdg8uv)",
    "radioTitle": "电台名称",
    "ttsText": "温馨简短的播报词 (若有)",
    "volume": 35
  }
}`;

    const prompt = `用户自然语言编排需求: "${userPrompt}"\n请生成自动化场景配置 JSON:`;

    const res = await this.generateCompletion({
      prompt,
      systemPrompt,
      temperature: 0.2,
      maxTokens: 500
    });

    let cleanJson = res.text.trim();
    if (cleanJson.startsWith('```json')) {
      cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsed: AiAutomationResult = JSON.parse(cleanJson);
    return parsed;
  }

  /**
   * One-click AI Log Diagnosis for System & XiaoAi Stream Logs
   */
  public async diagnoseLogs(logs: any[]): Promise<AiDiagnosisResult> {
    const errorLogs = logs.filter(l => l.level === 'error' || l.level === 'warn' || !l.success).slice(0, 15);
    const recentLogs = logs.slice(0, 25);

    const logsContext = JSON.stringify({
      errorCount: errorLogs.length,
      sampleErrors: errorLogs.map(l => ({
        timestamp: l.timestamp || l.timeFormatted,
        level: l.level,
        category: l.category || l.type,
        title: l.title || l.message,
        message: l.message || l.detail,
        device: l.deviceName || l.model || l.did,
        clientIp: l.clientIp || l.ip,
        traceId: l.traceId
      })),
      recentStreamActivity: recentLogs.slice(0, 8).map(l => ({
        time: l.timeFormatted || l.timestamp,
        title: l.title || l.message,
        category: l.category
      }))
    }, null, 2);

    const systemPrompt = `你是一名精通 Linux 局域网音频串流、小米 MIoT/Mina 协议、DLNA、FFmpeg 转码及 HTTP 206 串流的资深系统架构专家。
分析提供的听澜家庭音乐系统诊断日志，用通俗、严谨、面向家庭用户的语言提供根因分析与实操建议。

输出必须严格为 JSON 格式，不要包含 markdown 代码块：
{
  "summary": "1句话概括系统健康度与核心现象",
  "rootCause": "精准的故障根因技术分析 (60字以内)",
  "recommendations": [
    "排查建议 1",
    "排查建议 2",
    "排查建议 3"
  ],
  "severity": "normal" 或 "warning" 或 "critical"
}`;

    const prompt = `待分析的系统与音箱流日志如下：
${logsContext}

请生成诊断结论 JSON:`;

    const res = await this.generateCompletion({
      prompt,
      systemPrompt,
      temperature: 0.2,
      maxTokens: 600
    });

    try {
      let cleanJson = res.text.trim();
      if (cleanJson.startsWith('```json')) {
        cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const parsed = JSON.parse(cleanJson);
      return {
        success: true,
        latencyMs: res.latencyMs,
        modelUsed: res.modelUsed,
        summary: parsed.summary || '系统运行平稳',
        rootCause: parsed.rootCause || '未检测到严重故障',
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : ['建议持续保持网络畅通'],
        severity: parsed.severity || 'normal'
      };
    } catch (e: any) {
      return {
        success: true,
        latencyMs: res.latencyMs,
        modelUsed: res.modelUsed,
        summary: 'AI 诊断完成',
        rootCause: res.text.slice(0, 120),
        recommendations: ['请检查局域网连接与音箱状态'],
        severity: 'warning'
      };
    }
  }

  /**
   * Musical Insight & Appreciation Generator
   */
  public async generateMusicInsight(title: string, artist?: string, genre?: string): Promise<string> {
    const prompt = `为歌曲《${title || '未命名'}》${artist ? `（艺术家：${artist}）` : ''}${genre ? `（流派：${genre}）` : ''}写一段简短优美（80字以内）的鉴赏语与情绪共鸣分析。语言温润感性，富有意境。`;
    const res = await this.generateCompletion({
      prompt,
      systemPrompt: '你是一位优雅深情的电台音乐品鉴主持人。',
      temperature: 0.7,
      maxTokens: 200
    });
    return res.text.trim();
  }
}

export const aiService = AiService.getInstance();
