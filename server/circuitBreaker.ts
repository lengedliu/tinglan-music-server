/**
 * Xiaomi API Rate Limiter & Circuit Breaker with Geetest / Slider Challenge Interception
 *
 * Prevents account risk-control lockdowns, 429 Too Many Requests, and repeated unresolvable
 * requests when Geetest slide captchas are triggered.
 */

export interface CircuitBreakerStatus {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failuresCount: number;
  lastFailureTime: number | null;
  lastError: string | null;
  cooldownRemainingSec: number;
  rateLimitHits: number;
  geetestChallengeDetected: boolean;
  geetestChallengeUrl?: string;
}

export class XiaomiCircuitBreaker {
  private static instance: XiaomiCircuitBreaker;

  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failureThreshold = 3;
  private consecutiveFailures = 0;
  private lastFailureTime: number | null = null;
  private cooldownMs = 45000; // 45s cooldown on trip
  private halfOpenTrialInProgress = false;

  // Rate Limiting (Token Bucket / Sliding Window)
  private maxRequestsPerMinute = 35; // Safe threshold for Mina cloud
  private requestTimestamps: number[] = [];

  // Geetest slider challenge tracking
  private geetestChallengeDetected = false;
  private geetestChallengeUrl = '';
  private geetestCooldownMs = 90000; // 90s cooldown if slider detected

  // Event listeners
  private tripListeners: Array<(reason: string, status: CircuitBreakerStatus) => void> = [];

  public static getInstance(): XiaomiCircuitBreaker {
    if (!XiaomiCircuitBreaker.instance) {
      XiaomiCircuitBreaker.instance = new XiaomiCircuitBreaker();
    }
    return XiaomiCircuitBreaker.instance;
  }

  public onTrip(listener: (reason: string, status: CircuitBreakerStatus) => void): void {
    this.tripListeners.push(listener);
  }

  /**
   * Check if a new outbound Xiaomi API request can be executed right now.
   * Returns { allowed: true } or { allowed: false, reason, cooldownRemainingSec }
   */
  public canRequest(endpointName: string = 'general'): { allowed: boolean; reason?: string; cooldownRemainingSec?: number } {
    const now = Date.now();

    // 1. Clean sliding window
    this.requestTimestamps = this.requestTimestamps.filter(ts => now - ts < 60000);

    // 2. Check circuit state
    if (this.state === 'OPEN') {
      const activeCooldown = this.geetestChallengeDetected ? this.geetestCooldownMs : this.cooldownMs;
      const elapsed = this.lastFailureTime ? now - this.lastFailureTime : activeCooldown;

      if (elapsed < activeCooldown) {
        const remainingSec = Math.ceil((activeCooldown - elapsed) / 1000);
        return {
          allowed: false,
          reason: this.geetestChallengeDetected
            ? `小米安全风控检测到滑块验证码挑战，熔断器冷却中（还需 ${remainingSec} 秒）。建议使用【扫码登录】。`
            : `小米服务频控或连续鉴权异常，熔断器冷却保护中（还需 ${remainingSec} 秒）`,
          cooldownRemainingSec: remainingSec
        };
      } else {
        // Cooldown expired, transition to HALF_OPEN
        this.state = 'HALF_OPEN';
        this.halfOpenTrialInProgress = false;
        console.log('[CircuitBreaker] 🟡 熔断器进入半开模式 (HALF_OPEN)，准备发送单次探测请求...');
      }
    }

    if (this.state === 'HALF_OPEN') {
      if (this.halfOpenTrialInProgress) {
        return {
          allowed: false,
          reason: '半开探测请求正在执行中，请稍候...',
          cooldownRemainingSec: 5
        };
      }
      this.halfOpenTrialInProgress = true;
      return { allowed: true };
    }

    // 3. Check rate limit
    if (this.requestTimestamps.length >= this.maxRequestsPerMinute) {
      const oldestTs = this.requestTimestamps[0];
      const waitSec = Math.ceil((60000 - (now - oldestTs)) / 1000);
      return {
        allowed: false,
        reason: `请求频次已达安全上限 (${this.requestTimestamps.length}/${this.maxRequestsPerMinute}次/分)，自动平滑限流，请等待 ${waitSec} 秒`,
        cooldownRemainingSec: Math.max(1, waitSec)
      };
    }

    this.requestTimestamps.push(now);
    return { allowed: true };
  }

