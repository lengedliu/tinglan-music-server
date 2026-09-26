import { EventEmitter } from 'events';
import path from 'path';
import { Song } from './musicEngine.js';
import { JsonStore } from '../storage/jsonStore.js';

export type QueueLoopMode = 'all' | 'one' | 'shuffle';

export interface QueueStatus {
  queue: Song[];
  currentIndex: number;
  currentSong: Song | null;
  isPlaying: boolean;
  loopMode: QueueLoopMode;
  targetDid: string;
  targetDeviceName?: string;
  startTime: number;
  duration: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  totalSongs: number;
}

export interface PersistedQueueSnapshot {
  queue: Song[];
  currentIndex: number;
  loopMode: QueueLoopMode;
  targetDid: string;
  targetDeviceName: string;
  isPlaying: boolean;
  songStartTime: number;
  currentDuration: number;
  currentSongStarted: boolean;
  savedAt: number;
}

export type CastDispatcherFn = (song: Song, targetDid: string, seekSeconds?: number) => Promise<{ success: boolean; message?: string; error?: string }>;
export type PauseDispatcherFn = (targetDid: string) => Promise<any>;
export type SongProviderFn = () => Song[];

export class QueueEngine extends EventEmitter {
  private queue: Song[] = [];
  private currentIndex: number = 0;
  private loopMode: QueueLoopMode = 'all';
  private isPlaying: boolean = false;
  private targetDid: string = '';
  private targetDeviceName: string = '';
  private songStartTime: number = 0;
  private currentDuration: number = 180;
  private currentSongStarted: boolean = false;
  private autoAdvanceTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private castDispatcher: CastDispatcherFn | null = null;
  private pauseDispatcher: PauseDispatcherFn | null = null;
  private songProvider: SongProviderFn | null = null;
  private isTransitioning: boolean = false;
  private preheatHandler: ((song: Song, targetDid: string, isDeep?: boolean) => void) | null = null;
  private deepPreheatDoneForIndex: number = -1;
  private stateFilePath: string;

  constructor(dataDir?: string) {
    super();
    const resolvedDataDir = dataDir || process.env.DATA_DIR || path.join(process.cwd(), 'data');
    this.stateFilePath = path.join(resolvedDataDir, 'queue_snapshot.json');
    this.loadPersistedState();
  }

  public setDataDir(dataDir: string) {
    this.stateFilePath = path.join(dataDir, 'queue_snapshot.json');
    this.loadPersistedState();
  }

  /**
   * Persist current runtime snapshot atomically to KV storage
   */
  public saveSnapshot() {
    try {
      const snapshot: PersistedQueueSnapshot = {
        queue: this.queue,
        currentIndex: this.currentIndex,
        loopMode: this.loopMode,
        targetDid: this.targetDid,
        targetDeviceName: this.targetDeviceName,
        isPlaying: this.isPlaying,
        songStartTime: this.songStartTime,
        currentDuration: this.currentDuration,
        currentSongStarted: this.currentSongStarted,
        savedAt: Date.now()
      };
      JsonStore.saveJson(this.stateFilePath, snapshot);
    } catch (err: any) {
      console.warn('[QueueEngine] Failed to save queue snapshot:', err?.message);
    }
  }

  /**
   * Determine if a track is an infinite 24h Live Stream / Radio Station
   */
  public isLiveStream(song?: Song | null): boolean {
    if (!song) return false;
    if (song.isLiveStream) return true;
    if (typeof song.id === 'string' && (song.id.startsWith('station_') || song.id.includes('station_'))) return true;
    if (song.genre === '网络电台' || song.genre === 'Live Radio' || song.album === '网络电台') return true;
    if (typeof song.url === 'string' && (song.url.includes('.m3u8') || song.url.includes('/api/radio/stream/'))) return true;
    return false;
  }

  /**
   * Load and seamlessly resume state from persisted KV snapshot
   * Optimization P0-3: Silent standby on boot — restores queue & index, but NEVER auto-triggers audio output to speakers on restart!
   */
  public loadPersistedState() {
    try {
      const saved = JsonStore.readJson<PersistedQueueSnapshot | null>(this.stateFilePath, null);
      if (!saved || !Array.isArray(saved.queue) || saved.queue.length === 0) {
        return;
      }

      this.queue = saved.queue;
      this.currentIndex = Math.max(0, Math.min(saved.currentIndex || 0, this.queue.length - 1));
      this.loopMode = saved.loopMode || 'all';
      this.targetDid = saved.targetDid || '';
      this.targetDeviceName = saved.targetDeviceName || '';

      this.currentDuration = saved.currentDuration || 180;
      this.isPlaying = false;
      this.currentSongStarted = false;
      this.songStartTime = 0;
      this.clearTimer();
      this.stopHeartbeat();
      console.log(`[QueueEngine] 📂 已加载持久化播放队列快照 (静默待命): 共 ${this.queue.length} 首, 停留在第 ${this.currentIndex + 1} 首《${this.queue[this.currentIndex]?.title}》`);
    } catch (err: any) {
      console.warn('[QueueEngine] Failed to restore queue snapshot:', err?.message);
    }
  }

