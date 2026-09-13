import crypto from 'crypto';
import dgram from 'dgram';
import zlib from 'zlib';
import { getPersistentClientDeviceId } from './xiaomiPassport';

/**
 * Pure JavaScript / TypeScript implementation of RC4-drop1024
 *
 * Xiaomi api.io.mi.com (xiaomiio) requires RC4 encryption where the first 1024 bytes
 * of keystream are discarded (Fluhrer, Mantin, Shamir attack mitigation).
 * Since newer Node.js / OpenSSL deprecates or disables the legacy RC4 cipher,
 * this lightweight, self-contained implementation ensures 100% reliable execution
 * across all Node.js environments without external dependencies.
 */
export function rc4Drop1024(key: Buffer, data: Buffer): Buffer {
  // Key-Scheduling Algorithm (KSA)
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    s[i] = i;
  }
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) & 255;
    const temp = s[i];
    s[i] = s[j];
    s[j] = temp;
  }

  // Pseudo-Random Generation Algorithm (PRGA)
  let i = 0;
  j = 0;

  // Discard first 1024 bytes of keystream
  for (let k = 0; k < 1024; k++) {
    i = (i + 1) & 255;
    j = (j + s[i]) & 255;
    const temp = s[i];
    s[i] = s[j];
    s[j] = temp;
  }

  // Encrypt / decrypt the payload
  const out = Buffer.alloc(data.length);
  for (let k = 0; k < data.length; k++) {
    i = (i + 1) & 255;
    j = (j + s[i]) & 255;
    const temp = s[i];
    s[i] = s[j];
    s[j] = temp;
    out[k] = data[k] ^ s[(s[i] + s[j]) & 255];
  }
  return out;
}

/**
 * Generate signed nonce (snonce)
 * snonce = base64(sha256(base64Decode(ssecurity) + base64Decode(nonce)))
 */
export function signNonce(ssecurity: string, nonce: string): string {
  const ssecBuf = Buffer.from(ssecurity, 'base64');
  const nonceBuf = Buffer.from(nonce, 'base64');
  return crypto.createHash('sha256').update(Buffer.concat([ssecBuf, nonceBuf])).digest('base64');
}

/**
 * Calculate Xiaomi RC4 request signature:
 * SHA1(METHOD & URI & data=... & rc4_hash__=... & snonce) -> base64
 * Note: URI has `/app/` replaced by `/`, matching PiotrMachowski / Xiaomi-cloud-tokens-extractor & miservice
 */
export function rc4Hash(method: string, uri: string, data: Record<string, string>, snonce: string): string {
  const parts: string[] = [];
  if (method) {
    parts.push(method.toUpperCase());
  }
  if (uri) {
    // Standard Xiaomi IO format: e.g. /miotspec/action (not /app/miotspec/action)
    parts.push(uri.startsWith('/') ? uri : `/${uri}`);
  }
  for (const key of Object.keys(data)) {
    parts.push(`${key}=${data[key]}`);
  }
  parts.push(snonce);
  return crypto.createHash('sha1').update(parts.join('&')).digest('base64');
}

/**
 * Encode and encrypt request payload for Xiaomi Cloud MIoT API (api.io.mi.com)
 * Two-stage process:
 * 1. Compute rc4_hash__ over plaintext data
 * 2. Encrypt both data and rc4_hash__ using RC4-drop1024 with snonce as key
 * 3. Compute final signature over encrypted parameters
 */
