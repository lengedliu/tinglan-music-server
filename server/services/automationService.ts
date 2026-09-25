import fs from 'fs';
import path from 'path';
import { loadJson, saveJson } from '../storage/jsonStorage.js';

export interface AutomationScene {
  id: string;
  name: string;
  description: string;
  cronExpr: string; // e.g. "0 7 * * *" (每天 07:00) 或 "30 22 * * *" (每天 22:30)
  enabled: boolean;
  actionType: 'play_playlist' | 'play_radio' | 'tts_announce' | 'group_cast' | 'stop_playback';
  targetType: 'single_device' | 'group' | 'all_devices';
  targetId?: string; // did 或 group_id
  payload: {
    playlistId?: string;
    radioUrl?: string;
    radioTitle?: string;
    ttsText?: string;
    volume?: number;
  };
  lastRunTime?: string;
  lastRunStatus?: 'success' | 'failed';
  lastRunMessage?: string;
  createdAt: string;
}

export interface AutomationLog {
  id: string;
  sceneId: string;
  sceneName: string;
  timestamp: string;
  status: 'success' | 'failed';
  message: string;
  details?: any;
}

const AUTOMATION_FILE = path.join(process.cwd(), 'data', 'automation_scenes.json');
const LOGS_FILE = path.join(process.cwd(), 'data', 'automation_logs.json');

// Default initial preset scenes for Phase 3
const DEFAULT_SCENES: AutomationScene[] = [
  {
    id: 'scene_morning_alarm',
    name: '☀️ 智能早安唤醒晨曲',
    description: '每天早晨 07:30 自动向全屋音箱推送轻柔广播电台与唤醒语音，迎美好一天',
    cronExpr: '30 07 * * *',
    enabled: true,
    actionType: 'play_radio',
    targetType: 'all_devices',
    payload: {
      radioUrl: 'https://stream.zeno.fm/f3wvbbqmdg8uv',
      radioTitle: 'Lofi Chill Morning Beats',
      volume: 35
    },
    createdAt: new Date().toISOString()
  },
  {
    id: 'scene_night_lullaby',
    name: '🌙 夜间睡前舒缓音乐 & 自动打关机',
    description: '每晚 23:00 自动调低客厅与卧室音箱音量至 20%，播报睡前问候并开启轻音乐',
    cronExpr: '00 23 * * *',
    enabled: true,
    actionType: 'tts_announce',
    targetType: 'all_devices',
    payload: {
      ttsText: '夜深了，为您调低音量并播放助眠旋律，祝您晚安好梦。',
      volume: 20
    },
    createdAt: new Date().toISOString()
  }
];

class AutomationService {
  private scenes: AutomationScene[] = [];
  private logs: AutomationLog[] = [];
  private timer: NodeJS.Timeout | null = null;
  private actionHandler?: (scene: AutomationScene) => Promise<{ success: boolean; message: string }>;

  constructor() {
    this.init();
  }

  private init() {
    this.scenes = loadJson<AutomationScene[]>(AUTOMATION_FILE, DEFAULT_SCENES);
    this.logs = loadJson<AutomationLog[]>(LOGS_FILE, []);
    this.startScheduler();
  }

  public registerActionHandler(handler: (scene: AutomationScene) => Promise<{ success: boolean; message: string }>) {
    this.actionHandler = handler;
  }

  public getScenes(): AutomationScene[] {
    return this.scenes;
  }

  public getLogs(): AutomationLog[] {
    return this.logs;
  }