  public override emit(event: string | symbol, ...args: any[]): boolean {
    if (event === 'change') {
      this.saveSnapshot();
    }
    return super.emit(event, ...args);
  }

  public setCastDispatcher(dispatcher: CastDispatcherFn) {
    this.castDispatcher = dispatcher;
  }

  public setPauseDispatcher(dispatcher: PauseDispatcherFn) {
    this.pauseDispatcher = dispatcher;
  }

  public setSongProvider(provider: SongProviderFn) {
    this.songProvider = provider;
  }

  public setPreheatHandler(handler: (song: Song, targetDid: string, isDeep?: boolean) => void) {
    this.preheatHandler = handler;
  }

  public getNextSong(): Song | null {
    if (this.queue.length <= 1) return null;
    let nextIdx = (this.currentIndex + 1) % this.queue.length;
    return this.queue[nextIdx] || null;
  }

  private triggerNextTrackPreheat(isDeep: boolean = false) {
    if (!this.preheatHandler || this.queue.length <= 1) return;
    const nextSong = this.getNextSong();
    if (nextSong) {
      try {
        if (this.isPlaying && this.preheatHandler) {
          this.preheatHandler(nextSong, this.targetDid, isDeep);
        }
      } catch (err: any) {
        console.warn('[QueueEngine] Preheat trigger warning:', err?.message);
      }
    }
  }

  public setTargetDevice(targetDid: string, targetDeviceName?: string) {
    if (targetDid) this.targetDid = targetDid;
    if (targetDeviceName) this.targetDeviceName = targetDeviceName;
  }

  /**
   * Synchronize active playing track and queue context from single cast / voice search / API
   */
  public syncCurrentSong(song: Song, targetDid: string = '', allSongs?: Song[], deviceName?: string, mode?: QueueLoopMode) {
    if (targetDid) this.targetDid = targetDid;
    if (deviceName) this.targetDeviceName = deviceName;
    if (mode) this.loopMode = mode;

    this.clearTimer();
    this.isTransitioning = false;

    const songs = allSongs && allSongs.length > 0 ? allSongs : (this.songProvider ? this.songProvider() : []);
    if (songs.length > 0) {
      this.queue = [...songs];
      const cleanSongId = (song.id || '').replace(/\.(mp3|flac|wav|m4a|aac|ogg|opus)$/i, '');
      const matchIdx = this.queue.findIndex(s => {
        const cleanS = (s.id || '').replace(/\.(mp3|flac|wav|m4a|aac|ogg|opus)$/i, '');
        return cleanS === cleanSongId || s.id === song.id || s.title === song.title;
      });
      this.currentIndex = matchIdx >= 0 ? matchIdx : 0;
    } else {
      this.queue = [song];
      this.currentIndex = 0;
    }

    const isLive = this.isLiveStream(song);
    this.isPlaying = true;
    this.currentSongStarted = false;
    this.songStartTime = Date.now();
    this.currentDuration = isLive ? 0 : ((song.duration && song.duration > 5) ? song.duration : 180);

    console.log(`[QueueEngine] 🔄 同步当前曲目: 第 ${this.currentIndex + 1}/${this.queue.length} 首《${this.queue[this.currentIndex]?.title}》, 模式: ${this.loopMode}, 时长: ${isLive ? '24h无限电台直播' : `${this.currentDuration}s`}`);

    if (!isLive) {
      this.scheduleAutoAdvance(this.currentDuration);
      this.startHeartbeat();
      this.triggerNextTrackPreheat();
    } else {
      console.log(`[QueueEngine] 📻 当前曲目为网络电台直播流《${song.title}》，已禁用切歌计时器`);
      this.clearTimer();
      this.stopHeartbeat();
    }
    this.emit('change', this.getStatus());
  }

