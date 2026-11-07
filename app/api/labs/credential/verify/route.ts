// POST /api/labs/credential/verify  { document } → VerificationReport. Public: an employer pastes a credential.
// The document is untrusted: size-capped in bytes before it is buffered, rate-limited per caller, zod-validated,
// its text scanned for AI instructions and its links filtered.
import { z } from "zod";
import { allowVerify, callerKey, readCappedText } from "@/lib/labs/credential/http";
import { verifyCredential } from "@/lib/labs/credential/service";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";

const MAX_BYTES = 200_000;
const VerifyReqZ = z.object({ document: z.unknown().refine((v) => v !== undefined && v !== null, "document is required") }).strict();

export async function POST(req: Request) {
  if (!allowVerify(callerKey(req))) return fail(429, "rate_limited", "Too many checks in a minute. Wait a moment and try again.");
  const body = await readCappedText(req, MAX_BYTES);
  if (!body.ok) {
    return body.reason === "too_large"
      ? fail(413, "too_large", `A credential is at most ${MAX_BYTES / 1000} kB.`)
      : badRequest("We couldn't read the request body.");
  }
  let json: unknown;
  try { json = JSON.parse(body.text); } catch { return badRequest("Send JSON like { \"document\": { …the credential… } }."); }
  const parsed = VerifyReqZ.safeParse(json);
  if (!parsed.success) return badRequest(parsed.error);
  let doc = parsed.data.document;
  if (typeof doc === "string") {
    try { doc = JSON.parse(doc); } catch { return badRequest("document: the pasted text isn't valid JSON."); }
  }
  try {
    return ok(await verifyCredential(doc));
  } catch {
    return internal();
  }
}
