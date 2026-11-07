import { newRunId } from "@/lib/agents/events";
import { matchPod, NotFoundError } from "@/lib/agents/matchmaker";
import { badRequest, fail, internal, ok, PodMatchReqZ } from "@/lib/schemas/community";

// POST /api/pods/match {userId} → Pod (+ runId for useActivity().start). Contract §6.
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Request body must be JSON like {\"userId\":\"aisha\"}.");
  }
  const parsed = PodMatchReqZ.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);
  try {
    const runId = newRunId();
    const pod = await matchPod({ userId: parsed.data.userId, runId });
    return ok({ ...pod, runId });
  } catch (e) {
    if (e instanceof NotFoundError) return fail(404, "not_found", `We couldn't find a profile for "${parsed.data.userId}".`);
    return internal();
  }
}
