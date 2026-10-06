import fs from 'fs';
import path from 'path';
import { Song, Playlist } from '../src/types';
import { generateMinaRequestId, buildMinaHeaders } from './xiaomiPassport';
import { computeSongMatchScore } from './pinyinHelper';
import { xiaomiCircuitBreaker } from './circuitBreaker';
import { aiService } from './core/aiService.js';
import { musicAutoFetcherService } from './core/musicAutoFetcherService.js';
import { logEngine } from './core/logEngine.js';

export interface VoiceCommandRule {
  id: string;
  name: string;
  triggerPhrases: string[];
  actionType: 'play_playlist' | 'play_random_all' | 'play_song_search' | 'control_command' | 'download_song';
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
  missedReason?: 'homophone_mismatch' | 'unknown_song' | 'slang_hotword' | 'no_rule_match' | 'low_confidence' | 'smart_home_control';
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

export interface DialogueSessionContext {
  lastQuery: string;
  lastMatchedSongId: string;
  lastMoodTitle: string;
  lastQueueSongs: Song[];
  lastCurrentIndex: number;
  lastTimestamp: number;
}

const VOICE_CONFIG_FILE = path.join(process.cwd(), 'data', 'voice-config.json');
const VOICE_SLANG_FILE = path.join(process.cwd(), 'data', 'voice-slang.json');
const VOICE_LOGS_FILE = path.join(process.cwd(), 'data', 'voice-dialogues.json');

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
  // 3. Dedicated offline download with library duplication check
  {
    id: 'rule_download_song',
    name: '离线下载歌曲 (智能查重与后台入库)',
    triggerPhrases: ['下载歌曲', '帮我下载', '下载一首', '下载', '离线下载', '下首歌', '下歌曲'],
    actionType: 'download_song',
    ttsFeedback: '已为您启动后台离线下载',
    enabled: true
  },
  // 4. Intelligent song search (matched after high-priority controls)
  {
    id: 'rule_search_song',
    name: '智能搜歌点歌与播放',
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
  private playSongsQueueFn: ((songs: Song[], startIndex?: number, deviceId?: string) => Promise<boolean>) | null = null;
  private playPlaylistFn: ((playlistId: string, deviceId?: string) => Promise<boolean>) | null = null;
  private controlPlaybackFn: ((action: 'next' | 'prev' | 'pause' | 'stop' | 'resume' | 'volume_up' | 'volume_down', deviceId?: string) => Promise<boolean | { success: boolean; song?: any; message?: string }>) | null = null;
  private earlyStopFn: ((deviceId?: string) => Promise<any>) | null = null;
  private sendTtsFn: ((deviceId: string, text: string) => Promise<any>) | null = null;
  private getAuthInfoFn: (() => { userId?: string; serviceToken?: string; devices: any[] }) | null = null;

  private slangRules: VoiceSlangRule[] = DEFAULT_SLANG_RULES;

  // Item 4: Multi-turn Dialogue Session Context Map (TTL 90s)
  private sessionContextMap = new Map<string, DialogueSessionContext>();

  private saveDialogueLogsTimeout: NodeJS.Timeout | null = null;

  private constructor() {
    this.loadConfig();
    this.loadSlangRules();
    this.loadDialogueLogs();
  }

  public static getInstance(): VoiceCommandService {
    if (!VoiceCommandService.instance) {
      VoiceCommandService.instance = new VoiceCommandService();
    }
    return VoiceCommandService.instance;
  }

  private loadDialogueLogs() {
    try {
      if (fs.existsSync(VOICE_LOGS_FILE)) {
        const raw = fs.readFileSync(VOICE_LOGS_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.dialogueLogs = parsed;
          console.log(`[VoiceCommandService] Successfully loaded ${parsed.length} persisted voice dialogue logs.`);
        }
      }
    } catch (err: any) {
      console.warn('[VoiceCommandService] Failed to load voice-dialogues.json:', err.message);
    }
  }

  private scheduleSaveDialogueLogs() {
    if (this.saveDialogueLogsTimeout) return;
    this.saveDialogueLogsTimeout = setTimeout(() => {
      this.saveDialogueLogsTimeout = null;
      this.saveDialogueLogs();
    }, 400);
  }

  private saveDialogueLogs() {
    try {
      const dir = path.dirname(VOICE_LOGS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(VOICE_LOGS_FILE, JSON.stringify(this.dialogueLogs.slice(0, 500), null, 2), 'utf8');
    } catch (err: any) {
      console.warn('[VoiceCommandService] Failed to save voice-dialogues.json:', err.message);
    }
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
    playSongsQueue?: (songs: Song[], startIndex?: number, deviceId?: string) => Promise<boolean>;
    playPlaylist: (playlistId: string, deviceId?: string) => Promise<boolean>;
    controlPlayback: (action: 'next' | 'prev' | 'pause' | 'stop' | 'resume' | 'volume_up' | 'volume_down', deviceId?: string) => Promise<boolean | { success: boolean; song?: Song | null; message?: string }>;
    earlyStop?: (deviceId?: string) => Promise<any>;
    sendTts: (deviceId: string, text: string) => Promise<any>;
    getAuthInfo: () => { userId?: string; serviceToken?: string; devices: any[] };
  }) {
    this.getSongsFn = options.getSongs;
    this.getPlaylistsFn = options.getPlaylists;
    this.playSongFn = options.playSong;
    this.playSongsQueueFn = options.playSongsQueue || null;
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

  public restoreDefaultRules(): VoiceCommandRule[] {
    this.config.rules = JSON.parse(JSON.stringify(DEFAULT_RULES));
    this.saveConfig();
    return [...this.config.rules];
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

  public getDialogueLogs(limit = 100): VoiceDialogueLog[] {
    return this.dialogueLogs.slice(0, limit);
  }

  public clearLogs() {
    this.dialogueLogs = [];
    this.saveDialogueLogs();
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
      .replace(/^(小爱同学|小爱|给我|帮我|请帮我|麻烦|我想|我想听听|我想听|请|立刻|马上|能不能|麻烦你|口令)[\s，,。！!:]*/i, '')
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

    // =========================================================================
    // Tier 0: Direct Download Command Interception (口令以“下载”开头)
    // 检查曲库是否存在：若存在小爱回答“如您要下载的歌曲已存在”；若不存在播报“已为您启动后台离线下载”并加入下载队列
    // =========================================================================
    const isDownloadCommand = /^(下载歌曲|下载一首|帮我下载|离线下载|下载|下首歌|下歌曲)/.test(cleanQuery) || cleanQuery.startsWith('下载');
    if (isDownloadCommand) {
      return await this.handleDownloadVoiceCommand(
        rawQuery,
        cleanQuery,
        deviceId,
        deviceName,
        source,
        slangApplied,
        matchedSlangTerm
      );
    }

    // =========================================================================
    // Tier 1: Fast Non-Music Guardrail (智能家居与日常问答 0ms 零干扰放行)
    // Ensures home automation (lights, AC, curtains, vacuum), weather, alarms,
    // and daily tools are NEVER hijacked by private music services or AI models!
    // =========================================================================
    const isExplicitMusicWordPresent = (
      /(音乐|歌曲|歌单|电台|专辑|歌手|原唱|周杰伦|播放|放一首|来一首|放首歌|我想听|歌词|唱的歌|纯音乐|轻音乐|下载|离线|下载歌曲|帮我下载)/.test(rawQuery) ||
      /^(听|放|播|来首|搜|点|下)/.test(cleanQuery)
    );

    if (!isExplicitMusicWordPresent) {
      // 1. Smart Home Device Control Patterns
      const isSmartHomeControl = (
        // Open/close/control actions on household appliances/devices
        /^(打开|关闭|关掉|开一下|关一下|启动|停止|开启|关了|开了)(客厅|卧室|主卧|次卧|厨房|卫生间|阳台|玄关|走廊|过道|书房|餐厅|全屋|所有)?(灯|大灯|筒灯|射灯|灯带|夜灯|壁灯|吊灯|空调|电视|电视机|窗帘|纱帘|百叶窗|风扇|吊扇|电风扇|加湿器|除湿机|空气净化器|净化器|扫地机|扫地机器人|吸尘器|洗地机|插座|排插|开关|热水器|电热水器|饮水机|净水器|电饭煲|微波炉|烤箱|油烟机|洗碗机|洗衣机|烘干机|投影仪|幕布|摄像头|门锁|浴霸|暖风机|电热毯|取暖器|路由器|设备)$/.test(cleanQuery) ||
        // Action sentences with device parameters (e.g. 把空调调到26度, 客厅灯调亮一点, 窗帘打开一半)
        /^(把|将)?(客厅|卧室|厨房|空调|窗帘|风扇|灯|电视|加湿器|净化器|扫地机|插座|热水器).*(打开|关闭|关掉|开到|调到|升到|降到|调大|调小|调亮|调暗|设为|设置成|启动|停止|暂停扫地|回充|充电|去扫地|扫地|一半|全开|全关).*$/.test(cleanQuery) ||
        // Short direct device words
        /^(开灯|关灯|全开灯|全关灯|开空调|关空调|制冷模式|制热模式|除湿模式|送风模式|开风扇|关风扇|开窗帘|关窗帘|打开窗帘|关闭窗帘|扫地|去扫地|开始扫地|回去充电|暂停扫地|开电视|关电视|息屏|亮屏)$/.test(cleanQuery) ||
        // Smart scene modes
        /^(我出门了|我回家了|离家模式|回家模式|睡眠模式|睡觉模式|观影模式|早安模式|晚安模式|起床模式|就寝模式|会客模式)$/.test(cleanQuery)
      );

      // 2. Daily Life Utilities, Tools, and Information Queries
      const isDailyUtility = (
        // Weather & temperature (Requires explicit weather keywords, avoiding song titles like '晴天')
        /(天气|气温|多少度|下雨吗|今天晴吗|明天晴吗|空气质量|冷不冷|热不热|防晒指数|天气预报)/.test(cleanQuery) ||
        /^(晴天|阴天|下雨|下雪|刮风)吗$/.test(cleanQuery) ||
        // Alarms, timers, clocks, reminders
        /(几点|几号|星期几|礼拜几|闹钟|倒计时|定时器|提醒我|叫我起床|日程)/.test(cleanQuery) ||
        // Calculations, news, facts, small tools
        /(今日新闻|头条新闻|计算|算一下|加等于|减等于|乘等于|除等于|讲个笑话|讲故事|背首诗|翻译|汇率)/.test(cleanQuery) ||
        // Direct XiaoAi wake words or identity queries
        /^(你叫什么|你是谁|你几岁|你会做什么|小爱同学|你好小爱)$/.test(cleanQuery)
      );

      if (isSmartHomeControl || isDailyUtility) {
        const guardType = isSmartHomeControl ? '智能家居设备控制' : '日常生活问答';
        console.log(`[VoiceCommandService] 🏠 非音乐指令命中 (${guardType}): “${rawQuery}”，100% 零干扰安全放行给小爱原生系统`);
        this.addLog({
          id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          timestamp: Date.now(),
          queryText: rawQuery,
          matchedRuleId: 'rule_non_music_guardrail',
          matchedRuleName: '米家智能家居/日常问答放行',
          actionSummary: `非音乐指令 (${guardType})，已零干扰放行给小爱音箱原生系统处理`,
          status: 'ignored',
          source,
          deviceId,
          deviceName,
          slangApplied,
          slangTerm: matchedSlangTerm,
          missedReason: 'smart_home_control'
        });
        return { matched: false, summary: `非音乐指令 (${guardType})，已安全放行给小爱原生米家系统` };
      }
    }

    // Item 4: Multi-turn Dialogue Follow-up & Correction Check (90s window)
    const sessionKey = deviceId || 'global';
    const activeSession = this.sessionContextMap.get(sessionKey);
    const isSessionValid = activeSession && (now - activeSession.lastTimestamp < 90000);

    if (isSessionValid) {
      // 4.1 Direct Skip/Next in active mood queue
      const isDirectSkip = /^(换一首|再换一首|换一首歌|切一首|切歌|不是这首|换个歌|换一个|不喜欢这首|不想听这个)$/.test(cleanQuery);
      if (isDirectSkip && activeSession.lastQueueSongs && activeSession.lastQueueSongs.length > 1) {
        if (this.earlyStopFn) await this.earlyStopFn(deviceId).catch(() => {});
        activeSession.lastCurrentIndex = (activeSession.lastCurrentIndex + 1) % activeSession.lastQueueSongs.length;
        const nextSong = activeSession.lastQueueSongs[activeSession.lastCurrentIndex];
        
        const ttsText = `好的，为您切换至《${nextSong.title}》`;
        if (this.sendTtsFn && deviceId) {
          await this.sendTtsFn(deviceId, ttsText).catch(() => {});
          const delayMs = Math.min(Math.max(ttsText.length * 200, 1500), 4000);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }

        if (this.playSongFn) {
          await this.playSongFn(nextSong, undefined, deviceId);
        }

        const summary = `AI 多轮意图切歌: 《${nextSong.title}》 - ${nextSong.artist} (${activeSession.lastCurrentIndex + 1}/${activeSession.lastQueueSongs.length})`;
        this.addLog({
          id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          timestamp: Date.now(),
          queryText: rawQuery,
          matchedRuleId: 'rule_ai_multiturn_skip',
          matchedRuleName: 'AI 多轮意图切歌',
          actionSummary: summary,
          status: 'matched',
          source,
          deviceId,
          deviceName,
          slangApplied,
          slangTerm: matchedSlangTerm
        });

        return { matched: true, summary };
      }

      // 4.2 Contrast / Mood Refinement (e.g. "太吵了，来点更安静的", "换个欢快的", "来首节奏慢点的")
      const isContrastAdjustment = /(太吵|太闹|更安静|安静点|更轻柔|欢快|节奏慢|换个风格|换个歌手|换成民谣|换成摇滚)/.test(cleanQuery);
      if (isContrastAdjustment) {
        const songs = this.getSongsFn ? this.getSongsFn() : [];
        if (songs.length > 0) {
          const currentSong = activeSession.lastQueueSongs[activeSession.lastCurrentIndex];
          const contextualPrompt = `上一轮点歌需求是"${activeSession.lastQuery}"，当前正在播放《${currentSong?.title || '音乐'}》，用户提出了进一步调整需求："${rawQuery}"。请排除当前这首曲目，提炼新需求并推荐更契合的心境队列。`;
          
          try {
            const aiResult = await aiService.parseVoiceIntent(contextualPrompt, songs as any);
            if (aiResult.matched && aiResult.songId) {
              const songToPlay = songs.find(s => s.id === aiResult.songId) || aiResult.primarySong;
              if (songToPlay) {
                if (this.earlyStopFn) await this.earlyStopFn(deviceId).catch(() => {});

                if (this.sendTtsFn && deviceId && aiResult.ttsResponse) {
                  await this.sendTtsFn(deviceId, aiResult.ttsResponse).catch(() => {});
                  const ttsCharCount = (aiResult.ttsResponse || '').length;
                  const delayMs = Math.min(Math.max(ttsCharCount * 300 + 800, 2000), 20000);
                  await new Promise(resolve => setTimeout(resolve, delayMs));
                }

                if (this.playSongsQueueFn && Array.isArray(aiResult.playlistSongs) && aiResult.playlistSongs.length > 1) {
                  await this.playSongsQueueFn(aiResult.playlistSongs, 0, deviceId);
                } else if (this.playSongFn) {
                  await this.playSongFn(songToPlay, undefined, deviceId);
                }

                // Update session
                this.sessionContextMap.set(sessionKey, {
                  lastQuery: `${activeSession.lastQuery} -> ${rawQuery}`,
                  lastMatchedSongId: songToPlay.id,
                  lastMoodTitle: aiResult.queueTitle || songToPlay.title,
                  lastQueueSongs: aiResult.playlistSongs || [songToPlay],
                  lastCurrentIndex: 0,
                  lastTimestamp: now
                });

                const summary = `AI 多轮意图纠偏调整: 《${songToPlay.title}》 - ${songToPlay.artist} (${aiResult.reason || '多轮意图修正'})`;
                this.addLog({
                  id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                  timestamp: Date.now(),
                  queryText: rawQuery,
                  matchedRuleId: 'rule_ai_multiturn_refine',
                  matchedRuleName: 'AI 多轮意图纠偏',
                  actionSummary: summary,
                  status: 'matched',
                  source,
                  deviceId,
                  deviceName,
                  slangApplied,
                  slangTerm: matchedSlangTerm
                });

                return { matched: true, summary };
              }
            }
          } catch (e: any) {
            console.warn('[VoiceCommandService] Multi-turn refinement failed:', e.message);
          }
        }
      }
    }

    // Sort rules by specificity (control & playlist commands have higher priority than generic search)
    const enabledRules = [...this.config.rules.filter(r => r.enabled)].sort((a, b) => {
      if (a.actionType === 'play_song_search' && b.actionType !== 'play_song_search') return 1;
      if (b.actionType === 'play_song_search' && a.actionType !== 'play_song_search') return -1;
      return 0;
    });

    // Scheme 2: Fast Pre-Router for complex mood, scene, style, or lyric requests
    const aiConfig = aiService.getConfig();
    const isAiSemanticAvailable = Boolean(aiConfig.enabled && aiConfig.enableSemanticVoiceSearch);

    const isComplexSemanticQuery = isAiSemanticAvailable && (
      /(轻松|解压|治愈|伤感|难过|开心|快乐|安静|热血|孤独|emo|助眠|睡觉|看书|阅读|学习|下雨|雨天|开车|自驾|运动|健身|跑步|工作|写代码|发呆|冥想|纯音乐|轻音乐|古风|摇滚|爵士|民谣|电音|嘻哈|说唱|港乐|粤语经典|欧美流行|民乐|古典乐|白噪音|钢琴曲|吉他曲|大提琴)/.test(cleanQuery) ||
      /(适合|关于|类似|歌词|很有感觉|节奏|推荐点|来点|放点).*(的|歌|曲|音乐)/.test(cleanQuery) ||
      cleanQuery.includes('歌词里有') ||
      cleanQuery.includes('天青色')
    );

    for (const rule of enabledRules) {
      // If this query is an obvious complex semantic/mood/scene request, skip naive literal song search and pass directly to AI
      if (isComplexSemanticQuery && rule.actionType === 'play_song_search') {
        continue;
      }

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
        // Scheme 1: Fallback on Miss - If literal rule failed to find a song/playlist and AI is enabled,
        // don't abort with error! Let the AI Large Language Model take over with deep semantic comprehension!
        if ((rule.actionType === 'play_song_search' || rule.actionType === 'play_playlist') && isAiSemanticAvailable) {
          console.log(`[VoiceCommandService] Literal rule "${rule.name}" failed: ${err.message}. Seamlessly falling through to AI Semantic Engine.`);
          continue;
        }

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

    // 2. AI Large Language Model Semantic Voice Matching Fallback
    if (isAiSemanticAvailable) {
      const songs = this.getSongsFn ? this.getSongsFn() : [];
      if (songs.length > 0) {
        try {
          const aiResult = await aiService.parseVoiceIntent(rawQuery, songs as any);
          console.log(`[VoiceCommandService] 🤖 AI 意图提取完成，接收到返回数据:`, JSON.stringify(aiResult, null, 2));
          if (aiResult.matched && aiResult.songId) {
            const songToPlay = songs.find(s => s.id === aiResult.songId) || aiResult.primarySong;
            if (songToPlay && (this.playSongsQueueFn || this.playSongFn)) {
              if (this.earlyStopFn) await this.earlyStopFn(deviceId).catch(() => {});

              // Item 2: Continuous Dynamic Mood Queue Playback
              if (this.sendTtsFn && deviceId && aiResult.ttsResponse) {
                await this.sendTtsFn(deviceId, aiResult.ttsResponse).catch(() => {});
                const ttsCharCount = (aiResult.ttsResponse || '').length;
                const delayMs = Math.min(Math.max(ttsCharCount * 300 + 800, 2000), 20000);
                await new Promise(resolve => setTimeout(resolve, delayMs));
              }

              if (this.playSongsQueueFn && Array.isArray(aiResult.playlistSongs) && aiResult.playlistSongs.length > 1) {
                await this.playSongsQueueFn(aiResult.playlistSongs, 0, deviceId);
              } else if (this.playSongFn) {
                await this.playSongFn(songToPlay, undefined, deviceId);
              }

              // Update active dialogue session for multi-turn conversational follow-ups
              this.sessionContextMap.set(deviceId || 'global', {
                lastQuery: rawQuery,
                lastMatchedSongId: songToPlay.id,
                lastMoodTitle: aiResult.queueTitle || songToPlay.title,
                lastQueueSongs: aiResult.playlistSongs || [songToPlay],
                lastCurrentIndex: 0,
                lastTimestamp: Date.now()
              });

              const activeProvider = aiConfig.providers[aiConfig.activeProvider];
              const summary = aiResult.ttsResponse
                ? `${aiResult.ttsResponse} (已编排 ${aiResult.playlistSongs?.length || 1} 首连续播放)`
                : ((Array.isArray(aiResult.playlistSongs) && aiResult.playlistSongs.length > 1)
                  ? `AI 心境电台: 《${aiResult.queueTitle || songToPlay.title}》 (共 ${aiResult.playlistSongs.length} 首连续播放, 首曲: 《${songToPlay.title}》)`
                  : `AI 智能语义命中: 《${songToPlay.title}》 - ${songToPlay.artist} (${aiResult.reason || '意图契合'})`);

              this.addLog({
                id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                timestamp: Date.now(),
                queryText: rawQuery,
                matchedRuleId: 'rule_ai_semantic',
                matchedRuleName: `AI 心境电台 (${activeProvider?.badge || '大模型'})`,
                actionSummary: summary,
                status: 'matched',
                source,
                deviceId,
                deviceName,
                slangApplied,
                slangTerm: matchedSlangTerm
              });

              return { matched: true, summary };
            }
          }
        } catch (aiErr: any) {
          console.warn('[VoiceCommandService] AI voice search failed, falling back to ignored:', aiErr.message);
        }
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

      case 'download_song': {
        const query = param ? `下载 ${param}` : '下载';
        const res = await this.handleDownloadVoiceCommand(
          query,
          query,
          deviceId,
          undefined,
          'test_manual'
        );
        return {
          success: res.matched,
          summary: res.summary
        };
      }

      default:
        throw new Error('未知的指令动作类型');
    }
  }

  /**
   * Check if requested song exists in current music library (曲库)
   * Multi-strategy: title clean match, artist+title match, pinyin fuzzy score match
   */
  public checkSongExistsInLibrary(
    songs: Song[],
    targetTitle: string,
    targetArtist?: string,
    rawKeyword?: string
  ): Song | null {
    if (!songs || songs.length === 0) return null;

    const normTitle = (targetTitle || '').toLowerCase().replace(/[\s\-_《》「」『』()（）\[\]]/g, '');
    const normArtist = (targetArtist || '').toLowerCase().replace(/[\s\-_]/g, '');

    // 1. Direct match on clean title and artist
    for (const song of songs) {
      const sRawTitle = (song.title || '').toLowerCase();
      // Remove subtitles in parenthesis e.g. "月半小夜曲 (Acoustic Night)" -> "月半小夜曲"
      const sCleanTitle = sRawTitle.replace(/\s*\(.*?\)\s*/g, '').replace(/\s*（.*?）\s*/g, '').replace(/[\s\-_《》「」『』]/g, '').trim();
      const sCleanArtist = (song.artist || '').toLowerCase().replace(/[\s\-_]/g, '').trim();

      if (normArtist) {
        const artistMatch = sCleanArtist.includes(normArtist) || normArtist.includes(sCleanArtist);
        const titleMatch = sCleanTitle === normTitle ||
                           sCleanTitle.includes(normTitle) ||
                           normTitle.includes(sCleanTitle) ||
                           sRawTitle.includes(normTitle);
        if (artistMatch && titleMatch) {
          return song;
        }
      } else {
        if (sCleanTitle === normTitle || sRawTitle === normTitle) {
          return song;
        }
        // If clean title is inside song title and difference is small
        if (normTitle.length >= 2 && sCleanTitle.includes(normTitle) && sCleanTitle.length <= normTitle.length + 4) {
          return song;
        }
        if (normTitle.length >= 2 && normTitle.includes(sCleanTitle) && normTitle.length <= sCleanTitle.length + 4) {
          return song;
        }
      }
    }

    // 2. Multi-tier fuzzy & pinyin matching
    const searchParam = targetArtist ? `${targetArtist} ${targetTitle}` : (targetTitle || rawKeyword || '');
    const fuzzy = this.fuzzyFindSongWithScore(songs, searchParam);
    if (fuzzy && fuzzy.score >= 80) {
      return fuzzy.song;
    }

    return null;
  }

  /**
   * Handle voice commands starting with '下载' (e.g. 下载 晴天, 下载周杰伦的稻香, 帮我下载 七里香)
   * 1. Checks current music library (曲库)
   * 2. If exists -> XiaoAi replies: "如您要下载的歌曲已存在"
   * 3. If not exists -> Broadcasts: "已为您启动后台离线下载" and automatically enqueues background offline download
   */
  public async handleDownloadVoiceCommand(
    rawQuery: string,
    cleanQuery: string,
    deviceId?: string,
    deviceName?: string,
    source: 'speaker_mina_poll' | 'speaker_mina_ws' | 'test_manual' = 'test_manual',
    slangApplied = false,
    matchedSlangTerm = ''
  ): Promise<{ matched: boolean; summary: string }> {
    // Extract target from cleanQuery (e.g., '下载 晴天', '帮我下载 七里香', '下载歌曲 稻香', '下载一首 枫')
    let rawTarget = cleanQuery
      .replace(/^(帮我下载|下载歌曲|下载一首|离线下载|下载|下首歌|下歌曲)/, '')
      .replace(/^(一下|一首|点|首|首歌曲|首歌|关于|这首歌|歌曲)/, '')
      .trim();

    // Check if user just said '下载' without specifying a song
    if (!rawTarget) {
      const activeSession = this.sessionContextMap.get(deviceId || 'global');
      if (activeSession && activeSession.lastQueueSongs && activeSession.lastQueueSongs.length > 0) {
        const currentSong = activeSession.lastQueueSongs[activeSession.lastCurrentIndex];
        if (currentSong) {
          rawTarget = `${currentSong.artist ? currentSong.artist + ' ' : ''}${currentSong.title}`;
        }
      }
    }

    if (!rawTarget) {
      const promptTts = '请告诉我您想下载哪首歌曲，例如：下载 晴天';
      const targetDid = deviceId || this.config.targetDeviceId;
      if (this.sendTtsFn && targetDid) {
        await this.sendTtsFn(targetDid, promptTts).catch(() => {});
      }
      return {
        matched: true,
        summary: '请告诉我您想下载哪首歌曲，例如：下载 晴天'
      };
    }

    // Parse artist and title from rawTarget
    let extractedArtist = '';
    let extractedTitle = rawTarget;

    if (rawTarget.includes('唱的') || rawTarget.includes('的')) {
      const sep = rawTarget.includes('唱的') ? '唱的' : '的';
      const parts = rawTarget.split(sep).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        extractedArtist = parts[0];
        extractedTitle = parts.slice(1).join(' ').trim();
      }
    } else if (rawTarget.includes(' ')) {
      const parts = rawTarget.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        extractedArtist = parts[0];
        extractedTitle = parts.slice(1).join(' ').trim();
      }
    }

    extractedTitle = extractedTitle
      .replace(/^(这首歌|这首|歌曲|单曲)/, '')
      .replace(/(这首歌|这首|的歌|歌曲)$/, '')
      .replace(/[《》「」『』"]/g, '')
      .trim();

    if (!extractedTitle && extractedArtist) {
      extractedTitle = extractedArtist;
      extractedArtist = '';
    }
    if (!extractedTitle) {
      extractedTitle = rawTarget.trim();
    }

    const songs = this.getSongsFn ? this.getSongsFn() : [];
    const matchedExistingSong = this.checkSongExistsInLibrary(songs, extractedTitle, extractedArtist, rawTarget);
    const targetDid = deviceId || this.config.targetDeviceId;

    // Early interception on speaker to avoid overlapping native audio
    if (this.earlyStopFn && targetDid) {
      await this.earlyStopFn(targetDid).catch(() => {});
    }

    if (matchedExistingSong) {
      // 1. 曲库已存在：小爱回答“如您要下载的歌曲已存在”
      const ttsText = '如您要下载的歌曲已存在';
      if (this.sendTtsFn && targetDid) {
        await this.sendTtsFn(targetDid, ttsText).catch(() => {});
      }

      const summary = `如您要下载的歌曲已存在 (曲库已收录: 《${matchedExistingSong.title}》 - ${matchedExistingSong.artist || '本地曲目'})`;
      this.addLog({
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
        queryText: rawQuery,
        matchedRuleId: 'rule_download_song',
        matchedRuleName: '离线下载歌曲 (智能查重与后台入库)',
        actionSummary: summary,
        status: 'matched',
        source,
        deviceId,
        deviceName,
        slangApplied,
        slangTerm: matchedSlangTerm
      });

      console.log(`[VoiceCommandService] 📥 [曲库已收录] 指令: "${rawQuery}" -> 小爱播报: "${ttsText}" (已收录《${matchedExistingSong.title}》)`);
      return { matched: true, summary };
    } else {
      // 2. 曲库不存在：播报“已为您启动后台离线下载”并启动后台离线下载
      const ttsText = '已为您启动后台离线下载';
      if (this.sendTtsFn && targetDid) {
        await this.sendTtsFn(targetDid, ttsText).catch(() => {});
      }

      const downloadTitle = extractedTitle || rawTarget || '单曲';
      const downloadArtist = extractedArtist || '华语音乐';

      try {
        const fetcherCfg = musicAutoFetcherService.getConfig();
        const isSchedulerActive = Boolean(fetcherCfg.enabled && fetcherCfg.downloadMode !== 'ai_skill');

        if (isSchedulerActive) {
          // 调度中心开启：仅投递至调度流水线队列，避免双重触发
          musicAutoFetcherService.enqueueTask({
            title: downloadTitle,
            artist: downloadArtist,
            album: '经典精选集',
            genre: '流行 / 经典',
            requestedBy: 'voice_ai'
          });
          console.log(`[VoiceCommandService] 🚀 [调度中心模式] 自动调度后台离线下载并入库 NAS: 《${downloadTitle}》 - ${downloadArtist}`);
        } else {
          // 调度中心关闭：仅由 AI Skill 直连引擎秒级落盘并入库，绝对不重复入队
          logEngine.info(
            'automation',
            'AI Skill 语音口令触发',
            `小爱语音口令【${rawQuery}】已分流至 AI Skill 直连引擎 | 目标: 《${downloadTitle}》- ${downloadArtist} | 模式: AI 原生秒级落盘`,
            {
              query: rawQuery,
              title: downloadTitle,
              artist: downloadArtist,
              source,
              deviceId
            }
          );
          musicAutoFetcherService.executeAiSkillDirectDownload({
            title: downloadTitle,
            artist: downloadArtist,
            album: '经典精选集',
            genre: '流行 / 经典',
            requestedBy: 'voice_ai'
          }).catch(e => console.warn('[VoiceCommandService] AI Skill download error:', e.message));
          console.log(`[VoiceCommandService] 🤖 [AI Skill 直连模式] 自动使用 AI Skill 下载并同步 NAS: 《${downloadTitle}》 - ${downloadArtist}`);
        }
      } catch (fetchErr: any) {
        console.warn('[VoiceCommandService] Failed to trigger auto fetcher:', fetchErr.message);
      }

      const summary = `已为您启动后台离线下载 (曲库未收录，已创建离线下载任务: 《${downloadTitle}》 - ${downloadArtist}，下载完成将自动同步至NAS)`;
      this.addLog({
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
        queryText: rawQuery,
        matchedRuleId: 'rule_download_song',
        matchedRuleName: '离线下载歌曲 (智能查重与后台入库)',
        actionSummary: summary,
        status: 'matched',
        source,
        deviceId,
        deviceName,
        slangApplied,
        slangTerm: matchedSlangTerm
      });

      console.log(`[VoiceCommandService] 🚀 [启动离线下载] 指令: "${rawQuery}" -> 小爱播报: "${ttsText}" (创建下载任务: 《${downloadTitle}》 - ${downloadArtist})`);
      return { matched: true, summary };
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
    if (this.dialogueLogs.length > 500) {
      this.dialogueLogs.length = 500;
    }
    this.scheduleSaveDialogueLogs();
  }
}

export const voiceCommandService = VoiceCommandService.getInstance();
