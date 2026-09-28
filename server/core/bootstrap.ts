import path from 'path';
import fs from 'fs';
import { xiaomiPassport } from '../xiaomiPassport.js';
import { minaWsClient } from '../minaWebSocket.js';
import { xiaoaiResolverEngine } from '../xiaoaiResolver.js';
import { deviceRepository } from './repositories/deviceRepository.js';
import { musicRepository } from './repositories/musicRepository.js';
import { queueEngine } from './queueEngine.js';
import { xiaomiAdapter } from '../xiaomi/xiaomiAdapter.js';
import { ttsEngine } from '../ttsEngine.js';
import { voiceCommandService } from '../voiceCommandService.js';
import {
  ensureValidActiveDeviceId,
  dispatchCastSongDirectly,
  callMinaCloudApi,
  sendMiioCommand,
  validateMicoServiceToken
} from '../xiaomi/miotService.js';

export interface BootstrapOptions {
  getMiotConfig: () => any;
  saveMiotConfig: (cfg: any) => void;
  activeStreamIps: any;
  serverPort: number;
  jwtSecret: string;
}

export function restoreSessionAndDevicesOnStartup(options: BootstrapOptions): void {
  const { getMiotConfig, saveMiotConfig, activeStreamIps } = options;
  const miotConfig = getMiotConfig();

  if (!miotConfig) return;

  const candidateUid = miotConfig.userId || miotConfig.cUserId || '';
  const currentMicoToken = miotConfig.micoServiceToken || miotConfig.serviceToken || '';
  const currentMiotToken = miotConfig.miotServiceToken || miotConfig.xiaomiioServiceToken || miotConfig.serviceToken || '';

  (async () => {
    let isValid = false;

    // 1. 如果本地保存了 userId 和 serviceToken，启动时优先进行轻量自检，判断 Token 是否依然有效
    if (candidateUid && currentMicoToken) {
      try {
        const validation = await validateMicoServiceToken(candidateUid, currentMicoToken);
        if (validation.valid) {
          isValid = true;
          miotConfig.isLoggedIn = true;
          miotConfig.isMicoValid = true;
          saveMiotConfig(miotConfig);
          console.log(`[Auth] 🔑 启动自检：小米 serviceToken 依然有效，无需重新请求，直接复用已有凭证 (用户: ${candidateUid})`);
        } else {
          console.log(`[Auth] ⚠️ 启动自检：当前 serviceToken 已失效/过期 (${validation.error || 'HTTP ' + validation.status})，准备使用 passToken 重新换领...`);
        }
      } catch (valErr: any) {
        console.warn('[Auth] 启动 Token 校验请求异常:', valErr?.message || valErr);
      }
    }

    // 2. 如果已有的 serviceToken 已失效（或尚无 serviceToken），且本地保存了 passToken，则调用 passToken 静默换领新凭证
    if (!isValid && miotConfig.passToken) {
      try {
        const uidToUse = candidateUid || '0';
        const [micoRes, ioRes] = await Promise.allSettled([
          xiaomiPassport.fetchAdditionalStsToken(uidToUse, miotConfig.passToken, 'micoapi'),
          xiaomiPassport.fetchAdditionalStsToken(uidToUse, miotConfig.passToken, 'xiaomiio')
        ]);

        const micoToken = micoRes.status === 'fulfilled' ? micoRes.value.serviceToken : '';
        const ioToken = ioRes.status === 'fulfilled' ? ioRes.value.serviceToken : '';
        const recoveredUid = (micoRes.status === 'fulfilled' && micoRes.value.userId) || (ioRes.status === 'fulfilled' && ioRes.value.userId) || candidateUid;
        const ssec = (micoRes.status === 'fulfilled' && micoRes.value.ssecurity) || (ioRes.status === 'fulfilled' && ioRes.value.ssecurity) || miotConfig.ssecurity;

        if (micoToken || ioToken) {
          if (micoToken) {
            miotConfig.micoServiceToken = micoToken;
            miotConfig.serviceToken = micoToken;
          }
          if (ioToken) miotConfig.miotServiceToken = ioToken;
          miotConfig.isMicoValid = Boolean(micoToken);
          if (ssec) miotConfig.ssecurity = ssec;
          if (recoveredUid && recoveredUid !== '0') {
            miotConfig.userId = recoveredUid;
            miotConfig.miUser = `uid_${recoveredUid}`;
          }
          miotConfig.isLoggedIn = true;
          isValid = true;
          saveMiotConfig(miotConfig);
          console.log(`[Auth] 🔑 启动自检：已通过 passToken 为用户 ${miotConfig.userId} 成功换领最新 serviceToken`);
        } else {
          console.warn('[Auth] ❌ passToken 换发 serviceToken 失败，建议重新登录');
        }
      } catch (err: any) {
        console.warn('[Auth] passToken 启动换领异常:', err?.message || err);
      }
    }

    // 3. 如果凭证可用，自动同步设备列表与 Mina WebSocket 长连接
    if (isValid && miotConfig.isLoggedIn) {
      const activeMico = miotConfig.micoServiceToken || miotConfig.serviceToken;
      const activeMiot = miotConfig.miotServiceToken || miotConfig.xiaomiioServiceToken || miotConfig.serviceToken;

      try {
        const resolveResult = await xiaoaiResolverEngine.resolveDevices({
          userId: miotConfig.userId,
          micoServiceToken: activeMico || undefined,
          miotServiceToken: activeMiot || undefined,
          ssecurity: miotConfig.ssecurity,
          existingDevices: deviceRepository.getAllDevices(),
          activeStreamIps: Array.from(activeStreamIps)
        });
        if (resolveResult.xiaoAiDevices && resolveResult.xiaoAiDevices.length > 0) {
          deviceRepository.setDevices(resolveResult.xiaoAiDevices);
          ensureValidActiveDeviceId(miotConfig, (cfg) => saveMiotConfig(cfg));
          saveMiotConfig(miotConfig);
          console.log(`[Discovery] 启动成功恢复 ${deviceRepository.getAllDevices().length} 台小爱音箱`);
        }
      } catch (err: any) {
        console.warn('[Discovery] 启动云端设备同步提醒:', err.message);
      }

      if (activeMico) {
        try {
          minaWsClient.connect(miotConfig.userId, activeMico, miotConfig.activeDeviceId || '');
        } catch {}
      }
    }
  })();
}