  /**
   * Bi-directional Reverse Status Sensing:
   * Called when background adaptive heartbeat discovers hardware physical play state changes
   */
  public onHardwareStateChange(did: string, hardwareIsPlaying: boolean, volume?: number) {
    if (this.targetDid && this.targetDid !== did) return;
    if (this.isTransitioning) return;

    const now = Date.now();
    // Within 4s of song initiation, give speaker firmware time to buffer and establish playback
    if (this.songStartTime > 0 && (now - this.songStartTime < 4000)) {
      return;
    }

    if (this.isPlaying && !hardwareIsPlaying) {
      console.log(`[QueueEngine] 🎛️ 感知到小爱音箱 (${did}) 硬件已停止/暂停播放 (物理按键或语音交互)，自动同步服务端状态并销毁计时器`);
      this.pause();
    } else if (!this.isPlaying && hardwareIsPlaying) {
      console.log(`[QueueEngine] 🎛️ 感知到小爱音箱 (${did}) 硬件已恢复播放，自动同步服务端状态`);
      this.resume();
    }
  }

  /**
   * Ensure queue is populated from songProvider if empty or single song
   */
  private ensureQueueContext() {
    if ((this.queue.length <= 1) && this.songProvider) {
      const allSongs = this.songProvider();
      if (allSongs && allSongs.length > 0) {
        const currentSong = this.queue[this.currentIndex];
        this.queue = [...allSongs];
        if (currentSong) {
          const matchIdx = this.queue.findIndex(s => s.id === currentSong.id || s.title === currentSong.title);
          this.currentIndex = matchIdx >= 0 ? matchIdx : 0;
        }
      }
    }
  }

  /**
   * Restore persistent queue state from disk/database
   */
  public restoreState(state: { queue?: Song[]; currentIndex?: number; loopMode?: QueueLoopMode; targetDid?: string; targetDeviceName?: string }) {
    if (Array.isArray(state.queue)) {
      this.queue = [...state.queue];
    }
    if (typeof state.currentIndex === 'number') {
      this.currentIndex = Math.max(0, Math.min(state.currentIndex, Math.max(0, this.queue.length - 1)));
    }
    if (state.loopMode) {
      this.loopMode = state.loopMode;
    }
    if (state.targetDid) {
      this.targetDid = state.targetDid;
    }
    if (state.targetDeviceName) {
      this.targetDeviceName = state.targetDeviceName;
    }
    this.isPlaying = false;
  }

  public getStatus(): QueueStatus {
    const currentSong = this.queue[this.currentIndex] || null;
    const now = Date.now();
    const elapsed = this.isPlaying && this.songStartTime > 0 
      ? Math.max(0, Math.floor((now - this.songStartTime) / 1000)) 
      : 0;
    const remaining = this.isPlaying && this.currentDuration > 0
      ? Math.max(0, this.currentDuration - elapsed)
      : 0;

    return {
      queue: this.queue,
      currentIndex: this.currentIndex,
      currentSong,
      isPlaying: this.isPlaying,
      loopMode: this.loopMode,
      targetDid: this.targetDid,
      targetDeviceName: this.targetDeviceName,
      startTime: this.songStartTime,
      duration: this.currentDuration,
      elapsedSeconds: elapsed,
      remainingSeconds: remaining,
      totalSongs: this.queue.length
    };
  }

  /**
   * Start or replace current active queue and cast the target song to the speaker
   */
  public async playQueue(
    songs: Song[],
    startIndex: number = 0,
    targetDid: string = '',
    deviceName: string = '',
    mode?: QueueLoopMode
  ): Promise<{ success: boolean; currentSong: Song | null; message: string }> {
    if (!songs || songs.length === 0) {
      return { success: false, currentSong: null, message: '播放队列为空' };
    }

    this.clearTimer();
    this.queue = [...songs];
    this.currentIndex = Math.max(0, Math.min(startIndex, this.queue.length - 1));
    this.loopMode = mode || 'all';

    if (targetDid) {
      this.targetDid = targetDid;
    }
    if (deviceName) {
      this.targetDeviceName = deviceName;
    }

    const song = this.queue[this.currentIndex];
    const isLive = this.isLiveStream(song);
    this.isPlaying = true;
    this.currentSongStarted = false;
    this.songStartTime = Date.now();
    this.currentDuration = isLive ? 0 : ((song.duration && song.duration > 5) ? song.duration : 180);

    console.log(`[QueueEngine] ▶️ 启动全歌单连续投播: 共 ${this.queue.length} 首, 起始首:《${song.title}》, 模式: ${this.loopMode}, 时长: ${isLive ? '24h无限电台直播' : `${this.currentDuration}s`}`);

    // Dispatch cast command to the target speaker
    let dispatchRes: { success: boolean; message?: string; error?: string } = { success: true, message: '已下发投播指令' };
    if (this.castDispatcher && this.targetDid) {
      try {
        dispatchRes = await this.castDispatcher(song, this.targetDid);
      } catch (err: any) {
        dispatchRes = { success: false, error: err.message };
      }
    }

    if (!isLive) {
      // Schedule auto advance based on duration + safety buffer
      this.scheduleAutoAdvance(this.currentDuration);
      this.startHeartbeat();
      this.triggerNextTrackPreheat();
    } else {
      console.log(`[QueueEngine] 📻 当前曲目为网络电台直播流《${song.title}》，已完全禁用自动切歌计时器`);
      this.clearTimer();
      this.stopHeartbeat();
    }
    this.emit('change', this.getStatus());

    return {
      success: dispatchRes.success,
      currentSong: song,
      message: dispatchRes.message || `正在为【${this.targetDeviceName || '小爱音箱'}】连续播放全歌单 (${this.currentIndex + 1}/${this.queue.length} 首):《${song.title}》`
    };
  }

