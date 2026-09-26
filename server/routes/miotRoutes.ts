import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { deviceRepository } from '../core/repositories/deviceRepository.js';
import { deviceCustomizationRepository, DeviceCustomization } from '../core/repositories/deviceCustomizationRepository.js';
import { deviceStrategyRepository } from '../core/repositories/deviceStrategyRepository.js';
import { musicRepository } from '../core/repositories/musicRepository.js';
import { queueEngine } from '../core/queueEngine.js';
import { castPipelineManager } from '../xiaomi/strategies/castPipelineManager.js';
import { dlnaEngine } from '../dlnaEngine.js';
import { xiaomiAdapter } from '../xiaomi/xiaomiAdapter.js';
import { adaptiveHeartbeatEngine } from '../xiaomi/adaptiveHeartbeatEngine.js';
import { ttsEngine } from '../ttsEngine.js';
import { xiaoaiResolverEngine } from '../xiaoaiResolver.js';
import { xiaomiPassport } from '../xiaomiPassport.js';
import { xiaomiCircuitBreaker } from '../circuitBreaker.js';
import { minaWsClient } from '../minaWebSocket.js';
import { voiceCommandService } from '../voiceCommandService.js';
import { miotRpcEngine } from '../miotRpc.js';
import { appEventBus } from '../core/eventBus.js';
import {
  castLogs,
  addCastLog,
  getCastLogs,
  sanitizeDevice,
  sanitizeMiotConfig,
  parseServiceTokenAndUserId,
  validateMicoServiceToken,
  queryXiaomiMinaDevices,
  authenticateXiaomiPassport,
  refreshXiaomiTokens,
  callMinaCloudApi,
  getLocalNetworkIps,
  getBestLanIpForTarget,
  sendMiioHello,
  sendMiioCommand,
  testTcpConnection,
  testMiioConnection,
  ensureValidActiveDeviceId,
  dispatchCastSongDirectly
} from '../xiaomi/miotService.js';

export interface MiotRouterOptions {
  getMiotConfig: () => any;
  setMiotConfig: (config: any) => void;
  getSecuritySettings: () => any;
  isAuthRequiredForRequest: (req: Request) => boolean;
  serverPort: number;
  jwtSecret: string;
  musicDir: string;
  activeStreamIps: any;
  recentStreamEvents: any[];
}

