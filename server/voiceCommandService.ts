import { Song, Playlist } from '../src/types';
import { generateMinaRequestId, buildMinaHeaders } from './xiaomiPassport';

export interface VoiceCommandRule {
  id: string;
  name: string;
  triggerPhrases: string[];
  actionType: 'play_playlist' | 'play_random_all' | 'play_song_search' | 'control_command';
  targetPlaylistId?: string;
  controlAction?: 'next' | 'prev' | 'pause' | 'stop' | 'volume_up' | 'volume_down';
  ttsFeedback?: string;
  enabled: boolean;
}

export interface VoiceDialogueLog {
  id: string;
  timestamp: number;
  queryText: string;
  matchedRuleId?: string;
  matchedRuleName?: string;
  actionSummary?: string;
  status: 'matched' | 'ignored' | 'error';
  deviceId?: string;
  deviceName?: string;
}

export interface VoiceListenerConfig {
  enabled: boolean;
  pollIntervalMs: number;
  targetDeviceId?: string;
  ttsFeedbackEnabled: boolean;
  rules: VoiceCommandRule[];
}

export class VoiceCommandService {
  private static instance: VoiceCommandService;

  private config: VoiceListenerConfig = {
    enabled: false,
    pollIntervalMs: 2500,
    ttsFeedbackEnabled: true,
    rules: [
      {
        id: 'rule_search_song',
        name: '智能搜歌点歌',
        triggerPhrases: ['点歌', '来一首', '放一首', '我想听', '播放歌曲', '播放', '放'],
        actionType: 'play_song_search',
        ttsFeedback: '好的，为您播放 {title}',
        enabled: true
      },
      {
        id: 'rule_play_random',
        name: '随机播放全部',
        triggerPhrases: ['随便放点歌', '随机播放', '随心听', '随便听听', '随便放首歌', '来点音乐'],
        actionType: 'play_random_all',
        ttsFeedback: '好的，为您随机播放音乐',
        enabled: true
      },
      {
        id: 'rule_play_default_playlist',
        name: '播放当前歌单',
        triggerPhrases: ['播放本地歌单', '放本地歌', '播放私房歌', '播放我的歌单', '放歌'],
        actionType: 'play_playlist',
        targetPlaylistId: 'default',
        ttsFeedback: '好的，正在播放歌单',
        enabled: true
      },
      {
        id: 'rule_control_next',
        name: '语音切歌 (下一首)',
        triggerPhrases: ['切歌', '换一首', '不要这首', '下一曲', '下一首', '下个歌'],
        actionType: 'control_command',
        controlAction: 'next',
        ttsFeedback: '',
        enabled: true
      },
      {
        id: 'rule_control_prev',
        name: '语音切歌 (上一首)',
        triggerPhrases: ['上一首', '上一曲', '重播上一首'],
        actionType: 'control_command',
        controlAction: 'prev',
        ttsFeedback: '',
        enabled: true
      },
      {
        id: 'rule_control_pause',
        name: '语音暂停/停止',
        triggerPhrases: ['暂停音乐', '别放了', '先别唱了', '停止播放', '闭嘴', '暂停'],
        actionType: 'control_command',
        controlAction: 'pause',
        ttsFeedback: '',
        enabled: true
      }
    ]
  };

  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private lastProcessedRecordId: string | null = null;
  private lastProcessedTimestamp: number = Date.now();
  private dialogueLogs: VoiceDialogueLog[] = [];
  private consecutiveErrors = 0;

  // External bindings provided by server.ts
  private getSongsFn: (() => Song[]) | null = null;
  private getPlaylistsFn: (() => Playlist[]) | null = null;
  private playSongFn: ((song: Song, playlistName?: string, deviceId?: string) => Promise<boolean>) | null = null;
  private playPlaylistFn: ((playlistId: string, deviceId?: string) => Promise<boolean>) | null = null;
  private controlPlaybackFn: ((action: 'next' | 'prev' | 'pause' | 'stop' | 'volume_up' | 'volume_down', deviceId?: string) => Promise<boolean>) | null = null;
  private sendTtsFn: ((deviceId: string, text: string) => Promise<any>) | null = null;
  private getAuthInfoFn: (() => { userId?: string; serviceToken?: string; devices: any[] }) | null = null;