export function bindVoiceCommandCallbacks(options: BootstrapOptions): void {
  const { getMiotConfig, saveMiotConfig, serverPort, jwtSecret, activeStreamIps } = options;

  voiceCommandService.bindCallbacks({
    getSongs: () => musicRepository.getAllSongs() as any,
    getPlaylists: () => musicRepository.getAllPlaylists() as any,
    playSong: async (song, playlistName, deviceId) => {
      const miotConfig = getMiotConfig();
      const allDevs = deviceRepository.getAllDevices();
      const targetDev = (deviceId && deviceRepository.getDeviceByDid(deviceId)) || (miotConfig.activeDeviceId && deviceRepository.getDeviceByDid(miotConfig.activeDeviceId)) || allDevs[0];
      if (!targetDev) return false;
      queueEngine.syncCurrentSong(song as any, targetDev.did, musicRepository.getAllSongs() as any, targetDev.name);
      const res = await dispatchCastSongDirectly({
        song,
        targetDid: targetDev.did,
        miotConfig,
        saveMiotConfigFn: (cfg) => saveMiotConfig(cfg),
        serverPort,
        jwtSecret,
        activeStreamIps
      });
      return res.success;
    },
    playPlaylist: async (playlistId, deviceId) => {
      const miotConfig = getMiotConfig();
      const allDevs = deviceRepository.getAllDevices();
      const targetDev = (deviceId && deviceRepository.getDeviceByDid(deviceId)) || (miotConfig.activeDeviceId && deviceRepository.getDeviceByDid(miotConfig.activeDeviceId)) || allDevs[0];
      if (!targetDev) return false;
      let plSongs: any[] = [];
      if (playlistId === 'favorites') {
        plSongs = musicRepository.getAllSongs().filter(s => s.isFavorite);
        if (plSongs.length === 0) {
          plSongs = musicRepository.getAllSongs().slice(0, 10);
        }
      } else {
        const playlist = musicRepository.getPlaylistById(playlistId) || musicRepository.getAllPlaylists()[0];
        if (playlist) {
          plSongs = musicRepository.getAllSongs().filter(s => playlist.songIds.includes(s.id));
        }
      }
      if (plSongs.length === 0) plSongs = musicRepository.getAllSongs();
      if (plSongs.length === 0) return false;
      const res = await queueEngine.playQueue(plSongs as any, 0, targetDev.did, targetDev.name);
      return res.success;
    },
    controlPlayback: async (action: any, deviceId?: string): Promise<any> => {
      const miotConfig = getMiotConfig();
      const allDevs = deviceRepository.getAllDevices();
      const targetDev = (deviceId && deviceRepository.getDeviceByDid(deviceId)) || (miotConfig.activeDeviceId && deviceRepository.getDeviceByDid(miotConfig.activeDeviceId)) || allDevs[0];
      if (!targetDev) return false;
      if (action === 'next') {
        const res = await queueEngine.next(true, targetDev.did);
        return res;
      } else if (action === 'prev') {
        const res = await queueEngine.prev(targetDev.did);
        return res;
      } else if (action === 'pause' || action === 'stop') {
        queueEngine.pause();
        await xiaomiAdapter.setPlaybackOperation(targetDev, 'pause', (p, m, msg, tDid, r) => callMinaCloudApi(p, m, msg, tDid, r, miotConfig, (cfg) => saveMiotConfig(cfg)), (ip, tk, m, p, t) => sendMiioCommand(ip, tk, m, p, t), miotConfig).catch(() => {});
        return { success: true, message: '已暂停播放' };
      } else if (action === 'resume') {
        queueEngine.resume();
        await xiaomiAdapter.setPlaybackOperation(targetDev, 'play', (p, m, msg, tDid, r) => callMinaCloudApi(p, m, msg, tDid, r, miotConfig, (cfg) => saveMiotConfig(cfg)), (ip, tk, m, p, t) => sendMiioCommand(ip, tk, m, p, t), miotConfig).catch(() => {});
        return { success: true, message: '已恢复播放' };
      } else if (action === 'volume_up') {
        const currentVol = targetDev.status?.volume || 40;
        const newVol = Math.min(100, currentVol + 10);
        targetDev.status = targetDev.status || {};
        targetDev.status.volume = newVol;
        await xiaomiAdapter.setVolume(targetDev, newVol, (p, m, msg, tDid, r) => callMinaCloudApi(p, m, msg, tDid, r, miotConfig, (cfg) => saveMiotConfig(cfg)), (ip, tk, m, p, t) => sendMiioCommand(ip, tk, m, p, t), miotConfig).catch(() => {});
        return { success: true, message: `音量已调大至 ${newVol}%` };
      } else if (action === 'volume_down') {
        const currentVol = targetDev.status?.volume || 40;
        const newVol = Math.max(0, currentVol - 10);
        targetDev.status = targetDev.status || {};
        targetDev.status.volume = newVol;
        await xiaomiAdapter.setVolume(targetDev, newVol, (p, m, msg, tDid, r) => callMinaCloudApi(p, m, msg, tDid, r, miotConfig, (cfg) => saveMiotConfig(cfg)), (ip, tk, m, p, t) => sendMiioCommand(ip, tk, m, p, t), miotConfig).catch(() => {});
        return { success: true, message: `音量已调小至 ${newVol}%` };
      }
      return false;
    },
    earlyStop: async (deviceId?: string) => {
      const miotConfig = getMiotConfig();
      const allDevs = deviceRepository.getAllDevices();
      const targetDev = (deviceId && deviceRepository.getDeviceByDid(deviceId)) || (miotConfig.activeDeviceId && deviceRepository.getDeviceByDid(miotConfig.activeDeviceId)) || allDevs[0];
      if (!targetDev) return;
      queueEngine.pause();
      await xiaomiAdapter.setPlaybackOperation(targetDev, 'pause', (p, m, msg, tDid, r) => callMinaCloudApi(p, m, msg, tDid, r, miotConfig, (cfg) => saveMiotConfig(cfg)), (ip, tk, m, p, t) => sendMiioCommand(ip, tk, m, p, t), miotConfig).catch(() => {});
    },
    sendTts: async (deviceId, text) => {
      const miotConfig = getMiotConfig();
      const allDevs = deviceRepository.getAllDevices();
      const targetDev = (deviceId && deviceRepository.getDeviceByDid(deviceId)) || allDevs[0];
      if (!targetDev) return { success: false };
      return ttsEngine.dispatchToSpeaker({
        targetDevice: targetDev,
        text,
        miotConfig,
        sendMiioCommandFn: (ip, token, method, params, timeoutMs) => sendMiioCommand(ip, token, method, params, timeoutMs),
        callMinaCloudApiFn: (path, method, msg, tDid, retry) => callMinaCloudApi(path, method, msg, tDid, retry, miotConfig, (cfg) => saveMiotConfig(cfg))
      });
    },
    getAuthInfo: () => {
      const miotConfig = getMiotConfig();
      return {
        userId: miotConfig.userId,
        serviceToken: miotConfig.micoServiceToken || miotConfig.xiaomiioServiceToken || miotConfig.serviceToken,
        devices: deviceRepository.getAllDevices()
      };
    }
  });
}
