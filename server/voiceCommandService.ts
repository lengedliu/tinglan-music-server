import fs from 'fs';
import path from 'path';
import { Song, Playlist } from '../src/types';
import { generateMinaRequestId, buildMinaHeaders } from './xiaomiPassport';
import { computeSongMatchScore } from './pinyinHelper';
import { xiaomiCircuitBreaker } from './circuitBreaker';

export interface VoiceCommandRule {
  id: string;
  name: string;
  triggerPhrases: string[];
  actionType: 'play_playlist' | 'play_random_all' | 'play_song_search' | 'control_command';
  targetPlaylistId?: string;
  controlAction?: 'next' | 'prev' | 'pause' | 'stop' | 'resume' | 'volume_up' | 'volume_down';
  ttsFeedback?: string;
  enabled: boolean;
}

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
  source?: 'speaker_mina_poll' | 'speaker_mina_ws' | 'test_manual';
  deviceId?: string;
  deviceName?: string;
  slangApplied?: boolean;
  slangTerm?: string;
  missedReason?: 'homophone_mismatch' | 'unknown_song' | 'slang_hotword' | 'no_rule_match' | 'low_confidence';
}

export interface VoiceListenerConfig {
  enabled: boolean;
  pollIntervalMs: number;
  targetDeviceId?: string;
  ttsFeedbackEnabled: boolean;
  adaptivePollingEnabled?: boolean;
  earlyInterceptionEnabled?: boolean;
  rules: VoiceCommandRule[];
}

const VOICE_CONFIG_FILE = path.join(process.cwd(), 'data', 'voice-config.json');
const VOICE_SLANG_FILE = path.join(process.cwd(), 'data', 'voice-slang.json');

const DEFAULT_SLANG_RULES: VoiceSlangRule[] = [
  {
    id: 'slang_zhoujielun_1',
    slangTerm: '周节轮',
    targetType: 'artist',
    targetValue: '周杰伦',
    notes: '语音同音错别字矫正',
    hitCount: 12,
    createdAt: Date.now() - 86400000 * 3
  },
  {
    id: 'slang_zhoujielun_2',
    slangTerm: '周董',
    targetType: 'artist',
    targetValue: '周杰伦',
    notes: '歌手常见江湖别称/黑话',
    hitCount: 8,
    createdAt: Date.now() - 86400000 * 2
  },
  {
    id: 'slang_xuezhiqian',
    slangTerm: '薛之潜',
    targetType: 'artist',
    targetValue: '薛之谦',
    notes: '语音同音错别字矫正',
    hitCount: 5,
    createdAt: Date.now() - 86400000 * 2
  },
  {
    id: 'slang_haige',
    slangTerm: '嗨歌',
    targetType: 'playlist',
    targetValue: 'favorites',
    notes: '曲风黑话自动定位收藏歌单',
    hitCount: 15,
    createdAt: Date.now() - 86400000
  }
];

const DEFAULT_RULES: VoiceCommandRule[] = [
  // 1. Precise Playback Controls first
  {
    id: 'rule_control_resume',
    name: '语音继续播放/恢复',
    triggerPhrases: ['继续播放', '恢复播放', '继续放', '开始播放', '继续放歌', '接着放', '接着唱'],
    actionType: 'control_command',
    controlAction: 'resume',
    ttsFeedback: '好的，继续播放',
    enabled: true
  },
  {
    id: 'rule_control_pause',
    name: '语音暂停/停止',
    triggerPhrases: ['暂停音乐', '别放了', '先别唱了', '停止播放', '闭嘴', '暂停', '停止', '安静', '别播了', '不要放了', '不听了'],
    actionType: 'control_command',
    controlAction: 'pause',
    ttsFeedback: '已暂停',
    enabled: true
  },
  {
    id: 'rule_control_next',
    name: '语音切歌 (下一首)',
    triggerPhrases: ['切歌', '换一首', '不要这首', '下一曲', '下一首', '下个歌', '跳过这首', '下一个', '换首歌', '换首'],
    actionType: 'control_command',
    controlAction: 'next',
    ttsFeedback: '好的，下一首',
    enabled: true
  },
  {
    id: 'rule_control_prev',
    name: '语音切歌 (上一首)',
    triggerPhrases: ['上一首', '上一曲', '重播上一首', '回到上一首', '上一个歌', '上一个', '倒回去'],
    actionType: 'control_command',
    controlAction: 'prev',
    ttsFeedback: '好的，上一首',
    enabled: true
  },
  {
    id: 'rule_control_volume_up',
    name: '调大音量',
    triggerPhrases: ['调大音量', '大点声', '声音大一点', '大声一点', '音量加', '加大音量', '大点声音', '调高音量'],
    actionType: 'control_command',
    controlAction: 'volume_up',
    ttsFeedback: '音量已调大',
    enabled: true
  },
  {
    id: 'rule_control_volume_down',
    name: '调小音量',
    triggerPhrases: ['调小音量', '小点声', '声音小一点', '小声一点', '音量减', '减小音量', '小点声音', '调低音量'],
    actionType: 'control_command',
    controlAction: 'volume_down',
    ttsFeedback: '音量已调小',
    enabled: true
  },
  // 2. Playlists & Random playback
  {
    id: 'rule_play_favorites',
    name: '播放我喜欢的音乐',
    triggerPhrases: ['播放收藏', '放我喜欢的歌', '我喜欢的歌', '播放我喜欢', '放收藏', '听我喜欢的歌', '放我喜欢的音乐', '播放红心歌曲', '放红心'],
    actionType: 'play_playlist',
    targetPlaylistId: 'favorites',
    ttsFeedback: '好的，为您播放喜欢的音乐',
    enabled: true
  },
  {
    id: 'rule_play_random',
    name: '随机播放全部',
    triggerPhrases: ['随便放点歌', '随机播放', '随心听', '随便听听', '随便放首歌', '来点音乐', '随便放', '随便播', '随便放点', '放点音乐'],
    actionType: 'play_random_all',
    ttsFeedback: '好的，为您随机播放音乐',
    enabled: true
  },
  {
    id: 'rule_play_default_playlist',
    name: '播放当前/默认歌单',
    triggerPhrases: ['播放本地歌单', '放本地歌', '播放私房歌', '播放我的歌单', '播放默认歌单', '放歌单', '播放歌曲库'],
    actionType: 'play_playlist',
    targetPlaylistId: 'default',
    ttsFeedback: '好的，正在播放歌单',
    enabled: true
  },
  // 3. Intelligent song search (matched after high-priority controls)
  {
    id: 'rule_search_song',
    name: '智能搜歌点歌',
    triggerPhrases: ['点歌', '来一首', '放一首', '我想听', '播放歌曲', '来首', '放首', '听', '放', '播', '搜', '来一曲', '放一曲'],
    actionType: 'play_song_search',
    ttsFeedback: '好的，为您播放 {title}',
    enabled: true
  }
];