  private constructor() {}

  public static getInstance(): VoiceCommandService {
    if (!VoiceCommandService.instance) {
      VoiceCommandService.instance = new VoiceCommandService();
    }
    return VoiceCommandService.instance;
  }

  public bindCallbacks(options: {
    getSongs: () => Song[];
    getPlaylists: () => Playlist[];
    playSong: (song: Song, playlistName?: string, deviceId?: string) => Promise<boolean>;
    playPlaylist: (playlistId: string, deviceId?: string) => Promise<boolean>;
    controlPlayback: (action: 'next' | 'prev' | 'pause' | 'stop' | 'volume_up' | 'volume_down', deviceId?: string) => Promise<boolean>;
    sendTts: (deviceId: string, text: string) => Promise<any>;
    getAuthInfo: () => { userId?: string; serviceToken?: string; devices: any[] };
  }) {
    this.getSongsFn = options.getSongs;
    this.getPlaylistsFn = options.getPlaylists;
    this.playSongFn = options.playSong;
    this.playPlaylistFn = options.playPlaylist;
    this.controlPlaybackFn = options.controlPlayback;
    this.sendTtsFn = options.sendTts;
    this.getAuthInfoFn = options.getAuthInfo;
  }

  public getConfig(): VoiceListenerConfig {
    return { ...this.config };
  }

  public updateConfig(partial: Partial<VoiceListenerConfig>) {
    this.config = { ...this.config, ...partial };
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
    // Set baseline timestamp slightly in the past (3s) to prevent re-triggering old queries
    this.lastProcessedTimestamp = Date.now() - 3000;
    this.pollLoop();
  }

  public stop() {
    this.isRunning = false;
    this.config.enabled = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  public getStatus() {
    return {
      isRunning: this.isRunning,
      enabled: this.config.enabled,
      pollIntervalMs: this.config.pollIntervalMs,
      targetDeviceId: this.config.targetDeviceId || null,
      rulesCount: this.config.rules.length,
      logsCount: this.dialogueLogs.length,
      lastProcessedTime: this.lastProcessedTimestamp
    };
  }

  private async pollLoop() {
    if (!this.isRunning) return;

    try {
      await this.pollLatestConversations();
      this.consecutiveErrors = 0;
    } catch (err: any) {
      this.consecutiveErrors++;
      // Exponential backoff up to 15s to prevent hammering if offline/rate-limited
      const backoff = Math.min(15000, this.config.pollIntervalMs * Math.pow(1.5, Math.min(this.consecutiveErrors, 5)));
      if (this.isRunning) {
        this.timer = setTimeout(() => this.pollLoop(), backoff);
      }
      return;
    }

    if (this.isRunning) {
      this.timer = setTimeout(() => this.pollLoop(), this.config.pollIntervalMs);
    }
  }

  private async fetchMinaConversations(userId: string, serviceToken: string, hardwareDeviceId?: string, limit = 2): Promise<any> {
    const requestId = generateMinaRequestId();
    const timestamp = Date.now();
    let url = `https://api2.mina.mi.com/admin/v2/conversation_records?limit=${limit}&requestId=${requestId}&timestamp=${timestamp}`;
    if (hardwareDeviceId && !hardwareDeviceId.startsWith('did-') && !hardwareDeviceId.startsWith('manual_')) {
      url += `&hardwareDeviceId=${encodeURIComponent(hardwareDeviceId)}`;
    }

    const headers = buildMinaHeaders(userId, serviceToken);
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(4000)
    });

    if (!res.ok) {
      throw new Error(`Mina Conversation API returned HTTP ${res.status}`);
    }