export function encodeMiIOT(
  method: string,
  uri: string,
  data: unknown,
  ssecurity: string
): { _nonce: string; data: string; rc4_hash__: string; signature: string; snonce: string } {
  const dataText = typeof data === 'string' ? data : JSON.stringify(data);
  const nonce = crypto.randomBytes(12).toString('base64');
  const snonce = signNonce(ssecurity, nonce);

  // Phase 1: Compute rc4_hash__ over plaintext data
  const plain: Record<string, string> = {
    data: dataText,
  };
  plain.rc4_hash__ = rc4Hash(method, uri, plain, snonce);

  // Phase 2: RC4-drop1024 encrypt data + rc4_hash__
  const dataBuf = Buffer.from(plain.data, 'utf8');
  const hashBuf = Buffer.from(plain.rc4_hash__, 'utf8');
  const keyBuf = Buffer.from(snonce, 'base64');

  const encryptedBuf = rc4Drop1024(keyBuf, Buffer.concat([dataBuf, hashBuf]));
  const encData = encryptedBuf.subarray(0, dataBuf.length).toString('base64');
  const encHash = encryptedBuf.subarray(dataBuf.length).toString('base64');

  // Phase 3: Final signature over encrypted params
  const signature = rc4Hash(
    method,
    uri,
    {
      data: encData,
      rc4_hash__: encHash,
    },
    snonce
  );

  return {
    _nonce: nonce,
    data: encData,
    rc4_hash__: encHash,
    signature,
    snonce,
  };
}

/**
 * Decrypt Xiaomi Cloud MIoT API response
 */
