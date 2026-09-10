import crypto from 'crypto';
import { Communicate } from '@travisvn/edge-tts';
import { miotRpcEngine } from './miotRpc';

export interface TtsVoiceOption {
  id: string;
  name: string;
  gender: 'Female' | 'Male';
  locale: string;
  description: string;
}

export const POPULAR_TTS_VOICES: TtsVoiceOption[] = [
  { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓 (亲切女声 · 推荐)', gender: 'Female', locale: 'zh-CN', description: '温和自然，最接近智能音箱交互' },
  { id: 'zh-CN-YunxiNeural', name: '云希 (阳光男声)', gender: 'Male', locale: 'zh-CN', description: '清脆有活力，适合早安与播报' },
  { id: 'zh-CN-YunjianNeural', name: '云健 (影视旁白男声)', gender: 'Male', locale: 'zh-CN', description: '沉稳磁性，适合长文与新闻' },
  { id: 'zh-CN-XiaoyiNeural', name: '晓伊 (清新女声)', gender: 'Female', locale: 'zh-CN', description: '甜美亲切，适合音乐伴听提醒' },
  { id: 'zh-CN-liaoning-XiaobeiNeural', name: '小北 (东北话幽默女声)', gender: 'Female', locale: 'zh-CN-LN', description: '接地气方言，趣味互动' },
  { id: 'zh-HK-HiuMaanNeural', name: '晓曼 (粤语女声)', gender: 'Female', locale: 'zh-HK', description: '标准粤语朗读' },
  { id: 'en-US-JennyNeural', name: 'Jenny (US English)', gender: 'Female', locale: 'en-US', description: 'Natural English speech' }
];

// Audio cache to prevent re-synthesizing identical text
const audioCache = new Map<string, { buffer: Buffer; createdAt: number }>();
const MAX_CACHE_SIZE = 100;

export class TtsEngine {
  /**
   * Synthesize text to MP3 audio Buffer
   */
  public async synthesizeSpeechMp3(
    text: string,
    voice: string = 'zh-CN-XiaoxiaoNeural',
    rate: string = '+0%',
    pitch: string = '+0Hz'
  ): Promise<Buffer> {
    const cleanText = String(text || '').trim();
    if (!cleanText) {
      throw new Error('TTS 播报内容不能为空');
    }

    const cacheKey = `${voice}_${rate}_${pitch}_${cleanText}`;
    const cached = audioCache.get(cacheKey);
    if (cached && (Date.now() - cached.createdAt < 3600000 * 24)) {
      return cached.buffer;
    }

    try {
      const comm = new Communicate(cleanText, {
        voice: voice || 'zh-CN-XiaoxiaoNeural',
        rate,
        pitch,
        connectionTimeout: 8000
      });

      const chunks: Buffer[] = [];
      for await (const chunk of comm.stream()) {
        if (chunk.type === 'audio' && chunk.data) {
          chunks.push(chunk.data);
        }
      }

      if (chunks.length === 0) {
        throw new Error('未获取到合成音频数据');
      }

      const fullBuffer = Buffer.concat(chunks);
      
      // Cache management
      if (audioCache.size >= MAX_CACHE_SIZE) {
        const oldestKey = audioCache.keys().next().value;
        if (oldestKey) audioCache.delete(oldestKey);
      }
      audioCache.set(cacheKey, { buffer: fullBuffer, createdAt: Date.now() });

      return fullBuffer;
    } catch (err: any) {
      console.error('[TTSEngine] Synthesis error:', err.message);
      throw new Error(`语音合成服务异常: ${err.message}`);
    }
  }

  /**
   * Universal Multi-Channel XiaoAi TTS Dispatcher
   * Intelligently avoids timeouts by trying channels with fast failover:
   * 1. Local miIO (if IP/token available)
   * 2. Mina Cloud UBUS (text_to_speech) with hardware ID
   * 3. MIoT Cloud Spec Action (siid 5 aiid 1 / 5 / 3, siid 7 aiid 1)
   * 4. Audio Stream Playback Fallback (stream synthesised MP3 to speaker)
   */
  public async dispatchToSpeaker(params: {
    targetDevice: any;
    text: string;
    mode?: 'auto' | 'mina_ubus' | 'miot_spec' | 'local_miio' | 'audio_stream';
    voice?: string;
    serverHost?: string;
    miotConfig: any;
    sendMiioCommandFn: (ip: string, token: string, method: string, params: any, timeoutMs?: number) => Promise<any>;
    callMinaCloudApiFn: (path: string, method: string, message: any, targetDid?: string, retry?: number) => Promise<any>;
  }): Promise<{
    success: boolean;
    channel: string;
    error?: string;
    details?: any;
    triedChannels: string[];
  }> {
    const {
      targetDevice,
      text,
      mode = 'auto',
      voice = 'zh-CN-XiaoxiaoNeural',
      serverHost = '',
      miotConfig,
      sendMiioCommandFn,
      callMinaCloudApiFn
    } = params;

    const triedChannels: string[] = [];
    const cleanText = String(text || '').trim();
    if (!cleanText) {
      return { success: false, channel: '', error: '播报内容不能为空', triedChannels };
    }

    const activeMicoToken = miotConfig.micoServiceToken || miotConfig.serviceToken;
    const activeIoToken = miotConfig.xiaomiioServiceToken || activeMicoToken;
    const cleanUid = String(miotConfig.userId || '').replace(/^uid_/, '').trim();
    const cloudAuth = (cleanUid && activeIoToken) ? {
      userId: cleanUid,
      serviceToken: activeIoToken,
      ssecurity: miotConfig.ssecurity
    } : undefined;

    // ----------------------------------------------------
    // Channel 1: Local miIO UDP (if IP & Token present)
    // ----------------------------------------------------
    if ((mode === 'auto' || mode === 'local_miio') && targetDevice.token && targetDevice.ip) {
      triedChannels.push('Local miIO UDP (54321)');
      try {
        // Method 1: text_to_speech
        const localRes = await sendMiioCommandFn(targetDevice.ip, targetDevice.token, 'text_to_speech', [cleanText], 2000);
        if (localRes?.success) {
          return {
            success: true,
            channel: '局域网 miIO 本地指令 (text_to_speech)',
            details: localRes,
            triedChannels
          };
        }

        // Method 2: MIoT Local Action siid 5 aiid 1
        const actionRes = await sendMiioCommandFn(targetDevice.ip, targetDevice.token, 'action', {
          did: targetDevice.did,
          siid: 5,
          aiid: 1,
          in: [cleanText]
        }, 2000);
        if (actionRes?.success) {
          return {
            success: true,
            channel: '局域网 miIO 本地 Spec 动作 (siid:5, aiid:1)',
            details: actionRes,
            triedChannels
          };
        }
      } catch (e: any) {
        console.warn('[TTSEngine] Local miIO failed:', e.message);
      }
    }

    // ----------------------------------------------------
    // Channel 2: Mina Cloud UBUS (text_to_speech)
    // ----------------------------------------------------
    if ((mode === 'auto' || mode === 'mina_ubus') && miotConfig.isLoggedIn && activeMicoToken && cleanUid) {
      triedChannels.push('小米 Mina 云端 UBUS 通道');
      try {
        const minaRes = await callMinaCloudApiFn(
          'mibrain',
          'text_to_speech',
          { text: cleanText, tts: cleanText },
          targetDevice.did
        );

        if (minaRes?.success) {
          return {
            success: true,
            channel: '小米 Mina 云端指令通道 (text_to_speech)',
            details: minaRes,
            triedChannels
          };
        }

        // Fast retry with simple text object
        const minaRes2 = await callMinaCloudApiFn(
          'mibrain',
          'text_to_speech',
          { text: cleanText },
          targetDevice.did
        );
        if (minaRes2?.success) {
          return {
            success: true,
            channel: '小米 Mina 云端指令通道 (text_to_speech raw)',
            details: minaRes2,
            triedChannels
          };
        }
      } catch (e: any) {
        console.warn('[TTSEngine] Mina cloud UBUS failed:', e.message);
      }
    }

    // ----------------------------------------------------
    // Channel 3: MIoT Spec Cloud Action (play-text / execute-text)
    // ----------------------------------------------------
    if ((mode === 'auto' || mode === 'miot_spec') && cloudAuth) {
      triedChannels.push('米家 MIoT 规范云端动作');
      try {
        // Action 1: siid 5, aiid 1 (Intelligent Speaker: play-text)
        let rpcRes = await miotRpcEngine.executeAction(targetDevice, 5, 1, [cleanText], cloudAuth);
        if (rpcRes.code === 0) {
          return {
            success: true,
            channel: 'MIoT 原生智能语音服务 (siid:5, aiid:1)',
            details: rpcRes,
            triedChannels
          };
        }

        // Action 2: siid 5, aiid 5 (Intelligent Speaker: execute-text, e.g. for XiaoAi Play LX04 / L05 / Touch Screen)
        rpcRes = await miotRpcEngine.executeAction(targetDevice, 5, 5, [cleanText, 1], cloudAuth);
        if (rpcRes.code === 0) {
          return {
            success: true,
            channel: 'MIoT 智能执行指令 (siid:5, aiid:5)',
            details: rpcRes,
            triedChannels
          };
        }

        // Action 3: siid 5, aiid 3 (Intelligent Speaker: text-to-speech)
        rpcRes = await miotRpcEngine.executeAction(targetDevice, 5, 3, [cleanText, 0], cloudAuth);
        if (rpcRes.code === 0) {
          return {
            success: true,
            channel: 'MIoT 语音合成服务 (siid:5, aiid:3)',
            details: rpcRes,
            triedChannels
          };
        }

        // Action 4: siid 7, aiid 1 (Speaker: play-text)
        rpcRes = await miotRpcEngine.executeAction(targetDevice, 7, 1, [cleanText], cloudAuth);
        if (rpcRes.code === 0) {
          return {
            success: true,
            channel: 'MIoT 扬声器服务 (siid:7, aiid:1)',
            details: rpcRes,
            triedChannels
          };
        }

        // Action 5: siid 8, aiid 1 (Speaker: play-text alternate)
        rpcRes = await miotRpcEngine.executeAction(targetDevice, 8, 1, [cleanText], cloudAuth);
        if (rpcRes.code === 0) {
          return {
            success: true,
            channel: 'MIoT 扩展扬声器服务 (siid:8, aiid:1)',
            details: rpcRes,
            triedChannels
          };
        }
      } catch (rpcErr: any) {
        console.warn('[TTSEngine] MIoT Cloud Action failed:', rpcErr.message);
      }
    }

    // ----------------------------------------------------
    // Channel 4: High-Definition Audio Stream Fallback
    // ----------------------------------------------------
    if (serverHost && (mode === 'auto' || mode === 'audio_stream')) {
      triedChannels.push('高清音频串流投播 (Audio Stream TTS)');
      try {
        const streamAudioUrl = `${serverHost.replace(/\/$/, '')}/api/tts/audio.mp3?text=${encodeURIComponent(cleanText)}&voice=${encodeURIComponent(voice)}&t=${Date.now()}`;

        // 1. Try Mina player_play_url
        if (miotConfig.isLoggedIn && activeMicoToken) {
          const castRes = await callMinaCloudApiFn(
            'mediaplayer',
            'player_play_url',
            { url: streamAudioUrl, type: 1, media: 'app_ios' },
            targetDevice.did
          );
          if (castRes?.success) {
            return {
              success: true,
              channel: '高清语音串流投播 (Mina Media Stream)',
              details: { streamUrl: streamAudioUrl, castRes },
              triedChannels
            };
          }
        }

        // 2. Try MIoT playUrl (siid 3, aiid 1)
        if (cloudAuth) {
          const rpcRes = await miotRpcEngine.executeAction(targetDevice, 3, 1, [streamAudioUrl], cloudAuth);
          if (rpcRes.code === 0) {
            return {
              success: true,
              channel: '高清语音串流投播 (MIoT PlayUrl siid:3, aiid:1)',
              details: { streamUrl: streamAudioUrl, rpcRes },
              triedChannels
            };
          }
        }
      } catch (streamErr: any) {
        console.warn('[TTSEngine] Audio stream TTS fallback failed:', streamErr.message);
      }
    }

    return {
      success: false,
      channel: '',
      error: `所有通道均未能送达 (已尝试通道: ${triedChannels.join(', ')})。请检查米家账号是否保持登录状态或在设置中重新扫码绑定。`,
      triedChannels
    };
  }
}

export const ttsEngine = new TtsEngine();
