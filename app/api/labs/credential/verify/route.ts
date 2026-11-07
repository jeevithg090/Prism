// POST /api/labs/credential/verify  { document } → VerificationReport. Public: an employer pastes a credential.
// The document is untrusted: size-capped, zod-validated, its text scanned for AI instructions, its links filtered.
import { z } from "zod";
import { verifyCredential } from "@/lib/labs/credential/service";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";

const MAX_BYTES = 200_000;
const VerifyReqZ = z.object({ document: z.unknown().refine((v) => v !== undefined && v !== null, "document is required") }).strict();

export async function POST(req: Request) {
  const text = await req.text().catch(() => "");
  if (text.length > MAX_BYTES) return fail(413, "too_large", `A credential is at most ${MAX_BYTES / 1000} kB.`);
  let body: unknown;
  try { body = JSON.parse(text); } catch { return badRequest("Send JSON like { \"document\": { …the credential… } }."); }
  const parsed = VerifyReqZ.safeParse(body);
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