    const json: any = await res.json();
    return json?.data || json;
  }

  private async pollLatestConversations() {
    if (!this.getAuthInfoFn) return;
    const auth = this.getAuthInfoFn();
    if (!auth || !auth.userId || !auth.serviceToken) return;

    const devices = auth.devices || [];
    if (devices.length === 0) return;

    let targetDevice = devices.find(d => d.did === this.config.targetDeviceId || d.deviceID === this.config.targetDeviceId);
    if (!targetDevice) {
      targetDevice = devices[0];
    }
    if (!targetDevice) return;

    const deviceId = targetDevice.did;
    const hardwareDeviceId = (targetDevice as any).deviceID || (targetDevice as any).hardwareDeviceId || targetDevice.did;
    const deviceName = targetDevice.name || targetDevice.model || '小爱音箱';

    const data = await this.fetchMinaConversations(auth.userId, auth.serviceToken, hardwareDeviceId, 2);
    if (!data || !data.records || !Array.isArray(data.records) || data.records.length === 0) {
      return;
    }

    const latestRecord = data.records[0];
    const recordId = String(latestRecord.recordId || latestRecord.id || `${latestRecord.time}_${latestRecord.query}`);
    const recordTime = latestRecord.time ? Number(latestRecord.time) * 1000 : Date.now();
    const query = (latestRecord.query || '').trim();

    if (!query) return;

    // Prevent duplicate processing
    if (this.lastProcessedRecordId === recordId || recordTime < this.lastProcessedTimestamp) {
      return;
    }

    this.lastProcessedRecordId = recordId;
    this.lastProcessedTimestamp = recordTime;

    await this.processVoiceQuery(query, deviceId, deviceName);
  }

  public async processVoiceQuery(query: string, deviceId?: string, deviceName?: string): Promise<{ matched: boolean; summary: string }> {
    const cleanQuery = query.toLowerCase().replace(/^[，。！？\s]+|[，。！？\s]+$/g, '');
    const enabledRules = this.config.rules.filter(r => r.enabled);

    for (const rule of enabledRules) {
      const matchedPhrase = rule.triggerPhrases.find(phrase => {
        const p = phrase.toLowerCase().trim();
        return p && (cleanQuery.startsWith(p) || cleanQuery.includes(p));
      });

      if (!matchedPhrase) continue;

      let param = '';
      const phraseIdx = cleanQuery.indexOf(matchedPhrase.toLowerCase());
      if (phraseIdx !== -1) {
        param = cleanQuery.slice(phraseIdx + matchedPhrase.length).trim();
      }
      param = param.replace(/^(一下|一首|点|首|首歌曲|首歌)/, '').trim();

      try {
        const result = await this.executeRuleAction(rule, param, deviceId);
        
        this.addLog({
          id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          timestamp: Date.now(),
          queryText: query,
          matchedRuleId: rule.id,
          matchedRuleName: rule.name,
          actionSummary: result.summary,
          status: 'matched',
          deviceId,
          deviceName
        });

        return { matched: true, summary: result.summary };
      } catch (err: any) {
        this.addLog({
          id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          timestamp: Date.now(),
          queryText: query,
          matchedRuleId: rule.id,
          matchedRuleName: rule.name,
          actionSummary: `执行失败: ${err.message}`,
          status: 'error',
          deviceId,
          deviceName
        });
        return { matched: false, summary: err.message };
      }
    }

    this.addLog({
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      queryText: query,
      status: 'ignored',
      actionSummary: '未命中私有音乐语音指令',
      deviceId,
      deviceName
    });

    return { matched: false, summary: '未命中私有音乐指令' };
  }

  private async executeRuleAction(rule: VoiceCommandRule, param: string, deviceId?: string): Promise<{ success: boolean; summary: string }> {
    switch (rule.actionType) {
      case 'play_song_search': {
        const songs = this.getSongsFn ? this.getSongsFn() : [];
        if (songs.length === 0) {
          throw new Error('当前音乐库中暂无歌曲');
        }

        const keyword = param || '精选';
        const targetSong = this.fuzzyFindSong(songs, keyword);
        if (!targetSong) {
          throw new Error(`在歌库中未找到与「${keyword}」匹配的歌曲`);
        }

        if (this.config.ttsFeedbackEnabled && rule.ttsFeedback && deviceId && this.sendTtsFn) {
          const tts = rule.ttsFeedback.replace('{title}', `${targetSong.title} ${targetSong.artist || ''}`);
          await this.sendTtsFn(deviceId, tts).catch(() => {});
          await new Promise(r => setTimeout(r, 1200));
        }

        if (this.playSongFn) {
          await this.playSongFn(targetSong, '语音点歌', deviceId);
        }

        return {
          success: true,
          summary: `已点播歌曲:《${targetSong.title}》- ${targetSong.artist || '未知'}`
        };
      }

      case 'play_random_all': {
        const songs = this.getSongsFn ? this.getSongsFn() : [];
        if (songs.length === 0) throw new Error('歌库为空');

        const randomIndex = Math.floor(Math.random() * songs.length);
        const randomSong = songs[randomIndex];

        if (this.config.ttsFeedbackEnabled && rule.ttsFeedback && deviceId && this.sendTtsFn) {
          const tts = rule.ttsFeedback.replace('{title}', randomSong.title);
          await this.sendTtsFn(deviceId, tts).catch(() => {});
          await new Promise(r => setTimeout(r, 1000));
        }

        if (this.playSongFn) {
          await this.playSongFn(randomSong, '随机播放全部', deviceId);
        }

        return {
          success: true,
          summary: `随机起播:《${randomSong.title}》`
        };
      }

      case 'play_playlist': {
        const playlists = this.getPlaylistsFn ? this.getPlaylistsFn() : [];
        const playlistId = rule.targetPlaylistId || 'default';
        const targetPl = playlists.find(p => p.id === playlistId) || playlists[0];

        if (this.config.ttsFeedbackEnabled && rule.ttsFeedback && deviceId && this.sendTtsFn) {
          const tts = rule.ttsFeedback.replace('{playlist}', targetPl ? targetPl.name : '歌单');
          await this.sendTtsFn(deviceId, tts).catch(() => {});
          await new Promise(r => setTimeout(r, 1000));
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
        if (!rule.controlAction) throw new Error('未定义控制动作');
        if (this.controlPlaybackFn) {
          await this.controlPlaybackFn(rule.controlAction, deviceId);
        }
        return {
          success: true,
          summary: `已执行播控指令: ${rule.controlAction}`
        };
      }

      default:
        throw new Error('未知的指令动作类型');
    }
  }

  private fuzzyFindSong(songs: Song[], keyword: string): Song | null {
    if (!keyword) return songs[0] || null;
    const kw = keyword.toLowerCase().trim();

    // 1. Exact match title
    const exactTitle = songs.find(s => s.title.toLowerCase() === kw);
    if (exactTitle) return exactTitle;

    // 2. Contains match title
    const matchTitle = songs.find(s => s.title.toLowerCase().includes(kw) || kw.includes(s.title.toLowerCase()));
    if (matchTitle) return matchTitle;

    // 3. Match artist
    const matchArtist = songs.find(s => (s.artist || '').toLowerCase().includes(kw));
    if (matchArtist) return matchArtist;

    // 4. Match album / lyrics
    const matchAny = songs.find(s => {
      const full = `${s.title} ${s.artist || ''} ${s.album || ''}`.toLowerCase();
      return full.includes(kw);
    });

    return matchAny || songs[0] || null;
  }

  private addLog(log: VoiceDialogueLog) {
    this.dialogueLogs.unshift(log);
    if (this.dialogueLogs.length > 100) {
      this.dialogueLogs.pop();
    }
  }
}

export const voiceCommandService = VoiceCommandService.getInstance();
