import crypto from 'crypto';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';

let cachedClientDeviceId = '';

/**
 * Get or initialize a persistent client device identifier for Xiaomi Mina / Passport sessions.
 * Matches Songloft / official Mi SoundBox iOS App client identity behavior.
 */
export function getPersistentClientDeviceId(userId?: string): string {
  if (cachedClientDeviceId && cachedClientDeviceId.length === 16) {
    return cachedClientDeviceId;
  }
  try {
    const dataDir = path.join(process.cwd(), 'data');
    const clientIdentityFile = path.join(dataDir, 'mina_client_id.json');
    if (fs.existsSync(clientIdentityFile)) {
      const parsed = JSON.parse(fs.readFileSync(clientIdentityFile, 'utf-8'));
      if (parsed && typeof parsed.clientDeviceId === 'string' && /^[0-9A-Fa-f]{16}$/.test(parsed.clientDeviceId)) {
        cachedClientDeviceId = parsed.clientDeviceId.toUpperCase();
        return cachedClientDeviceId;
      }
    }
    // Generate a standard 16-hex client id (e.g. "45A72B8C1D9E3F0A") matching Songloft / miservice
    const newId = crypto.randomBytes(8).toString('hex').toUpperCase();
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(clientIdentityFile, JSON.stringify({ clientDeviceId: newId, createdAt: new Date().toISOString() }, null, 2), 'utf-8');
    cachedClientDeviceId = newId;
    return cachedClientDeviceId;
  } catch {
    if (!cachedClientDeviceId || cachedClientDeviceId.length !== 16) {
      cachedClientDeviceId = crypto.randomBytes(8).toString('hex').toUpperCase();
    }
    return cachedClientDeviceId;
  }
}

let minaSeqCounter = 0;
/**
 * Generate sequential and timestamp-ordered Request ID matching official iOS client protocol
 */
export function generateMinaRequestId(prefix: string = 'app_ios'): string {
  minaSeqCounter = (minaSeqCounter + 1) % 1000000;
  return `${prefix}_${Date.now()}_${minaSeqCounter}`;
}

export interface XiaomiAuth {
  userId: string;
  micoServiceToken?: string;   // 仅供 Mina/小爱云 (api2.mina.mi.com, ws) 使用
  miotServiceToken?: string;   // 仅供 MIoT-spec / 米家云 (api.io.mi.com) 使用
  ssecurity?: string;
  passToken?: string;
  cUserId?: string;
}

/**
 * Build unified Mina HTTP headers with persistent client identity and cookies
 */
export function buildMinaHeaders(userId: string, serviceToken: string, targetSpeakerDeviceId?: string): Record<string, string> {
  const clientDevId = getPersistentClientDeviceId(userId);
  const cookieDeviceId = targetSpeakerDeviceId || clientDevId;
  return {
    'User-Agent': 'MISoundBox/1.4.0 (iPhone; iOS 14.4; Scale/3.00)',
    'Accept': 'application/json, text/plain, */*',
    'Cookie': `userId=${userId}; serviceToken=${serviceToken}; deviceId=${cookieDeviceId}; channel=MI_APP_STORE; PassportDeviceId=${clientDevId}`
  };
}

function logDebug(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const dataStr = data ? (typeof data === 'object' ? JSON.stringify(data) : String(data)) : '';
  console.log(`[Passport Log ${timestamp.slice(11, 19)}] ${message}`, dataStr);
  const logMsg = `[${timestamp}] ${message} ${data ? (typeof data === 'object' ? JSON.stringify(data, null, 2) : data) : ''}\n`;
  try {
    fs.appendFileSync('./passport_debug.log', logMsg);
  } catch (err) {
    console.error('Failed to write passport_debug.log:', err);
  }
}

export interface XiaomiPassportResult {
  success: boolean;
  userId?: string;
  ssecurity?: string;
  serviceToken?: string;
  passToken?: string;
  cUserId?: string;
  location?: string;
  nonce?: number;
  code?: number;
  error?: string;
  captchaUrl?: string;
  captchaIck?: string;
  notificationUrl?: string;
  stsTokens?: {
    micoapi?: string;
    xiaomiio?: string;
  };
}