  /**
   * Record a successful request
   */
  public recordSuccess(): void {
    if (this.state === 'HALF_OPEN' || this.consecutiveFailures > 0) {
      console.log('[CircuitBreaker] 🟢 小米接口通信恢复正常，熔断器重置为 CLOSED');
    }
    this.state = 'CLOSED';
    this.consecutiveFailures = 0;
    this.halfOpenTrialInProgress = false;
    this.geetestChallengeDetected = false;
    this.geetestChallengeUrl = '';
  }

  /**
   * Record a failed request or analyze response payload for risk-control signals
   */
  public recordFailure(error: any, responseStatus?: number, responseBody?: any): void {
    const now = Date.now();
    this.lastFailureTime = now;
    this.consecutiveFailures++;

    const errStr = String(error?.message || error || '');
    let bodyStr = '';
    try {
      bodyStr = typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody || '');
    } catch {}

    // Check for Geetest / Captcha challenge indicators
    const isGeetest =
      responseStatus === 403 ||
      errStr.includes('70016') ||
      errStr.includes('87001') ||
      errStr.includes('geetest') ||
      errStr.includes('captcha') ||
      bodyStr.includes('captchaUrl') ||
      bodyStr.includes('geetest') ||
      bodyStr.includes('70016');

    // Check for 429 Too Many Requests
    const is429 = responseStatus === 429 || errStr.includes('429') || errStr.includes('Too Many Requests');

    // Check for 401 Unauthorized
    const is401 = responseStatus === 401 || errStr.includes('401') || errStr.includes('Unauthorized');

    if (isGeetest) {
      this.geetestChallengeDetected = true;
      const match = bodyStr.match(/https?:\/\/[^\s"']+(?:captcha|geetest)[^\s"']*/i);
      if (match) this.geetestChallengeUrl = match[0];
      this.trip('小米账号触发滑块验证码 (Geetest/Captcha Challenge)');
      return;
    }

    if (is429) {
      this.trip('小米接口触发 429 Too Many Requests 频控限制');
      return;
    }

    if (this.state === 'HALF_OPEN') {
      this.trip('半开探测请求失败，维持熔断');
      return;
    }

    if (this.consecutiveFailures >= this.failureThreshold) {
      this.trip(`连续 ${this.consecutiveFailures} 次请求失败: ${errStr || `HTTP ${responseStatus}`}`);
    }
  }

  /**
   * Trip the breaker into OPEN state
   */
  public trip(reason: string): void {
    this.state = 'OPEN';
    this.lastFailureTime = Date.now();
    this.halfOpenTrialInProgress = false;

    const status = this.getStatus();
    console.warn(`[CircuitBreaker] 🔴 触发安全熔断保护: ${reason} (冷却 ${status.cooldownRemainingSec} 秒)`);

    for (const listener of this.tripListeners) {
      try {
        listener(reason, status);
      } catch {}
    }
  }

  /**
   * Reset breaker manually (e.g. after user re-logins with QR code)
   */
  public reset(): void {
    this.state = 'CLOSED';
    this.consecutiveFailures = 0;
    this.lastFailureTime = null;
    this.geetestChallengeDetected = false;
    this.geetestChallengeUrl = '';
    this.halfOpenTrialInProgress = false;
    this.requestTimestamps = [];
    console.log('[CircuitBreaker] 🔄 熔断器已手动重置');
  }

  /**
   * Get current diagnostic status
   */
  public getStatus(): CircuitBreakerStatus {
    const now = Date.now();
    let cooldownRemainingSec = 0;

    if (this.state === 'OPEN' && this.lastFailureTime) {
      const activeCooldown = this.geetestChallengeDetected ? this.geetestCooldownMs : this.cooldownMs;
      const elapsed = now - this.lastFailureTime;
      if (elapsed < activeCooldown) {
        cooldownRemainingSec = Math.ceil((activeCooldown - elapsed) / 1000);
      }
    }

    return {
      state: this.state,
      failuresCount: this.consecutiveFailures,
      lastFailureTime: this.lastFailureTime,
      lastError: this.geetestChallengeDetected ? 'Geetest/Captcha Challenge' : null,
      cooldownRemainingSec,
      rateLimitHits: this.requestTimestamps.length,
      geetestChallengeDetected: this.geetestChallengeDetected,
      geetestChallengeUrl: this.geetestChallengeUrl || undefined
    };
  }
}

export const xiaomiCircuitBreaker = XiaomiCircuitBreaker.getInstance();
