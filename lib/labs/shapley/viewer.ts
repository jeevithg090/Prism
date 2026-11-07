// Readiness Explained · who is asking: the `ks_uid` cookie, validated like a user id (the demo student when absent).
import { DEMO_UID, safeUserId, UID_COOKIE } from "@/lib/session-cookie";

export function viewerOf(req: Request): string {
  const m = (req.headers.get("cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${UID_COOKIE}=([^;]+)`));
  return safeUserId(m?.[1]) ?? DEMO_UID;
}