export function decodeMiIOT(ssecurity: string, nonce: string, responseBase64: string): any {
  const snonce = signNonce(ssecurity, nonce);
  const keyBuf = Buffer.from(snonce, 'base64');
  const encryptedBuf = Buffer.from(responseBase64, 'base64');
  const decryptedBuf = rc4Drop1024(keyBuf, encryptedBuf);

  let text: string;
  // Check if response is gzipped (magic bytes 0x1F, 0x8B)
  if (decryptedBuf.length >= 2 && decryptedBuf[0] === 0x1f && decryptedBuf[1] === 0x8b) {
    text = zlib.gunzipSync(decryptedBuf).toString('utf8');
  } else {
    text = decryptedBuf.toString('utf8');
  }
  return JSON.parse(text);
}

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
  // Service 3: Play Control / Media (Standard MIoT urn:miot-spec-v2:service:play-control:0000781D)
  playControl: {
    siid: 3,
    status: { piid: 1, type: 'uint8', values: { playing: 1, paused: 2, stopped: 0 } },
    play: { aiid: 2, legacyAiid: 1 },
    pause: { aiid: 3, legacyAiid: 2 },
    toggle: { aiid: 3 },
    next: { aiid: 6, legacyAiid: 4 },
    previous: { aiid: 5 },
    playUrl: { aiid: 1, in: ['url'] }
  },
  // Service 7: Intelligent Speaker (Modern Pro / OH2P / Sound / X08 / L05)
  intelligentSpeaker7: {
    siid: 7,
    wakeUp: { aiid: 1 },
    playRadio: { aiid: 2 },
    playText: { aiid: 3, in: ['text'] },
    executeTextDirective: { aiid: 4, in: ['text', 'silent'] },
    playMusic: { aiid: 5 }
  },
  // Service 5: Legacy Intelligent Voice / TTS (LX04, etc.)
  intelligentSpeaker5: {
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
   * Execute Cloud MIoT API Call via official RC4 + SHA-1 signed encrypted protocol (api.io.mi.com)
   *
   * Adheres to PiotrMachowski / Xiaomi-cloud-tokens-extractor & miservice specifications:
   * - Endpoint: https://api.io.mi.com/app/...
   * - URI for signing: /... (e.g. /miotspec/action)
   * - Header: MIOT-ENCRYPT-ALGORITHM: ENCRYPT-RC4
   * - Two-stage RC4-drop1024 parameter encryption + SHA1 signature
   * - Response RC4 decryption with automatic gzip decompression
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

    // Strip leading slash and optional leading "app/" for signing URI
    let cleanEndpoint = endpointPath.replace(/^\/+/, '');
    if (cleanEndpoint.startsWith('app/')) {
      cleanEndpoint = cleanEndpoint.slice(4);
    }
    const uri = `/${cleanEndpoint}`;
    const url = `https://api.io.mi.com/app${uri}`;

    // Normalize data object
    const dataObj = (params && typeof params === 'object' && ('params' in params || 'list' in params || 'data' in params))
      ? params
      : (typeof params === 'object' ? { params } : params);

    const passportDeviceId = getPersistentClientDeviceId(userId);

    // If ssecurity is not available, fallback to legacy plaintext POST (warning logged)
    if (!ssecurity) {
      console.warn(`[MiotRpcEngine] ⚠️ executeCloudMiot: 缺少 ssecurity，尝试明文降级访问 ${uri}...`);
      const dataStr = typeof dataObj === 'string' ? dataObj : JSON.stringify(dataObj);
      const headers: Record<string, string> = {
        'User-Agent': 'MICO/AndroidApp/@SHIP.TO.2A2FE0D7@/2.4.40',
        'x-xiaomi-protocal-flag-cli': 'PROTOCAL-HTTP2',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': `userId=${userId}; serviceToken=${serviceToken}; PassportDeviceId=${passportDeviceId}; countryCode=CN; locale=zh_CN; timezone=GMT+08:00; timezone_id=Asia/Shanghai`
      };
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: new URLSearchParams({ data: dataStr }).toString()
        });
        const resText = await res.text();
        let resJson: any;
        try { resJson = JSON.parse(resText); } catch { return { code: res.status, result: resText, exeMode: 'cloud_miot' }; }
        return this.parseCloudMiotResult(resJson, res.status);
      } catch (err: any) {
        return { code: -1, error: `MIoT 明文请求失败: ${err.message}`, exeMode: 'cloud_miot' };
      }
    }

    // Standard Encrypted Xiaomi IO Call (RC4-drop1024 + SHA1)
    const encoded = encodeMiIOT('POST', uri, dataObj, ssecurity);
    const postBodyStr = new URLSearchParams({
      _nonce: encoded._nonce,
      data: encoded.data,
      rc4_hash__: encoded.rc4_hash__,
      signature: encoded.signature
    }).toString();

    const headers: Record<string, string> = {
      'User-Agent': 'MICO/AndroidApp/@SHIP.TO.2A2FE0D7@/2.4.40',
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-xiaomi-protocal-flag-cli': 'PROTOCAL-HTTP2',
      'miot-accept-encoding': 'GZIP',
      'miot-encrypt-algorithm': 'ENCRYPT-RC4',
      'Cookie': [
        'countryCode=CN',
        'locale=zh_CN',
        'timezone=GMT+08:00',
        'timezone_id=Asia/Shanghai',
        `userId=${userId}`,
        `PassportDeviceId=${passportDeviceId}`,
        `serviceToken=${serviceToken}`,
        `yetAnotherServiceToken=${serviceToken}`,
      ].join('; ')
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: postBodyStr
      });

      const resText = await res.text();

      // Check for HTTP errors
      if (res.status === 401 || res.status === 403) {
        return {
          code: res.status,
          error: `MIoT 云端认证失败 (HTTP ${res.status})，可能 serviceToken 或 ssecurity 已失效`,
          exeMode: 'cloud_miot'
        };
      }

      let resJson: any = null;

      // Try decrypting with RC4-drop1024
      try {
        resJson = decodeMiIOT(ssecurity, encoded._nonce, resText.trim());
      } catch (decErr: any) {
        // Fallback: Check if response was returned unencrypted
        try {
          resJson = JSON.parse(resText);
        } catch {
          return {
            code: res.status !== 200 ? res.status : -1,
            error: `MIoT 响应解密失败: ${decErr.message} (原始响应长度: ${resText.length})`,
            result: resText.slice(0, 300),
            exeMode: 'cloud_miot'
          };
        }
      }

      return this.parseCloudMiotResult(resJson, res.status);
    } catch (err: any) {
      return { code: -1, error: `MIoT 云端请求失败: ${err.message}`, exeMode: 'cloud_miot' };
    }
  }

  private parseCloudMiotResult(resJson: any, httpStatus: number): MiotRpcResult {
    if (!resJson || typeof resJson !== 'object') {
      return { code: -1, error: '云端返回了空结果', exeMode: 'cloud_miot' };
    }

    if (resJson.code === 0 || resJson.message === 'ok') {
      const innerResult = resJson.result !== undefined ? resJson.result : resJson;

      // Case 1: Action execution result { did, siid, aiid, code: -704042011, out: [] }
      if (innerResult && typeof innerResult === 'object' && !Array.isArray(innerResult)) {
        if (innerResult.code !== undefined && Number(innerResult.code) !== 0) {
          return {
            code: Number(innerResult.code),
            error: `MIoT 设备执行未确认 (Inner Code: ${innerResult.code})`,
            result: innerResult,
            exeMode: 'cloud_miot'
          };
        }
      }

      // Case 2: Property execution result array [{ did, siid, piid, code: -704042011 }]
      if (Array.isArray(innerResult) && innerResult.length > 0) {
        const failedItem = innerResult.find((item: any) => item && item.code !== undefined && Number(item.code) !== 0);
        if (failedItem) {
          return {
            code: Number(failedItem.code),
            error: `MIoT 属性操作失败 (Inner Code: ${failedItem.code})`,
            result: innerResult,
            exeMode: 'cloud_miot'
          };
        }
      }

      return {
        code: 0,
        result: innerResult,
        exeMode: 'cloud_miot'
      };
    }

    return {
      code: resJson.code || httpStatus,
      error: resJson.message || resJson.description || '云端返回错误',
      result: resJson,
      exeMode: 'cloud_miot'
    };
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
      const targetDid = (device as any).cloudDid || (device as any).deviceID || device.did;
      return this.executeCloudMiot('miotspec/prop/get', { params: [{ did: targetDid, siid, piid }] }, cloudAuth.userId, cloudAuth.serviceToken, cloudAuth.ssecurity);
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
      const targetDid = (device as any).cloudDid || (device as any).deviceID || device.did;
      return this.executeCloudMiot('miotspec/prop/set', { params: [{ did: targetDid, siid, piid, value }] }, cloudAuth.userId, cloudAuth.serviceToken, cloudAuth.ssecurity);
    }

    return { code: -1, error: '设备未配置局域网 Token 且未登录云端账号' };
  }

  /**
   * High-Level: Execute MIoT Action
   */
  public async executeAction(
    device: { ip?: string; token?: string; did: string; cloudDid?: string; deviceID?: string },
    siid: number,
    aiid: number,
    inParams: any[] = [],
    cloudAuth?: { userId: string; serviceToken: string; ssecurity?: string }
  ): Promise<MiotRpcResult> {
    // 1. Prefer Local miIO action
    if (device.ip && device.token) {
      const actionReq = { did: device.did, siid, aiid, in: inParams };
      const localRes = await this.executeLocalMiio(device.ip, device.token, 'action', actionReq);
      if (localRes.code === 0 && (!localRes.result || typeof localRes.result.code !== 'number' || localRes.result.code === 0)) {
        return localRes;
      }
    }

    // 2. Fallback to Cloud MIoT
    if (cloudAuth?.userId && cloudAuth?.serviceToken) {
      const targetDid = (device as any).cloudDid || (device as any).deviceID || device.did;
      return this.executeCloudMiot('miotspec/action', { params: { did: targetDid, siid, aiid, in: inParams } }, cloudAuth.userId, cloudAuth.serviceToken, cloudAuth.ssecurity);
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
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const spec = await res.json();
        this.specCache.set(modelUrn, spec);
        return spec;
      }
    } catch {}

    return null;
  }

  /**
   * Inspect device model MIoT Spec to determine whether it actually possesses
   * a legitimate URL property or Action, preventing blind guesses (e.g. treating siid=3, piid=1 playing-state as URL).
   */
  public async inspectDeviceMediaSpec(
    model: string
  ): Promise<{
    hasValidUrlProperty: boolean;
    urlProp?: { siid: number; piid: number; description?: string };
    playAction?: { siid: number; aiid: number; description?: string };
    hasCustomPlayUrlAction: boolean;
    playUrlAction?: { siid: number; aiid: number; description?: string };
    rawServicesSummary: string[];
  }> {
    const summary: string[] = [];
    if (!model) {
      return {
        hasValidUrlProperty: false,
        hasCustomPlayUrlAction: false,
        rawServicesSummary: ['未提供设备型号']
      };
    }

    const cleanModel = model.toLowerCase();

    // Standard XiaoAi Speaker models known to use standard play-control (siid=3, piid=1 is playing-state uint8 enum)
    const knownStandardXiaoaiModels = [
      'xiaomi.wifispeaker.lx06',
      'xiaomi.wifispeaker.l06a',
      'xiaomi.wifispeaker.lx04',
      'xiaomi.wifispeaker.lx05',
      'xiaomi.wifispeaker.l05b',
      'xiaomi.wifispeaker.l05c',
      'xiaomi.wifispeaker.l16a',
      'xiaomi.wifispeaker.x08c',
      'xiaomi.wifispeaker.s12',
      'xiaomi.wifispeaker.s12a'
    ];

    try {
      // 1. Fetch dynamic Spec from MIoT Spec instance registry if possible
      let spec = await this.getMiotSpecInstance(`urn:miot-spec-v2:device:speaker:0000A015:${cleanModel.replace(/\./g, '-')}:1`);
      if (!spec) {
        spec = await this.getMiotSpecInstance(`urn:miot-spec-v2:device:speaker:0000A015:${cleanModel}:1`);
      }

      let foundUrlProp: { siid: number; piid: number; description?: string } | undefined;
      let foundPlayAction: { siid: number; aiid: number; description?: string } | undefined;
      let foundPlayUrlAction: { siid: number; aiid: number; description?: string } | undefined;

      if (spec && Array.isArray(spec.services)) {
        for (const s of spec.services) {
          const sDesc = s.description || s.type || `siid:${s.iid}`;
          summary.push(`siid:${s.iid} (${sDesc})`);

          if (Array.isArray(s.properties)) {
            for (const p of s.properties) {
              const pDesc = (p.description || '').toLowerCase();
              const pType = (p.format || p.type || '').toLowerCase();
              // Check if this property is explicitly a string URL/URI
              if ((pDesc.includes('url') || pDesc.includes('uri') || pDesc.includes('media-url')) && pType === 'string') {
                foundUrlProp = { siid: s.iid, piid: p.iid, description: p.description };
              }
            }
          }

          if (Array.isArray(s.actions)) {
            for (const a of s.actions) {
              const aDesc = (a.description || '').toLowerCase();
              if (aDesc === 'play' || aDesc.includes('start-play')) {
                foundPlayAction = { siid: s.iid, aiid: a.iid, description: a.description };
              }
              if (aDesc.includes('play-url') || aDesc.includes('play-uri') || aDesc.includes('specify-url')) {
                foundPlayUrlAction = { siid: s.iid, aiid: a.iid, description: a.description };
              }
            }
          }
        }

        return {
          hasValidUrlProperty: Boolean(foundUrlProp),
          urlProp: foundUrlProp,
          playAction: foundPlayAction,
          hasCustomPlayUrlAction: Boolean(foundPlayUrlAction),
          playUrlAction: foundPlayUrlAction,
          rawServicesSummary: summary
        };
      }
    } catch {}

    // Fallback based on canonical Xiaomi MIoT Speaker Spec knowledge
    const isKnownXiaoai = knownStandardXiaoaiModels.some(m => cleanModel.includes(m) || m.includes(cleanModel));
    if (isKnownXiaoai) {
      summary.push('siid:1 (device-information)');
      summary.push('siid:2 (speaker, piid:1 volume, piid:2 mute)');
      summary.push('siid:3 (play-control, piid:1 playing-state [uint8 status, NOT URL], aiid:1 play, aiid:2 pause)');
      summary.push('siid:7 (intelligent-speaker, aiid:3 play-text, aiid:4 execute-text-directive)');

      return {
        hasValidUrlProperty: false, // Confirmed: piid=1 is playing-state, no URL property
        playAction: { siid: 3, aiid: 1, description: 'play' },
        hasCustomPlayUrlAction: false,
        rawServicesSummary: summary
      };
    }

    return {
      hasValidUrlProperty: false,
      hasCustomPlayUrlAction: false,
      rawServicesSummary: summary.length > 0 ? summary : ['未检测到明确的 MIoT URL 属性']
    };
  }
}

export const miotRpcEngine = new MiotRpcEngine();