  /**
   * Synchronize stream start event from streamServer / speaker HTTP request
   * CRITICAL FIX: Only set initial start time once per song; do NOT push back the timer on intermediate chunks.
   * If speaker re-requests byte 0 after playing for a while, intercept the single-track loop and auto-advance!
   */
  public notifyStreamConsumed(
    songId: string,
    options?: { isBrowser?: boolean; startByte?: number; range?: string; duration?: number }
  ) {
    // Ignore browser audio requests — QueueEngine governs the hardware speaker playback
    if (options?.isBrowser) return;

    const rawCleanSongId = decodeURIComponent(songId).replace(/\.(mp3|flac|wav|m4a|aac|ogg|opus)$/i, '').trim();

    // If queue is empty or not playing, auto-adopt stream from provider
    if (!this.isPlaying || this.queue.length === 0) {
      this.ensureQueueContext();
      if (this.queue.length > 0) {
        const matchIdx = this.queue.findIndex(s => {
          const sClean = decodeURIComponent(s.id || '').replace(/\.(mp3|flac|wav|m4a|aac|ogg|opus)$/i, '').trim();
          return sClean === rawCleanSongId || s.id === songId || rawCleanSongId.includes(sClean) || sClean.includes(rawCleanSongId);
        });
        if (matchIdx >= 0) {
          this.currentIndex = matchIdx;
          this.isPlaying = true;
          this.currentSongStarted = false;
          console.log(`[QueueEngine] 🔄 监听到音箱硬件拉流事件，自动接管并同步当前曲目: 第 ${this.currentIndex + 1}/${this.queue.length} 首《${this.queue[this.currentIndex]?.title}》`);
        }
      }
    }

    if (this.queue.length === 0) return;

    const currentSong = this.queue[this.currentIndex];
    if (!currentSong) return;

    const cleanCurrentId = decodeURIComponent(currentSong.id || '').replace(/\.(mp3|flac|wav|m4a|aac|ogg|opus)$/i, '').trim();

    const matchesCurrent = (rawCleanSongId === cleanCurrentId) || 
      songId.includes(cleanCurrentId) || 
      cleanCurrentId.includes(rawCleanSongId);

    if (!matchesCurrent) {
      // Check if it matches another song in the queue (e.g. user or speaker switched track)
      const otherIdx = this.queue.findIndex(s => {
        const sClean = decodeURIComponent(s.id || '').replace(/\.(mp3|flac|wav|m4a|aac|ogg|opus)$/i, '').trim();
        return sClean === rawCleanSongId || s.id === songId;
      });
      if (otherIdx >= 0) {
        this.currentIndex = otherIdx;
        this.currentSongStarted = false;
        console.log(`[QueueEngine] 🔄 音箱拉流曲目匹配队列第 ${this.currentIndex + 1} 首《${this.queue[this.currentIndex]?.title}》`);
      } else {
        return;
      }
    }

    const activeSong = this.queue[this.currentIndex];
    const now = Date.now();
    const isLive = this.isLiveStream(activeSong);

    // If current track is a 24h live stream or radio station, disable all timers & anti-loop guards!
    if (isLive) {
      this.currentDuration = 0;
      this.clearTimer();
      this.stopHeartbeat();
      if (!this.currentSongStarted) {
        this.currentSongStarted = true;
        this.songStartTime = now;
        console.log(`[QueueEngine] 📻 音箱硬件已连接网络电台直播流《${activeSong?.title}》，已完全豁免切歌计时器`);
        this.emit('change', this.getStatus());
      }
      return;
    }

    // 1. First time speaker pulls stream for this song
    if (!this.currentSongStarted) {
      this.currentSongStarted = true;
      this.songStartTime = now;
      if (options?.duration && options.duration > 5) {
        this.currentDuration = options.duration;
      } else if (activeSong?.duration && activeSong.duration > 5) {
        this.currentDuration = activeSong.duration;
      } else {
        this.currentDuration = 180;
      }

      console.log(`[QueueEngine] 🎧 音箱硬件已成功拉取流媒体《${activeSong?.title}》，启动精准切歌倒计时 (时长: ${this.currentDuration}s, 模式: ${this.loopMode})`);
      this.scheduleAutoAdvance(this.currentDuration);
      this.startHeartbeat();
      this.triggerNextTrackPreheat();
      this.emit('change', this.getStatus());
      return;
    }

    // 2. Subsequent stream chunk requests for the active song
    const elapsed = Math.floor((now - this.songStartTime) / 1000);
    const startByte = options?.startByte ?? (options?.range ? parseInt(options.range.replace(/^bytes=/, '').split('-')[0], 10) : undefined);

    // ANTI-LOOP GUARD & RECONNECT DEBOUNCING:
    // Only intercept when >= 75% of song duration has elapsed AND byte 0 is re-requested.
    // If byte 0 is re-requested early in the track (< 75% duration), treat it as WiFi jitter/reconnection without skipping!
    const minElapsedThreshold = Math.max(15, this.currentDuration * 0.75);
    if (startByte === 0) {
      if (elapsed >= minElapsedThreshold) {
        if (this.loopMode === 'one') {
          console.log(`[QueueEngine] 🔂 单曲循环模式：音箱重新从头播放《${activeSong?.title}》`);
          this.songStartTime = now;
          this.scheduleAutoAdvance(this.currentDuration);
        } else if (!this.isTransitioning) {
          console.log(`[QueueEngine] 🔄 监测到音箱硬件已播完曲目并尝试单曲循环回绕 (已播放 ${elapsed}s / 总时长 ${this.currentDuration}s)，立即拦截单曲循环，自动切播队列下一首！`);
          this.next(false).catch(err => console.warn('[QueueEngine] 循环拦截切歌异常:', err));
        }
        return;
      } else {
        console.log(`[QueueEngine] 📶 捕获到音箱弱网/网络抖动重新握手请求 (已播 ${elapsed}s / 总时长 ${this.currentDuration}s)，判定为网络重连，保持当前曲目平稳播放`);
      }
    }

    // Normal intermediate range requests (buffering bytes): DO NOT reset songStartTime or autoAdvanceTimer!
  }

