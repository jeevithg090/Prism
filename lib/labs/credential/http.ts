// Keystone Labs · Verifiable Skill Credential: shared helpers for the API routes.
import { DEMO_UID, UID_COOKIE, safeUserId } from "@/lib/session-cookie";
import { fail, internal } from "@/lib/schemas/community";
import { CredentialError } from "./service";

/** The demo session's student id from the `ks_uid` cookie, sanitised (the demo persona when absent). */
export function viewerId(req: Request): string {
  const m = (req.headers.get("cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${UID_COOKIE}=([^;]+)`));
  return safeUserId(m?.[1]) ?? DEMO_UID;
}

/** CredentialError → a helpful envelope; anything else → a generic 500 (no internals leak). */
export function credentialFailure(e: unknown): Response {
  if (e instanceof CredentialError) {
    const status = e.code === "not_found" ? 404 : e.code === "forbidden" ? 403 : e.code === "no_proofs" ? 409 : 400;
    return fail(status, e.code, e.message);
  }
  return internal();
}

/**
 * Reads a request body as UTF-8 text without ever buffering more than `maxBytes`: a declared Content-Length
 * over the cap is refused before reading, and a chunked body is cut off as soon as it passes the cap.
 */
export async function readCappedText(req: Request, maxBytes: number): Promise<{ ok: true; text: string } | { ok: false; reason: "too_large" | "unreadable" }> {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: "too_large" };
  if (!req.body) return { ok: true, text: "" };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  return { ok: true, text: Buffer.concat(chunks).toString("utf8") };
}

/**
 * A small fixed-window limit per caller for the public verifier, so anonymous traffic can't flood the
 * agent_runs ledger and the Activity feed. Generous enough for a live demo (the tamper buttons included).
 */
const WINDOW_MS = 60_000;
export const VERIFY_LIMIT = 60;
const windows = new Map<string, { start: number; count: number }>();

export function callerKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (fwd || req.headers.get("x-real-ip") || "local").slice(0, 64);
}

export function allowVerify(key: string, now = Date.now()): boolean {
  const w = windows.get(key);
  if (!w || now - w.start >= WINDOW_MS) {
    if (windows.size > 5000) windows.clear(); // bounded memory
    windows.set(key, { start: now, count: 1 });
    return true;
  }
  w.count += 1;
  return w.count <= VERIFY_LIMIT;
}

/** Forget every window (tests). */
export function resetVerifyLimits(): void {
  windows.clear();
}
