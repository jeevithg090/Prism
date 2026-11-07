// Keystone Labs · Viva Check. POST /api/labs/viva/grade {userId, sessionId, answers:[{questionId, text, mode}]} → VivaSession
// with its result. A pass writes keystone-interview evidence (Proof Ladder rung 3); a weak or gamed answer flags a re-viva.
import { newRunId } from "@/lib/agents/events";
import { gradeViva } from "@/lib/labs/viva/agent";
import { actingAs, readBody, toResponse } from "@/lib/labs/viva/http";
import { GradeReqZ } from "@/lib/labs/viva/model";
import { badRequest, ok } from "@/lib/schemas/community";

export async function POST(req: Request) {
  const body = await readBody(req, GradeReqZ, `{"userId":"aisha","sessionId":"viva_…","answers":[{"questionId":"q1","text":"…"}]}`);
  if ("res" in body) return body.res;
  if (!body.data.answers.some((a) => a.text.trim())) return badRequest("answers: say or type at least one answer first");
  const denied = actingAs(req, body.data.userId);
  if (denied) return denied;
  try {
    return ok(await gradeViva({ ...body.data, runId: newRunId() }));
  } catch (e) {
    return toResponse(e);
  }
}