  /**
   * Phase 3: Hardware closed-loop EOF / stream completion event
   * Called when speaker has fetched all audio bytes and closed the connection.
   */
  public notifyStreamCompleted(songId: string, clientIp?: string) {
    if (!this.isPlaying || this.queue.length === 0 || this.isTransitioning) return;
    const currentSong = this.queue[this.currentIndex];
    if (!currentSong) return;

    const rawCleanSongId = decodeURIComponent(songId).replace(/\.(mp3|flac|wav|m4a|aac|ogg|opus)$/i, '').trim();
    const cleanCurrentId = decodeURIComponent(currentSong.id || '').replace(/\.(mp3|flac|wav|m4a|aac|ogg|opus)$/i, '').trim();
    if (rawCleanSongId !== cleanCurrentId && !songId.includes(cleanCurrentId)) return;

    const now = Date.now();
    const elapsed = Math.floor((now - this.songStartTime) / 1000);
    const remaining = this.currentDuration - elapsed;

    console.log(`[QueueEngine] 🏁 捕获音箱流结束闭环事件 (已播放 ${elapsed}s / 总时长 ${this.currentDuration}s, 剩余 ${remaining}s)`);

    // If less than 4 seconds remaining, cleanly trigger next track immediately
    if (remaining <= 4) {
      console.log(`[QueueEngine] ⏭️ 音箱已完整拉取全部音频数据且接近曲目尾声，执行零静音无缝切歌！`);
      this.next(false).catch(err => console.warn('[QueueEngine] 闭环切歌异常:', err));
    }
  }

  /**
   * Compatibility alias for legacy stream completion event
   */
  public notifyStreamEof(songId: string, _totalBytes?: number, clientIp?: string) {
    this.notifyStreamCompleted(songId, clientIp);
  }

