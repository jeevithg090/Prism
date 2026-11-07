// Keystone Labs · Viva Check. POST /api/labs/viva/review {reviewerId, sessionId, decision:"cleared"|"keep", note?}
// The human checkpoint: only the PR's pod reviewer can clear a re-viva, after asking the student in person.
import { newRunId } from "@/lib/agents/events";
import { reviewViva } from "@/lib/labs/viva/agent";
import { actingAs, readBody, toResponse } from "@/lib/labs/viva/http";
import { ReviewReqZ } from "@/lib/labs/viva/model";
import { ok } from "@/lib/schemas/community";

export async function POST(req: Request) {
  const body = await readBody(req, ReviewReqZ, `{"reviewerId":"priya","sessionId":"viva_…","decision":"cleared"}`);
  if ("res" in body) return body.res;
  const denied = actingAs(req, body.data.reviewerId);
  if (denied) return denied;
  try {
    return ok(await reviewViva({ ...body.data, runId: newRunId() }));
  } catch (e) {
    return toResponse(e);
  }
}
