import crypto from 'crypto';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { xiaomiCircuitBreaker } from './circuitBreaker';

let cachedClientDeviceId = '';

/**
 * Get or initialize a persistent client device identifier for Xiaomi Mina / Passport sessions.
 * Matches official Mi SoundBox iOS App client identity behavior.
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
    // Generate a standard 16-hex client id (e.g. "45A72B8C1D9E3F0A") matching miservice
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
 * Extract a big integer or string value safely from raw JSON to avoid 64-bit precision truncation
 * Reference: safe extractBigIntField
 */
export function extractBigIntField(jsonStr: string, field: string): string {
  const match = jsonStr.match(new RegExp(`"${field}"\\s*:\\s*([0-9]{15,30})`));
  if (match) {
    return match[1];
  }
  const strMatch = jsonStr.match(new RegExp(`"${field}"\\s*:\\s*"([^"]+)"`));
  if (strMatch) {
    return strMatch[1];
  }
  return '';
}

/**
 * Compute clientSign = base64(sha1("nonce={nonce}&{ssecurity}"))
 * Essential for Xiaomi STS token authentication
 */
export function computeClientSign(nonce: string, ssecurity: string): string {
  const input = `nonce=${nonce}&${ssecurity}`;
  return crypto.createHash('sha1').update(input).digest('base64');
}

/**
 * Append or replace query parameters on an existing URL safely
 */
export function appendQueryParams(urlStr: string, params: Record<string, string>): string {
  try {
    const u = new URL(urlStr);
    for (const [k, v] of Object.entries(params)) {
      u.searchParams.set(k, v);
    }
    return u.toString();
  } catch {
    const qs = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    return urlStr.includes('?') ? `${urlStr}&${qs}` : `${urlStr}?${qs}`;
  }
}

/**
 * Build unified Mina HTTP headers with persistent client identity and cookies
 * Fully aligned with official Mi SoundBox iOS App client identity behavior.
 */