  /**
   * Phase 3: Seamless cross-speaker playback handover
   * Transfers active queue, current track, and precise playback position to target speaker.
   */
  public async transferPlayback(
    newTargetDid: string,
    newTargetDeviceName?: string,
    positionOffsetSeconds?: number
  ): Promise<{ success: boolean; message: string; elapsedSeconds: number; song: Song | null }> {
    if (!newTargetDid) {
      return { success: false, message: '目标音箱 DID 不能为空', elapsedSeconds: 0, song: null };
    }
    this.ensureQueueContext();
    if (this.queue.length === 0 || !this.currentSongStarted) {
      this.targetDid = newTargetDid;
      if (newTargetDeviceName) this.targetDeviceName = newTargetDeviceName;
      this.emit('change', this.getStatus());
      return {
        success: true,
        message: `已将播放目标音箱设置为【${this.targetDeviceName}】`,
        elapsedSeconds: 0,
        song: this.queue[this.currentIndex] || null
      };
    }

    const currentSong = this.queue[this.currentIndex];
    const oldTargetDid = this.targetDid;
    const oldTargetName = this.targetDeviceName;

    const now = Date.now();
    const elapsedSeconds = (typeof positionOffsetSeconds === 'number' && positionOffsetSeconds >= 0)
      ? positionOffsetSeconds
      : Math.max(0, Math.floor((now - this.songStartTime) / 1000));

    console.log(`[QueueEngine] 🔄 触发跨音箱无缝流转: 从【${oldTargetName || oldTargetDid}】->【${newTargetDeviceName || newTargetDid}】，保持曲目《${currentSong?.title}》，接续进度 ${elapsedSeconds}s`);

    // 1. Pause / Stop playback on the old speaker
    if (oldTargetDid && oldTargetDid !== newTargetDid && this.pauseDispatcher) {
      try {
        await this.pauseDispatcher(oldTargetDid);
      } catch (pauseErr: any) {
        console.warn('[QueueEngine] Handover: Failed to pause old speaker:', pauseErr?.message);
      }
    }

    // 2. Switch target device
    this.targetDid = newTargetDid;
    if (newTargetDeviceName) this.targetDeviceName = newTargetDeviceName;

    // 3. Dispatch to new speaker with seekSeconds parameter
    let dispatchRes: { success: boolean; message?: string; error?: string } = { success: true };
    if (this.castDispatcher && currentSong) {
      try {
        dispatchRes = await this.castDispatcher(currentSong, newTargetDid, elapsedSeconds);
      } catch (err: any) {
        dispatchRes = { success: false, error: err.message };
      }
    }

    // 4. Update playback timer and remaining duration
    this.songStartTime = Date.now() - (elapsedSeconds * 1000);
    const remaining = Math.max(5, this.currentDuration - elapsedSeconds);
    this.scheduleAutoAdvance(remaining);
    this.emit('change', this.getStatus());

    return {
      success: dispatchRes.success,
      message: dispatchRes.success
        ? `已无缝流转播放至【${this.targetDeviceName}】（自 ${elapsedSeconds}s 处续播）`
        : `流转指令下发异常: ${dispatchRes.error || dispatchRes.message || '音箱未响应'}`,
      elapsedSeconds,
      song: currentSong
    };
  }

  /**
   * Play next song in the active queue
   */
  public async next(force: boolean = true, targetDidOverride?: string): Promise<{ success: boolean; song: Song | null; message: string }> {
    if (targetDidOverride) this.targetDid = targetDidOverride;
    this.ensureQueueContext();

    if (this.queue.length === 0) {
      return { success: false, song: null, message: '播放队列为空' };
    }

    if (force) {
      this.isTransitioning = false;
    }

    let nextIdx = this.currentIndex;

    if (this.loopMode === 'shuffle') {
      if (this.queue.length > 1) {
        do {
          nextIdx = Math.floor(Math.random() * this.queue.length);
        } while (nextIdx === this.currentIndex);
      }
    } else if (this.loopMode === 'one' && !force) {
      // User explicitly wanted single track loop
      nextIdx = this.currentIndex;
      console.log(`[QueueEngine] 🔂 单曲循环模式：重新播放《${this.queue[nextIdx]?.title}》`);
    } else {
      // Default / 'all': Sequence through whole playlist
      nextIdx = (this.currentIndex + 1) % this.queue.length;
    }

    return this.jumpTo(nextIdx, targetDidOverride);
  }

  /**
   * Play previous song in the active queue
   */
  public async prev(targetDidOverride?: string): Promise<{ success: boolean; song: Song | null; message: string }> {
    if (targetDidOverride) this.targetDid = targetDidOverride;
    this.ensureQueueContext();

    if (this.queue.length === 0) {
      return { success: false, song: null, message: '播放队列为空' };
    }

    this.isTransitioning = false;

    let prevIdx = 0;
    if (this.loopMode === 'shuffle') {
      prevIdx = Math.floor(Math.random() * this.queue.length);
    } else {
      prevIdx = (this.currentIndex - 1 + this.queue.length) % this.queue.length;
    }

    return this.jumpTo(prevIdx, targetDidOverride);
  }

