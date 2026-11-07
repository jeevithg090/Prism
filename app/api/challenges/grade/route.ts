// P5 · POST /api/challenges/grade {userId, challengeId, submission} → GradeResult. Rubric ✓/○ with Socratic hints;
// on a pass it writes `micro-challenge` evidence (rung 1 · Tried it).
import { gradeChallenge, NotFoundError, UngradableError } from "@/lib/agents/challenges";
import { newRunId } from "@/lib/agents/events";
import { ChallengeGradeReqZ } from "@/components/challenge/model";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return badRequest("Body must be JSON like {\"userId\":\"aisha\",\"challengeId\":\"ch_docker_01\",\"submission\":\"FROM …\"}"); }
  const parsed = ChallengeGradeReqZ.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);
  if (!parsed.data.submission.trim()) return badRequest("submission: write something in the editor first");
  try {
    return ok(await gradeChallenge({ ...parsed.data, runId: newRunId() }));
  } catch (e) {
    if (e instanceof NotFoundError) return fail(404, "not_found", e.message);
    if (e instanceof UngradableError) return fail(503, "ungradable", e.message);
    return internal();
  }
}