export interface QrCodeResult {
  success: boolean;
  qrId?: string;
  qrUrl?: string;
  loginUrl?: string;
  lpUrl?: string;
  qrCodeUrl?: string;
  qrDataUrl?: string;
  error?: string;
}

export interface QrCodeStatusResult {
  success: boolean;
  status: 'pending' | 'scanned' | 'confirmed' | 'expired' | 'failed';
  userId?: string;
  serviceToken?: string;
  ssecurity?: string;
  passToken?: string;
  error?: string;
}

/**
 * Xiaomi Passport Authentication Engine
 * Implements complete Xiaomi Cloud Passport Login, STS Token exchange,
 * QR-code scan login, and cookie bypass parsing.
 */
export class XiaomiPassport {
  private userAgent = 'APP/com.xiaomi.mihome APPV/6.0.103 iosPassportSDK/3.9.0 iOS/14.4';
  private webUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  /**
   * Parse Cookie strings or raw auth input to extract userId, serviceToken, ssecurity, passToken
   */
  public parseTokenCookies(input: string): {
    userId?: string;
    serviceToken?: string;
    ssecurity?: string;
    passToken?: string;
    cUserId?: string;
  } {
    if (!input) return {};
    const text = String(input).trim();
    const result: {
      userId?: string;
      serviceToken?: string;
      ssecurity?: string;
      passToken?: string;
      cUserId?: string;
    } = {};

    const uidMatch = text.match(/(?:userId|uid|cUserId)=([^;\s"'&]+)/i);
    if (uidMatch) result.userId = uidMatch[1].trim();

    const tokenMatch = text.match(/(?:serviceToken)=([^;\s"'&]+)/i);
    if (tokenMatch) result.serviceToken = tokenMatch[1].trim();

    const ssecMatch = text.match(/(?:ssecurity)=([^;\s"'&]+)/i);
    if (ssecMatch) result.ssecurity = ssecMatch[1].trim();

    const passMatch = text.match(/(?:passToken)=([^;\s"'&]+)/i);
    if (passMatch) result.passToken = passMatch[1].trim();

    const cUserMatch = text.match(/(?:cUserId)=([^;\s"'&]+)/i);
    if (cUserMatch) result.cUserId = cUserMatch[1].trim();

    return result;
  }

  /**
   * Step 1: Query initial login parameters from Xiaomi Passport
   */
  public async getServiceLoginParams(sid = 'micoapi'): Promise<{
    _sign: string;
    qs: string;
    callback: string;
    cookies: string;
    sid: string;
  }> {
    const url = `https://account.xiaomi.com/pass/serviceLogin?sid=${encodeURIComponent(sid)}&_json=true`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': this.userAgent
      }
    });

    const setCookiesArr: string[] = typeof (res.headers as any).getSetCookie === 'function'
      ? (res.headers as any).getSetCookie()
      : [res.headers.get('set-cookie') || ''];
    const cookies = setCookiesArr.filter(Boolean).join('; ');

    const rawText = await res.text();
    const cleanJson = rawText.replace('&&&START&&&', '');
    const data = JSON.parse(cleanJson);

    return {
      _sign: data._sign || '',
      qs: data.qs || '',
      callback: data.callback || (sid === 'micoapi' ? 'https://api2.mina.mi.com/sts' : 'https://sts.api.io.mi.com/sts'),
      cookies,
      sid
    };
  }

  /**
   * Step 2 & 3: Login with account and password, followed by STS token exchange
   */
  public async loginWithPassword(
    user: string,
    pass: string,
    sid = 'micoapi',
    options?: { captchaCode?: string; captchaIck?: string }
  ): Promise<XiaomiPassportResult> {
    if (!user || !pass) {
      return { success: false, error: '请输入小米账号与密码' };
    }

    try {
      // 1. Get login metadata
      const params = await this.getServiceLoginParams(sid);
      if (!params._sign || !params.qs) {
        return { success: false, error: '未能从小米认证服务器获取登录签名，请检查网络连通性' };
      }

      // 2. Compute uppercase MD5 hash of password
      const passHash = crypto.createHash('md5').update(pass).digest('hex').toUpperCase();

      const postBody = new URLSearchParams({
        user: user.trim(),
        hash: passHash,
        callback: params.callback,
        sid: params.sid,
        qs: params.qs,
        _sign: params._sign,
        _json: 'true'
      });

      if (options?.captchaCode) {
        postBody.append('captCode', options.captchaCode);
      }
      if (options?.captchaIck) {
        postBody.append('ick', options.captchaIck);
      }

      const res = await fetch('https://account.xiaomi.com/pass/serviceLoginAuth2', {
        method: 'POST',
        headers: {
          'User-Agent': this.userAgent,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': params.cookies
        },
        body: postBody.toString()
      });

      const setCookies2Arr: string[] = typeof (res.headers as any).getSetCookie === 'function'
        ? (res.headers as any).getSetCookie()
        : [res.headers.get('set-cookie') || ''];
      const currentCookies = [params.cookies, ...setCookies2Arr].filter(Boolean).join('; ');

      const rawText = await res.text();
      const cleanJson = rawText.replace('&&&START&&&', '');
      let data: any;
      try {
        data = JSON.parse(cleanJson);
      } catch (parseErr) {
        return { success: false, error: `小米认证响应解析异常: ${rawText.slice(0, 100)}` };
      }

      if (data.code !== 0) {
        let errorMsg = data.description || data.desc || '登录验证失败';
        if (data.code === 70016) {
          errorMsg = '小米账号或密码错误 (错误码: 70016)，请仔细核对账号和密码后重试';
        } else if (data.code === 70002) {
          errorMsg = '该小米账号不存在 (错误码: 70002)，请检查输入';
        } else if (data.code === 87001) {
          errorMsg = '触发了小米安全图形验证码，请在输入验证码后重试，或使用【二维码扫码】/【Token 直连】模式';
        } else if (data.notificationUrl) {
          errorMsg = '触发了小米官方二次安全验证 (2FA)。推荐使用【扫码登录】或直接粘贴【ServiceToken】直连';
        }

        return {
          success: false,
          code: data.code,
          error: errorMsg,
          captchaUrl: data.captchaUrl ? `https://account.xiaomi.com${data.captchaUrl}` : undefined,
          notificationUrl: data.notificationUrl
        };
      }

      const userId = String(data.userId || '').trim();
      const ssecurity = data.ssecurity;
      const passToken = data.passToken;
      const cUserId = data.cUserId;
      let serviceToken = data.serviceToken || '';

      // 3. Follow location to perform STS token exchange
      if (data.location) {
        const stsResult = await this.exchangeStsToken(data.location, currentCookies, ssecurity);
        if (stsResult.serviceToken) {
          serviceToken = stsResult.serviceToken;
        }
      }

      // If we authenticated for micoapi, also attempt to fetch xiaomiio STS token for MIoT Home capabilities
      let xiaomiioToken: string | undefined;
      if (serviceToken && passToken && userId) {
        try {
          const miHomeSts = await this.fetchAdditionalStsToken(userId, passToken, 'xiaomiio');
          if (miHomeSts?.serviceToken) {
            xiaomiioToken = miHomeSts.serviceToken;
          }
        } catch {
          // Non-blocking
        }
      }

      if (!userId || !serviceToken) {
        return {
          success: false,
          code: 87002,
          error: '小米安全风控拦截：未获取到有效授权令牌 (serviceToken)。建议使用【局域网 Token 直连】或【扫码登录】模式！'
        };
      }

      return {
        success: true,
        userId,
        ssecurity,
        serviceToken,
        passToken,
        cUserId,
        stsTokens: {
          micoapi: serviceToken,
          xiaomiio: xiaomiioToken
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: `连接小米认证服务器异常: ${err.message || '网络超时'}`
      };
    }
  }

  /**
   * STS Token Exchange
   * Exchanges location redirect URL from Passport for a scoped serviceToken
   */
  public async exchangeStsToken(
    locationUrl: string,
    cookies: string,
    ssecurity?: string
  ): Promise<{ serviceToken?: string; passToken?: string; cookies?: string; rawLocation?: string; ssecurity?: string }> {
    logDebug(`exchangeStsToken START`, { locationUrl, cookies });
    try {
      let currentUrl = locationUrl.startsWith('http://') ? locationUrl.replace('http://', 'https://') : locationUrl;
      
      const cookieKvMap = new Map<string, string>();
      if (cookies) {
        cookies.split(';').forEach(item => {
          const eqIdx = item.indexOf('=');
          if (eqIdx > 0) {
            const k = item.slice(0, eqIdx).trim();
            const v = item.slice(eqIdx + 1).trim();
            if (k && !['domain', 'path', 'expires', 'httponly', 'samesite', 'secure'].includes(k.toLowerCase())) {
              cookieKvMap.set(k, v);
            }
          }
        });
      }

      // 1. First check if serviceToken is embedded directly in the locationUrl search params
      try {
        const u = new URL(currentUrl);
        const st = u.searchParams.get('serviceToken') || u.searchParams.get('st') || u.searchParams.get('sts') || u.searchParams.get('service_token');
        if (st) {
          logDebug(`exchangeStsToken found serviceToken directly in URL params:`, st);
          cookieKvMap.set('serviceToken', st);
          return { serviceToken: st, cookies: Array.from(cookieKvMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ') };
        }
      } catch {}

      let hops = 0;
      const maxHops = 5;

      while (hops < maxHops) {
        hops++;
        if (currentUrl.startsWith('http://')) {
          currentUrl = currentUrl.replace('http://', 'https://');
        }

        // Songloft 优化：针对 mina.mi.com 小爱官方接口，强制使用官方 App 客户端伪装，洗净 Cookie 干扰项
        const isMinaEndpoint = currentUrl.includes('mina.mi.com');
        let effectiveDevId = '';
        if (isMinaEndpoint) {
          const cleanUid = cookieKvMap.get('userId') || '';
          const clientDevId = getPersistentClientDeviceId(cleanUid);

          // 关键修复：从 locationUrl 参数中提取 Passport 签发给该设备的 d 参数（如 wb_... 或 app_ios_...）
          // 严禁对 locationUrl 中的 d 参数做魔改或正则替换，因为 URL 中的 query string 被包含在 _ssign HMAC 签名中！
          // 修改 query string 会导致签名校验不匹配而触发 api2.mina.mi.com 下发 401 Unauthorized。
          try {
            const uObj = new URL(currentUrl);
            effectiveDevId = uObj.searchParams.get('d') || clientDevId;
          } catch {
            effectiveDevId = clientDevId;
          }

          // 2. 清理 Web 登录遗留的 Cookie 干扰项
          cookieKvMap.delete('pass_ua');
          cookieKvMap.delete('theme');
          cookieKvMap.delete('passInfo');
          cookieKvMap.delete('sdkVersion');

          // 3. 强行补充 App 设备特征 Cookie，使其与 URL 里的 d= 参数保持一致
          cookieKvMap.set('deviceId', effectiveDevId);
          cookieKvMap.set('PassportDeviceId', effectiveDevId);
        }

        const cleanCookieHeader = Array.from(cookieKvMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
        let stsUserAgent = isMinaEndpoint
          ? 'MISoundBox/1.4.0 (iPhone; iOS 14.4; Scale/3.00)'
          : this.userAgent;

        let res = await fetch(currentUrl, {
          headers: {
            'User-Agent': stsUserAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Cookie': cleanCookieHeader
          },
          redirect: 'manual'
        });

        // 针对 Mina 接口的 401 重试机制：使用精简 核心 Cookies 重新尝试
        if (res.status === 401 && isMinaEndpoint) {
          const cleanUid = cookieKvMap.get('userId') || '';
          const clientDevId = getPersistentClientDeviceId(cleanUid);
          const retryDevId = effectiveDevId || clientDevId;
          const cleanMinimalCookie = `userId=${cleanUid}; passToken=${cookieKvMap.get('passToken') || ''}; deviceId=${retryDevId}; PassportDeviceId=${retryDevId}`;

          logDebug(`exchangeStsToken retrying Mina 401 with App UserAgent & minimal clean cookies`, { currentUrl, cleanMinimalCookie });
          res = await fetch(currentUrl, {
            headers: {
              'User-Agent': 'MISoundBox/1.4.0 (iPhone; iOS 14.4; Scale/3.00)',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
              'Cookie': cleanMinimalCookie
            },
            redirect: 'manual'
          });
        }

        const setCookiesArr: string[] = typeof (res.headers as any).getSetCookie === 'function'
          ? (res.headers as any).getSetCookie()
          : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')!] : []);

        for (const sc of setCookiesArr) {
          if (!sc) continue;
          const firstPart = sc.split(';')[0].trim();
          const eqIdx = firstPart.indexOf('=');
          if (eqIdx > 0) {
            const k = firstPart.slice(0, eqIdx).trim();
            const v = firstPart.slice(eqIdx + 1).trim();
            if (k && !['domain', 'path', 'expires', 'httponly', 'samesite', 'secure'].includes(k.toLowerCase())) {
              cookieKvMap.set(k, v);
            }
          }
        }

        const updatedCookieHeader = Array.from(cookieKvMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');

        logDebug(`exchangeStsToken hop ${hops}`, {
          url: currentUrl,
          status: res.status,
          cookies: updatedCookieHeader,
          location: res.headers.get('location')
        });

        // Check if serviceToken is in Cookie map
        if (cookieKvMap.has('serviceToken') && cookieKvMap.get('serviceToken')) {
          const st = cookieKvMap.get('serviceToken')!;
          logDebug(`exchangeStsToken success at hop ${hops}:`, st);
          return { serviceToken: st, passToken: cookieKvMap.get('passToken'), cookies: updatedCookieHeader };
        }

        // Check next location
        const nextLoc = res.headers.get('location');
        if (nextLoc) {
          try {
            const nextUrlObj = new URL(nextLoc, currentUrl);
            const st = nextUrlObj.searchParams.get('serviceToken') || nextUrlObj.searchParams.get('st') || nextUrlObj.searchParams.get('sts') || nextUrlObj.searchParams.get('service_token');
            if (st) {
              logDebug(`exchangeStsToken found serviceToken in redirect URL at hop ${hops}:`, st);
              cookieKvMap.set('serviceToken', st);
              return { serviceToken: st, passToken: cookieKvMap.get('passToken'), cookies: Array.from(cookieKvMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ') };
            }
            currentUrl = nextUrlObj.href;
          } catch {
            break;
          }
        } else {
          // No more redirects. Check response body
          const bodyText = await res.text();
          const bodyMatch = bodyText.match(/["']?(?:serviceToken|service_token|stsToken)["']?\s*[:=]\s*["']?([^"';\s&]+)/i);
          if (bodyMatch) {
            logDebug(`exchangeStsToken found serviceToken in response body at hop ${hops}:`, bodyMatch[1]);
            cookieKvMap.set('serviceToken', bodyMatch[1]);
            return { serviceToken: bodyMatch[1], passToken: cookieKvMap.get('passToken'), cookies: Array.from(cookieKvMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ') };
          }
          break;
        }
      }

      const finalCookieHeader = Array.from(cookieKvMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
      logDebug(`exchangeStsToken finished with NO serviceToken found after ${hops} hops`);
      return { passToken: cookieKvMap.get('passToken'), cookies: finalCookieHeader };
    } catch (err: any) {
      logDebug(`exchangeStsToken ERROR`, err.message);
      console.warn('STS exchange failed:', err.message);
      return {};
    }
  }

  /**
   * Fetch additional scoped STS token using passToken (e.g. for xiaomiio or micoapi)
   */
  public async fetchAdditionalStsToken(
    userId: string,
    passToken: string,
    targetSid: 'xiaomiio' | 'micoapi',
    cUserId?: string
  ): Promise<{ serviceToken?: string; ssecurity?: string; userId?: string; error?: string }> {
    try {
      const cleanUid = String(userId || '').replace(/^uid_/, '').replace(/^["']|["']$/g, '').trim();
      const cleanPassToken = String(passToken || '').replace(/^["']|["']$/g, '').trim();

      const hosts = ['https://account.xiaomi.com', 'https://cn.account.xiaomi.com'];
      let lastErr = '';

      for (const host of hosts) {
        try {
          const clientDevId = getPersistentClientDeviceId(cleanUid);
          const loginUrl = targetSid === 'micoapi'
            ? `${host}/pass/serviceLogin?sid=micoapi&_json=true&_qrsize=280&deviceId=${encodeURIComponent(clientDevId)}&d=${encodeURIComponent(clientDevId)}`
            : `${host}/pass/serviceLogin?sid=${encodeURIComponent(targetSid)}&_json=true`;
          const baseCookies = targetSid === 'micoapi'
            ? [
                `userId=${cleanUid}`,
                cUserId ? `cUserId=${cUserId}` : '',
                `passToken=${cleanPassToken}`,
                `deviceId=${clientDevId}`,
                `PassportDeviceId=${clientDevId}`,
                'uLocale=zh_CN'
              ].filter(Boolean).join('; ')
            : [
                `userId=${cleanUid}`,
                cUserId ? `cUserId=${cUserId}` : '',
                `passToken=${cleanPassToken}`,
                'uLocale=zh_CN',
                'sdkVersion=3.9'
              ].filter(Boolean).join('; ');

          const fetchUa = targetSid === 'micoapi'
            ? 'MISoundBox/1.4.0 (iPhone; iOS 14.4; Scale/3.00)'
            : this.userAgent;

          const res = await fetch(loginUrl, {
            method: 'GET',
            headers: {
              'User-Agent': fetchUa,
              'Cookie': baseCookies
            }
          });

          const setCookiesArr: string[] = typeof (res.headers as any).getSetCookie === 'function'
            ? (res.headers as any).getSetCookie()
            : [res.headers.get('set-cookie') || ''];
          const responseCookies = setCookiesArr.filter(Boolean).map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
          const combinedCookieHeader = [baseCookies, responseCookies].filter(Boolean).join('; ');

          const raw = await res.text();
          const clean = raw.replace('&&&START&&&', '');
          let json: any = {};
          try {
            json = JSON.parse(clean);
          } catch {
            continue;
          }

          const returnedUserId = json.userId ? String(json.userId) : (json.cUserId || cleanUid);

          if (json.code === 0 && json.location) {
            const sts = await this.exchangeStsToken(json.location, combinedCookieHeader, json.ssecurity);
            if (sts.serviceToken) {
              return {
                serviceToken: sts.serviceToken,
                ssecurity: json.ssecurity || (sts as any).ssecurity,
                userId: returnedUserId
              };
            } else {
              lastErr = `STS 重定向换取 serviceToken 失败 (${targetSid} 网关未下发凭证)`;
            }
          } else if (json.code === 0 && json.serviceToken) {
            return {
              serviceToken: json.serviceToken,
              ssecurity: json.ssecurity,
              userId: returnedUserId
            };
          } else {
            lastErr = json.desc || json.message || `认证流程未完成 (code: ${json.code})`;
          }
        } catch (hErr: any) {
          lastErr = hErr.message;
        }
      }

      return {
        error: lastErr || '未能完成 STS 令牌换取'
      };
    } catch (err: any) {
      console.warn(`[STS ${targetSid}] exception:`, err.message);
      return { error: err.message };
    }
  }

  /**
   * QR Code Login - Step 1: Generate Login QR Code
   */
  public async generateLoginQrCode(
    sid = 'micoapi',
    region = 'cn'
  ): Promise<QrCodeResult & { qrCodeUrl?: string; qrDataUrl?: string; qr?: string }> {
    try {
      // For China Mainland, use cn.account.xiaomi.com to ensure dc=ak (China mainland datacenter),
      // which is required for Mi Home (米家 App) and domestic Xiaomi account authorization.
      const host = region === 'cn' ? 'cn.account.xiaomi.com' : 'account.xiaomi.com';
      const cleanSid = sid === 'mijia' ? 'xiaomiio' : (sid || 'micoapi');
      const url = `https://${host}/longPolling/loginUrl?sid=${encodeURIComponent(cleanSid)}&dc=ak&_json=true&_qrsize=280&_hasLogo=false`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': this.webUserAgent,
          'Accept': 'application/json, text/plain, */*'
        }
      });

      const raw = await res.text();
      const clean = raw.replace('&&&START&&&', '');
      let data: any;
      try {
        data = JSON.parse(clean);
      } catch (parseErr) {
        return { success: false, error: `解析小米二维码响应异常: ${raw.slice(0, 100)}` };
      }

      if (data.code !== 0 || (!data.qr && !data.loginUrl)) {
        return { success: false, error: data.description || data.desc || `生成二维码失败 (code: ${data.code})` };
      }

      // Extract qrId/lp parameter from loginUrl or lp
      const lpMatch = (data.lp || data.loginUrl || '').match(/[?&](?:lp|k)=([^&]+)/);
      const ticketMatch = (data.loginUrl || '').match(/[?&](?:ticket|lp|k)=([^&]+)/);
      const qrId = lpMatch ? lpMatch[1] : (ticketMatch ? ticketMatch[1] : `qr_${Date.now()}`);

      // NOTE: data.qr returned by Xiaomi API is an official PNG QR image generated by Xiaomi servers
      // (which encodes the internal longPolling/login?ticket=... token that Mi Home App and Xiaomi Camera recognize).
      // DO NOT pass data.qr into QRCode.toDataURL() - that would encode the URL into a secondary QR code!
      let officialImgDataUrl = '';
      if (data.qr) {
        try {
          const imgRes = await fetch(data.qr, {
            headers: {
              'User-Agent': this.webUserAgent,
              'Accept': 'image/png,image/*;q=0.9,*/*;q=0.8'
            }
          });
          if (imgRes.ok) {
            const imgBuf = await imgRes.arrayBuffer();
            officialImgDataUrl = `data:image/png;base64,${Buffer.from(imgBuf).toString('base64')}`;
          }
        } catch (imgErr: any) {
          console.warn('Failed to fetch official Xiaomi QR image buffer:', imgErr.message);
        }
      }

      // Fallback: if buffering failed, try QRCode.toDataURL on data.loginUrl (the actual login ticket URL)
      let fallbackDataUrl = '';
      if (!officialImgDataUrl && data.loginUrl) {
        try {
          fallbackDataUrl = await QRCode.toDataURL(data.loginUrl, {
            width: 280,
            margin: 1,
            color: { dark: '#000000', light: '#ffffff' },
            errorCorrectionLevel: 'M'
          });
        } catch {}
      }

      const finalQrUrl = officialImgDataUrl || data.qr || fallbackDataUrl;

      return {
        success: true,
        qrId,
        qr: data.qr,
        loginUrl: data.loginUrl,
        lpUrl: data.lp,
        qrUrl: finalQrUrl,
        qrCodeUrl: finalQrUrl,
        qrDataUrl: finalQrUrl
      };
    } catch (err: any) {
      return { success: false, error: err.message || '网络连接超时' };
    }
  }

  /**
   * QR Code Login - Step 2: Poll QR code status (Scanned / Confirmed)
   */
  public async checkQrCodeStatus(loginUrl: string, lpUrl?: string): Promise<QrCodeStatusResult> {
    try {
      // STRICT RULE: Only long-poll the lpUrl (data.lp)! NEVER poll loginUrl because loginUrl returns 70016 expired error!
      const targetPollUrl = lpUrl || (loginUrl && loginUrl.includes('/lp/') ? loginUrl : null);

      if (!targetPollUrl) {
        return { success: true, status: 'pending' };
      }

      let data: any = null;
      try {
        const controller = new AbortController();
        // Long-polling timeout: 8 seconds per status check
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(targetPollUrl, {
          headers: {
            'User-Agent': this.webUserAgent,
            'Accept': 'application/json, text/plain, */*'
          },
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        // Extract any Set-Cookie headers returned by Xiaomi
        const setCookiesArr: string[] = typeof (res.headers as any).getSetCookie === 'function'
          ? (res.headers as any).getSetCookie()
          : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')!] : []);
        
        let headerPassToken = '';
        for (const sc of setCookiesArr) {
          const match = sc.match(/(?:passToken|serviceToken)=([^;\s]+)/i);
          if (match && sc.toLowerCase().includes('passtoken')) {
            headerPassToken = match[1];
          }
        }

        const raw = await res.text();
        const clean = raw.replace('&&&START&&&', '');
        try {
          data = JSON.parse(clean);
          if (headerPassToken && !data.passToken) {
            data.passToken = headerPassToken;
          }
        } catch {}
      } catch (pollErr: any) {
        // AbortError or network timeout during long-polling is expected when no scan event occurred yet -> STILL PENDING
        return { success: true, status: 'pending' };
      }

      if (!data) {
        return { success: true, status: 'pending' };
      }

      if (data.code === 0) {
        logDebug(`checkQrCodeStatus code 0 CONFIRMED! Raw payload`, data);
        // Confirmed! Extract token details
        const userId = String(data.userId || data.cUserId || '').trim();
        const ssecurity = data.ssecurity;
        let passToken = data.passToken;
        let serviceToken = data.serviceToken || data.service_token || data.stsToken || data.micoToken || '';

        if (data.location) {
          logDebug(`checkQrCodeStatus location redirect found: ${data.location}`);
          const cookieStr = [
            `userId=${userId}`,
            data.cUserId ? `cUserId=${data.cUserId}` : '',
            passToken ? `passToken=${passToken}` : '',
            'uLocale=zh_CN'
          ].filter(Boolean).join('; ');
          const sts = await this.exchangeStsToken(data.location, cookieStr, ssecurity);
          if (sts.serviceToken) serviceToken = sts.serviceToken;
          if (sts.passToken && !passToken) passToken = sts.passToken;
        }

        const result: QrCodeStatusResult = {
          success: true,
          status: 'confirmed',
          userId,
          serviceToken,
          ssecurity,
          passToken
        };
        logDebug(`checkQrCodeStatus return result: userId=${userId}, hasPassToken=${Boolean(passToken)}, hasServiceToken=${Boolean(serviceToken)}`, result);
        return result;
      } else if (data.code === 70014) {
        logDebug(`checkQrCodeStatus code 70014: 等待扫码...`);
        return { success: true, status: 'pending' };
      } else if (data.code === 70013) {
        logDebug(`checkQrCodeStatus code 70013: 手机已扫码，等待确认...`);
        return { success: true, status: 'scanned' };
      } else if (data.code === 70015 || data.code === 70016) {
        logDebug(`checkQrCodeStatus code ${data.code}: 二维码已过期/失效`);
        return { success: true, status: 'expired' };
      }

      return {
        success: true,
        status: 'pending'
      };
    } catch (err: any) {
      return {
        success: true,
        status: 'pending'
      };
    }
  }
}

export const xiaomiPassport = new XiaomiPassport();
