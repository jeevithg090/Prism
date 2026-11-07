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
