// P5 · POST /api/challenges/generate {userId, skillId} → PublicChallenge (no grading rules, no sample answer).
import { generateChallenge, NotFoundError } from "@/lib/agents/challenges";
import { newRunId } from "@/lib/agents/events";
import { ChallengeGenerateReqZ } from "@/components/challenge/model";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return badRequest("Body must be JSON like {\"userId\":\"aisha\",\"skillId\":\"docker\"}"); }
  const parsed = ChallengeGenerateReqZ.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);
  try {
    return ok(await generateChallenge(parsed.data.userId, parsed.data.skillId, newRunId()));
  } catch (e) {
    if (e instanceof NotFoundError) return fail(404, "not_found", e.message);
    return internal();
  }
}
