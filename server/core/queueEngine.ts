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

export class QueueEngine extends EventEmitter {
  private queue: Song[] = [];
  private currentIndex: number = 0;
  private loopMode: QueueLoopMode = 'all';
  private isPlaying: boolean = false;
  private targetDid: string = '';
  private targetDeviceName: string = '';
  private songStartTime: number = 0;
  private currentDuration: number = 0;
  private autoAdvanceTimer: NodeJS.Timeout | null = null;
  private castDispatcher: CastDispatcherFn | null = null;

  constructor() {
    super();
  }

  public setCastDispatcher(dispatcher: CastDispatcherFn) {
    this.castDispatcher = dispatcher;
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
   * Start or replace current active queue and cast the first song to the speaker
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
    if (mode) {
      this.loopMode = mode;
    }
    if (targetDid) {
      this.targetDid = targetDid;
    }
    if (deviceName) {
      this.targetDeviceName = deviceName;
    }

    const song = this.queue[this.currentIndex];
    this.isPlaying = true;
    this.songStartTime = Date.now();
    this.currentDuration = song.duration || 180;

    // Dispatch cast command to the target speaker
    let dispatchRes: { success: boolean; message?: string; error?: string } = { success: true, message: '已下发投播指令' };
    if (this.castDispatcher && this.targetDid) {
      try {
        dispatchRes = await this.castDispatcher(song, this.targetDid);
      } catch (err: any) {
        dispatchRes = { success: false, error: err.message };
      }
    }

    // Schedule auto advance for next song
    this.scheduleAutoAdvance(this.currentDuration);
    this.emit('change', this.getStatus());

    return {
      success: dispatchRes.success,
      currentSong: song,
      message: dispatchRes.message || `正在为【${this.targetDeviceName || '小爱音箱'}】播放第 ${this.currentIndex + 1}/${this.queue.length} 首：《${song.title}》`
    };
  }

  /**
   * Synchronize stream start event from streamServer / speaker HTTP request
   */
  public notifyStreamConsumed(songId: string, duration?: number) {
    const currentSong = this.queue[this.currentIndex];
    if (!currentSong) return;

    const cleanSongId = songId.replace(/\.(mp3|flac|wav|m4a|aac|ogg)$/i, '');
    const cleanCurrentId = currentSong.id.replace(/\.(mp3|flac|wav|m4a|aac|ogg)$/i, '');

    if (cleanSongId === cleanCurrentId || songId.includes(cleanCurrentId)) {
      this.songStartTime = Date.now();
      if (duration && duration > 0) {
        this.currentDuration = duration;
      } else if (currentSong.duration && currentSong.duration > 0) {
        this.currentDuration = currentSong.duration;
      } else {
        this.currentDuration = 180;
      }
      this.scheduleAutoAdvance(this.currentDuration);
      this.emit('change', this.getStatus());
    }
  }

  /**
   * Play next song in the active queue
   */
  public async next(force: boolean = true): Promise<{ success: boolean; song: Song | null; message: string }> {
    if (this.queue.length === 0) {
      return { success: false, song: null, message: '队列为空' };
    }

    let nextIdx = this.currentIndex;
    if (this.loopMode === 'shuffle') {
      if (this.queue.length > 1) {
        do {
          nextIdx = Math.floor(Math.random() * this.queue.length);
        } while (nextIdx === this.currentIndex);
      }
    } else if (this.loopMode === 'one' && !force) {
      // Single track loop auto advance
      nextIdx = this.currentIndex;
    } else {
      nextIdx = (this.currentIndex + 1) % this.queue.length;
    }

    return this.jumpTo(nextIdx);
  }

  /**
   * Play previous song in the active queue
   */
  public async prev(): Promise<{ success: boolean; song: Song | null; message: string }> {
    if (this.queue.length === 0) {
      return { success: false, song: null, message: '队列为空' };
    }

    let prevIdx = 0;
    if (this.loopMode === 'shuffle') {
      prevIdx = Math.floor(Math.random() * this.queue.length);
    } else {
      prevIdx = (this.currentIndex - 1 + this.queue.length) % this.queue.length;
    }

    return this.jumpTo(prevIdx);
  }

  /**
   * Jump to specific song index in the queue
   */
  public async jumpTo(index: number): Promise<{ success: boolean; song: Song | null; message: string }> {
    if (this.queue.length === 0) {
      return { success: false, song: null, message: '队列为空' };
    }

    this.clearTimer();
    this.currentIndex = Math.max(0, Math.min(index, this.queue.length - 1));
    const song = this.queue[this.currentIndex];
    this.isPlaying = true;
    this.songStartTime = Date.now();
    this.currentDuration = song.duration || 180;

    let dispatchRes: { success: boolean; message?: string; error?: string } = { success: true, message: '已切歌并下发投播' };
    if (this.castDispatcher && this.targetDid) {
      try {
        dispatchRes = await this.castDispatcher(song, this.targetDid);
      } catch (err: any) {
        dispatchRes = { success: false, error: err.message };
      }
    }

    this.scheduleAutoAdvance(this.currentDuration);
    this.emit('change', this.getStatus());

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
      // The currently playing song was removed, advance to next
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
    this.queue = [];
    this.currentIndex = 0;
    this.isPlaying = false;
    this.songStartTime = 0;
    this.currentDuration = 0;
    this.emit('change', this.getStatus());
  }

  /**
   * Set playback loop mode
   */
  public setLoopMode(mode: QueueLoopMode) {
    this.loopMode = mode;
    this.emit('change', this.getStatus());
  }

  /**
   * Pause queue playback
   */
  public pause() {
    this.clearTimer();
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
    const remaining = Math.max(5, this.currentDuration - Math.floor((Date.now() - this.songStartTime) / 1000));
    this.scheduleAutoAdvance(remaining);
    this.emit('change', this.getStatus());
  }

  private scheduleAutoAdvance(durationSeconds: number) {
    this.clearTimer();
    if (!this.isPlaying) return;

    // Safety buffer: add 2.5s for audio buffer & transition on speaker
    const delayMs = Math.max(5000, (durationSeconds + 2.5) * 1000);
    console.log(`[QueueEngine] ⏱️ 已为当前歌曲设置自动切歌定时器: ${Math.round(delayMs / 1000)}秒后切下一首`);

    this.autoAdvanceTimer = setTimeout(async () => {
      if (this.isPlaying && this.queue.length > 0) {
        console.log(`[QueueEngine] ⏭️ 歌曲播放完毕，自动切播队列下一首 (当前模式: ${this.loopMode})`);
        await this.next(false);
      }
    }, delayMs);
  }

  private clearTimer() {
    if (this.autoAdvanceTimer) {
      clearTimeout(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }
  }
}

export const queueEngine = new QueueEngine();
