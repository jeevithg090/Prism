// P5 · POST /api/challenges/sample {challengeId} → {sampleAnswer}. The demo's "Use sample answer" button.
// Fetched only on request; a pass with it is labelled "(demo)" on the evidence, so it can't pose as your own work.
import { getSampleAnswer, NotFoundError } from "@/lib/agents/challenges";
import { ChallengeSampleReqZ } from "@/components/challenge/model";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return badRequest("Body must be JSON like {\"challengeId\":\"ch_docker_01\"}"); }
  const parsed = ChallengeSampleReqZ.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);
  try {
    return ok({ sampleAnswer: await getSampleAnswer(parsed.data.challengeId) });
  } catch (e) {
    if (e instanceof NotFoundError) return fail(404, "not_found", e.message);
    return internal();
  }
}
