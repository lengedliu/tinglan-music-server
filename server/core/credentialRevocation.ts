/**
 * [Fix A2] JWT revocation on password change.
 *
 * JWTs were previously valid for their full 30-day lifetime regardless of
 * password changes — a stolen token stayed usable even after the user re-secured
 * the account. This registry records the last password-change timestamp per user
 * (hydrated from users.json on boot, updated on every password write), and the
 * auth middleware rejects any token whose `iat` predates that timestamp.
 *
 * Storage is in-memory by design: single-process server, cheap lookups, and the
 * durable source of truth is the `passwordChangedAt` field persisted in users.json.
 */

const passwordChangedAtByUser = new Map<string, number>();

export function setPasswordChangedAt(userId: string, tsMs: number = Date.now()): void {
  const id = String(userId || '').trim();
  if (!id) return;
  const ts = Number(tsMs) || Date.now();
  passwordChangedAtByUser.set(id, ts);
}

export function getPasswordChangedAt(userId: string): number {
  return passwordChangedAtByUser.get(String(userId || '').trim()) || 0;
}

/** True when the token was issued (iat, seconds) BEFORE the user's last password change. */
export function isTokenRevokedByPasswordChange(userId: string, iatSec?: number): boolean {
  if (!userId || typeof iatSec !== 'number' || !Number.isFinite(iatSec)) return false;
  const changedAt = getPasswordChangedAt(userId);
  return changedAt > 0 && iatSec * 1000 < changedAt;
}

/** Restore the in-memory registry from the persisted users array on boot. */
export function hydratePasswordChangedAt(users: any[]): void {
  for (const u of Array.isArray(users) ? users : []) {
    if (u?.id && u?.passwordChangedAt) {
      const ts = Number(u.passwordChangedAt);
      if (Number.isFinite(ts) && ts > 0) passwordChangedAtByUser.set(String(u.id), ts);
    }
  }
}
