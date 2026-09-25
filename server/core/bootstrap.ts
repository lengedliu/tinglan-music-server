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
  sendMiioCommand
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

  if (!miotConfig || !miotConfig.passToken) return;

  const candidateUid = miotConfig.userId || miotConfig.cUserId || '0';
  Promise.allSettled([
    xiaomiPassport.fetchAdditionalStsToken(candidateUid, miotConfig.passToken, 'micoapi'),
    xiaomiPassport.fetchAdditionalStsToken(candidateUid, miotConfig.passToken, 'xiaomiio')
  ]).then(async ([micoRes, ioRes]) => {
    const micoToken = micoRes.status === 'fulfilled' ? micoRes.value.serviceToken : '';
    const ioToken = ioRes.status === 'fulfilled' ? ioRes.value.serviceToken : '';
    const recoveredUid = (micoRes.status === 'fulfilled' && micoRes.value.userId) || (ioRes.status === 'fulfilled' && ioRes.value.userId) || candidateUid;
    const ssec = (micoRes.status === 'fulfilled' && micoRes.value.ssecurity) || (ioRes.status === 'fulfilled' && ioRes.value.ssecurity) || miotConfig.ssecurity;

    if (micoToken || ioToken) {
      if (micoToken) miotConfig.micoServiceToken = micoToken;
      if (ioToken) miotConfig.miotServiceToken = ioToken;
      miotConfig.isMicoValid = Boolean(micoToken);
      if (ssec) miotConfig.ssecurity = ssec;
      if (recoveredUid && recoveredUid !== '0') {
        miotConfig.userId = recoveredUid;
        miotConfig.miUser = `uid_${recoveredUid}`;
      }
      miotConfig.isLoggedIn = true;
      saveMiotConfig(miotConfig);
      console.log('[Auth] Restored active dual-channel session via stored passToken for user:', miotConfig.userId);

      // Auto resolve XiaoAi devices
      try {
        const resolveResult = await xiaoaiResolverEngine.resolveDevices({
          userId: miotConfig.userId,
          micoServiceToken: micoToken || undefined,
          miotServiceToken: ioToken || undefined,
          ssecurity: ssec,
          existingDevices: deviceRepository.getAllDevices(),
          activeStreamIps: Array.from(activeStreamIps)
        });
        if (resolveResult.xiaoAiDevices && resolveResult.xiaoAiDevices.length > 0) {
          deviceRepository.setDevices(resolveResult.xiaoAiDevices);
          ensureValidActiveDeviceId(miotConfig, (cfg) => saveMiotConfig(cfg));
          saveMiotConfig(miotConfig);
          console.log(`[Discovery] Auto-restored ${deviceRepository.getAllDevices().length} XiaoAi speakers from cloud`);
        }
      } catch (err: any) {
        console.warn('[Discovery] Device auto-resolution warning:', err.message);
      }

      // Connect Mina WS
      if (micoToken) {
        try {
          minaWsClient.connect(miotConfig.userId, micoToken, miotConfig.activeDeviceId || '');
        } catch {}
      }
    }
  }).catch((err) => console.warn('[Auth] passToken startup recovery skipped:', err.message));
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
