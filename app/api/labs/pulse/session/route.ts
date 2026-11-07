// POST /api/labs/pulse/session { challengeId?, programmeId?, source? } → { session, snapshot, runId }
// Opens a Live Lab Pulse session for a micro-challenge. DEMO_MODE defaults to the simulated seeded cohort.
import { PulseNotFoundError, startPulseSession } from "@/lib/labs/pulse/agent";
import { SessionCreateReqZ } from "@/lib/labs/pulse/model";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = SessionCreateReqZ.safeParse(body ?? {});
  if (!parsed.success) return badRequest(parsed.error);
  try {
    return ok(await startPulseSession(parsed.data), 201);
  } catch (e) {
    if (e instanceof PulseNotFoundError) return fail(404, "not_found", e.message);
    return internal();
  }
}
