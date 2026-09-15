import { EventEmitter } from 'events';
import { Song } from './musicEngine.js';

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

export type CastDispatcherFn = (song: Song, targetDid: string) => Promise<{ success: boolean; message?: string; error?: string }>;
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
  private songProvider: SongProviderFn | null = null;
  private isTransitioning: boolean = false;

  constructor() {
    super();
  }

  public setCastDispatcher(dispatcher: CastDispatcherFn) {
    this.castDispatcher = dispatcher;
  }

  public setSongProvider(provider: SongProviderFn) {
    this.songProvider = provider;
  }

  public setTargetDevice(targetDid: string, targetDeviceName?: string) {
    if (targetDid) this.targetDid = targetDid;
    if (targetDeviceName) this.targetDeviceName = targetDeviceName;
  }

  /**
   * Synchronize active playing track and queue context from single cast / voice search
   */
  public syncCurrentSong(song: Song, targetDid: string = '', allSongs?: Song[], deviceName?: string) {
    if (targetDid) this.targetDid = targetDid;
    if (deviceName) this.targetDeviceName = deviceName;

    const songs = allSongs && allSongs.length > 0 ? allSongs : (this.songProvider ? this.songProvider() : []);
    if (songs.length > 0) {
      this.queue = [...songs];
      const matchIdx = this.queue.findIndex(s => s.id === song.id || s.title === song.title);
      this.currentIndex = matchIdx >= 0 ? matchIdx : 0;
    } else {
      this.queue = [song];
      this.currentIndex = 0;
    }

    this.isPlaying = true;
    this.currentSongStarted = true;
    this.songStartTime = Date.now();
    this.currentDuration = (song.duration && song.duration > 5) ? song.duration : 180;
    this.scheduleAutoAdvance(this.currentDuration);
    this.startHeartbeat();
    this.emit('change', this.getStatus());
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
    this.isPlaying = true;
    this.currentSongStarted = false;
    this.songStartTime = Date.now();
    this.currentDuration = (song.duration && song.duration > 5) ? song.duration : 180;

    console.log(`[QueueEngine] ▶️ 启动全歌单连续投播: 共 ${this.queue.length} 首, 起始首:《${song.title}》, 模式: ${this.loopMode}, 时长: ${this.currentDuration}s`);

    // Dispatch cast command to the target speaker
    let dispatchRes: { success: boolean; message?: string; error?: string } = { success: true, message: '已下发投播指令' };
    if (this.castDispatcher && this.targetDid) {
      try {
        dispatchRes = await this.castDispatcher(song, this.targetDid);
      } catch (err: any) {
        dispatchRes = { success: false, error: err.message };
      }
    }

    // Schedule auto advance based on duration + safety buffer
    this.scheduleAutoAdvance(this.currentDuration);
    this.startHeartbeat();
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
    if (!this.isPlaying || this.queue.length === 0) return;

    const currentSong = this.queue[this.currentIndex];
    if (!currentSong) return;

    const cleanSongId = songId.replace(/\.(mp3|flac|wav|m4a|aac|ogg|opus)$/i, '');
    const cleanCurrentId = (currentSong.id || '').replace(/\.(mp3|flac|wav|m4a|aac|ogg|opus)$/i, '');

    if (cleanSongId !== cleanCurrentId && !songId.includes(cleanCurrentId) && !cleanCurrentId.includes(cleanSongId)) {
      // Stream request does not match current song in queue
      return;
    }

    const now = Date.now();

    // 1. First time speaker pulls stream for this song
    if (!this.currentSongStarted) {
      this.currentSongStarted = true;
      this.songStartTime = now;
      if (options?.duration && options.duration > 5) {
        this.currentDuration = options.duration;
      } else if (currentSong.duration && currentSong.duration > 5) {
        this.currentDuration = currentSong.duration;
      } else {
        this.currentDuration = 180;
      }

      console.log(`[QueueEngine] 🎧 音箱硬件已成功拉取流媒体《${currentSong.title}》，开始播放计时 (时长: ${this.currentDuration}s)`);
      this.scheduleAutoAdvance(this.currentDuration);
      this.emit('change', this.getStatus());
      return;
    }

    // 2. Subsequent stream chunk requests for the active song
    const elapsed = Math.floor((now - this.songStartTime) / 1000);
    const startByte = options?.startByte ?? (options?.range ? parseInt(options.range.replace(/^bytes=/, '').split('-')[0], 10) : undefined);

    // ANTI-LOOP GUARD: If the speaker re-requests byte 0 of the current song after playing for > 12s,
    // it means the speaker's internal media player hit EOF and is attempting to loop the track!
    if (startByte === 0 && elapsed > Math.min(15, this.currentDuration * 0.4)) {
      if (!this.isTransitioning) {
        console.log(`[QueueEngine] 🔄 监测到音箱硬件尝试单曲循环回绕 (已播放 ${elapsed}s / 总时长 ${this.currentDuration}s)，立即拦截单曲循环，强制自动切播下一首！`);
        this.next(false).catch(err => console.warn('[QueueEngine] 循环拦截切歌异常:', err));
      }
      return;
    }

    // Normal intermediate range requests (buffering bytes): DO NOT reset songStartTime or autoAdvanceTimer!
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
    this.isPlaying = true;
    this.currentSongStarted = false;
    this.songStartTime = Date.now();
    this.currentDuration = (song.duration && song.duration > 5) ? song.duration : 180;

    console.log(`[QueueEngine] ⏭️ 切换至第 ${this.currentIndex + 1}/${this.queue.length} 首:《${song.title}》 (时长: ${this.currentDuration}s)`);

    let dispatchRes: { success: boolean; message?: string; error?: string } = { success: true, message: '已切歌并下发投播' };
    if (this.castDispatcher && this.targetDid) {
      try {
        dispatchRes = await this.castDispatcher(song, this.targetDid);
      } catch (err: any) {
        dispatchRes = { success: false, error: err.message };
      }
    }

    this.scheduleAutoAdvance(this.currentDuration);
    this.startHeartbeat();
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
    const remaining = Math.max(5, this.currentDuration - Math.floor((Date.now() - this.songStartTime) / 1000));
    this.scheduleAutoAdvance(remaining);
    this.startHeartbeat();
    this.emit('change', this.getStatus());
  }

  private scheduleAutoAdvance(durationSeconds: number) {
    this.clearTimer();
    if (!this.isPlaying) return;

    // Add 2.0s buffer for stream latency & speaker decoder flush
    const delayMs = Math.max(4000, (durationSeconds + 2.0) * 1000);
    console.log(`[QueueEngine] ⏱️ 已设置精准自动切歌计时器: ${Math.round(delayMs / 1000)}秒后推进下一首 (当前歌曲:《${this.queue[this.currentIndex]?.title}》)`);

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
      const elapsed = Math.floor((Date.now() - this.songStartTime) / 1000);
      const threshold = (this.currentDuration || 180) + 3;

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