export function buildMinaHeaders(userId: string, serviceToken: string, targetSpeakerDeviceId?: string): Record<string, string> {
  const cleanUid = String(userId || '').replace(/^uid_/, '').replace(/^["']|["']$/g, '').trim();
  const cleanToken = String(serviceToken || '').replace(/^["']|["']$/g, '').trim();
  const clientDevId = getPersistentClientDeviceId(cleanUid);
  const cookieDeviceId = targetSpeakerDeviceId || clientDevId;
  return {
    'User-Agent': `Android-7.1.1-1.0.0-ONEPLUS A3010-136-${clientDevId} APP/xiaomi.smarthome APPV/62830`,
    'Accept': 'application/json, text/plain, */*',
    'Cookie': `userId=${cleanUid}; serviceToken=${cleanToken}; deviceId=${cookieDeviceId}; channel=MI_APP_STORE; PassportDeviceId=${clientDevId}`
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
  xiaomiioSsecurity?: string;
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
      const canReq = xiaomiCircuitBreaker.canRequest('passport_login');
      if (!canReq.allowed) {
        return {
          success: false,
          error: `登录请求被安全频控保护拦截: ${canReq.reason || '正在冷却中'}。请稍后重试或切换至【扫码登录】。`
        };
      }

      // 1. Get login metadata
      const params = await this.getServiceLoginParams(sid);
      if (!params._sign || !params.qs) {
        xiaomiCircuitBreaker.recordFailure('未能从小米认证服务器获取登录签名');
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
        xiaomiCircuitBreaker.recordFailure(`小米认证响应解析异常: ${rawText.slice(0, 100)}`, res.status);
        return { success: false, error: `小米认证响应解析异常: ${rawText.slice(0, 100)}` };
      }

      if (data.code !== 0) {
        let errorMsg = data.description || data.desc || '登录验证失败';
        if (data.code === 70016) {
          errorMsg = '小米账号或密码错误 (错误码: 70016)，请仔细核对账号和密码后重试';
        } else if (data.code === 70002) {
          errorMsg = '该小米账号不存在 (错误码: 70002)，请检查输入';
        } else if (data.code === 87001) {
          errorMsg = '触发了小米安全图形验证码/滑块挑战，请在输入验证码后重试，或使用【二维码扫码】/【Token 直连】模式';
        } else if (data.notificationUrl) {
          errorMsg = '触发了小米官方二次安全验证 (2FA)。推荐使用【扫码登录】或直接粘贴【ServiceToken】直连';
        }

        // Record risk-control or captcha challenges
        xiaomiCircuitBreaker.recordFailure(errorMsg, res.status, data);

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
        const nonce = extractBigIntField(cleanJson, 'nonce') || (data.nonce ? String(data.nonce) : '');
        const stsResult = await this.exchangeStsToken(data.location, currentCookies, ssecurity, nonce);
        if (stsResult.serviceToken) {
          serviceToken = stsResult.serviceToken;
        }
      }

      // If we authenticated for micoapi, also attempt to fetch xiaomiio STS token for MIoT Home capabilities
      let xiaomiioToken: string | undefined;
      let xiaomiioSsecurity: string | undefined;
      if (serviceToken && passToken && userId) {
        try {
          const miHomeSts = await this.fetchAdditionalStsToken(userId, passToken, 'xiaomiio');
          if (miHomeSts?.serviceToken) {
            xiaomiioToken = miHomeSts.serviceToken;
            xiaomiioSsecurity = miHomeSts.ssecurity;
          }
        } catch {
          // Non-blocking
        }
      }

      if (!userId || !serviceToken) {
        xiaomiCircuitBreaker.recordFailure('未获取到有效授权令牌');
        return {
          success: false,
          code: 87002,
          error: '小米安全风控拦截：未获取到有效授权令牌 (serviceToken)。建议使用【扫码登录】模式！'
        };
      }

      xiaomiCircuitBreaker.recordSuccess();

      return {
        success: true,
        userId,
        ssecurity,
        serviceToken,
        passToken,
        cUserId,
        xiaomiioSsecurity,
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
   * Supports clientSign computation: clientSign = base64(sha1("nonce={nonce}&{ssecurity}"))
   */
  public async exchangeStsToken(
    locationUrl: string,
    cookies: string,
    ssecurity?: string,
    nonceStr?: string
  ): Promise<{ serviceToken?: string; passToken?: string; cookies?: string; rawLocation?: string; ssecurity?: string }> {
    logDebug(`exchangeStsToken START`, { locationUrl, cookies, hasSsecurity: Boolean(ssecurity), hasNonce: Boolean(nonceStr) });
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

      // 签名规范：从原始 nonce 与 ssecurity 计算 clientSign 并追加到 location URL
      // 签名公式：clientSign = base64(sha1("nonce={nonce}&{ssecurity}"))
      if (nonceStr && ssecurity && !currentUrl.includes('clientSign=')) {
        const clientSign = computeClientSign(nonceStr, ssecurity);
        currentUrl = appendQueryParams(currentUrl, {
          _userIdNeedEncrypt: 'true',
          clientSign
        });
        logDebug(`exchangeStsToken appended clientSign to URL: ${currentUrl.replace(/clientSign=[^&]+/, 'clientSign=***')}`);
      }

      // 1. First check if serviceToken is embedded directly in the locationUrl search params
      try {
        const u = new URL(currentUrl);
        const st = u.searchParams.get('serviceToken') || u.searchParams.get('st') || u.searchParams.get('sts') || u.searchParams.get('service_token');
        if (st) {
          logDebug(`exchangeStsToken found serviceToken directly in URL params:`, st);
          cookieKvMap.set('serviceToken', st);
          return { serviceToken: st, cookies: Array.from(cookieKvMap.entries()).map(([k, v]) => `${k}=${v}`).join('; '), ssecurity };
        }
      } catch {}

      let hops = 0;
      const maxHops = 10;
      const cleanUid = cookieKvMap.get('userId') || '';
      const clientDevId = getPersistentClientDeviceId(cleanUid);
      const standardUa = `Android-7.1.1-1.0.0-ONEPLUS A3010-136-${clientDevId} APP/xiaomi.smarthome APPV/62830`;

      while (hops < maxHops) {
        hops++;
        if (currentUrl.startsWith('http://')) {
          currentUrl = currentUrl.replace('http://', 'https://');
        }

        // 携带标准核心 Cookies
        if (!cookieKvMap.has('deviceId')) cookieKvMap.set('deviceId', clientDevId);
        if (!cookieKvMap.has('sdkVersion')) cookieKvMap.set('sdkVersion', '3.8.6');

        const cleanCookieHeader = Array.from(cookieKvMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');

        const res = await fetch(currentUrl, {
          headers: {
            'User-Agent': standardUa,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Cookie': cleanCookieHeader
          },
          redirect: 'manual'
        });

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
          url: currentUrl.replace(/clientSign=[^&]+/, 'clientSign=***'),
          status: res.status,
          cookies: updatedCookieHeader,
          location: res.headers.get('location')
        });

        // Check if serviceToken is in Cookie map
        if (cookieKvMap.has('serviceToken') && cookieKvMap.get('serviceToken')) {
          const st = cookieKvMap.get('serviceToken')!;
          logDebug(`exchangeStsToken success at hop ${hops}:`, st.slice(0, 6) + '••••');
          return { serviceToken: st, passToken: cookieKvMap.get('passToken'), cookies: updatedCookieHeader, ssecurity };
        }

        // Check next location
        const nextLoc = res.headers.get('location');
        if (nextLoc) {
          try {
            const nextUrlObj = new URL(nextLoc, currentUrl);
            const st = nextUrlObj.searchParams.get('serviceToken') || nextUrlObj.searchParams.get('st') || nextUrlObj.searchParams.get('sts') || nextUrlObj.searchParams.get('service_token');
            if (st) {
              logDebug(`exchangeStsToken found serviceToken in redirect URL at hop ${hops}:`, st.slice(0, 6) + '••••');
              cookieKvMap.set('serviceToken', st);
              return { serviceToken: st, passToken: cookieKvMap.get('passToken'), cookies: Array.from(cookieKvMap.entries()).map(([k, v]) => `${k}=${v}`).join('; '), ssecurity };
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
            logDebug(`exchangeStsToken found serviceToken in response body at hop ${hops}:`, bodyMatch[1].slice(0, 6) + '••••');
            cookieKvMap.set('serviceToken', bodyMatch[1]);
            return { serviceToken: bodyMatch[1], passToken: cookieKvMap.get('passToken'), cookies: Array.from(cookieKvMap.entries()).map(([k, v]) => `${k}=${v}`).join('; '), ssecurity };
          }
          break;
        }
      }

      const finalCookieHeader = Array.from(cookieKvMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
      logDebug(`exchangeStsToken finished with NO serviceToken found after ${hops} hops`);
      return { passToken: cookieKvMap.get('passToken'), cookies: finalCookieHeader, ssecurity };
    } catch (err: any) {
      logDebug(`exchangeStsToken ERROR`, err.message);
      console.warn('STS exchange failed:', err.message);
      return {};
    }
  }

  /**
   * Fetch additional scoped STS token using passToken (e.g. for xiaomiio or micoapi)
   * Follows standard 3-step handshake:
   * 1. GET serviceLogin?sid={sid}&_json=true
   * 2. Extract nonce & ssecurity, compute clientSign
   * 3. Follow redirect location with clientSign to extract serviceToken
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

      const clientDevId = getPersistentClientDeviceId(cleanUid);
      const standardUa = `Android-7.1.1-1.0.0-ONEPLUS A3010-136-${clientDevId} APP/xiaomi.smarthome APPV/62830`;

      const cookieParts = [
        `passToken=${cleanPassToken}`,
        `userId=${cleanUid}`,
        `deviceId=${clientDevId}`,
        `sdkVersion=3.8.6`,
      ];
      if (cUserId) {
        cookieParts.push(`cUserId=${cUserId}`);
      }
      const cookieHeader = cookieParts.join('; ');

      const serviceLoginUrl = `https://account.xiaomi.com/pass/serviceLogin?sid=${encodeURIComponent(targetSid)}&_json=true`;

      logDebug(`[fetchAdditionalStsToken] 正在申请 ${targetSid} 域凭证 (userId=${cleanUid})`);

      const res = await fetch(serviceLoginUrl, {
        method: 'GET',
        headers: {
          'User-Agent': standardUa,
          'Cookie': cookieHeader
        }
      });

      const setCookiesArr: string[] = typeof (res.headers as any).getSetCookie === 'function'
        ? (res.headers as any).getSetCookie()
        : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')!] : []);
      const responseCookies = setCookiesArr.filter(Boolean).map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
      const combinedCookieHeader = [cookieHeader, responseCookies].filter(Boolean).join('; ');

      const raw = await res.text();
      const clean = raw.replace('&&&START&&&', '').trim();
      let json: any = {};
      try {
        json = JSON.parse(clean);
      } catch (parseErr: any) {
        logDebug(`[fetchAdditionalStsToken] JSON解析失败:`, clean.slice(0, 100));
        return { error: `解析 serviceLogin 响应失败: ${clean.slice(0, 100)}` };
      }

      if (json.code !== 0) {
        const desc = json.desc || json.description || `错误码: ${json.code}`;
        logDebug(`[fetchAdditionalStsToken] serviceLogin 失败:`, desc);
        return { error: `serviceLogin for ${targetSid} failed: ${desc}` };
      }

      const returnedUserId = json.userId ? String(json.userId) : (json.cUserId || cleanUid);
      const ssecurity = json.ssecurity || '';
      const nonce = extractBigIntField(clean, 'nonce') || (json.nonce ? String(json.nonce) : '');

      logDebug(`[fetchAdditionalStsToken] serviceLogin 成功, location=${Boolean(json.location)}, nonce=${Boolean(nonce)}, ssecurity=${Boolean(ssecurity)}`);

      if (json.location) {
        const sts = await this.exchangeStsToken(json.location, combinedCookieHeader, ssecurity, nonce);
        if (sts.serviceToken) {
          logDebug(`[fetchAdditionalStsToken] ✅ 成功置换 ${targetSid} 的 serviceToken: ${sts.serviceToken.slice(0, 6)}••••`);
          return {
            serviceToken: sts.serviceToken,
            ssecurity,
            userId: returnedUserId
          };
        } else {
          return { error: `STS 重定向换取 serviceToken 失败 (${targetSid} 网关未下发凭证)` };
        }
      } else if (json.serviceToken) {
        return {
          serviceToken: json.serviceToken,
          ssecurity,
          userId: returnedUserId
        };
      }

      return { error: `认证流程未完成 (code: ${json.code})` };
    } catch (err: any) {
      logDebug(`[fetchAdditionalStsToken] 异常:`, err.message);
      return { error: err.message };
    }
  }

  /**
   * QR Code Login - Step 1: Generate Login QR Code
   * Follows standard QR code initialization:
   * 1. Query serviceLogin to obtain _sign, qs, callback
   * 2. Query longPolling/loginUrl to obtain official QR PNG and long-polling lpUrl
   */
  public async generateLoginQrCode(
    sid = 'mijia',
    region = 'cn'
  ): Promise<QrCodeResult & { qrCodeUrl?: string; qrDataUrl?: string; qr?: string }> {
    try {
      const clientDevId = getPersistentClientDeviceId();
      const standardUa = `Android-7.1.1-1.0.0-ONEPLUS A3010-136-${clientDevId} APP/xiaomi.smarthome APPV/62830`;
      const cleanSid = sid === 'micoapi' || sid === 'xiaomiio' ? 'mijia' : (sid || 'mijia');

      // Step 1: GET serviceLogin to get signature parameters
      let sign = '';
      let qs = '';
      let callback = '';
      try {
        const step1Url = `https://account.xiaomi.com/pass/serviceLogin?sid=${encodeURIComponent(cleanSid)}&_json=true`;
        const step1Res = await fetch(step1Url, {
          headers: {
            'User-Agent': standardUa,
            'Cookie': `sdkVersion=3.8.6; deviceId=${clientDevId}`
          }
        });
        const raw1 = await step1Res.text();
        const clean1 = raw1.replace('&&&START&&&', '').trim();
        const json1 = JSON.parse(clean1);
        sign = json1._sign || '';
        qs = json1.qs || '';
        callback = json1.callback || '';
      } catch (e: any) {
        logDebug('[generateLoginQrCode] Step 1 warning:', e.message);
      }

      // Step 2: GET longPolling/loginUrl
      const params = new URLSearchParams();
      params.append('_qrsize', '280');
      params.append('sid', cleanSid);
      if (qs) params.append('qs', qs);
      if (sign) params.append('_sign', sign);
      if (callback) params.append('callback', callback);
      params.append('_json', 'true');
      params.append('_dc', String(Date.now()));

      const url = `https://account.xiaomi.com/longPolling/loginUrl?${params.toString()}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': standardUa,
          'Accept': 'application/json, text/plain, */*'
        }
      });

      const raw = await res.text();
      const clean = raw.replace('&&&START&&&', '').trim();
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

      let officialImgDataUrl = '';
      if (data.qr) {
        try {
          const imgRes = await fetch(data.qr, {
            headers: {
              'User-Agent': standardUa,
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
      const targetPollUrl = lpUrl || (loginUrl && loginUrl.includes('/lp/') ? loginUrl : null);

      if (!targetPollUrl) {
        return { success: true, status: 'pending' };
      }

      const clientDevId = getPersistentClientDeviceId();
      const standardUa = `Android-7.1.1-1.0.0-ONEPLUS A3010-136-${clientDevId} APP/xiaomi.smarthome APPV/62830`;

      let data: any = null;
      let clean = '';
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(targetPollUrl, {
          headers: {
            'User-Agent': standardUa,
            'Accept': 'application/json, text/plain, */*'
          },
          signal: controller.signal
        });
        clearTimeout(timeoutId);

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
        clean = raw.replace('&&&START&&&', '').trim();
        try {
          data = JSON.parse(clean);
          if (headerPassToken && !data.passToken) {
            data.passToken = headerPassToken;
          }
        } catch {}
      } catch (pollErr: any) {
        return { success: true, status: 'pending' };
      }

      if (!data) {
        return { success: true, status: 'pending' };
      }

      if (data.code === 0) {
        logDebug(`checkQrCodeStatus code 0 CONFIRMED! Raw payload`, data);
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
            `deviceId=${clientDevId}`,
            'sdkVersion=3.8.6',
            'uLocale=zh_CN'
          ].filter(Boolean).join('; ');
          const nonce = extractBigIntField(clean, 'nonce') || (data.nonce ? String(data.nonce) : '');
          const sts = await this.exchangeStsToken(data.location, cookieStr, ssecurity, nonce);
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
