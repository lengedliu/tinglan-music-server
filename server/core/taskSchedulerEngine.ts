import { EventEmitter } from 'events';
import { scheduledTaskRepository, ScheduledTask } from './repositories/scheduledTaskRepository.js';

export interface TaskExecutionHandler {
  pauseDevice: (did: string) => Promise<void>;
  playSongOnDevice: (did: string, songId: string) => Promise<boolean>;
  playPlaylistOnDevice: (did: string, playlistId: string) => Promise<boolean>;
  setVolumeOnDevice: (did: string, volume: number) => Promise<boolean>;
  speakTtsOnDevice: (did: string, text: string) => Promise<boolean>;
}

export class TaskSchedulerEngine extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private handlers: TaskExecutionHandler | null = null;

  constructor() {
    super();
  }

  public setHandlers(handlers: TaskExecutionHandler) {
    this.handlers = handlers;
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[TaskSchedulerEngine] ⏰ 后端常驻定时调度引擎已启动 (每 15 秒精度检测)');
    this.timer = setInterval(() => {
      this.tick().catch(err => {
        console.error('[TaskSchedulerEngine] Tick execution error:', err);
      });
    }, 15000);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
  }

  private async tick() {
    if (!this.handlers) return;
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sun, 1 = Mon ...
    const currentHour = now.getHours().toString().padStart(2, '0');
    const currentMin = now.getMinutes().toString().padStart(2, '0');
    const currentTimeStr = `${currentHour}:${currentMin}`;
    const nowIso = now.toISOString();

    const tasks = scheduledTaskRepository.getAllTasks().filter(t => t.isEnabled);

    for (const task of tasks) {
      try {
        let shouldExecute = false;

        if (task.type === 'sleep_timer') {
          // One-off target time or countdown timestamp
          if (task.targetTime) {
            const targetMs = new Date(task.targetTime).getTime();
            if (!isNaN(targetMs) && now.getTime() >= targetMs) {
              shouldExecute = true;
            }
          }
        } else if (task.type === 'alarm' || task.type === 'routine') {
          // Check repeat days and time
          if (task.targetTime === currentTimeStr) {
            // Check if already executed in this exact minute
            if (task.lastExecutedAt) {
              const lastExec = new Date(task.lastExecutedAt);
              const isSameMinute = lastExec.toDateString() === now.toDateString() &&
                lastExec.getHours() === now.getHours() &&
                lastExec.getMinutes() === now.getMinutes();
              if (isSameMinute) continue;
            }

            if (!task.repeatDays || task.repeatDays.length === 0) {
              shouldExecute = true;
            } else if (task.repeatDays.includes(currentDay)) {
              shouldExecute = true;
            }
          }
        }

        if (shouldExecute) {
          console.log(`[TaskSchedulerEngine] 🚀 触发定时任务 [${task.title}] (${task.type}) -> 设备: ${task.targetDid}`);
          await this.executeTask(task);

          task.lastExecutedAt = nowIso;
          if (task.type === 'sleep_timer' || (!task.repeatDays || task.repeatDays.length === 0)) {
            // One-off task disables itself upon completion
            task.isEnabled = false;
          }
          scheduledTaskRepository.upsertTask(task);
          this.emit('taskExecuted', task);
        }
      } catch (err: any) {
        console.error(`[TaskSchedulerEngine] Failed to execute task ${task.id}:`, err?.message);
      }
    }
  }

  public async executeTask(task: ScheduledTask): Promise<boolean> {
    if (!this.handlers) return false;

    if (task.volume !== undefined && task.volume !== null && task.volume >= 0) {
      await this.handlers.setVolumeOnDevice(task.targetDid, task.volume);
    }

    if (task.action === 'pause') {
      await this.handlers.pauseDevice(task.targetDid);
      return true;
    }

    if (task.action === 'play_song' && task.songId) {
      return await this.handlers.playSongOnDevice(task.targetDid, task.songId);
    }

    if (task.action === 'play_playlist' && task.playlistId) {
      return await this.handlers.playPlaylistOnDevice(task.targetDid, task.playlistId);
    }

    if (task.action === 'tts_alarm' && task.ttsText) {
      return await this.handlers.speakTtsOnDevice(task.targetDid, task.ttsText);
    }

    return true;
  }
}

export const taskSchedulerEngine = new TaskSchedulerEngine();
