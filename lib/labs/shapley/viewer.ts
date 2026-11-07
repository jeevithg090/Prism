// Readiness Explained · who is asking, and whether they may write.
//
// Identity is the app's demo session: the `ks_uid` cookie, validated like a user id (the demo student when absent).
// The cookie isn't signed, so anyone can set it; reads follow the app-wide model (the persona switcher), but writes
// get two extra checks: the request must come from this origin (no cross-site form posts into a student's Coach
// memory), and outside DEMO_MODE only the demo student can write, so a hand-set cookie can't add notes for someone
// else. A signed session would replace both.
import { DEMO_UID, safeUserId, UID_COOKIE } from "@/lib/session-cookie";

export function viewerOf(req: Request): string {
  const m = (req.headers.get("cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${UID_COOKIE}=([^;]+)`));
  return safeUserId(m?.[1]) ?? DEMO_UID;
}

/** True when the Origin header is absent (same-origin fetches from older browsers, server calls) or names this host. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export type WriteCheck = { ok: true; userId: string } | { ok: false; status: 403; message: string };

/** Who a write acts for, or why it's refused. */
export function writerOf(req: Request): WriteCheck {
  if (!sameOrigin(req)) return { ok: false, status: 403, message: "Choices can only be saved from Keystone itself." };
  const userId = viewerOf(req);
  if (userId !== DEMO_UID && process.env.DEMO_MODE !== "true") {
    return { ok: false, status: 403, message: "Saving a next proof for another student needs a signed-in session. Switch back to your own profile." };
  }
  return { ok: true, userId };
}