export class VoiceCommandService {
  private static instance: VoiceCommandService;

  private config: VoiceListenerConfig = {
    enabled: true,
    pollIntervalMs: 2500,
    ttsFeedbackEnabled: true,
    adaptivePollingEnabled: true,
    earlyInterceptionEnabled: true,
    rules: DEFAULT_RULES
  };

  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private lastProcessedRecordId: string | null = null;
  private lastProcessedTimestamp: number = Date.now() - 5000;
  private dialogueLogs: VoiceDialogueLog[] = [];
  private consecutiveErrors = 0;
  private lastSeenQuery = '';
  private lastSeenQueryTime = 0;
  private recentCommands: Map<string, number> = new Map();

  // Adaptive polling state
  private lastDialogueDetectedTime = 0;
  private burstPollingUntil = 0;
  private currentActualIntervalMs = 2500;

  // External bindings provided by server.ts
  private getSongsFn: (() => Song[]) | null = null;
  private getPlaylistsFn: (() => Playlist[]) | null = null;
  private playSongFn: ((song: Song, playlistName?: string, deviceId?: string) => Promise<boolean>) | null = null;
  private playPlaylistFn: ((playlistId: string, deviceId?: string) => Promise<boolean>) | null = null;
  private controlPlaybackFn: ((action: 'next' | 'prev' | 'pause' | 'stop' | 'resume' | 'volume_up' | 'volume_down', deviceId?: string) => Promise<boolean | { success: boolean; song?: any; message?: string }>) | null = null;
  private earlyStopFn: ((deviceId?: string) => Promise<any>) | null = null;
  private sendTtsFn: ((deviceId: string, text: string) => Promise<any>) | null = null;
  private getAuthInfoFn: (() => { userId?: string; serviceToken?: string; devices: any[] }) | null = null;

  private slangRules: VoiceSlangRule[] = DEFAULT_SLANG_RULES;

  private constructor() {
    this.loadConfig();
    this.loadSlangRules();
  }

  public static getInstance(): VoiceCommandService {
    if (!VoiceCommandService.instance) {
      VoiceCommandService.instance = new VoiceCommandService();
    }
    return VoiceCommandService.instance;
  }

  private loadConfig() {
    try {
      if (fs.existsSync(VOICE_CONFIG_FILE)) {
        const raw = fs.readFileSync(VOICE_CONFIG_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          const loadedRules: VoiceCommandRule[] = Array.isArray(parsed.rules) ? parsed.rules : [];
          const existingIds = new Set(loadedRules.map(r => r.id));
          const mergedRules = [...loadedRules];
          for (const defRule of DEFAULT_RULES) {
            if (!existingIds.has(defRule.id)) {
              mergedRules.push(defRule);
            }
          }

          this.config = {
            ...this.config,
            ...parsed,
            rules: mergedRules
          };
        }
      }
    } catch (err: any) {
      console.warn('[VoiceCommandService] Failed to load voice-config.json:', err.message);
    }
  }