export function createMiotRouter(options: MiotRouterOptions): Router {
  const router = Router();
  const {
    getMiotConfig,
    setMiotConfig,
    getSecuritySettings,
    isAuthRequiredForRequest,
    serverPort,
    jwtSecret,
    musicDir,
    activeStreamIps,
    recentStreamEvents
  } = options;

  function checkMiotAdminPermission(req: Request, res: Response): boolean {
    const clientUser = (req as any).user;
    const authRequired = isAuthRequiredForRequest(req);

    if (authRequired) {
      if (!clientUser || clientUser.role !== 'admin') {
        res.status(200).json({ success: false, error: '权限不足：该操作仅系统管理员允许执行' });
        return false;
      }
    } else {
      if (clientUser && clientUser.role !== 'admin') {
        res.status(200).json({ success: false, error: '权限不足：普通用户无权执行此操作' });
        return false;
      }
    }
    return true;
  }

  function checkMiotControlPermission(req: Request, res: Response): boolean {
    const clientUser = (req as any).user;
    const authRequired = isAuthRequiredForRequest(req);
    const securitySettings = getSecuritySettings();

    if (authRequired) {
      if (!clientUser) {
        res.status(200).json({ success: false, error: '权限不足：请先登录账号后再控制音箱播放' });
        return false;
      }
      if (clientUser.role !== 'admin' && securitySettings.allowUserMiotControl === false) {
        res.status(200).json({ success: false, error: '权限不足：系统管理员已限制普通用户控制音箱播放' });
        return false;
      }
    } else {
      if (clientUser && clientUser.role !== 'admin' && securitySettings.allowUserMiotControl === false) {
        res.status(200).json({ success: false, error: '权限不足：系统管理员已限制普通用户控制音箱播放' });
        return false;
      }
    }
    return true;
  }

  function checkMiotTtsPermission(req: Request, res: Response): boolean {
    const clientUser = (req as any).user;
    const authRequired = isAuthRequiredForRequest(req);
    const securitySettings = getSecuritySettings();

    if (authRequired) {
      if (!clientUser) {
        res.status(200).json({ success: false, error: '权限不足：请先登录账号后再发送语音 TTS' });
        return false;
      }
      if (clientUser.role !== 'admin' && securitySettings.allowUserMiotTts === false) {
        res.status(200).json({ success: false, error: '权限不足：系统管理员已禁止普通用户发送语音 TTS 播报' });
        return false;
      }
    } else {
      if (clientUser && clientUser.role !== 'admin' && securitySettings.allowUserMiotTts === false) {
        res.status(200).json({ success: false, error: '权限不足：系统管理员已禁止普通用户发送语音 TTS 播报' });
        return false;
      }
    }
    return true;
  }

  function generateStreamToken(songId: string, ttlSeconds: number = 86400): string {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const dataToSign = `${songId}:${exp}`;
    const hmac = crypto.createHmac('sha256', jwtSecret).update(dataToSign).digest('hex').slice(0, 16);
    return `${exp}.${hmac}`;
  }

  // --- Configuration ---
  router.get('/config', (req: Request, res: Response) => {
    res.json(sanitizeMiotConfig(getMiotConfig()));
  });

  router.post('/config', (req: Request, res: Response) => {
    if (!checkMiotAdminPermission(req, res)) return;

    let miotConfig = getMiotConfig();
    const incoming = { ...req.body };
    if (!incoming.serviceToken || incoming.serviceToken.includes('****') || incoming.serviceToken.includes('••••')) {
      delete incoming.serviceToken;
    }
    if (incoming.micoServiceToken && (incoming.micoServiceToken.includes('****') || incoming.micoServiceToken.includes('••••'))) {
      delete incoming.micoServiceToken;
    }
    if (incoming.miotServiceToken && (incoming.miotServiceToken.includes('****') || incoming.miotServiceToken.includes('••••'))) {
      delete incoming.miotServiceToken;
    }
    if (incoming.xiaomiioServiceToken && (incoming.xiaomiioServiceToken.includes('****') || incoming.xiaomiioServiceToken.includes('••••'))) {
      delete incoming.xiaomiioServiceToken;
    }
    if (!incoming.passToken && miotConfig.passToken) delete incoming.passToken;
    if (!incoming.ssecurity && miotConfig.ssecurity) delete incoming.ssecurity;
    if (!incoming.xiaomiioServiceToken && miotConfig.xiaomiioServiceToken) delete incoming.xiaomiioServiceToken;
    if (!incoming.micoServiceToken && miotConfig.micoServiceToken) delete incoming.micoServiceToken;
    if (!incoming.userId && miotConfig.userId) delete incoming.userId;

    miotConfig = { ...miotConfig, ...incoming };
    if (miotConfig.passToken || (miotConfig.serviceToken && miotConfig.userId)) {
      miotConfig.isLoggedIn = true;
    }
    setMiotConfig(miotConfig);

    addCastLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      type: 'sync',
      message: '已更新小米音箱连接配置',
      detail: `服务器串流地址: ${miotConfig.serverHost}, 默认设备: ${miotConfig.activeDeviceId}`,
      success: true
    });
    res.json({ success: true, config: sanitizeMiotConfig(miotConfig) });
  });

  // --- Active / Default Speaker ---
  router.post('/active-device', (req: Request, res: Response) => {
    if (!checkMiotAdminPermission(req, res)) return;

    const { did } = req.body || {};
    if (!did) {
      return res.status(400).json({ success: false, error: '缺少音箱 DID 参数' });
    }

    const cleanDid = String(did).trim();
    const miotConfig = getMiotConfig();
    miotConfig.activeDeviceId = cleanDid;
    setMiotConfig(miotConfig);

    try {
      voiceCommandService.updateConfig({ targetDeviceId: cleanDid });
    } catch {}

    if (miotConfig.userId && (miotConfig.serviceToken || miotConfig.micoServiceToken)) {
      const activeToken = miotConfig.micoServiceToken || miotConfig.serviceToken;
      try {
        minaWsClient.connect(miotConfig.userId, activeToken, cleanDid);
      } catch {}
    }

    const targetDev = deviceRepository.getAllDevices().find((d: any) =>
      String(d.did).trim() === cleanDid ||
      (d.deviceID && String(d.deviceID).trim() === cleanDid) ||
      (d.cloudDid && String(d.cloudDid).trim() === cleanDid)
    );

    addCastLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      type: 'sync',
      message: `已设置默认目标音箱: ${targetDev?.name || cleanDid}`,
      detail: `DID: ${cleanDid} | IP: ${targetDev?.ip || '未指定'} | 型号: ${targetDev?.model || 'XiaoAi'}`,
      success: true
    });

    res.json({
      success: true,
      activeDeviceId: cleanDid,
      device: targetDev ? sanitizeDevice(targetDev) : null,
      config: sanitizeMiotConfig(miotConfig)
    });
  });

  // --- Login / Logout / Passport ---
  router.post('/login', async (req: Request, res: Response) => {
    if (!checkMiotAdminPermission(req, res)) return;

    const { mode, userId, serviceToken, miUser, miPassword, ip, token, did } = req.body;
    const miotConfig = getMiotConfig();

    if (mode === 'token' || (ip && token)) {
      if (!ip || !token) {
        return res.status(400).json({ success: false, error: '局域网直连模式需要提供音箱 IP 和 32位 Device Token' });
      }
      const cleanToken = String(token).trim().toLowerCase();
      const cleanIp = String(ip).trim();
      const targetDid = did ? String(did).trim() : `did-${Date.now()}`;

      const probe = await testMiioConnection(cleanIp, 2000);
      const resolvedDid = probe.did || targetDid;

      let detectedModel = 'xiaomi.wifispeaker.direct';
      let detectedMac = '00:1A:7D:' + Math.random().toString(16).slice(2, 8).toUpperCase();
      let detectedHw = 'MIoT-Local';
      let detectedName = `局域网小爱音箱 (${cleanIp})`;
      try {
        const infoRes = await sendMiioCommand(cleanIp, cleanToken, 'miIO.info', [], 1500);
        if (infoRes.success && infoRes.result) {
          if (infoRes.result.model) detectedModel = infoRes.result.model;
          if (infoRes.result.mac) detectedMac = infoRes.result.mac;
          if (infoRes.result.hw_ver) detectedHw = infoRes.result.hw_ver;
        }
      } catch {}

      if (detectedModel !== 'xiaomi.wifispeaker.direct') {
        const specCheck = await xiaoaiResolverEngine.evaluateMiotSpec(detectedModel);
        if (!specCheck.isSpeaker) {
          return res.status(400).json({
            success: false,
            error: `目标设备 (型号: ${detectedModel}) 并非小爱智能音箱！${specCheck.reason}。miIO 协议为米家通用协议，请确认输入的 IP 和 Token 对应的是小爱音箱。`
          });
        }
      }

      const existingDev = deviceRepository.getAllDevices().find((d: any) => d.ip === cleanIp || d.did === resolvedDid || d.did === targetDid);
      if (existingDev) {
        deviceRepository.addOrUpdateDevice({
          ...existingDev,
          token: cleanToken,
          isOnline: probe.reachable,
          online: probe.reachable,
          did: probe.did || existingDev.did,
          model: detectedModel !== 'xiaomi.wifispeaker.direct' ? detectedModel : existingDev.model,
          hardware: detectedHw !== 'MIoT-Local' ? detectedHw : existingDev.hardware
        } as any);
      } else {
        deviceRepository.addOrUpdateDevice({
          did: resolvedDid,
          name: detectedName,
          model: detectedModel,
          hardware: detectedHw,
          ip: cleanIp,
          mac: detectedMac,
          token: cleanToken,
          isOnline: probe.reachable,
          online: probe.reachable,
          status: { playing: false, volume: 50, muted: false, updatedAt: new Date().toISOString() }
        } as any);
      }
      miotConfig.isLoggedIn = true;
      miotConfig.bindMode = 'token';
      miotConfig.activeDeviceId = existingDev ? existingDev.did : resolvedDid;
      setMiotConfig(miotConfig);

      addCastLog({
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        type: 'sync',
        message: `已通过局域网 Token 绑定音箱: ${cleanIp}`,
        detail: `Token: ${cleanToken.slice(0, 6)}...${cleanToken.slice(-4)} | ${probe.message}`,
        success: true
      });
      return res.json({
        success: true,
        message: `局域网 Token 绑定成功！${probe.message}`,
        devices: deviceRepository.getAllDevices().map((d: any) => sanitizeDevice(d)),
        config: sanitizeMiotConfig(miotConfig)
      });
    }

    if (mode === 'cookie' || mode === 'passToken' || (serviceToken && userId) || (req.body.passToken && req.body.userId)) {
      const { userId: parsedUid, serviceToken: cleanToken, passToken: cleanPassToken, cUserId: cleanCUserId } = parseServiceTokenAndUserId(
        userId || req.body.userId,
        serviceToken || req.body.serviceToken,
        req.body.passToken
      );

      let cleanUid = parsedUid;
      if (!cleanUid || cleanUid === 'undefined') {
        return res.status(400).json({ success: false, error: '请输入有效的 User ID（支持从 Cookie 复制或粘贴完整 Cookie 字符串）' });
      }

      let activeServiceToken = cleanToken;
      let xiaomiioServiceToken = '';
      let micoExchangeAttempted = false;
      let micoExchangeError: string | undefined;

      if (cleanPassToken) {
        micoExchangeAttempted = true;
        try {
          const micoTokenRes = await xiaomiPassport.fetchAdditionalStsToken(cleanUid, cleanPassToken, 'micoapi');
          if (micoTokenRes.serviceToken) {
            activeServiceToken = micoTokenRes.serviceToken;
            if (micoTokenRes.ssecurity) miotConfig.ssecurity = micoTokenRes.ssecurity;
          } else {
            micoExchangeError = micoTokenRes.error;
          }
        } catch (err: any) {
          micoExchangeError = err.message;
        }

        try {
          const ioTokenRes = await xiaomiPassport.fetchAdditionalStsToken(cleanUid, cleanPassToken, 'xiaomiio');
          if (ioTokenRes.serviceToken) {
            xiaomiioServiceToken = ioTokenRes.serviceToken;
            miotConfig.xiaomiioToken = xiaomiioServiceToken;
            miotConfig.xiaomiioServiceToken = xiaomiioServiceToken;
            miotConfig.miotServiceToken = xiaomiioServiceToken;
            if (ioTokenRes.ssecurity) miotConfig.xiaomiioSsecurity = ioTokenRes.ssecurity;
          }
        } catch {}
      }

      let micoStatus: { valid: boolean; status?: number; error?: string } = { valid: false };
      if (activeServiceToken) {
        micoStatus = await validateMicoServiceToken(cleanUid, activeServiceToken);
      }

      const isMicoValid = micoStatus.valid;
      if (!isMicoValid && activeServiceToken && !xiaomiioServiceToken) {
        xiaomiioServiceToken = activeServiceToken;
        miotConfig.xiaomiioToken = xiaomiioServiceToken;
        miotConfig.xiaomiioServiceToken = xiaomiioServiceToken;
        miotConfig.miotServiceToken = xiaomiioServiceToken;
      }

      miotConfig.userId = cleanUid;
      if (cleanCUserId) (miotConfig as any).cUserId = cleanCUserId;
      if (activeServiceToken) {
        miotConfig.serviceToken = activeServiceToken;
        if (isMicoValid) {
          miotConfig.micoServiceToken = activeServiceToken;
        }
      }
      miotConfig.isMicoValid = isMicoValid;
      if (cleanPassToken) miotConfig.passToken = cleanPassToken;
      if (req.body.ssecurity) miotConfig.ssecurity = req.body.ssecurity;
      miotConfig.miUser = miUser || `uid_${cleanUid}`;
      miotConfig.isLoggedIn = true;
      miotConfig.bindMode = 'account';

      if (isMicoValid && activeServiceToken) {
        try {
          minaWsClient.connect(cleanUid, activeServiceToken, miotConfig.activeDeviceId || '');
        } catch {}
      }

      try {
        const resolvePromise = xiaoaiResolverEngine.resolveDevices({
          userId: cleanUid,
          micoServiceToken: isMicoValid ? activeServiceToken : undefined,
          miotServiceToken: xiaomiioServiceToken || (!isMicoValid ? activeServiceToken : undefined),
          ssecurity: miotConfig.ssecurity,
          existingDevices: deviceRepository.getAllDevices(),
          activeStreamIps: Array.from(activeStreamIps)
        });
        const timeoutPromise = new Promise<any>((resolve) =>
          setTimeout(() => resolve({ xiaoAiDevices: deviceRepository.getAllDevices() }), 8000)
        );
        const resolveResult = await Promise.race([resolvePromise, timeoutPromise]);
        if (resolveResult.xiaoAiDevices && resolveResult.xiaoAiDevices.length > 0) {
          deviceRepository.setDevices(resolveResult.xiaoAiDevices);
          ensureValidActiveDeviceId(miotConfig, setMiotConfig);
        }
      } catch (err: any) {
        console.warn('Auto resolve devices error on login:', err.message);
      }

      setMiotConfig(miotConfig);

      addCastLog({
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        type: 'sync',
        message: `已导入小米账号凭证: ${miotConfig.miUser}`,
        detail: `用户ID: ${cleanUid} | 同步 ${deviceRepository.getAllDevices().length} 台音箱`,
        success: true
      });

      return res.json({
        success: true,
        message: '小米服务凭证导入成功！',
        devices: deviceRepository.getAllDevices().map((d: any) => sanitizeDevice(d)),
        config: sanitizeMiotConfig(miotConfig)
      });
    }

    // Mode 3: Username & Password
    if (!miUser || !miPassword) {
      return res.status(400).json({ success: false, error: '请输入小米账号与密码，或通过二维码扫码登录' });
    }

    try {
      const authResult = await authenticateXiaomiPassport(miUser, miPassword);
      if (!authResult.success) {
        return res.status(401).json({ success: false, error: authResult.error || '小米账号登录鉴权失败' });
      }

      miotConfig.userId = authResult.userId;
      miotConfig.serviceToken = authResult.micoServiceToken || authResult.serviceToken || '';
      miotConfig.micoServiceToken = authResult.micoServiceToken || authResult.serviceToken || '';
      miotConfig.miotServiceToken = authResult.xiaomiioServiceToken || authResult.serviceToken || '';
      miotConfig.xiaomiioServiceToken = authResult.xiaomiioServiceToken || authResult.serviceToken || '';
      miotConfig.passToken = authResult.passToken;
      miotConfig.ssecurity = authResult.ssecurity;
      miotConfig.miUser = miUser;
      miotConfig.isLoggedIn = true;
      miotConfig.bindMode = 'account';

      if (authResult.devices && authResult.devices.length > 0) {
        deviceRepository.setDevices(authResult.devices);
      }
      ensureValidActiveDeviceId(miotConfig, setMiotConfig);
      setMiotConfig(miotConfig);

      if (authResult.userId && (authResult.micoServiceToken || authResult.serviceToken)) {
        try {
          minaWsClient.connect(authResult.userId, authResult.micoServiceToken || authResult.serviceToken!, miotConfig.activeDeviceId || '');
        } catch {}
      }

      addCastLog({
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        type: 'sync',
        message: `小米账号登录成功: ${miUser}`,
        detail: `用户ID: ${authResult.userId} | 同步 ${deviceRepository.getAllDevices().length} 台音箱`,
        success: true
      });

      res.json({
        success: true,
        message: '小米账号登录成功',
        devices: deviceRepository.getAllDevices().map((d: any) => sanitizeDevice(d)),
        config: sanitizeMiotConfig(miotConfig)
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || '登录异常' });
    }
  });

  router.post('/logout', (req: Request, res: Response) => {
    if (!checkMiotAdminPermission(req, res)) return;

    minaWsClient.disconnect();
    const miotConfig = getMiotConfig();
    miotConfig.isLoggedIn = false;
    miotConfig.miUser = '';
    miotConfig.userId = '';
    miotConfig.serviceToken = '';
    miotConfig.micoServiceToken = '';
    miotConfig.miotServiceToken = '';
    miotConfig.xiaomiioServiceToken = '';
    miotConfig.passToken = '';
    setMiotConfig(miotConfig);

    addCastLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      type: 'sync',
      message: '已解除小米账号绑定',
      detail: '已清除云端令牌与登录凭证，并断开 Mina WebSocket 长连接',
      success: true
    });

    res.json({ success: true, message: '已安全退出并解绑小米账号', config: sanitizeMiotConfig(miotConfig) });
  });

  router.get('/passport/qrcode/get', async (req: Request, res: Response) => {
    if (!checkMiotAdminPermission(req, res)) return;
    const sid = (req.query.sid as string) || 'xiaomiio';
    const region = (req.query.region as string) || 'cn';
    const qrRes = await xiaomiPassport.generateLoginQrCode(sid, region);
    if (qrRes.success) {
      return res.json(qrRes);
    }
    return res.status(500).json(qrRes);
  });

  router.post('/passport/qrcode/check', async (req: Request, res: Response) => {
    if (!checkMiotAdminPermission(req, res)) return;

    const { loginUrl, lpUrl, sid } = req.body;
    if (!loginUrl && !lpUrl) {
      return res.status(400).json({ success: false, error: '缺少 loginUrl 参数' });
    }

    const checkRes = await xiaomiPassport.checkQrCodeStatus(loginUrl || lpUrl, lpUrl);
    if (checkRes.success && checkRes.status === 'confirmed') {
      const miotConfig = getMiotConfig();
      const effectiveSid = sid || 'micoapi';
      let primaryToken = checkRes.serviceToken || '';
      let micoServiceToken = effectiveSid === 'micoapi' ? primaryToken : undefined;
      let miotServiceToken = effectiveSid === 'micoapi' ? undefined : primaryToken;
      let ssecurity = checkRes.ssecurity || '';

      if (checkRes.userId && checkRes.passToken) {
        if (!micoServiceToken) {
          try {
            const micoTokenRes = await xiaomiPassport.fetchAdditionalStsToken(checkRes.userId, checkRes.passToken, 'micoapi');
            if (micoTokenRes.serviceToken) micoServiceToken = micoTokenRes.serviceToken;
            if (micoTokenRes.ssecurity) ssecurity = micoTokenRes.ssecurity;
          } catch {}
        }
        if (!miotServiceToken) {
          try {
            const ioTokenRes = await xiaomiPassport.fetchAdditionalStsToken(checkRes.userId, checkRes.passToken, 'xiaomiio');
            if (ioTokenRes.serviceToken) miotServiceToken = ioTokenRes.serviceToken;
            if (ioTokenRes.ssecurity && !ssecurity) ssecurity = ioTokenRes.ssecurity;
          } catch {}
        }
      }

      if (!checkRes.userId || (!micoServiceToken && !miotServiceToken && !primaryToken)) {
        return res.json({
          success: false,
          status: 'error',
          error: '扫码确认成功，但未能成功获取到服务凭证，请刷新二维码重新扫码授权'
        });
      }

      miotConfig.userId = checkRes.userId;
      miotConfig.micoServiceToken = micoServiceToken;
      miotConfig.miotServiceToken = miotServiceToken;
      miotConfig.xiaomiioServiceToken = miotServiceToken;
      miotConfig.isMicoValid = Boolean(micoServiceToken);
      miotConfig.ssecurity = ssecurity;
      miotConfig.passToken = checkRes.passToken;
      miotConfig.miUser = `uid_${checkRes.userId}`;
      miotConfig.isLoggedIn = true;
      miotConfig.bindMode = 'account';
      setMiotConfig(miotConfig);

      if (micoServiceToken) {
        try {
          minaWsClient.connect(checkRes.userId, micoServiceToken, miotConfig.activeDeviceId || '');
        } catch {}
      }

      let devices: any[] = [];
      try {
        const resolvePromise = xiaoaiResolverEngine.resolveDevices({
          userId: checkRes.userId,
          micoServiceToken,
          miotServiceToken,
          ssecurity,
          existingDevices: deviceRepository.getAllDevices(),
          activeStreamIps: Array.from(activeStreamIps)
        });
        const timeoutPromise = new Promise<any>((resolve) =>
          setTimeout(() => resolve({ xiaoAiDevices: deviceRepository.getAllDevices() }), 8000)
        );
        const resolveResult = await Promise.race([resolvePromise, timeoutPromise]);
        devices = resolveResult.xiaoAiDevices || [];
        if (devices && devices.length > 0) {
          deviceRepository.setDevices(devices);
          ensureValidActiveDeviceId(miotConfig, setMiotConfig);
        }
      } catch (err: any) {
        console.warn('Auto resolve devices error on QR login:', err.message);
      }

      addCastLog({
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        type: 'sync',
        message: `小米扫码登录成功: ${miotConfig.miUser}`,
        detail: `用户ID: ${checkRes.userId} | 同步 ${deviceRepository.getAllDevices().length} 台音箱`,
        success: true
      });

      return res.json({
        success: true,
        status: 'confirmed',
        user: miotConfig.miUser,
        devices: deviceRepository.getAllDevices().map((d: any) => sanitizeDevice(d)),
        config: sanitizeMiotConfig(miotConfig)
      });
    }

    return res.json(checkRes);
  });

  // --- WebSocket & Circuit Breaker ---
  router.get('/ws/status', (req: Request, res: Response) => {
    if (!checkMiotAdminPermission(req, res)) return;
    const status = minaWsClient.getStatus();
    const recentEvents = minaWsClient.getRecentEvents();
    res.json({ success: true, status, recentEvents });
  });

  router.post('/ws/reconnect', (req: Request, res: Response) => {
    if (!checkMiotAdminPermission(req, res)) return;
    const miotConfig = getMiotConfig();
    if (miotConfig.userId && miotConfig.serviceToken) {
      minaWsClient.connect(miotConfig.userId, miotConfig.serviceToken, miotConfig.activeDeviceId || '');
      return res.json({ success: true, message: '正在重新建立 Mina WebSocket 连接...' });
    }
    return res.status(400).json({ success: false, error: '未配置有效的小米云端凭证' });
  });

  router.get('/circuit-status', (req: Request, res: Response) => {
    if (!checkMiotAdminPermission(req, res)) return;
    const status = xiaomiCircuitBreaker.getStatus();
    res.json({ success: true, status });
  });

  router.post('/circuit-reset', (req: Request, res: Response) => {
    if (!checkMiotAdminPermission(req, res)) return;
    xiaomiCircuitBreaker.reset();
    res.json({ success: true, message: '风控熔断器已重置为正常就绪状态', status: xiaomiCircuitBreaker.getStatus() });
  });

  router.get('/cloud/snapshots', (req: Request, res: Response) => {
    if (!checkMiotAdminPermission(req, res)) return;
    const miotConfig = getMiotConfig();
    const snapshots = xiaoaiResolverEngine.getCloudSnapshots();
    res.json({
      success: true,
      count: snapshots.length,
      snapshots,
      account: {
        userId: miotConfig.userId,
        miUser: miotConfig.miUser,
        isLoggedIn: miotConfig.isLoggedIn,
        hasServiceToken: Boolean(miotConfig.serviceToken && miotConfig.serviceToken.trim().length > 0)
      }
    });
  });

  router.post('/cloud/snapshots/clear', (req: Request, res: Response) => {
    if (!checkMiotAdminPermission(req, res)) return;
    xiaoaiResolverEngine.clearCloudSnapshots();
    res.json({ success: true, message: '已清空云端抓包快照' });
  });

  router.get('/cloud/export-debug', (req: Request, res: Response) => {
    if (!checkMiotAdminPermission(req, res)) return;
    const miotConfig = getMiotConfig();
    const snapshots = xiaoaiResolverEngine.getCloudSnapshots();
    const debugBundle = {
      exportedAt: new Date().toISOString(),
      account: {
        userId: miotConfig.userId,
        miUser: miotConfig.miUser,
        isLoggedIn: miotConfig.isLoggedIn,
        hasServiceToken: Boolean(miotConfig.serviceToken && miotConfig.serviceToken.trim().length > 0),
        activeDeviceId: miotConfig.activeDeviceId
      },
      cloudSnapshots: snapshots,
      devices: deviceRepository.getAllDevices().map((d: any) => sanitizeDevice(d)),
      castLogs: getCastLogs().slice(0, 30)
    };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="tinglan-xiaomi-cloud-debug-${Date.now()}.json"`);
    res.send(JSON.stringify(debugBundle, null, 2));
  });

  router.get('/events', (req: Request, res: Response) => {
    if (!checkMiotAdminPermission(req, res)) return;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toLocaleTimeString(), message: 'TingLan SSE Event Stream Connected' })}\n\n`);

    const onMinaEvent = (evt: any) => {
      try {
        res.write(`data: ${JSON.stringify(evt)}\n\n`);
      } catch {}
    };

    minaWsClient.on('event', onMinaEvent);
    req.on('close', () => {
      minaWsClient.off('event', onMinaEvent);
    });
  });

  // --- MIoT RPC ---
  router.post('/rpc/prop/get', async (req: Request, res: Response) => {
    if (!checkMiotAdminPermission(req, res)) return;
    const { did, siid, piid } = req.body;
    const targetDev = deviceRepository.getAllDevices().find((d: any) => d.did === String(did));
    if (!targetDev) {
      return res.status(404).json({ success: false, error: '未找到指定 DID 的音箱设备' });
    }

    const miotConfig = getMiotConfig();
    const cloudAuth = (miotConfig.userId && miotConfig.serviceToken)
      ? {
          userId: miotConfig.userId,
          serviceToken: miotConfig.xiaomiioServiceToken || miotConfig.serviceToken,
          ssecurity: miotConfig.ssecurity
        }
      : undefined;

    const result = await miotRpcEngine.getProperty(targetDev, Number(siid) || 2, Number(piid) || 1, cloudAuth);
    res.json(result);
  });

  router.post('/rpc/prop/set', async (req: Request, res: Response) => {
    if (!checkMiotAdminPermission(req, res)) return;
    const { did, siid, piid, value } = req.body;
    const targetDev = deviceRepository.getAllDevices().find((d: any) => d.did === String(did));
    if (!targetDev) {
      return res.status(404).json({ success: false, error: '未找到指定 DID 的音箱设备' });
    }

    const miotConfig = getMiotConfig();
    const cloudAuth = (miotConfig.userId && miotConfig.serviceToken)
      ? {
          userId: miotConfig.userId,
          serviceToken: miotConfig.xiaomiioServiceToken || miotConfig.serviceToken,
          ssecurity: miotConfig.ssecurity
        }
      : undefined;

    const result = await miotRpcEngine.setProperty(targetDev, Number(siid) || 2, Number(piid) || 1, value, cloudAuth);
    res.json(result);
  });

  router.post('/rpc/action', async (req: Request, res: Response) => {
    if (!checkMiotAdminPermission(req, res)) return;
    const { did, siid, aiid, inArgs } = req.body;
    const targetDev = deviceRepository.getAllDevices().find((d: any) => d.did === String(did));
    if (!targetDev) {
      return res.status(404).json({ success: false, error: '未找到指定 DID 的音箱设备' });
    }

    const miotConfig = getMiotConfig();
    const cloudAuth = (miotConfig.userId && miotConfig.serviceToken)
      ? {
          userId: miotConfig.userId,
          serviceToken: miotConfig.xiaomiioServiceToken || miotConfig.serviceToken,
          ssecurity: miotConfig.ssecurity
        }
      : undefined;

    const result = await miotRpcEngine.executeAction(targetDev, Number(siid) || 3, Number(aiid) || 1, inArgs || [], cloudAuth);
    res.json(result);
  });

  router.post('/rpc/raw', async (req: Request, res: Response) => {
    if (!checkMiotAdminPermission(req, res)) return;
    const { ip, token, method, params, did, siid, aiid, inArgs } = req.body;

    if (ip && token) {
      const result = await miotRpcEngine.executeLocalMiio(ip, token, method || 'get_prop', params || []);
      return res.json(result);
    }

    const miotConfig = getMiotConfig();
    if (did && miotConfig.userId && miotConfig.serviceToken) {
      const result = await miotRpcEngine.executeAction(
        { did, ip, token },
        Number(siid) || 3,
        Number(aiid) || 1,
        inArgs || [],
        {
          userId: miotConfig.userId,
          serviceToken: miotConfig.xiaomiioServiceToken || miotConfig.serviceToken,
          ssecurity: miotConfig.ssecurity
        }
      );
      return res.json(result);
    }

    return res.status(400).json({ success: false, error: '缺少本地 miIO (IP + Token) 或云端 (DID + 登录账号) 参数' });
  });

  router.get('/spec/:model', async (req: Request, res: Response) => {
    const { model } = req.params;
    const spec = await miotRpcEngine.getMiotSpecInstance(model);
    if (!spec) {
      return res.status(404).json({ success: false, error: `未找到型号 ${model} 的 MIoT 规范实例` });
    }
    res.json({ success: true, spec });
  });

  // --- Device Management & Discovery ---
  router.get('/devices', (req: Request, res: Response) => {
    res.json(deviceRepository.getAllDevices().map((d: any) => sanitizeDevice(d)));
  });

  router.post('/devices', async (req: Request, res: Response) => {
    if (!checkMiotAdminPermission(req, res)) return;

    const { name, ip, did, model, hardware, token } = req.body;
    if (!name || !ip) {
      return res.status(400).json({ error: 'Name and IP are required' });
    }

    const cleanIp = String(ip).trim();
    const cleanName = String(name).trim();
    const cleanModel = model ? String(model).trim() : 'xiaomi.wifispeaker.sound';
    const cleanToken = token ? String(token).trim() : undefined;
    const targetDid = did ? String(did).trim() : `did-${Date.now()}`;
    const hasToken = Boolean(cleanToken && cleanToken.length > 0);

    const specEval = await xiaoaiResolverEngine.evaluateMiotSpec(cleanModel);

    const newDevice = {
      did: targetDid,
      name: cleanName,
      model: cleanModel,
      hardware: hardware || 'L16A',
      ip: cleanIp,
      token: cleanToken,
      mac: '00:1A:7D:' + Math.random().toString(16).slice(2, 8).toUpperCase(),
      platform: hasToken ? 'miio' : 'dlna',
      source: hasToken ? 'hybrid' : 'lan',
      capabilities: {
        ...specEval.capabilities,
        supportsDlna: true,
        hasPlayControl: true,
        hasVolumeControl: true
      },
      online: true,
      isOnline: true,
      status: {
        playing: false,
        volume: 45,
        muted: false,
        updatedAt: new Date().toISOString()
      }
    };

    deviceRepository.addOrUpdateDevice(newDevice as any);
    const miotConfig = getMiotConfig();
    if (!miotConfig.activeDeviceId) {
      miotConfig.activeDeviceId = newDevice.did;
      setMiotConfig(miotConfig);
    }

    addCastLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      type: 'sync',
      message: `已添加自定义小米音箱: ${newDevice.name}`,
      detail: `IP: ${newDevice.ip} | DID: ${newDevice.did} | 平台: ${newDevice.platform}`,
      success: true
    });

    res.json({
      success: true,
      device: sanitizeDevice(newDevice),
      devices: deviceRepository.getAllDevices().map((d: any) => sanitizeDevice(d))
    });
  });

  router.put('/devices/:did', async (req: Request, res: Response) => {
    if (!checkMiotAdminPermission(req, res)) return;

    const { did } = req.params;
    const { name, ip, did: newDid, model, hardware, token } = req.body;

    const currentDev = deviceRepository.getDeviceByDid(did);
    if (!currentDev) {
      return res.status(404).json({ success: false, error: '未找到指定音箱设备' });
    }

    const resolvedToken = (token !== undefined && !String(token).includes('****') && !String(token).includes('••••'))
      ? (token ? String(token).trim() : undefined)
      : currentDev.token;

    const cleanModel = model !== undefined ? model.trim() : currentDev.model;
    const specEval = await xiaoaiResolverEngine.evaluateMiotSpec(cleanModel);
    const targetIp = ip !== undefined ? ip.trim() : currentDev.ip;
    const hasToken = Boolean(resolvedToken && resolvedToken.length > 0);

    const updatedDev = {
      ...currentDev,
      name: name !== undefined ? name.trim() : currentDev.name,
      ip: targetIp,
      did: newDid !== undefined ? String(newDid).trim() : currentDev.did,
      model: cleanModel,
      hardware: hardware !== undefined ? hardware.trim() : currentDev.hardware,
      token: resolvedToken,
      capabilities: specEval.capabilities,
      platform: hasToken && targetIp ? 'miio' : (currentDev.platform || 'mina'),
      source: targetIp && hasToken ? 'hybrid' : (targetIp ? 'lan' : (currentDev.source || 'cloud')),
      online: currentDev.online ?? currentDev.isOnline ?? true,
      isOnline: currentDev.online ?? currentDev.isOnline ?? true
    };

    deviceRepository.addOrUpdateDevice(updatedDev as any);

    const miotConfig = getMiotConfig();
    if (miotConfig.activeDeviceId === did && newDid && newDid !== did) {
      miotConfig.activeDeviceId = String(newDid).trim();
      setMiotConfig(miotConfig);
    }

    addCastLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      type: 'sync',
      message: `已修改音箱信息: ${updatedDev.name}`,
      detail: `IP: ${updatedDev.ip} | 型号: ${updatedDev.model}`,
      success: true
    });

    res.json({
      success: true,
      device: sanitizeDevice(updatedDev),
      devices: deviceRepository.getAllDevices().map((d: any) => sanitizeDevice(d))
    });
  });

  router.delete('/devices/:did', (req: Request, res: Response) => {
    if (!checkMiotAdminPermission(req, res)) return;

    const { did } = req.params;
    const didStr = String(did).trim();
    const targetDevice = deviceRepository.getDeviceByDid(didStr);

    deviceRepository.removeDevice(didStr);

    const miotConfig = getMiotConfig();
    if (String(miotConfig.activeDeviceId).trim() === didStr) {
      miotConfig.activeDeviceId = deviceRepository.getAllDevices()[0]?.did || '';
      setMiotConfig(miotConfig);
    }

    addCastLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      type: 'sync',
      message: `已移除音箱: ${targetDevice?.name || didStr}`,
      detail: `剩余 ${deviceRepository.getAllDevices().length} 台小米音箱设备`,
      success: true
    });

    res.json({
      success: true,
      deletedDid: didStr,
      devices: deviceRepository.getAllDevices().map((d: any) => sanitizeDevice(d)),
      activeDeviceId: miotConfig.activeDeviceId
    });
  });

  router.post('/devices/clear', (req: Request, res: Response) => {
    if (!checkMiotAdminPermission(req, res)) return;

    deviceRepository.setDevices([]);
    const miotConfig = getMiotConfig();
    miotConfig.activeDeviceId = '';
    setMiotConfig(miotConfig);

    addCastLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      type: 'sync',
      message: '已清空全部音箱设备列表',
      detail: '可通过手动添加或扫描重新发现音箱',
      success: true
    });

    res.json({ success: true, message: '已清空全部音箱设备', devices: [] });
  });

  router.post('/devices/reset', (req: Request, res: Response) => {
    if (!checkMiotAdminPermission(req, res)) return;

    deviceRepository.setDevices([]);
    const miotConfig = getMiotConfig();
    miotConfig.activeDeviceId = '';
    setMiotConfig(miotConfig);

    res.json({ success: true, message: '已重置设备列表', devices: [] });
  });

  router.post('/devices/ping', async (req: Request, res: Response) => {
    const { ip, timeout } = req.body;
    if (!ip) {
      return res.status(400).json({ error: 'IP is required' });
    }

    const cleanIp = String(ip).trim();
    const timeoutMs = parseInt(String(timeout || '1500'), 10);
    const probeResult = await testMiioConnection(cleanIp, isNaN(timeoutMs) ? 1500 : timeoutMs);

    res.json({
      ip: cleanIp,
      reachable: probeResult.reachable,
      isMiio: probeResult.isMiio,
      did: probeResult.did,
      latency: probeResult.latency,
      message: probeResult.message
    });
  });

  router.get('/strategy-profiles', (_req: Request, res: Response) => {
    const profiles = deviceRepository.getAllDevices().map((d: any) => {
      const devId = d.did || d.ip || 'unknown';
      const profile = castPipelineManager.getProfile(devId);
      return {
        did: d.did,
        name: d.name,
        model: d.model,
        ip: d.ip,
        preferredStrategy: profile?.preferredStrategy || 'auto_discover',
        lastSuccessTime: profile?.lastSuccessTime || null,
        failStreak: profile?.failStreak || 0
      };
    });
    res.json({ success: true, profiles });
  });

  router.post('/strategy-profiles/reset', (req: Request, res: Response) => {
    const { did } = req.body || {};
    if (did) {
      castPipelineManager.clearProfile(String(did));
      res.json({ success: true, message: `已重置设备 ${did} 的投播策略记忆缓存` });
    } else {
      castPipelineManager.resetAllProfiles();
      res.json({ success: true, message: '已全量重置所有设备的投播降级与策略记忆缓存' });
    }
  });

  router.post('/strategy-profiles/:did/reset', (req: Request, res: Response) => {
    const { did } = req.params;
    castPipelineManager.clearProfile(did);
    res.json({ success: true, message: `已重置设备 ${did} 的投播策略记忆缓存` });
  });

  router.post('/strategy-profiles/reset-all', (_req: Request, res: Response) => {
    castPipelineManager.resetAllProfiles();
    res.json({ success: true, message: '已全量重置所有设备的投播降级与策略记忆缓存' });
  });

  router.post('/devices/resolve', async (req: Request, res: Response) => {
    if (!checkMiotAdminPermission(req, res)) return;

    const { subnetPrefix } = req.body || {};
    const miotConfig = getMiotConfig();
    try {
      const result = await xiaoaiResolverEngine.resolveDevices({
        userId: miotConfig.userId,
        micoServiceToken: miotConfig.micoServiceToken || (miotConfig.isMicoValid ? miotConfig.serviceToken : undefined),
        miotServiceToken: miotConfig.miotServiceToken || miotConfig.xiaomiioServiceToken || (!miotConfig.isMicoValid ? miotConfig.serviceToken : undefined),
        ssecurity: miotConfig.ssecurity,
        subnetPrefix,
        existingDevices: deviceRepository.getAllDevices(),
        activeStreamIps: Array.from(activeStreamIps)
      });

      if (result.xiaoAiDevices.length > 0) {
        deviceRepository.setDevices(result.xiaoAiDevices);
        ensureValidActiveDeviceId(miotConfig, setMiotConfig);
      }

      addCastLog({
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        type: 'sync',
        message: `MIoT 发现与解析：小爱音箱 ${result.metrics.speakerConfirmed} 台，过滤非音箱 ${result.metrics.nonSpeakerIgnored} 台`,
        detail: `云端: ${result.metrics.cloudFound} | 局域网: ${result.metrics.lanFound} | 双轨融合: ${result.metrics.hybridMerged}`,
        success: true
      });

      res.json({
        success: true,
        count: deviceRepository.getAllDevices().length,
        devices: deviceRepository.getAllDevices().map((d: any) => sanitizeDevice(d)),
        ignoredDevices: result.ignoredDevices,
        metrics: result.metrics,
        activeDeviceId: miotConfig.activeDeviceId
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/devices/scan', async (req: Request, res: Response) => {
    if (!checkMiotAdminPermission(req, res)) return;

    const { subnetPrefix } = req.body || {};
    const miotConfig = getMiotConfig();
    try {
      const result = await xiaoaiResolverEngine.resolveDevices({
        userId: miotConfig.userId,
        micoServiceToken: miotConfig.micoServiceToken || (miotConfig.isMicoValid ? miotConfig.serviceToken : undefined),
        miotServiceToken: miotConfig.miotServiceToken || miotConfig.xiaomiioServiceToken || (!miotConfig.isMicoValid ? miotConfig.serviceToken : undefined),
        ssecurity: miotConfig.ssecurity,
        subnetPrefix,
        existingDevices: deviceRepository.getAllDevices(),
        activeStreamIps: Array.from(activeStreamIps)
      });

      if (result.xiaoAiDevices.length > 0) {
        deviceRepository.setDevices(result.xiaoAiDevices);
        ensureValidActiveDeviceId(miotConfig, setMiotConfig);
      }

      addCastLog({
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        type: 'sync',
        message: result.metrics.cloudFound > 0
          ? `小爱设备发现完成：云端(${result.metrics.cloudFound}) + 局域网Hello(${result.metrics.lanFound})，已确认 ${result.metrics.speakerConfirmed} 台音箱`
          : `局域网 miIO Hello 探测完成：当前 ${deviceRepository.getAllDevices().length} 台音箱设备就绪`,
        detail: `双轨融合: ${result.metrics.hybridMerged} 台 | 规范过滤非音箱: ${result.metrics.nonSpeakerIgnored} 台`,
        success: true
      });

      res.json({
        success: true,
        count: deviceRepository.getAllDevices().length,
        cloudSyncedCount: result.metrics.cloudFound,
        activeDeviceId: miotConfig.activeDeviceId,
        devices: deviceRepository.getAllDevices().map((d: any) => sanitizeDevice(d)),
        ignoredDevices: result.ignoredDevices,
        metrics: result.metrics
      });
    } catch (err: any) {
      console.warn('Scan pipeline fallback error:', err);
      res.json({
        success: true,
        count: deviceRepository.getAllDevices().length,
        cloudSyncedCount: 0,
        activeDeviceId: miotConfig.activeDeviceId,
        devices: deviceRepository.getAllDevices().map((d: any) => sanitizeDevice(d))
      });
    }
  });

  // --- Heartbeat ---
  router.get('/heartbeat/status', (req: Request, res: Response) => {
    const statuses = adaptiveHeartbeatEngine.getHeartbeatStatuses();
    res.json({
      success: true,
      count: statuses.length,
      statuses,
      timestamp: new Date().toISOString()
    });
  });

  router.post('/heartbeat/boost', (req: Request, res: Response) => {
    const duration = parseInt(String(req.body?.durationMs || '30000'), 10);
    adaptiveHeartbeatEngine.triggerActiveMode(isNaN(duration) ? 30000 : duration);
    res.json({
      success: true,
      message: '已切换至高频自愈嗅探模式 (3s/次)',
      durationMs: isNaN(duration) ? 30000 : duration
    });
  });

  router.post('/heartbeat/reset-backoff', (req: Request, res: Response) => {
    const { did } = req.body || {};
    if (did) {
      adaptiveHeartbeatEngine.resetDeviceBackoff(did);
    } else {
      for (const dev of deviceRepository.getAllDevices()) {
        adaptiveHeartbeatEngine.resetDeviceBackoff(dev.did);
      }
    }
    adaptiveHeartbeatEngine.triggerActiveMode(30000);
    res.json({
      success: true,
      message: did ? `已重置设备 ${did} 的心跳退避计时器并立即嗅探` : '已重置所有音箱的心跳退避计时器并立即嗅探'
    });
  });

  // --- Cast & Control ---
  router.post('/cast', async (req: Request, res: Response) => {
    if (!checkMiotControlPermission(req, res)) return;

    const startTime = Date.now();
    const { did, songId, songTitle, songArtist, streamUrl, duration } = req.body;
    const miotConfig = getMiotConfig();

    let devices = deviceRepository.getAllDevices();
    if (devices.length === 0 && miotConfig.passToken) {
      try {
        const resolveRes = await xiaoaiResolverEngine.resolveDevices({
          userId: miotConfig.userId,
          serviceToken: miotConfig.micoServiceToken || miotConfig.serviceToken,
          xiaomiioServiceToken: miotConfig.xiaomiioServiceToken || miotConfig.serviceToken,
          ssecurity: miotConfig.ssecurity,
          existingDevices: devices,
          activeStreamIps: Array.from(activeStreamIps)
        });
        if (resolveRes.xiaoAiDevices && resolveRes.xiaoAiDevices.length > 0) {
          deviceRepository.setDevices(resolveRes.xiaoAiDevices);
          devices = deviceRepository.getAllDevices();
          if (!miotConfig.activeDeviceId) {
            miotConfig.activeDeviceId = devices[0].did;
            setMiotConfig(miotConfig);
          }
        }
      } catch (rErr: any) {
        console.warn('[Cast] Auto device resolution failed:', rErr.message);
      }
    }

    const targetDevice = devices.find((d: any) => d.did === did || (d as any).deviceID === did) || devices[0];
    if (!targetDevice) {
      return res.status(404).json({ success: false, error: '未找到指定音箱设备' });
    }

    const isDummyDevice = (!targetDevice.ip && !targetDevice.token && (targetDevice.did === 'wifispeaker' || !targetDevice.did || !targetDevice.did.match(/^\d+$/)));
    if (isDummyDevice && !miotConfig.isLoggedIn) {
      const errorMsg = '当前选中的为预设示例音箱，尚未关联真实硬件。请先在【设置】中绑定米家账号，并在【播放协议控制中枢】点击【重新扫描设备】同步真实音箱！';
      addCastLog({
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        type: 'error',
        message: `投放失败【${targetDevice.name}】`,
        detail: `✕ ${errorMsg}`,
        success: false,
        did: targetDevice.did,
        ip: '未配置',
        model: targetDevice.model,
        protocol: 'MIoT / miIO',
        requestMethod: 'POST /api/miot/cast',
        httpStatus: 400,
        errorCode: 'ERR_DUMMY_DEVICE',
        responseTimeMs: 2,
        streamUrl: streamUrl || ''
      });

      return res.status(400).json({
        success: false,
        error: errorMsg,
        message: errorMsg
      });
    }

    const selectedCastMode = (req.body.castMode || miotConfig.castMode || 'auto') as any;
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
    const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || req.get('host');
    const reqOrigin = `${proto}://${host}`;
    const primaryLanIp = getBestLanIpForTarget(targetDevice.ip, miotConfig.serverHost);

    let baseHost = (miotConfig.serverHost && miotConfig.serverHost.startsWith('http'))
      ? miotConfig.serverHost.replace(/\/$/, '')
      : reqOrigin;

    let isLoopback = baseHost.includes('localhost') || baseHost.includes('127.0.0.1');
    let hostWarning: string | null = null;

    const rawId = (songId || 'song-1').toString();
    const cleanSongId = rawId.replace(/\.(mp3|wav|flac|m4a|aac|ogg|opus|ape)$/i, '');

    if (isLoopback) {
      if (primaryLanIp) {
        baseHost = `http://${primaryLanIp}:${serverPort}`;
        isLoopback = false;
      } else {
        hostWarning = '检测到当前串流地址为 localhost/127.0.0.1，已自动无缝切换为公网高保真 CDN 直链，确保音箱即投即响。';
      }
    }

    if (targetDevice.ip && baseHost.includes(targetDevice.ip)) {
      if (primaryLanIp && primaryLanIp !== targetDevice.ip) {
        baseHost = `http://${primaryLanIp}:${serverPort}`;
        hostWarning = `检测到串流地址误设为音箱自身 IP (${targetDevice.ip})，已自动纠偏为服务器真实 IP (${primaryLanIp})`;
      } else {
        baseHost = reqOrigin;
        hostWarning = `检测到串流地址误设为音箱自身 IP (${targetDevice.ip})，已自动切换为外部网关地址 (${reqOrigin})`;
      }
    }
    const resolvedServerHost = baseHost;

    const streamToken = generateStreamToken(cleanSongId);
    let resolvedStreamUrl = `${baseHost}/api/stream/${encodeURIComponent(cleanSongId)}.mp3?token=${streamToken}`;
    const isNavidromeOrRawStream = streamUrl && (streamUrl.includes('/rest/stream.view') || streamUrl.includes(':4533') || streamUrl.includes('subsonic'));
    if (streamUrl && streamUrl.startsWith('http') && !streamUrl.includes('localhost') && !streamUrl.includes('127.0.0.1') && !isNavidromeOrRawStream) {
      resolvedStreamUrl = streamUrl;
    }

    if (miotConfig.ttsAnnouncement) {
      try {
        await ttsEngine.dispatchToSpeaker({
          targetDevice,
          text: `${miotConfig.ttsPrefix || '正在为您播放'} ${songTitle || '歌曲'}`,
          mode: 'auto',
          forSongCast: true,
          serverHost: resolvedServerHost,
          miotConfig,
          sendMiioCommandFn: (ip, token, method, params, timeoutMs) => sendMiioCommand(ip, token, method, params, timeoutMs || 2500),
          callMinaCloudApiFn: (path, method, msg, tDid, retry) => callMinaCloudApi(path, method, msg, tDid, retry, miotConfig, setMiotConfig)
        });
        await new Promise(r => setTimeout(r, 1200));
      } catch (ttsErr: any) {
        console.warn('TTS intro failed before cast:', ttsErr.message);
      }
    }

    const castResult = await xiaomiAdapter.playUrl(
      targetDevice,
      resolvedStreamUrl,
      songTitle || '音乐',
      (path, method, msg, tDid, retry) => callMinaCloudApi(path, method, msg, tDid, retry, miotConfig, setMiotConfig),
      (ip, token, method, params, timeoutMs) => sendMiioCommand(ip, token, method, params, timeoutMs || 2500),
      miotConfig,
      {
        songArtist,
        duration,
        castMode: selectedCastMode
      }
    );

    const isSuccess = castResult.success;
    const responseTimeMs = Date.now() - startTime;
    const nowTime = new Date().toLocaleTimeString();

    const stages = [
      { stage: 'COMMAND_SENT' as const, label: '指令发送成功', success: true, timestamp: nowTime },
      { stage: 'DEVICE_ACK' as const, label: isSuccess ? `音箱响应成功 (${castResult.protocol})` : '指令被拒绝', success: isSuccess, timestamp: nowTime },
      { stage: 'STREAM_CONNECTED' as const, label: '等待音箱拉取音频流', success: false, pending: true, timestamp: nowTime },
      { stage: 'PLAYING' as const, label: '等待音箱解码播放', success: false, pending: true, timestamp: nowTime }
    ];

    if (isSuccess) {
      const updatedStatus = {
        ...(targetDevice as any).status,
        playing: true,
        currentSongId: cleanSongId,
        currentTitle: songTitle || '未知曲目',
        currentArtist: songArtist || '未知歌手',
        currentDuration: duration || 200,
        currentPosition: 0,
        streamUrl: resolvedStreamUrl,
        lastTts: miotConfig.ttsAnnouncement ? `${miotConfig.ttsPrefix || '正在为您播放'}: ${songTitle || '歌曲'}` : (targetDevice as any).status?.lastTts,
        updatedAt: new Date().toISOString()
      };
      deviceRepository.addOrUpdateDevice({
        ...targetDevice,
        status: updatedStatus
      } as any);
      adaptiveHeartbeatEngine.notifyDeviceActivity(targetDevice.did);

      try {
        const matchedSong = musicRepository.getSongById(cleanSongId) || musicRepository.getAllSongs().find(s => s.title === songTitle);
        const activeSongObj = {
          id: cleanSongId,
          title: songTitle || matchedSong?.title || '未知曲目',
          artist: songArtist || matchedSong?.artist || '未知歌手',
          duration: duration || matchedSong?.duration || 180,
          url: resolvedStreamUrl
        };
        const incomingQueue = (Array.isArray(req.body.queue) && req.body.queue.length > 0) ? req.body.queue : musicRepository.getAllSongs();
        const queueMode = req.body.mode || 'all';
        queueEngine.syncCurrentSong(activeSongObj as any, targetDevice.did, incomingQueue, targetDevice.name, queueMode);
      } catch (qErr: any) {
        console.warn('[Cast] QueueEngine sync failed:', qErr.message);
      }
    } else {
      if ((targetDevice as any).status) {
        deviceRepository.addOrUpdateDevice({
          ...targetDevice,
          status: { ...(targetDevice as any).status, playing: false, updatedAt: new Date().toISOString() }
        } as any);
      }
    }

    const logEntry = {
      id: `log-${Date.now()}`,
      timestamp: nowTime,
      type: 'cast' as const,
      message: isSuccess ? `已向【${targetDevice.name}】下发播放指令` : `投放失败【${targetDevice.name}】`,
      detail: `${castResult.message} | 串流源: ${resolvedStreamUrl}`,
      success: isSuccess,
      did: targetDevice.did,
      ip: targetDevice.ip || '未配置局域网IP',
      model: targetDevice.model || 'xiaomi.wifispeaker',
      protocol: castResult.protocol,
      requestMethod: 'POST /api/miot/cast',
      httpStatus: isSuccess ? 200 : 502,
      errorCode: isSuccess ? 0 : (castResult.errorCode || 'ERR_CAST_FAILED'),
      responseTimeMs,
      streamUrl: resolvedStreamUrl,
      steps: castResult.steps || []
    };

    addCastLog(logEntry);

    if (!isSuccess) {
      return res.status(502).json({
        success: false,
        error: castResult.message,
        message: `向 ${targetDevice.name} 投播失败: ${castResult.message}`,
        protocol: castResult.protocol,
        details: castResult.details,
        stages,
        device: sanitizeDevice(targetDevice),
        streamUrl: resolvedStreamUrl
      });
    }

    res.json({
      success: true,
      message: hostWarning ? `已向 ${targetDevice.name} 下发指令，但提示：${hostWarning}` : castResult.message,
      warning: hostWarning,
      protocol: castResult.protocol,
      details: castResult.details,
      stages,
      device: sanitizeDevice(targetDevice),
      streamUrl: resolvedStreamUrl
    });
  });

  router.get('/stream-status', (req: Request, res: Response) => {
    const localIps = getLocalNetworkIps();
    const primaryLanIp = localIps.find(ip => !ip.startsWith('127.') && !ip.startsWith('169.254.') && !ip.startsWith('172.17.')) || localIps[0] || '';
    const miotConfig = getMiotConfig();
    const currentServerHost = miotConfig.serverHost || (primaryLanIp ? `http://${primaryLanIp}:${serverPort}` : '');
    const isLoopback = currentServerHost.includes('localhost') || currentServerHost.includes('127.0.0.1');

    const speakerStreams = recentStreamEvents.filter(e => !e.isBrowser);
    const lastSpeakerStream = speakerStreams[0] || null;

    res.json({
      success: true,
      serverHost: currentServerHost,
      isLoopback,
      detectedLanIps: localIps,
      primaryLanIp,
      lastSpeakerStream,
      speakerStreamCount: speakerStreams.length,
      recentStreamEvents: recentStreamEvents.slice(0, 10),
      activeIps: Array.from(activeStreamIps)
    });
  });

  router.post('/test-sound', async (req: Request, res: Response) => {
    const miotConfig = getMiotConfig();
    const deviceId = req.body.deviceId || miotConfig.activeDeviceId;
    const targetDevice = deviceRepository.getAllDevices().find((d: any) => d.did === deviceId || (d as any).deviceID === deviceId) || deviceRepository.getAllDevices()[0];

    if (!targetDevice) {
      return res.status(404).json({ success: false, error: '未找到指定音箱' });
    }

    const testToneUrl = 'https://music.163.com/song/media/outer/url?id=1436709403.mp3';
    try {
      const result = await xiaomiAdapter.playUrl(
        targetDevice,
        testToneUrl,
        '网易云测试音频',
        (path, method, msg, tDid, retry) => callMinaCloudApi(path, method, msg, tDid, retry, miotConfig, setMiotConfig),
        (ip, token, method, params, timeoutMs) => sendMiioCommand(ip, token, method, params, timeoutMs || 2500),
        miotConfig
      );

      res.json({
        success: result.success,
        protocol: result.protocol,
        message: result.message,
        device: sanitizeDevice(targetDevice)
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/control', async (req: Request, res: Response) => {
    if (!checkMiotControlPermission(req, res)) return;

    const { did, action, value } = req.body;
    const targetDevice = deviceRepository.getAllDevices().find((d: any) => d.did === did || (d as any).deviceID === did) || deviceRepository.getAllDevices()[0];

    if (!targetDevice) {
      return res.status(404).json({ error: 'Device not found' });
    }

    if (!(targetDevice as any).status) {
      (targetDevice as any).status = { playing: false, volume: 45, muted: false, updatedAt: new Date().toISOString() };
    }

    const miotConfig = getMiotConfig();
    let detail = '';
    let cloudResult: any = null;
    let localMiioResult: any = null;

    const activeMicoToken = miotConfig.micoServiceToken || (miotConfig.isMicoValid ? miotConfig.serviceToken : undefined);
    const activeIoToken = miotConfig.miotServiceToken || miotConfig.xiaomiioServiceToken || (!miotConfig.isMicoValid ? miotConfig.serviceToken : undefined);
    const cloudAuth = (miotConfig.userId && activeIoToken) ? {
      userId: String(miotConfig.userId),
      serviceToken: activeIoToken,
      ssecurity: miotConfig.ssecurity
    } : undefined;

    const dispatchAction = async (miioMethod: string, miioParams: any[], siid: number, aiid: number, inArgs: any[] = [], minaAction?: { path: string; method: string; msg: any }) => {
      const tasks: Promise<any>[] = [];

      if (targetDevice.ip && (action === 'pause' || action === 'stop')) {
        tasks.push(
          dlnaEngine.pause(targetDevice.ip)
            .then(res => {
              if (res.success) localMiioResult = { success: true, protocol: 'DLNA' };
              return res;
            })
            .catch(() => ({ success: false }))
        );
      }

      if (targetDevice.token && targetDevice.ip) {
        tasks.push(
          sendMiioCommand(targetDevice.ip, targetDevice.token, miioMethod, miioParams, 1200)
            .then(res => {
              if (res.success) localMiioResult = res;
              return res;
            })
            .catch(() => ({ success: false }))
        );
      }

      if (cloudAuth) {
        tasks.push(
          miotRpcEngine.executeAction(targetDevice, siid, aiid, inArgs, cloudAuth)
            .then(res => {
              if (res.code === 0) {
                cloudResult = { success: true, data: res.result };
              }
              return res;
            })
            .catch(() => ({ code: -1 }))
        );
      }

      if (minaAction && miotConfig.isLoggedIn && activeMicoToken && miotConfig.userId) {
        tasks.push(
          callMinaCloudApi(minaAction.path, minaAction.method, minaAction.msg, targetDevice.did, 0, miotConfig, setMiotConfig)
            .then(res => {
              if (res.success && !cloudResult?.success) {
                cloudResult = res;
              }
              return res;
            })
            .catch(() => ({ success: false }))
        );
      }

      if (tasks.length > 0) {
        await Promise.allSettled(tasks);
      }
    };

    const dispatchProperty = async (miioMethod: string, miioParams: any[], siid: number, piid: number, propVal: any, minaAction?: { path: string; method: string; msg: any }) => {
      const tasks: Promise<any>[] = [];

      if (targetDevice.token && targetDevice.ip) {
        tasks.push(
          sendMiioCommand(targetDevice.ip, targetDevice.token, miioMethod, miioParams, 1200)
            .then(res => {
              if (res.success) localMiioResult = res;
              return res;
            })
            .catch(() => ({ success: false }))
        );
      }

      if (cloudAuth) {
        tasks.push(
          miotRpcEngine.setProperty(targetDevice, siid, piid, propVal, cloudAuth)
            .then(res => {
              if (res.code === 0) {
                cloudResult = { success: true, data: res.result };
              }
              return res;
            })
            .catch(() => ({ code: -1 }))
        );
      }

      if (minaAction && miotConfig.isLoggedIn && activeMicoToken && miotConfig.userId) {
        tasks.push(
          callMinaCloudApi(minaAction.path, minaAction.method, minaAction.msg, targetDevice.did, 0, miotConfig, setMiotConfig)
            .then(res => {
              if (res.success && !cloudResult?.success) {
                cloudResult = res;
              }
              return res;
            })
            .catch(() => ({ success: false }))
        );
      }

      if (tasks.length > 0) {
        await Promise.allSettled(tasks);
      }
    };

    switch (action) {
      case 'play':
        (targetDevice as any).status.playing = true;
        detail = '已发送播放指令';
        await dispatchAction(
          'player_play_operation', ['play'],
          3, 2, [],
          { path: 'mediaplayer', method: 'player_play_operation', msg: { action: 'play' } }
        );
        break;

      case 'pause':
      case 'stop':
        (targetDevice as any).status.playing = false;
        detail = '已发送暂停/停止指令';
        await dispatchAction(
          'player_play_operation', ['pause'],
          3, 1, [],
          { path: 'mediaplayer', method: 'player_play_operation', msg: { action: 'pause' } }
        );
        break;

      case 'toggle':
        const nextState = !(targetDevice as any).status.playing;
        (targetDevice as any).status.playing = nextState;
        detail = nextState ? '已发送播放指令' : '已发送暂停指令';
        await dispatchAction(
          'player_play_operation', [nextState ? 'play' : 'pause'],
          3, nextState ? 2 : 1, [],
          { path: 'mediaplayer', method: 'player_play_operation', msg: { action: nextState ? 'play' : 'pause' } }
        );
        break;

      case 'next':
        detail = '已切换至下一首';
        queueEngine.next(true, targetDevice.did);
        await dispatchAction(
          'player_play_operation', ['next'],
          3, 3, [],
          { path: 'mediaplayer', method: 'player_play_operation', msg: { action: 'next' } }
        );
        break;

      case 'prev':
        detail = '已切换至上一首';
        queueEngine.prev(targetDevice.did);
        await dispatchAction(
          'player_play_operation', ['prev'],
          3, 4, [],
          { path: 'mediaplayer', method: 'player_play_operation', msg: { action: 'prev' } }
        );
        break;

      case 'volume':
        const vol = Math.max(0, Math.min(100, Number(value) || 45));
        (targetDevice as any).status.volume = vol;
        detail = `已调节音量至 ${vol}%`;
        await dispatchProperty(
          'set_volume', [vol],
          2, 1, vol,
          { path: 'mediaplayer', method: 'player_set_volume', msg: { volume: vol } }
        );
        break;

      case 'mute':
        const isMuted = Boolean(value);
        (targetDevice as any).status.muted = isMuted;
        detail = isMuted ? '已开启静音' : '已解除静音';
        await dispatchProperty(
          'set_mute', [isMuted],
          2, 2, isMuted,
          { path: 'mediaplayer', method: 'player_set_volume', msg: { volume: isMuted ? 0 : ((targetDevice as any).status.volume || 40) } }
        );
        break;

      default:
        return res.status(400).json({ error: `不支持的控制指令: ${action}` });
    }

    (targetDevice as any).status.updatedAt = new Date().toISOString();
    deviceRepository.addOrUpdateDevice(targetDevice as any);

    addCastLog({
      id: `log-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      type: 'control',
      message: `${targetDevice.name}: ${detail}`,
      detail: cloudResult?.success ? '✓ 云端 MIoT 执行成功' : (localMiioResult?.success ? '✓ 局域网协议响应' : '已发送控制请求'),
      success: true
    });

    res.json({
      success: true,
      action,
      message: detail,
      device: sanitizeDevice(targetDevice)
    });
  });

  router.post('/group-cast', async (req: Request, res: Response) => {
    if (!checkMiotControlPermission(req, res)) return;

    const { dids, action = 'cast', song, volume } = req.body;
    if (!Array.isArray(dids) || dids.length === 0) {
      return res.status(400).json({ success: false, error: '请选择至少一个目标音箱' });
    }

    const results: { did: string; name: string; success: boolean; message: string }[] = [];
    const miotConfig = getMiotConfig();

    const tasks = dids.map(async (did: string) => {
      const dev = deviceRepository.getAllDevices().find((d: any) => d.did === did || (d as any).deviceID === did);
      const devName = dev?.name || `音箱(${did})`;

      if (!dev) {
        results.push({ did, name: devName, success: false, message: '未找到指定音箱' });
        return;
      }

      try {
        if (action === 'cast') {
          const targetSong = song || musicRepository.getAllSongs()[0];
          if (!targetSong) {
            results.push({ did, name: devName, success: false, message: '未指定要广播的曲目' });
            return;
          }
          const castRes = await dispatchCastSongDirectly({
            song: targetSong,
            targetDid: did,
            miotConfig,
            saveMiotConfigFn: setMiotConfig,
            serverPort,
            jwtSecret,
            activeStreamIps
          });
          results.push({
            did,
            name: devName,
            success: castRes.success,
            message: castRes.success ? (castRes.message || '已成功串流') : (castRes.error || '串流未响应')
          });
        } else if (action === 'volume') {
          const volVal = Math.max(0, Math.min(100, Number(volume) || 45));
          if ((dev as any).status) (dev as any).status.volume = volVal;
          deviceRepository.addOrUpdateDevice(dev as any);
          results.push({ did, name: devName, success: true, message: `音量已调整为 ${volVal}%` });
        } else {
          const isPlay = action === 'play';
          if ((dev as any).status) (dev as any).status.playing = isPlay;
          deviceRepository.addOrUpdateDevice(dev as any);
          results.push({ did, name: devName, success: true, message: isPlay ? '已同步播放' : '已同步暂停' });
        }
      } catch (err: any) {
        results.push({ did, name: devName, success: false, message: err.message || '指令发送异常' });
      }
    });

    await Promise.allSettled(tasks);

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.length - successCount;

    addCastLog({
      id: `log-group-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      type: 'cast',
      message: `【全屋多音箱广播】${action.toUpperCase()} (${successCount}/${results.length} 成功)`,
      detail: results.map(r => `${r.name}: ${r.success ? '✓' : '✕'} ${r.message}`).join(' | '),
      success: successCount > 0
    });

    res.json({
      success: successCount > 0,
      total: results.length,
      successCount,
      failedCount,
      results
    });
  });

  router.post('/tts', async (req: Request, res: Response) => {
    if (!checkMiotTtsPermission(req, res)) return;

    const { did, text, mode, voice } = req.body;
    if (!text || !String(text).trim()) {
      return res.status(400).json({ success: false, error: '请输入播报文本内容' });
    }

    const miotConfig = getMiotConfig();
    const targetDid = did || miotConfig.activeDeviceId;
    const targetDevice = deviceRepository.getAllDevices().find((d: any) => d.did === targetDid || (d as any).deviceID === targetDid) || deviceRepository.getAllDevices()[0];

    if (!targetDevice) {
      return res.status(404).json({ success: false, error: '未找到指定的小米智能音箱' });
    }

    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
    const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || req.get('host');
    const reqOrigin = `${proto}://${host}`;
    const primaryLanIp = getBestLanIpForTarget(targetDevice.ip, miotConfig.serverHost);

    let baseHost = (miotConfig.serverHost && miotConfig.serverHost.startsWith('http'))
      ? miotConfig.serverHost.replace(/\/$/, '')
      : reqOrigin;

    if (baseHost.includes('localhost') || baseHost.includes('127.0.0.1')) {
      if (primaryLanIp) {
        baseHost = `http://${primaryLanIp}:${serverPort}`;
      }
    }

    try {
      const ttsResult = await ttsEngine.dispatchToSpeaker({
        targetDevice,
        text: String(text).trim(),
        mode: mode || 'auto',
        voice,
        serverHost: baseHost,
        miotConfig,
        sendMiioCommandFn: (ip, token, method, params, timeoutMs) => sendMiioCommand(ip, token, method, params, timeoutMs || 2500),
        callMinaCloudApiFn: (path, method, msg, tDid, retry) => callMinaCloudApi(path, method, msg, tDid, retry, miotConfig, setMiotConfig)
      });

      addCastLog({
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        type: 'tts',
        message: `${targetDevice.name} 播报: “${text.length > 20 ? text.slice(0, 20) + '...' : text}”`,
        detail: `协议: ${(ttsResult as any).protocol || ttsResult.channel} | 方式: ${(ttsResult as any).method || "tts_dispatch"} | 状态: ${(ttsResult as any).message || (ttsResult.success ? "播报成功" : ttsResult.error)}`,
        success: ttsResult.success
      });

      res.json({
        success: ttsResult.success,
        protocol: (ttsResult as any).protocol || ttsResult.channel,
        method: (ttsResult as any).method || "tts_dispatch",
        message: (ttsResult as any).message || (ttsResult.success ? "播报成功" : ttsResult.error),
        device: sanitizeDevice(targetDevice)
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'TTS 语音播报异常' });
    }
  });

  router.get('/status', (req: Request, res: Response) => {
    const miotConfig = getMiotConfig();
    const activeDevice = deviceRepository.getAllDevices().find((d: any) => d.did === miotConfig.activeDeviceId) || deviceRepository.getAllDevices()[0];
    res.json({
      success: true,
      config: sanitizeMiotConfig(miotConfig),
      activeDevice: activeDevice ? sanitizeDevice(activeDevice) : null,
      deviceCount: deviceRepository.getAllDevices().length,
      isLoggedIn: miotConfig.isLoggedIn,
      bindMode: miotConfig.bindMode
    });
  });

  router.get('/logs', (req: Request, res: Response) => {
    res.json({ success: true, logs: getCastLogs() });
  });

  // --- Voice Command Engine ---
  router.get('/voice/status', (req: Request, res: Response) => {
    res.json({
      success: true,
      status: voiceCommandService.getStatus(),
      recentLogs: voiceCommandService.getDialogueLogs().slice(0, 15)
    });
  });

  router.post('/voice/config', (req: Request, res: Response) => {
    if (!checkMiotControlPermission(req, res)) return;
    try {
      const updated = voiceCommandService.updateConfig(req.body);
      res.json({ success: true, config: updated });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  router.post('/voice/toggle', (req: Request, res: Response) => {
    if (!checkMiotControlPermission(req, res)) return;
    const { enabled } = req.body || {};
    const miotConfig = getMiotConfig();
    const isEnabled = enabled !== undefined ? Boolean(enabled) : !voiceCommandService.getStatus().enabled;

    if (isEnabled) {
      voiceCommandService.updateConfig({ targetDeviceId: miotConfig.activeDeviceId });
      voiceCommandService.start();
    } else {
      voiceCommandService.stop();
    }

    res.json({
      success: true,
      enabled: voiceCommandService.getStatus().enabled,
      message: isEnabled ? '已启用小爱同学语音点歌拦截引擎' : '已停用语音指令轮询'
    });
  });

  router.get('/voice/logs', (req: Request, res: Response) => {
    res.json({ success: true, logs: voiceCommandService.getDialogueLogs() });
  });

  router.post('/voice/logs/clear', (req: Request, res: Response) => {
    if (!checkMiotControlPermission(req, res)) return;
    voiceCommandService.clearLogs();
    res.json({ success: true, message: '已清空语音指令捕获日志' });
  });

  router.post('/voice/test-query', async (req: Request, res: Response) => {
    if (!checkMiotControlPermission(req, res)) return;

    const { query, did } = req.body || {};
    if (!query || !String(query).trim()) {
      return res.status(400).json({ success: false, error: '请输入待测试的语音指令文本' });
    }

    const miotConfig = getMiotConfig();
    const targetDev = deviceRepository.getAllDevices().find((d: any) => d.did === did) || deviceRepository.getAllDevices()[0];
    const deviceId = targetDev?.did || miotConfig.activeDeviceId || 'test-speaker';
    const deviceName = targetDev?.name || '测试音箱';

    try {
      const result = await voiceCommandService.processVoiceQuery(query, deviceId, deviceName, 'test_manual');
      res.json({
        success: true,
        result,
        logs: voiceCommandService.getDialogueLogs().slice(0, 10)
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/voice/poll-now', async (req: Request, res: Response) => {
    if (!checkMiotControlPermission(req, res)) return;
    try {
      const report = await voiceCommandService.pollNow();
      res.json({
        success: report.success,
        message: report.message,
        recordsFound: report.recordsFound,
        lastQuery: report.lastQuery,
        status: voiceCommandService.getStatus(),
        logs: voiceCommandService.getDialogueLogs()
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message,
        status: voiceCommandService.getStatus(),
        logs: voiceCommandService.getDialogueLogs()
      });
    }
  });

  // --- Voice Slang Dictionary & Missed Analytics Endpoints ---
  router.get('/voice/slang', (req: Request, res: Response) => {
    res.json({ success: true, slangRules: voiceCommandService.getSlangRules() });
  });

  router.post('/voice/slang', (req: Request, res: Response) => {
    if (!checkMiotControlPermission(req, res)) return;
    try {
      const { slangTerm, targetType, targetValue, notes, id } = req.body || {};
      if (!slangTerm || !targetValue) {
        return res.status(400).json({ success: false, error: '黑话词条和目标对应值不能为空' });
      }
      const rule = voiceCommandService.addOrUpdateSlangRule({
        id,
        slangTerm,
        targetType: targetType || 'artist',
        targetValue,
        notes
      });
      res.json({ success: true, rule, message: `已成功保存黑话词条「${slangTerm}」` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.delete('/voice/slang/:id', (req: Request, res: Response) => {
    if (!checkMiotControlPermission(req, res)) return;
    try {
      const deleted = voiceCommandService.deleteSlangRule(req.params.id);
      res.json({ success: deleted, message: deleted ? '黑话词条已成功删除' : '词条不存在' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/voice/missed-analytics', (req: Request, res: Response) => {
    try {
      const analytics = voiceCommandService.getMissedAnalytics();
      res.json({ success: true, analytics });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // P2: Get all device customizations (aliases, rooms, hotkeys, volume limits)
  router.get('/customizations', (req: Request, res: Response) => {
    try {
      const customs = deviceCustomizationRepository.getAll();
      res.json({ success: true, customizations: customs });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // P2: Get or set customization for a single device
  router.get('/:did/customization', (req: Request, res: Response) => {
    try {
      const { did } = req.params;
      const custom = deviceCustomizationRepository.getByDid(did);
      res.json({ success: true, customization: custom || null });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/:did/customization', (req: Request, res: Response) => {
    try {
      const { did } = req.params;
      const body = req.body;
      const saved = deviceCustomizationRepository.upsert({
        deviceDid: did,
        customName: body.customName,
        roomName: body.roomName,
        icon: body.icon,
        hotkeyMappings: body.hotkeyMappings,
        defaultVolume: body.defaultVolume !== undefined ? Number(body.defaultVolume) : 40,
        maxVolumeLimit: body.maxVolumeLimit !== undefined ? Number(body.maxVolumeLimit) : 100,
        defaultEqPresetId: body.defaultEqPresetId,
        updatedAt: new Date().toISOString()
      });
      res.json({ success: true, message: '音箱个性化配置已保存', customization: saved });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Phase 1: 获取所有音箱硬件自学习推流策略画像
  router.get('/strategy-profiles', (req: Request, res: Response) => {
    try {
      const profiles = deviceStrategyRepository.getAllProfiles();
      const devices = deviceRepository.getAllDevices();
      
      const enriched = profiles.map(p => {
        const d = devices.find(dev => dev.did === p.deviceDid || (dev as any).deviceID === p.deviceDid);
        return {
          ...p,
          deviceName: d?.name || p.deviceName || p.deviceDid,
          deviceModel: d?.model || p.deviceModel || 'XiaoAi'
        };
      });

      res.json({
        success: true,
        profiles: enriched,
        total: enriched.length
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Phase 1: 重置音箱自适应推流画像 (清空试错历史，重新全量协商)
  router.post('/strategy-profiles/reset', (req: Request, res: Response) => {
    if (!checkMiotAdminPermission(req, res)) return;
    try {
      const { did } = req.body || {};
      if (did) {
        castPipelineManager.clearProfile(did);
      } else {
        castPipelineManager.resetAllProfiles();
      }
      res.json({ success: true, message: did ? `音箱 [${did}] 策略画像已重置` : '所有音箱策略画像已重置' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
