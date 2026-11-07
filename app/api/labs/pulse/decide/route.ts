// POST /api/labs/pulse/decide { sessionId, minute, criterionId, kind, decision, note? } → { intervention, explainer, runId }
// The human checkpoint: the lecturer runs or skips the suggested intervention. Nothing is sent to anyone;
// the explainer is for the lecturer to say out loud, and it never contains the challenge's answer.
import { decideIntervention, PulseNotFoundError } from "@/lib/labs/pulse/agent";
import { DecideReqZ } from "@/lib/labs/pulse/model";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Send a JSON body.");
  }
  const parsed = DecideReqZ.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);
  try {
    return ok(await decideIntervention(parsed.data));
  } catch (e) {
    if (e instanceof PulseNotFoundError) return fail(404, "not_found", e.message);
    return internal();
  }
}
