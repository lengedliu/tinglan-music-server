import crypto from 'crypto';
import dgram from 'dgram';

export interface MiotPropertyGet {
  did: string;
  siid: number;
  piid: number;
}

export interface MiotPropertySet {
  did: string;
  siid: number;
  piid: number;
  value: any;
}

export interface MiotActionParam {
  did: string;
  siid: number;
  aiid: number;
  in?: any[];
}

export interface MiotRpcResult {
  code: number;
  message?: string;
  result?: any;
  exeMode?: 'local_miio' | 'cloud_miot' | 'cloud_mina';
  error?: string;
}

/**
 * Standard XiaoAi Speaker MIoT Specification Mapping
 */
export const XIAOAI_MIOT_SPEC = {
  // Service 2: Speaker
  speaker: {
    siid: 2,
    volume: { piid: 1, type: 'uint8', min: 0, max: 100 },
    mute: { piid: 2, type: 'bool' }
  },
  // Service 3: Play Control / Media
  playControl: {
    siid: 3,
    status: { piid: 1, type: 'uint8', values: { playing: 1, paused: 2, stopped: 3 } },
    play: { aiid: 1 },
    pause: { aiid: 2 },
    toggle: { aiid: 3 },
    next: { aiid: 4 },
    previous: { aiid: 5 },
    playUrl: { aiid: 1, in: ['url'] }
  },
  // Service 5: Intelligent Voice / TTS
  intelligentSpeaker: {
    siid: 5,
    playText: { aiid: 1, in: ['text'] },
    wakeUp: { aiid: 2 },
    textToSpeech: { aiid: 3, in: ['text', 'tts_type'] }
  }
};

/**
 * MIoT RPC Engine
 * Provides dual-channel RPC execution:
 * 1. Local miIO UDP 54321 Spec Protocol (zero-latency LAN command execution)
 * 2. Cloud MIoT REST API with Request Signing
 */
export class MiotRpcEngine {
  private specCache = new Map<string, any>();

  /**
   * Compute MIoT Cloud API Request Signature (RC4 / HMAC-SHA1)
   * Note: Reserved for future cloud requests requiring HMAC-SHA256 signature verification.
   */
  public generateCloudSignature(
    path: string,
    params: Record<string, any>,
    ssecurity: string,
    nonce: string
  ): string {
    const sortedKeys = Object.keys(params).sort();
    const paramParts: string[] = [];
    for (const key of sortedKeys) {
      paramParts.push(`${key}=${params[key]}`);
    }

    const signContent = `${path}&${ssecurity}&${nonce}&data=${params.data || ''}`;
    return crypto.createHmac('sha256', Buffer.from(ssecurity, 'base64')).update(signContent).digest('base64');
  }

  /**
   * Execute Local miIO UDP Packet
   */
  public async executeLocalMiio(
    ip: string,
    tokenHex: string,
    method: string,
    params: any = [],
    timeoutMs = 2500
  ): Promise<MiotRpcResult> {
    if (!ip || !tokenHex) {
      return { code: -1, error: '缺少音箱 IP 或 32位 Hex Token', exeMode: 'local_miio' };
    }

    const cleanToken = tokenHex.trim().toLowerCase();
    if (cleanToken.length !== 32) {
      return { code: -1, error: 'Token 格式不正确，必须为 32 位十六进制字符串', exeMode: 'local_miio' };
    }

    try {
      // 1. Handshake Hello packet to fetch device DID & stamp
      const hello = await this.sendMiioHello(ip, 1200);
      const didNum = hello.did ? Number(hello.did) || 0 : 0;
      const stamp = (hello.stamp || 0) + 1;

      // 2. Derive AES Key and IV
      const tokenBuf = Buffer.from(cleanToken, 'hex');
      const key = crypto.createHash('md5').update(tokenBuf).digest();
      const iv = crypto.createHash('md5').update(Buffer.concat([key, tokenBuf])).digest();

      // 3. Encrypt JSON Payload
      const msgObj = {
        id: Math.floor(Math.random() * 100000) + 1,
        method,
        params
      };
      const msgStr = JSON.stringify(msgObj);
      const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
      const encrypted = Buffer.concat([cipher.update(msgStr, 'utf8'), cipher.final()]);

      // 4. Build 32-byte Header
      const header = Buffer.alloc(32);
      header.writeUInt16BE(0x2131, 0);
      header.writeUInt16BE(32 + encrypted.length, 2);
      header.writeUInt32BE(0, 4);
      header.writeUInt32BE(didNum, 8);
      header.writeUInt32BE(stamp, 12);

      const checksum = crypto.createHash('md5').update(
        Buffer.concat([header.subarray(0, 16), tokenBuf, encrypted])
      ).digest();
      checksum.copy(header, 16);

      const fullPacket = Buffer.concat([header, encrypted]);

      // 5. Send and wait for reply
      return await new Promise<MiotRpcResult>((resolve) => {
        const client = dgram.createSocket('udp4');
        let isResolved = false;

        const timer = setTimeout(() => {
          if (!isResolved) {
            isResolved = true;
            try { client.close(); } catch {}
            resolve({ code: -2, error: 'miIO UDP 54321 响应超时', exeMode: 'local_miio' });
          }
        }, timeoutMs);

        client.on('message', (respMsg) => {
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timer);
            try {
              try { client.close(); } catch {}
              if (respMsg.length <= 32) {
                return resolve({ code: 0, result: 'ok (ACK received)', exeMode: 'local_miio' });
              }
              const respEncrypted = respMsg.subarray(32);
              const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
              const decrypted = Buffer.concat([decipher.update(respEncrypted), decipher.final()]).toString('utf8');
              const cleanJson = decrypted.replace(/\0+$/g, '');
              const parsed = JSON.parse(cleanJson);
              if (parsed.error) {
                resolve({
                  code: parsed.error.code || -3,
                  error: parsed.error.message || JSON.stringify(parsed.error),
                  exeMode: 'local_miio'
                });
              } else {
                resolve({
                  code: 0,
                  result: parsed.result !== undefined ? parsed.result : parsed,
                  exeMode: 'local_miio'
                });
              }
            } catch (decErr: any) {
              resolve({ code: 0, result: 'packet_acknowledged', exeMode: 'local_miio' });
            }
          }
        });

        client.on('error', (err) => {
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timer);
            try { client.close(); } catch {}
            resolve({ code: -4, error: `miIO Socket 错误: ${err.message}`, exeMode: 'local_miio' });
          }
        });

