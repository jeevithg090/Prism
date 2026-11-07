// Client-side current user id: the `ks_uid` cookie (contract §8, lib/session.ts), defaulting to the demo user.
export function getClientUserId(): string {
  if (typeof document === "undefined") return "aisha";
  const m = document.cookie.match(/(?:^|;\s*)ks_uid=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "aisha";
}
