// The demo session (contract §8): the current student's id lives in the `ks_uid` cookie.
// Isomorphic on purpose: proxy.ts, lib/session.ts (server) and the PersonaSwitcher (client) share it.
export const UID_COOKIE = "ks_uid";
export const DEMO_UID = "aisha";
export const UID_MAX_AGE_S = 60 * 60 * 24 * 7; // 7 days

const SAFE_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

/** A cookie value is only trusted as a user id if it looks like one (it ends up in file paths and URLs). */
export function safeUserId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let v = raw;
  try { v = decodeURIComponent(raw); } catch { return null; }
  return SAFE_ID.test(v) ? v : null;
}

/** The `document.cookie` assignment that signs in as `userId` for the demo. */
export function uidCookie(userId: string): string {
  return `${UID_COOKIE}=${encodeURIComponent(userId)}; path=/; max-age=${UID_MAX_AGE_S}; samesite=lax`;
}