        client.send(fullPacket, 0, fullPacket.length, 54321, ip, (err) => {
          if (err && !isResolved) {
            isResolved = true;
            clearTimeout(timer);
            try { client.close(); } catch {}
            resolve({ code: -5, error: `UDP 54321 发送异常: ${err.message}`, exeMode: 'local_miio' });
          }
        });
      });
    } catch (e: any) {
      return { code: -6, error: e.message || 'miIO 执行异常', exeMode: 'local_miio' };
    }
  }

  private sendMiioHello(ip: string, timeoutMs = 1200): Promise<{ reachable: boolean; did?: string; stamp?: number }> {
    return new Promise((resolve) => {
      const client = dgram.createSocket('udp4');
      let isResolved = false;

      const timer = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          try { client.close(); } catch {}
          resolve({ reachable: false });
        }
      }, timeoutMs);

      client.on('message', (msg) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timer);
          try {
            let didStr = '';
            let stamp = 0;
            if (msg.length >= 32 && msg[0] === 0x21 && msg[1] === 0x31) {
              didStr = String(msg.readUInt32BE(8));
              stamp = msg.readUInt32BE(12);
            }
            try { client.close(); } catch {}
            resolve({ reachable: true, did: didStr, stamp });
          } catch {
            try { client.close(); } catch {}
            resolve({ reachable: true });
          }
        }
      });

      client.on('error', () => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timer);
          try { client.close(); } catch {}
          resolve({ reachable: false });
        }
      });

      const helloPacket = Buffer.from('21310020ffffffffffffffffffffffffffffffffffffffffffffffffffffffff', 'hex');
      try {
        client.send(helloPacket, 0, helloPacket.length, 54321, ip);
      } catch {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timer);
          try { client.close(); } catch {}
          resolve({ reachable: false });
        }
      }
    });
  }

  /**
   * Execute Cloud MIoT API Call (with official HMAC-SHA256 ssecurity signature)
   */
  public async executeCloudMiot(
    endpointPath: string,
    params: any,
    userId: string,
    serviceToken: string,
    ssecurity?: string
  ): Promise<MiotRpcResult> {
    if (!userId || !serviceToken) {
      return { code: -1, error: '未提供小米云端 userId 或 serviceToken', exeMode: 'cloud_miot' };
    }

    const cleanEndpoint = endpointPath.replace(/^\//, '');
    const url = `https://api.io.mi.com/app/${cleanEndpoint}`;
    const uri = `/${cleanEndpoint}`;

    // Normalize data object
    const dataObj = (params && typeof params === 'object' && ('params' in params || 'list' in params))
      ? params
      : (typeof params === 'object' ? { params } : params);

    const headers: Record<string, string> = {
      'User-Agent': 'iOS-14.4-6.0.103-iPhone12,3--D7744744F7AF32F0544445285880DD63E47D9BE9-8816080-84A3F44E137B71AE-iPhone',
      'x-xiaomi-protocal-flag-cli': 'PROTOCAL-HTTP2',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': `userId=${userId}; serviceToken=${serviceToken}; PassportDeviceId=${userId}`
    };

    let postBodyStr = '';
    if (ssecurity) {
      const dataStr = typeof dataObj === 'string' ? dataObj : JSON.stringify(dataObj);
      const rand8 = crypto.randomBytes(8);
      const timeBuf = Buffer.alloc(4);
      timeBuf.writeUInt32BE(Math.floor(Date.now() / 1000 / 60), 0);
      const nonce = Buffer.concat([rand8, timeBuf]).toString('base64');
      const hashNonce = crypto.createHash('sha256').update(Buffer.from(ssecurity, 'base64')).update(Buffer.from(nonce, 'base64')).digest('base64');
      const msg = `${uri}&${hashNonce}&${nonce}&data=${dataStr}`;
      const sign = crypto.createHmac('sha256', Buffer.from(hashNonce, 'base64')).update(msg).digest('base64');
      postBodyStr = new URLSearchParams({ _nonce: nonce, data: dataStr, signature: sign }).toString();
    } else {
      const dataStr = typeof dataObj === 'string' ? dataObj : JSON.stringify(dataObj);
      postBodyStr = new URLSearchParams({ data: dataStr }).toString();
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: postBodyStr
      });

      const resText = await res.text();
      let resJson: any;
      try {
        resJson = JSON.parse(resText);
      } catch {
        return { code: res.status, result: resText, exeMode: 'cloud_miot' };
      }

      if (res.ok && (resJson.code === 0 || resJson.message === 'ok')) {
        return {
          code: 0,
          result: resJson.result !== undefined ? resJson.result : resJson,
          exeMode: 'cloud_miot'
        };
      }

      return {
        code: resJson.code || res.status,
        error: resJson.message || resJson.description || '云端返回错误',
        result: resJson,
        exeMode: 'cloud_miot'
      };
    } catch (err: any) {
      return { code: -1, error: `MIoT 云端请求失败: ${err.message}`, exeMode: 'cloud_miot' };
    }
  }

  /**
   * High-Level: Get MIoT Property (Auto chooses Local miIO if IP+Token present, else Cloud)
   */
  public async getProperty(
    device: { ip?: string; token?: string; did: string },
    siid: number,
    piid: number,
    cloudAuth?: { userId: string; serviceToken: string; ssecurity?: string }
  ): Promise<MiotRpcResult> {
    // 1. Prefer Local miIO get_properties
    if (device.ip && device.token) {
      const propReq = [{ did: device.did, siid, piid }];
      const localRes = await this.executeLocalMiio(device.ip, device.token, 'get_properties', propReq);
      if (localRes.code === 0) return localRes;
    }

    // 2. Fallback to Cloud MIoT
    if (cloudAuth?.userId && cloudAuth?.serviceToken) {
      return this.executeCloudMiot('miotspec/prop/get', { params: [{ did: device.did, siid, piid }] }, cloudAuth.userId, cloudAuth.serviceToken, cloudAuth.ssecurity);
    }

    return { code: -1, error: '设备未配置局域网 Token 且未登录云端账号' };
  }

  /**
   * High-Level: Set MIoT Property
   */
  public async setProperty(
    device: { ip?: string; token?: string; did: string },
    siid: number,
    piid: number,
    value: any,
    cloudAuth?: { userId: string; serviceToken: string; ssecurity?: string }
  ): Promise<MiotRpcResult> {
    // 1. Prefer Local miIO set_properties
    if (device.ip && device.token) {
      const propReq = [{ did: device.did, siid, piid, value }];
      const localRes = await this.executeLocalMiio(device.ip, device.token, 'set_properties', propReq);
      if (localRes.code === 0) return localRes;
    }

    // 2. Fallback to Cloud MIoT
    if (cloudAuth?.userId && cloudAuth?.serviceToken) {
      return this.executeCloudMiot('miotspec/prop/set', { params: [{ did: device.did, siid, piid, value }] }, cloudAuth.userId, cloudAuth.serviceToken, cloudAuth.ssecurity);
    }

    return { code: -1, error: '设备未配置局域网 Token 且未登录云端账号' };
  }

  /**
   * High-Level: Execute MIoT Action
   */
  public async executeAction(
    device: { ip?: string; token?: string; did: string },
    siid: number,
    aiid: number,
    inParams: any[] = [],
    cloudAuth?: { userId: string; serviceToken: string; ssecurity?: string }
  ): Promise<MiotRpcResult> {
    // 1. Prefer Local miIO action
    if (device.ip && device.token) {
      const actionReq = { did: device.did, siid, aiid, in: inParams };
      const localRes = await this.executeLocalMiio(device.ip, device.token, 'action', actionReq);
      if (localRes.code === 0) return localRes;
    }

    // 2. Fallback to Cloud MIoT
    if (cloudAuth?.userId && cloudAuth?.serviceToken) {
      return this.executeCloudMiot('miotspec/action', { params: { did: device.did, siid, aiid, in: inParams } }, cloudAuth.userId, cloudAuth.serviceToken, cloudAuth.ssecurity);
    }

    return { code: -1, error: '设备未配置局域网 Token 且未登录云端账号' };
  }

  /**
   * Query & cache official MIoT Spec Schema for a model
   */
  public async getMiotSpecInstance(modelUrn: string): Promise<any> {
    if (this.specCache.has(modelUrn)) {
      return this.specCache.get(modelUrn);
    }

    try {
      const url = `https://miot-spec.org/miot-spec-v2/instance?type=${encodeURIComponent(modelUrn)}`;
      const res = await fetch(url);
      if (res.ok) {
        const spec = await res.json();
        this.specCache.set(modelUrn, spec);
        return spec;
      }
    } catch {}

    return null;
  }
}

export const miotRpcEngine = new MiotRpcEngine();
