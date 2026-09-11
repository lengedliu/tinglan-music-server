import crypto from 'crypto';
import QRCode from 'qrcode';
import fs from 'fs';

function logDebug(message: string, data?: any) {
  const timestamp = new Date().toISOString();
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
  ): Promise<{ serviceToken?: string; cookies?: string; rawLocation?: string }> {
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

        const cleanCookieHeader = Array.from(cookieKvMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');

        const res = await fetch(currentUrl, {
          headers: {
            // 修复：这里此前用的是 webUserAgent（桌面浏览器 UA）。
            // api2.mina.mi.com 是小爱音箱 App 后端专用域名，不是给浏览器访问的
            // 网页，用浏览器 UA 请求会被直接拒绝（这正是你日志里看到的
            // "status: 401, setCookie: '', location: null" ——服务器根本没有
            // 走到"下发 serviceToken"这一步，第一步就把请求当成非法客户端拒了）。
            // 密码登录那条路径里，凡是打到 App 域名的请求都用的是 this.userAgent
            // （真实小米账App UA），这里改成保持一致。
            'User-Agent': this.userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
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
          url: currentUrl,
          status: res.status,
          cookies: updatedCookieHeader,
          location: res.headers.get('location')
        });

        // Check if serviceToken is in Cookie map
        if (cookieKvMap.has('serviceToken') && cookieKvMap.get('serviceToken')) {
          const st = cookieKvMap.get('serviceToken')!;
          logDebug(`exchangeStsToken success at hop ${hops}:`, st);
          return { serviceToken: st, cookies: updatedCookieHeader };
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
              return { serviceToken: st, cookies: Array.from(cookieKvMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ') };
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
            return { serviceToken: bodyMatch[1], cookies: Array.from(cookieKvMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ') };
          }
          break;
        }
      }

      const finalCookieHeader = Array.from(cookieKvMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
      logDebug(`exchangeStsToken finished with NO serviceToken found after ${hops} hops`);
      return { cookies: finalCookieHeader };
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
          const loginUrl = `${host}/pass/serviceLogin?sid=${encodeURIComponent(targetSid)}&_json=true`;
          const baseCookies = [
            `userId=${cleanUid}`,
            cUserId ? `cUserId=${cUserId}` : '',
            `passToken=${cleanPassToken}`,
            'uLocale=zh_CN',
            'sdkVersion=3.9'
          ].filter(Boolean).join('; ');

          const res = await fetch(loginUrl, {
            method: 'GET',
            headers: {
              'User-Agent': this.userAgent,
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
            }
          }

          if (json.code === 0 && json.serviceToken) {
            return {
              serviceToken: json.serviceToken,
              ssecurity: json.ssecurity,
              userId: returnedUserId
            };
          }

          lastErr = json.desc || json.message || `认证流程未完成 (code: ${json.code})`;
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
    sid = 'xiaomiio',
    region = 'cn'
  ): Promise<QrCodeResult & { qrCodeUrl?: string; qrDataUrl?: string; qr?: string }> {
    try {
      // For China Mainland, use cn.account.xiaomi.com to ensure dc=ak (China mainland datacenter),
      // which is required for Mi Home (米家 App) and domestic Xiaomi account authorization.
      const host = region === 'cn' ? 'cn.account.xiaomi.com' : 'account.xiaomi.com';
      const cleanSid = sid === 'mijia' ? 'xiaomiio' : (sid || 'xiaomiio');
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

        const raw = await res.text();
        const clean = raw.replace('&&&START&&&', '');
        try {
          data = JSON.parse(clean);
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
        const passToken = data.passToken;
        let serviceToken = data.serviceToken || data.service_token || data.stsToken || data.micoToken || '';

        if (data.location) {
          const cookieStr = [
            `userId=${userId}`,
            data.cUserId ? `cUserId=${data.cUserId}` : '',
            passToken ? `passToken=${passToken}` : '',
            'uLocale=zh_CN'
          ].filter(Boolean).join('; ');
          const sts = await this.exchangeStsToken(data.location, cookieStr, ssecurity);
          if (sts.serviceToken) serviceToken = sts.serviceToken;
        }

        const result: QrCodeStatusResult = {
          success: true,
          status: 'confirmed',
          userId,
          serviceToken,
          ssecurity,
          passToken
        };
        logDebug(`checkQrCodeStatus return result`, result);
        return result;
      } else if (data.code === 70014) {
        return { success: true, status: 'pending' };
      } else if (data.code === 70013) {
        return { success: true, status: 'scanned' };
      } else if (data.code === 70015 || data.code === 70016) {
        // Explicit expiry from long-polling endpoint
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