  /**
   * Jump to specific song index in the queue
   */
  public async jumpTo(index: number, targetDidOverride?: string): Promise<{ success: boolean; song: Song | null; message: string }> {
    if (targetDidOverride) this.targetDid = targetDidOverride;
    this.ensureQueueContext();

    if (this.queue.length === 0) {
      return { success: false, song: null, message: '播放队列为空' };
    }

    if (this.isTransitioning) {
      console.log('[QueueEngine] ⏳ 正在切歌转换中，跳过重叠指令');
      return { success: true, song: this.queue[this.currentIndex], message: '正在切换中' };
    }

    this.isTransitioning = true;
    this.clearTimer();

    this.currentIndex = Math.max(0, Math.min(index, this.queue.length - 1));
    const song = this.queue[this.currentIndex];
    const isLive = this.isLiveStream(song);
    this.isPlaying = true;
    this.currentSongStarted = false;
    this.songStartTime = Date.now();
    this.currentDuration = isLive ? 0 : ((song.duration && song.duration > 5) ? song.duration : 180);

    console.log(`[QueueEngine] ⏭️ 切换至第 ${this.currentIndex + 1}/${this.queue.length} 首:《${song.title}》 (时长: ${isLive ? '24h无限电台直播' : `${this.currentDuration}s`})`);

    let dispatchRes: { success: boolean; message?: string; error?: string } = { success: true, message: '已切歌并下发投播' };
    if (this.castDispatcher && this.targetDid) {
      try {
        dispatchRes = await this.castDispatcher(song, this.targetDid);
      } catch (err: any) {
        dispatchRes = { success: false, error: err.message };
      }
    }

    if (!isLive) {
      this.scheduleAutoAdvance(this.currentDuration);
      this.startHeartbeat();
    } else {
      console.log(`[QueueEngine] 📻 切换至网络电台《${song.title}》，已禁用切歌计时器`);
      this.clearTimer();
      this.stopHeartbeat();
    }
    this.emit('change', this.getStatus());

    setTimeout(() => {
      this.isTransitioning = false;
    }, 1500);

    return {
      success: dispatchRes.success,
      song,
      message: dispatchRes.message || `已切换至第 ${this.currentIndex + 1}/${this.queue.length} 首：《${song.title}》`
    };
  }

  /**
   * Add songs to the queue
   */
  public addSongs(songs: Song[], playImmediately: boolean = false) {
    if (!songs || songs.length === 0) return;
    this.queue.push(...songs);
    if (playImmediately || (!this.isPlaying && this.queue.length === songs.length)) {
      this.jumpTo(this.queue.length - songs.length);
    } else {
      this.emit('change', this.getStatus());
    }
  }

  /**
   * Insert a song directly after the currently playing song (Play Next)
   */
  public insertNext(song: Song): boolean {
    if (!song) return false;
    if (this.queue.length === 0) {
      this.queue = [song];
      this.currentIndex = 0;
      this.emit('change', this.getStatus());
      return true;
    }
    const insertAt = Math.min(this.currentIndex + 1, this.queue.length);
    this.queue.splice(insertAt, 0, song);
    this.emit('change', this.getStatus());
    return true;
  }

  /**
   * Reorder the queue: move item from fromIndex to toIndex
   */
  public reorder(fromIndex: number, toIndex: number): boolean {
    if (
      fromIndex < 0 ||
      fromIndex >= this.queue.length ||
      toIndex < 0 ||
      toIndex >= this.queue.length ||
      fromIndex === toIndex
    ) {
      return false;
    }

    const currentTrack = this.queue[this.currentIndex];
    const [movedItem] = this.queue.splice(fromIndex, 1);
    this.queue.splice(toIndex, 0, movedItem);

    // Keep currentIndex synced with the current playing track
    if (currentTrack) {
      const newCurrentIdx = this.queue.findIndex(s => s.id === currentTrack.id);
      if (newCurrentIdx !== -1) {
        this.currentIndex = newCurrentIdx;
      }
    }

    this.emit('change', this.getStatus());
    return true;
  }

  /**
   * Replace the entire queue with a new song order
   */
  public replaceQueue(newQueue: Song[], newCurrentIndex?: number): boolean {
    if (!Array.isArray(newQueue)) return false;
    this.queue = [...newQueue];
    if (typeof newCurrentIndex === 'number' && newCurrentIndex >= 0 && newCurrentIndex < this.queue.length) {
      this.currentIndex = newCurrentIndex;
    } else {
      this.currentIndex = Math.max(0, Math.min(this.currentIndex, this.queue.length - 1));
    }
    this.emit('change', this.getStatus());
    return true;
  }

  /**
   * Remove a song from the queue
   */
  public removeSong(songId: string): boolean {
    const idx = this.queue.findIndex(s => s.id === songId);
    if (idx === -1) return false;

    this.queue.splice(idx, 1);
    if (this.queue.length === 0) {
      this.clear();
      return true;
    }

    if (idx < this.currentIndex) {
      this.currentIndex = Math.max(0, this.currentIndex - 1);
    } else if (idx === this.currentIndex) {
      this.currentIndex = Math.min(this.currentIndex, this.queue.length - 1);
      if (this.isPlaying) {
        this.jumpTo(this.currentIndex);
      }
    }
    this.emit('change', this.getStatus());
    return true;
  }