  private saveConfig() {
    try {
      const dir = path.dirname(VOICE_CONFIG_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(VOICE_CONFIG_FILE, JSON.stringify(this.config, null, 2), 'utf8');
    } catch (err: any) {
      console.warn('[VoiceCommandService] Failed to save voice-config.json:', err.message);
    }
  }

  private loadSlangRules() {
    try {
      if (fs.existsSync(VOICE_SLANG_FILE)) {
        const raw = fs.readFileSync(VOICE_SLANG_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.slangRules = parsed;
        }
      }
    } catch (err: any) {
      console.warn('[VoiceCommandService] Failed to load voice-slang.json:', err.message);
    }
  }

  private saveSlangRules() {
    try {
      const dir = path.dirname(VOICE_SLANG_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(VOICE_SLANG_FILE, JSON.stringify(this.slangRules, null, 2), 'utf8');
    } catch (err: any) {
      console.warn('[VoiceCommandService] Failed to save voice-slang.json:', err.message);
    }
  }

  public getSlangRules(): VoiceSlangRule[] {
    return [...this.slangRules];
  }

  public addOrUpdateSlangRule(rule: Partial<VoiceSlangRule> & { slangTerm: string; targetValue: string }): VoiceSlangRule {
    const existingIndex = this.slangRules.findIndex(r => r.id === rule.id || r.slangTerm.toLowerCase() === rule.slangTerm.toLowerCase());
    
    if (existingIndex !== -1) {
      const updated: VoiceSlangRule = {
        ...this.slangRules[existingIndex],
        ...rule,
        id: this.slangRules[existingIndex].id
      };
      this.slangRules[existingIndex] = updated;
      this.saveSlangRules();
      return updated;
    } else {
      const newRule: VoiceSlangRule = {
        id: rule.id || `slang_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        slangTerm: rule.slangTerm.trim(),
        targetType: rule.targetType || 'artist',
        targetValue: rule.targetValue.trim(),
        notes: rule.notes || '',
        hitCount: rule.hitCount || 0,
        createdAt: Date.now()
      };
      this.slangRules.unshift(newRule);
      this.saveSlangRules();
      return newRule;
    }
  }

  public deleteSlangRule(id: string): boolean {
    const initialLen = this.slangRules.length;
    this.slangRules = this.slangRules.filter(r => r.id !== id);
    if (this.slangRules.length !== initialLen) {
      this.saveSlangRules();
      return true;
    }
    return false;
  }

  public getMissedAnalytics() {
    const totalLogs = this.dialogueLogs.length;
    const matchedCount = this.dialogueLogs.filter(l => l.status === 'matched').length;
    const missedLogs = this.dialogueLogs.filter(l => l.status === 'ignored' || l.status === 'error');
    const missedCount = missedLogs.length;

    const hitRate = totalLogs > 0 ? Math.round((matchedCount / totalLogs) * 100) : 100;

    // Aggregated top missed terms
    const missedMap = new Map<string, { term: string; count: number; lastTime: number; devices: Set<string>; reason: string }>();

    for (const log of missedLogs) {
      const cleanTerm = log.queryText
        .replace(/^(小爱同学|小爱|给我|帮我|我想听|听|放|播)/i, '')
        .trim() || log.queryText;

      if (!cleanTerm) continue;

      const existing = missedMap.get(cleanTerm);
      if (existing) {
        existing.count += 1;
        existing.lastTime = Math.max(existing.lastTime, log.timestamp);
        if (log.deviceName) existing.devices.add(log.deviceName);
      } else {
        missedMap.set(cleanTerm, {
          term: cleanTerm,
          count: 1,
          lastTime: log.timestamp,
          devices: new Set(log.deviceName ? [log.deviceName] : []),
          reason: log.missedReason || 'no_rule_match'
        });
      }
    }

    const topMissed = Array.from(missedMap.values())
      .map(item => ({
        term: item.term,
        count: item.count,
        lastTime: item.lastTime,
        devices: Array.from(item.devices),
        reason: item.reason
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // Reason breakdown
    const reasonBreakdown = {
      homophone_mismatch: missedLogs.filter(l => l.missedReason === 'homophone_mismatch').length,
      unknown_song: missedLogs.filter(l => l.missedReason === 'unknown_song').length,
      slang_hotword: missedLogs.filter(l => l.missedReason === 'slang_hotword').length,
      no_rule_match: missedLogs.filter(l => l.missedReason === 'no_rule_match' || !l.missedReason).length,
      low_confidence: missedLogs.filter(l => l.missedReason === 'low_confidence').length
    };

    return {
      totalLogs,
      matchedCount,
      missedCount,
      hitRatePercent: hitRate,
      topMissed,
      reasonBreakdown,
      recentMissedLogs: missedLogs.slice(0, 30)
    };
  }

  public bindCallbacks(options: {
    getSongs: () => Song[];
    getPlaylists: () => Playlist[];
    playSong: (song: Song, playlistName?: string, deviceId?: string) => Promise<boolean>;
    playPlaylist: (playlistId: string, deviceId?: string) => Promise<boolean>;
    controlPlayback: (action: 'next' | 'prev' | 'pause' | 'stop' | 'resume' | 'volume_up' | 'volume_down', deviceId?: string) => Promise<boolean | { success: boolean; song?: Song | null; message?: string }>;
    earlyStop?: (deviceId?: string) => Promise<any>;
    sendTts: (deviceId: string, text: string) => Promise<any>;
    getAuthInfo: () => { userId?: string; serviceToken?: string; devices: any[] };
  }) {
    this.getSongsFn = options.getSongs;
    this.getPlaylistsFn = options.getPlaylists;
    this.playSongFn = options.playSong;
    this.playPlaylistFn = options.playPlaylist;
    this.controlPlaybackFn = options.controlPlayback;
    this.earlyStopFn = options.earlyStop || null;
    this.sendTtsFn = options.sendTts;
    this.getAuthInfoFn = options.getAuthInfo;

    // Auto-start if config enabled
    if (this.config.enabled && !this.isRunning) {
      this.start();
    }
  }

  public getConfig(): VoiceListenerConfig {
    return { ...this.config };
  }

  public updateConfig(partial: Partial<VoiceListenerConfig>) {
    this.config = { ...this.config, ...partial };
    this.saveConfig();
    if (this.config.enabled && !this.isRunning) {
      this.start();
    } else if (!this.config.enabled && this.isRunning) {
      this.stop();
    }
  }

  public getDialogueLogs(): VoiceDialogueLog[] {
    return this.dialogueLogs.slice(0, 50);
  }

  public clearLogs() {
    this.dialogueLogs = [];
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.config.enabled = true;
    this.saveConfig();
    this.lastProcessedTimestamp = Date.now() - 5000;
    this.boostToBurstMode(20000);
    this.pollLoop();
    console.log('[VoiceCommandService] 🎙️ 小爱语音口令自适应捕获引擎已启动 (含拼音容错与自适应动态退避)');
  }

  public stop() {
    this.isRunning = false;
    this.config.enabled = false;
    this.saveConfig();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log('[VoiceCommandService] ⏸️ 小爱语音口令引擎已暂停');
  }

  /**
   * Boost polling to high-speed burst mode (800ms) for responsiveness
   */
  public boostToBurstMode(durationMs = 45000) {
    const now = Date.now();
    this.lastDialogueDetectedTime = now;
    this.burstPollingUntil = Math.max(this.burstPollingUntil, now + durationMs);
  }

  /**
   * Calculate current polling interval based on activity level
   */
  private computeDynamicInterval(): { intervalMs: number; mode: 'burst' | 'active' | 'idle' | 'standby' } {
    if (this.config.adaptivePollingEnabled === false) {
      return { intervalMs: this.config.pollIntervalMs || 2500, mode: 'active' };
    }

    const now = Date.now();
    if (now < this.burstPollingUntil) {
      return { intervalMs: 800, mode: 'burst' };
    }

    const timeSinceLastDialogue = now - this.lastDialogueDetectedTime;
    if (timeSinceLastDialogue < 180000) { // < 3 minutes
      return { intervalMs: 2000, mode: 'active' };
    } else if (timeSinceLastDialogue < 600000) { // 3 ~ 10 minutes
      return { intervalMs: 4500, mode: 'idle' };
    } else { // > 10 minutes deep standby
      return { intervalMs: 6500, mode: 'standby' };
    }
  }

  public getStatus() {
    const auth = this.getAuthInfoFn ? this.getAuthInfoFn() : null;
    const hasAuth = Boolean(auth && auth.userId && auth.serviceToken);
    const dynamic = this.computeDynamicInterval();
    const now = Date.now();

    return {
      isRunning: this.isRunning,
      enabled: this.config.enabled,
      isLoggedIn: hasAuth,
      pollIntervalMs: dynamic.intervalMs,
      configuredPollIntervalMs: this.config.pollIntervalMs,
      pollingMode: dynamic.mode,
      burstRemainingSec: Math.max(0, Math.round((this.burstPollingUntil - now) / 1000)),
      timeSinceLastDialogueSec: this.lastDialogueDetectedTime > 0 ? Math.round((now - this.lastDialogueDetectedTime) / 1000) : null,
      adaptivePollingEnabled: this.config.adaptivePollingEnabled !== false,
      earlyInterceptionEnabled: this.config.earlyInterceptionEnabled !== false,
      targetDeviceId: this.config.targetDeviceId || null,
      rulesCount: this.config.rules.length,
      logsCount: this.dialogueLogs.length,
      lastProcessedTime: this.lastProcessedTimestamp
    };
  }

  /**
   * Real-time WebSocket dialogue push bridge from minaWsClient
   */
  public async onDialogueEvent(query: string, deviceId?: string, deviceName?: string) {
    if (!query || typeof query !== 'string') return;
    const now = Date.now();
    const clean = query.trim();
    if (!clean) return;

    this.boostToBurstMode(45000);

    // Suppress duplicates within 3s window
    if (this.lastSeenQuery === clean && now - this.lastSeenQueryTime < 3000) {
      return;
    }
    this.lastSeenQuery = clean;
    this.lastSeenQueryTime = now;

    console.log(`[VoiceCommandService] ⚡ 收到 Mina WebSocket 实时语音对话: “${clean}”`);
    await this.processVoiceQuery(clean, deviceId, deviceName, 'speaker_mina_ws');
  }

  /**
   * Manual or periodic poll trigger returning execution report
   */
  public async pollNow(): Promise<{ success: boolean; message: string; recordsFound: number; lastQuery?: string }> {
    this.boostToBurstMode(30000);
    if (!this.getAuthInfoFn) {
      return { success: false, message: '未挂载小米音箱认证服务', recordsFound: 0 };
    }
    const auth = this.getAuthInfoFn();
    if (!auth || !auth.userId || !auth.serviceToken) {
      return { success: false, message: '尚未绑定小米账号或登录已过期，请在【设备与连接】中登录', recordsFound: 0 };
    }

    try {
      const records = await this.pollLatestConversations();
      return {
        success: true,
        message: records && records.length > 0 ? `成功从音箱云端同步 ${records.length} 条对话` : '已查询小爱音箱云端，暂无新对话记录',
        recordsFound: records ? records.length : 0,
        lastQuery: records?.[0]?.query
      };
    } catch (err: any) {
      return {
        success: false,
        message: `从音箱云端拉取对话失败: ${err.message}`,
        recordsFound: 0
      };
    }
  }

  private async pollLoop() {
    if (!this.isRunning) return;

    let nextInterval = 2500;

    // Check circuit breaker before polling
    const canReq = xiaomiCircuitBreaker.canRequest('mina_poll');
    if (!canReq.allowed) {
      const waitMs = (canReq.cooldownRemainingSec || 30) * 1000;
      nextInterval = Math.max(15000, waitMs);
      this.currentActualIntervalMs = nextInterval;
      console.log(`[VoiceCommandService] 🛡️ 熔断保护/滑块拦截生效中，语音轮询暂停 ${Math.ceil(nextInterval / 1000)} 秒 (${canReq.reason || '等待冷却'})`);
      if (this.isRunning) {
        this.timer = setTimeout(() => this.pollLoop(), nextInterval);
      }
      return;
    }

    try {
      await this.pollLatestConversations();
      this.consecutiveErrors = 0;
      const dynamic = this.computeDynamicInterval();
      nextInterval = dynamic.intervalMs;
      this.currentActualIntervalMs = nextInterval;
    } catch (err: any) {
      this.consecutiveErrors++;
      const backoff = Math.min(30000, 3000 * Math.pow(1.4, Math.min(this.consecutiveErrors, 5)));
      nextInterval = backoff;
    }

    if (this.isRunning) {
      this.timer = setTimeout(() => this.pollLoop(), nextInterval);
    }
  }

  /**
   * Fetch conversation records using official XiaoAi Mina endpoint
   */
  private async fetchMinaConversations(userId: string, serviceToken: string, hardware: string, targetSpeakerDeviceId?: string, limit = 2): Promise<any[]> {
    const timestamp = Date.now();
    const requestId = generateMinaRequestId();
    const cleanHardware = (hardware || 'L16A').replace(/[^a-zA-Z0-9_-]/g, '');

    const candidateUrls = [
      `https://userprofile.mina.mi.com/device_profile/v2/conversation?source=dialogu&hardware=${encodeURIComponent(cleanHardware)}&timestamp=${timestamp}&limit=${limit}`,
      `https://userprofile.mina.mi.com/device_profile/v2/conversation?source=dialogu&timestamp=${timestamp}&limit=${limit}`,
      `https://userprofile.mina.mi.com/device_profile/v2/conversation?timestamp=${timestamp}&limit=${limit}`,
      `https://api2.mina.mi.com/admin/v2/conversation_records?limit=${limit}&requestId=${requestId}&timestamp=${timestamp}`
    ];

    const headers = buildMinaHeaders(userId, serviceToken, targetSpeakerDeviceId);

    let lastError: Error | null = null;
    for (const url of candidateUrls) {
      try {
        const res = await fetch(url, {
          headers,
          signal: AbortSignal.timeout(4500)
        });

        if (!res.ok) {
          if (res.status === 401 || res.status === 429 || res.status === 403) {
            xiaomiCircuitBreaker.recordFailure(`Mina Cloud HTTP ${res.status}`, res.status);
            console.warn(`[VoiceCommandService] ⚠️ Mina 云端响应异常 (HTTP ${res.status})，已记录至风控熔断器`);
          }
          continue;
        }

        const json: any = await res.json();
        if (!json) continue;

        if (json.code === 70016 || json.code === 87001 || json.captchaUrl) {
          xiaomiCircuitBreaker.recordFailure('Geetest captcha required', 403, json);
          return [];
        }

        let records: any[] = [];
        if (json.data) {
          let parsedData = json.data;
          if (typeof parsedData === 'string') {
            try {
              parsedData = JSON.parse(parsedData);
            } catch {}
          }
          if (parsedData && Array.isArray(parsedData.records)) {
            records = parsedData.records;
          }
        } else if (Array.isArray(json.records)) {
          records = json.records;
        }

        if (Array.isArray(records)) {
          xiaomiCircuitBreaker.recordSuccess();
          return records;
        }
      } catch (err: any) {
        lastError = err;
      }
    }

    if (lastError) {
      xiaomiCircuitBreaker.recordFailure(lastError);
      throw lastError;
    }
    return [];
  }

  private async pollLatestConversations(): Promise<any[]> {
    if (!this.getAuthInfoFn) return [];
    const auth = this.getAuthInfoFn();
    if (!auth || !auth.userId || !auth.serviceToken) return [];

    const devices = auth.devices || [];
    if (devices.length === 0) return [];

    let targetDevice = devices.find(d => d.did === this.config.targetDeviceId || d.deviceID === this.config.targetDeviceId);
    if (!targetDevice) {
      targetDevice = devices[0];
    }
    if (!targetDevice) return [];

    const deviceId = targetDevice.did;
    const deviceName = targetDevice.name || targetDevice.model || '小爱音箱';
    const hardware = targetDevice.hardware || targetDevice.model?.split('.').pop()?.toUpperCase() || 'L16A';
    const hardwareDeviceId = (targetDevice as any).deviceID || (targetDevice as any).hardwareDeviceId || (targetDevice.did && !targetDevice.did.startsWith('did-') ? targetDevice.did : undefined);

    const records = await this.fetchMinaConversations(auth.userId, auth.serviceToken, hardware, hardwareDeviceId, 3);
    if (!records || records.length === 0) {
      return [];
    }

    const latestRecord = records[0];
    const recordId = String(latestRecord.recordId || latestRecord.id || `${latestRecord.time}_${latestRecord.query}`);
    const rawTime = Number(latestRecord.time || 0);
    const recordTime = rawTime > 1e11 ? rawTime : rawTime * 1000;
    const query = String(latestRecord.query || latestRecord.text || '').trim();

    if (!query) return records;

    // Prevent duplicate processing
    if (this.lastProcessedRecordId === recordId || (recordTime > 0 && recordTime <= this.lastProcessedTimestamp)) {
      return records;
    }

    this.lastProcessedRecordId = recordId;
    if (recordTime > 0) {
      this.lastProcessedTimestamp = recordTime;
    }

    this.boostToBurstMode(45000);

    console.log(`[VoiceCommandService] 🎙️ 音箱云端捕获新语音: “${query}” (设备: ${deviceName})`);
    await this.processVoiceQuery(query, deviceId, deviceName, 'speaker_mina_poll');
    return records;
  }

  /**
   * Process and match voice query against rules with intelligent priority and phonetics
   */
  public async processVoiceQuery(
    query: string,
    deviceId?: string,
    deviceName?: string,
    source: 'speaker_mina_poll' | 'speaker_mina_ws' | 'test_manual' = 'test_manual'
  ): Promise<{ matched: boolean; summary: string }> {
    const rawQuery = String(query || '').trim();
    if (!rawQuery) {
      return { matched: false, summary: '语音内容为空' };
    }

    this.boostToBurstMode(45000);

    // 1. Clean wake words, polite prefixes & punctuation
    let cleanQuery = rawQuery
      .replace(/^[，。！？!?~\s]+|[，。！？!?~\s]+$/g, '')
      .replace(/^(小爱同学|小爱|给我|帮我|请帮我|麻烦|我想|我想听听|我想听|请|立刻|马上|能不能|麻烦你)[\s，,。！!:]*/i, '')
      .trim();

    if (!cleanQuery) cleanQuery = rawQuery;

    // Check Voice Slang Dictionary (黑话/同音字/别名库) transformation
    let slangApplied = false;
    let matchedSlangTerm = '';
    
    for (const slangRule of this.slangRules) {
      if (!slangRule.slangTerm) continue;
      const termLower = slangRule.slangTerm.toLowerCase();
      if (cleanQuery.toLowerCase().includes(termLower)) {
        slangApplied = true;
        matchedSlangTerm = slangRule.slangTerm;
        slangRule.hitCount = (slangRule.hitCount || 0) + 1;
        this.saveSlangRules();

        // Perform replacement based on slang type
        if (slangRule.targetType === 'artist' || slangRule.targetType === 'song') {
          cleanQuery = cleanQuery.replace(new RegExp(slangRule.slangTerm, 'gi'), slangRule.targetValue);
        } else if (slangRule.targetType === 'playlist') {
          cleanQuery = `播放 ${slangRule.targetValue}`;
        }
        break; // apply highest priority matching slang
      }
    }

    // Idempotency de-duplication: prevent double execution from concurrent Mina WS and Mina cloud poll
    const dedupeKey = `${cleanQuery.toLowerCase()}_${deviceId || 'any'}`;
    const now = Date.now();
    const lastTrigger = this.recentCommands.get(dedupeKey);
    if (source !== 'test_manual' && lastTrigger && (now - lastTrigger < 5000)) {
      console.log(`[VoiceCommandService] ⏳ 忽略5秒内重复语音指令: “${rawQuery}” (来源: ${source})`);
      return { matched: false, summary: '重复语音指令（5秒内已处理，自动去重忽略）' };
    }
    this.recentCommands.set(dedupeKey, now);

    // Housekeep dedupe map
    if (this.recentCommands.size > 100) {
      for (const [k, ts] of this.recentCommands.entries()) {
        if (now - ts > 30000) this.recentCommands.delete(k);
      }
    }

    // Sort rules by specificity (control & playlist commands have higher priority than generic search)
    const enabledRules = [...this.config.rules.filter(r => r.enabled)].sort((a, b) => {
      if (a.actionType === 'play_song_search' && b.actionType !== 'play_song_search') return 1;
      if (b.actionType === 'play_song_search' && a.actionType !== 'play_song_search') return -1;
      return 0;
    });

    for (const rule of enabledRules) {
      const sortedPhrases = [...rule.triggerPhrases].sort((a, b) => b.length - a.length);

      const matchedPhrase = sortedPhrases.find(phrase => {
        const p = phrase.toLowerCase().trim();
        if (!p) return false;
        if (p.length === 1) {
          return cleanQuery.startsWith(p);
        }
        return cleanQuery.startsWith(p) || cleanQuery.includes(p);
      });

      if (!matchedPhrase) continue;

      let param = '';
      const phraseIdx = cleanQuery.indexOf(matchedPhrase.toLowerCase());
      if (phraseIdx !== -1) {
        param = cleanQuery.slice(phraseIdx + matchedPhrase.length).trim();
      }
      param = param.replace(/^(一下|一首|点|首|首歌曲|首歌|关于|音乐)/, '').trim();

      // Early Interception: Instant early stop to prevent official audio overlap
      if (this.config.earlyInterceptionEnabled !== false && this.earlyStopFn && rule.actionType !== 'control_command') {
        this.earlyStopFn(deviceId).catch(() => {});
      }

      try {
        const result = await this.executeRuleAction(rule, param, deviceId);

        this.addLog({
          id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          timestamp: Date.now(),
          queryText: rawQuery,
          matchedRuleId: rule.id,
          matchedRuleName: rule.name,
          actionSummary: result.summary,
          status: 'matched',
          source,
          deviceId,
          deviceName,
          slangApplied,
          slangTerm: matchedSlangTerm
        });

        return { matched: true, summary: result.summary };
      } catch (err: any) {
        this.addLog({
          id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          timestamp: Date.now(),
          queryText: rawQuery,
          matchedRuleId: rule.id,
          matchedRuleName: rule.name,
          actionSummary: `执行失败: ${err.message}`,
          status: 'error',
          source,
          deviceId,
          deviceName,
          slangApplied,
          slangTerm: matchedSlangTerm,
          missedReason: err.message.includes('未检索到') ? 'unknown_song' : 'low_confidence'
        });
        return { matched: false, summary: err.message };
      }
    }

    // Determine missed reason for no rule matched
    let missedReason: 'homophone_mismatch' | 'unknown_song' | 'slang_hotword' | 'no_rule_match' | 'low_confidence' = 'no_rule_match';
    if (rawQuery.includes('唱') || rawQuery.includes('听') || rawQuery.includes('放') || rawQuery.includes('曲')) {
      missedReason = 'slang_hotword';
    }

    // No rule matched
    this.addLog({
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      queryText: rawQuery,
      status: 'ignored',
      actionSummary: '未命中私有音乐语音指令 (已由小爱系统原生处理)',
      source,
      deviceId,
      deviceName,
      slangApplied,
      slangTerm: matchedSlangTerm,
      missedReason
    });

    return { matched: false, summary: '未命中私有音乐指令' };
  }

  private async executeRuleAction(rule: VoiceCommandRule, param: string, deviceId?: string): Promise<{ success: boolean; summary: string }> {
    switch (rule.actionType) {
      case 'play_song_search': {
        const songs = this.getSongsFn ? this.getSongsFn() : [];
        if (songs.length === 0) {
          throw new Error('当前曲库中暂无可用歌曲');
        }

        const cleanParam = param.trim();
        const matchResult = this.fuzzyFindSongWithScore(songs, cleanParam);
        if (!matchResult || !matchResult.song) {
          throw new Error(`曲库中未检索到与「${cleanParam || '推荐'}」匹配的曲目`);
        }

        const targetSong = matchResult.song;

        if (this.config.ttsFeedbackEnabled && rule.ttsFeedback && deviceId && this.sendTtsFn) {
          const tts = rule.ttsFeedback.replace('{title}', `${targetSong.title}`);
          await this.sendTtsFn(deviceId, tts).catch(() => {});
          await new Promise(r => setTimeout(r, 1000));
        }

        if (this.playSongFn) {
          await this.playSongFn(targetSong, '语音点歌', deviceId);
        }

        return {
          success: true,
          summary: `已点播曲目:《${targetSong.title}》- ${targetSong.artist || '本地曲目'} (匹配评分: ${matchResult.score}分)`
        };
      }

      case 'play_random_all': {
        const songs = this.getSongsFn ? this.getSongsFn() : [];
        if (songs.length === 0) throw new Error('曲库为空');

        const randomIndex = Math.floor(Math.random() * songs.length);
        const randomSong = songs[randomIndex];

        if (this.config.ttsFeedbackEnabled && rule.ttsFeedback && deviceId && this.sendTtsFn) {
          const tts = rule.ttsFeedback.replace('{title}', randomSong.title);
          await this.sendTtsFn(deviceId, tts).catch(() => {});
          await new Promise(r => setTimeout(r, 900));
        }

        if (this.playSongFn) {
          await this.playSongFn(randomSong, '随机播放全部', deviceId);
        }

        return {
          success: true,
          summary: `随机起播:《${randomSong.title}》(${randomIndex + 1}/${songs.length})`
        };
      }

      case 'play_playlist': {
        const playlists = this.getPlaylistsFn ? this.getPlaylistsFn() : [];
        const playlistId = rule.targetPlaylistId || 'default';
        const targetPl = playlists.find(p => p.id === playlistId) || playlists[0];

        if (this.config.ttsFeedbackEnabled && rule.ttsFeedback && deviceId && this.sendTtsFn) {
          const plName = targetPl ? targetPl.name : (playlistId === 'favorites' ? '我喜欢的音乐' : '歌单');
          const tts = rule.ttsFeedback.replace('{playlist}', plName);
          await this.sendTtsFn(deviceId, tts).catch(() => {});
          await new Promise(r => setTimeout(r, 900));
        }

        if (this.playPlaylistFn && targetPl) {
          await this.playPlaylistFn(targetPl.id, deviceId);
        }

        return {
          success: true,
          summary: `已投播歌单:《${targetPl ? targetPl.name : '默认歌单'}》`
        };
      }

      case 'control_command': {
        if (!rule.controlAction) throw new Error('未定义播控动作');
        let newSongTitle = '';
        let resultMsg = '';
        if (this.controlPlaybackFn) {
          const res: any = await this.controlPlaybackFn(rule.controlAction, deviceId);
          if (res && typeof res === 'object') {
            if (res.song && res.song.title) {
              newSongTitle = res.song.title;
            }
            if (res.message) {
              resultMsg = res.message;
            }
          }
        }

        let feedbackText = rule.ttsFeedback;
        if (newSongTitle && (rule.controlAction === 'next' || rule.controlAction === 'prev')) {
          feedbackText = `${rule.ttsFeedback}，《${newSongTitle}》`;
        }

        if (this.config.ttsFeedbackEnabled && feedbackText && deviceId && this.sendTtsFn) {
          await this.sendTtsFn(deviceId, feedbackText).catch(() => {});
        }

        const actionNames: Record<string, string> = {
          next: newSongTitle ? `切歌至下一首:《${newSongTitle}》` : '切歌至下一首',
          prev: newSongTitle ? `切歌至上一首:《${newSongTitle}》` : '切歌至上一首',
          pause: '暂停播放',
          stop: '停止播放',
          resume: '继续播放',
          volume_up: '音量调大 +10%',
          volume_down: '音量调小 -10%'
        };

        return {
          success: true,
          summary: resultMsg || `已执行播控指令: ${actionNames[rule.controlAction] || rule.controlAction}`
        };
      }

      default:
        throw new Error('未知的指令动作类型');
    }
  }

  /**
   * Advanced Multi-Tiered Fuzzy & Phonetic Song Search Engine
   */
  public fuzzyFindSongWithScore(songs: Song[], rawKeyword: string): { song: Song; score: number } | null {
    if (songs.length === 0) return null;
    if (!rawKeyword || !rawKeyword.trim()) {
      return { song: songs[0], score: 50 };
    }

    let kw = rawKeyword.toLowerCase().trim();
    kw = kw.replace(/^(一下|一首|点|首|首歌曲|首歌|关于|给我放|帮我放|我想听)/, '').trim();
    kw = kw.replace(/(的歌|这首歌|这首|歌曲|那首歌|唱的歌|唱的)$/, '').trim();

    if (!kw) return { song: songs[0], score: 50 };

    // 1. Handle "歌手唱的歌名" or "歌手的歌名"
    if (kw.includes('唱的') || kw.includes('的')) {
      const splitToken = kw.includes('唱的') ? '唱的' : '的';
      const parts = kw.split(splitToken).map(s => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const [artistPart, titlePart] = parts;
        const bothMatch = songs.find(s =>
          (s.artist || '').toLowerCase().includes(artistPart) && s.title.toLowerCase().includes(titlePart)
        );
        if (bothMatch) return { song: bothMatch, score: 100 };
      }
    }

    // 2. Score all songs with pinyin, edit distance, and phonetic algorithms
    let bestSong: Song | null = null;
    let bestScore = 0;

    for (const song of songs) {
      const score = computeSongMatchScore(song, kw);
      if (score > bestScore) {
        bestScore = score;
        bestSong = song;
      }
      // Early return if 100% exact match
      if (score >= 100) {
        return { song, score };
      }
    }

    if (bestSong && bestScore >= 60) {
      return { song: bestSong, score: bestScore };
    }

    return null;
  }

  private addLog(log: VoiceDialogueLog) {
    this.dialogueLogs.unshift(log);
    if (this.dialogueLogs.length > 100) {
      this.dialogueLogs.pop();
    }
  }
}

export const voiceCommandService = VoiceCommandService.getInstance();
