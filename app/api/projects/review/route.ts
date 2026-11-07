// P5 · POST /api/projects/review {podId, prNumber?} → PRReview. "Review my PR now": the AI Tech Lead on demand.
import { newRunId } from "@/lib/agents/events";
import { NotFoundError } from "@/lib/agents/proof";
import { reviewNow } from "@/lib/agents/techlead";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";
import { ProjectReviewReqZ } from "@/lib/schemas/studio";
import { withReplayInfo } from "@/lib/replay";

async function handlePOST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Body must be JSON like {\"podId\":\"pod_demo01\"}");
  }
  const parsed = ProjectReviewReqZ.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);

  try {
    return ok(await reviewNow(parsed.data, newRunId()));
  } catch (e) {
    if (e instanceof NotFoundError) return fail(404, "not_found", e.message);
    return internal();
  }
}

/** Demo toggle: the envelope says whether its AI / connector values were replayed from a real run (lib/replay.ts). */
export const POST = withReplayInfo(handlePOST);