  /**
   * Clear active queue
   */
  public clear() {
    this.clearTimer();
    this.stopHeartbeat();
    this.queue = [];
    this.currentIndex = 0;
    this.isPlaying = false;
    this.currentSongStarted = false;
    this.songStartTime = 0;
    this.currentDuration = 0;
    this.emit('change', this.getStatus());
  }

  /**
   * Set playback loop mode
   */
  public setLoopMode(mode: QueueLoopMode) {
    this.loopMode = mode;
    console.log(`[QueueEngine] 🔁 循环模式切换为: ${mode}`);
    this.emit('change', this.getStatus());
  }

  /**
   * Pause queue playback
   */
  public pause() {
    this.clearTimer();
    this.stopHeartbeat();
    this.isPlaying = false;
    this.emit('change', this.getStatus());
  }

  /**
   * Resume queue playback
   */
  public resume() {
    if (this.queue.length === 0) return;
    this.isPlaying = true;
    const currentSong = this.queue[this.currentIndex];
    if (this.isLiveStream(currentSong)) {
      this.clearTimer();
      this.stopHeartbeat();
      this.emit('change', this.getStatus());
      return;
    }
    const remaining = Math.max(5, this.currentDuration - Math.floor((Date.now() - this.songStartTime) / 1000));
    this.scheduleAutoAdvance(remaining);
    this.startHeartbeat();
    this.emit('change', this.getStatus());
  }

  private scheduleAutoAdvance(durationSeconds: number) {
    this.clearTimer();
    if (!this.isPlaying) return;

    const currentSong = this.queue[this.currentIndex];
    if (this.isLiveStream(currentSong)) {
      this.clearTimer();
      this.stopHeartbeat();
      return;
    }

    // Smart Ring Buffer Tail Flush: XiaoAi hardware buffers ~128KB-256KB (~2.5-3.5s of audio)
    // Adding 2.5s tail grace buffer completely eliminates end-of-track clipping/swallowing
    const delayMs = Math.max(4500, (durationSeconds + 2.5) * 1000);
    console.log(`[QueueEngine] ⏱️ 已设置精准自动切歌计时器: ${Math.round(delayMs / 1000)}秒后推进下一首 (当前歌曲:《${this.queue[this.currentIndex]?.title}》, 含2.5s音箱硬件Buffer排空缓冲)`);

    this.autoAdvanceTimer = setTimeout(async () => {
      if (this.isPlaying && this.queue.length > 0 && !this.isTransitioning) {
        console.log(`[QueueEngine] ⏭️ 定时器触发：曲目已播放完毕，自动切播队列下一首 (循环模式: ${this.loopMode})`);
        await this.next(false);
      }
    }, delayMs);
  }

  /**
   * Watchdog Heartbeat: Every 1.5s checks elapsed time against duration.
   * Guarantees that even if setTimeout drifts or speaker hangs, the queue automatically advances!
   */
  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.isPlaying || this.queue.length === 0 || this.songStartTime <= 0 || this.isTransitioning) return;
      const currentSong = this.queue[this.currentIndex];
      if (this.isLiveStream(currentSong)) {
        return; // Network radio streams never trigger watchdog force advance
      }
      const elapsed = Math.floor((Date.now() - this.songStartTime) / 1000);
      const remaining = Math.max(0, this.currentDuration - elapsed);

      // Phase 3: Stage 2 Deep Pre-caching when 25s remaining or 75% played
      if (this.deepPreheatDoneForIndex !== this.currentIndex && (remaining <= 25 || elapsed >= this.currentDuration * 0.75)) {
        this.deepPreheatDoneForIndex = this.currentIndex;
        console.log(`[QueueEngine] ⚡ 双阶段预热 Stage 2 激活 (剩余 ${remaining}s): 启动下一首全量预转码`);
        this.triggerNextTrackPreheat(true /* isDeep */);
      }

      const threshold = (this.currentDuration || 180) + 4; // 4.0s safe threshold to let speaker flush full buffer

      if (elapsed >= threshold) {
        console.log(`[QueueEngine] 🛡️ 守护心跳触发：当前曲目《${this.queue[this.currentIndex]?.title}》播放时间已达 ${elapsed}s (总长 ${this.currentDuration}s)，执行强制切播下一首！`);
        this.next(false).catch(err => console.warn('[QueueEngine] 守护心跳切歌异常:', err));
      }
    }, 1500);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private clearTimer() {
    if (this.autoAdvanceTimer) {
      clearTimeout(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }
  }
}

export const queueEngine = new QueueEngine();