  public saveScene(scene: Partial<AutomationScene> & { name: string; cronExpr: string }): AutomationScene {
    if (scene.id) {
      const idx = this.scenes.findIndex(s => s.id === scene.id);
      if (idx !== -1) {
        this.scenes[idx] = { ...this.scenes[idx], ...scene };
        saveJson(AUTOMATION_FILE, this.scenes, true);
        return this.scenes[idx];
      }
    }

    const newScene: AutomationScene = {
      id: `scene_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: scene.name,
      description: scene.description || '自定义第三阶段自动化场景',
      cronExpr: scene.cronExpr,
      enabled: scene.enabled ?? true,
      actionType: scene.actionType || 'tts_announce',
      targetType: scene.targetType || 'all_devices',
      targetId: scene.targetId,
      payload: scene.payload || {},
      createdAt: new Date().toISOString()
    };

    this.scenes.push(newScene);
    saveJson(AUTOMATION_FILE, this.scenes, true);
    return newScene;
  }

  public deleteScene(id: string): boolean {
    const prevLen = this.scenes.length;
    this.scenes = this.scenes.filter(s => s.id !== id);
    if (this.scenes.length !== prevLen) {
      saveJson(AUTOMATION_FILE, this.scenes, true);
      return true;
    }
    return false;
  }

  public toggleScene(id: string, enabled?: boolean): AutomationScene | null {
    const scene = this.scenes.find(s => s.id === id);
    if (scene) {
      scene.enabled = enabled !== undefined ? enabled : !scene.enabled;
      saveJson(AUTOMATION_FILE, this.scenes, true);
      return scene;
    }
    return null;
  }

  public async triggerSceneManually(id: string): Promise<{ success: boolean; message: string }> {
    const scene = this.scenes.find(s => s.id === id);
    if (!scene) {
      return { success: false, message: '未找到指定自动化场景' };
    }
    return await this.executeScene(scene, true);
  }

  private async executeScene(scene: AutomationScene, isManual = false): Promise<{ success: boolean; message: string }> {
    const nowStr = new Date().toLocaleTimeString('zh-CN');
    let result = { success: true, message: '场景触发成功' };

    try {
      if (this.actionHandler) {
        result = await this.actionHandler(scene);
      } else {
        result = { success: true, message: `模拟触发场景「${scene.name}」` };
      }
    } catch (e: any) {
      result = { success: false, message: `执行异常: ${e.message}` };
    }

    // Update scene status
    scene.lastRunTime = new Date().toISOString();
    scene.lastRunStatus = result.success ? 'success' : 'failed';
    scene.lastRunMessage = result.message;
    saveJson(AUTOMATION_FILE, this.scenes);

    // Append Log
    const newLog: AutomationLog = {
      id: `log_${Date.now()}`,
      sceneId: scene.id,
      sceneName: scene.name,
      timestamp: new Date().toISOString(),
      status: result.success ? 'success' : 'failed',
      message: `${isManual ? '【手动触发】' : '【Cron定时触发】'} ${result.message}`
    };

    this.logs.unshift(newLog);
    if (this.logs.length > 100) this.logs = this.logs.slice(0, 100);
    saveJson(LOGS_FILE, this.logs);

    return result;
  }

  private startScheduler() {
    if (this.timer) clearInterval(this.timer);
    
    // Check every minute
    this.timer = setInterval(() => {
      const now = new Date();
      const currentMinute = now.getMinutes();
      const currentHour = now.getHours();

      this.scenes.forEach(scene => {
        if (!scene.enabled) return;

        // Simple Cron match: "MM HH * * *" or "MM HH"
        const parts = scene.cronExpr.trim().split(/\s+/);
        if (parts.length >= 2) {
          const cronMin = parseInt(parts[0], 10);
          const cronHour = parseInt(parts[1], 10);

          if (!isNaN(cronMin) && !isNaN(cronHour)) {
            if (currentMinute === cronMin && currentHour === cronHour) {
              // Avoid duplicate execution in the same minute
              if (scene.lastRunTime) {
                const lastRun = new Date(scene.lastRunTime);
                if (
                  lastRun.getFullYear() === now.getFullYear() &&
                  lastRun.getMonth() === now.getMonth() &&
                  lastRun.getDate() === now.getDate() &&
                  lastRun.getHours() === now.getHours() &&
                  lastRun.getMinutes() === now.getMinutes()
                ) {
                  return; // already ran this minute
                }
              }

              console.log(`[Automation Scheduler] ⏰ Cron Triggered: ${scene.name}`);
              this.executeScene(scene, false);
            }
          }
        }
      });
    }, 30000); // Check every 30s
  }
}

export const automationService = new AutomationService();
