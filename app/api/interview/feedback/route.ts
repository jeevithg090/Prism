// P4 · POST /api/interview/feedback {userId, roleId, transcript, durationSec, skillId?} → InterviewResult
// (InterviewFeedback + the proof it saved). Saves to `interviews` (🎤 Interview-ready badge), a mock-interview
// momentum event, and keystone-interview evidence: Communication + the skill of the PR you explained.
import { isRole } from "@/lib/agents/market";
import { getProfile } from "@/lib/graph/data";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";
import { interviewContext } from "@/lib/voice/context";
import { scoreInterview } from "@/lib/voice/interviewScoring";
import { FeedbackReqZ } from "@/lib/voice/schemas";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Body must be JSON like {\"userId\":\"aisha\",\"roleId\":\"ml-engineer\",\"transcript\":\"user: …\",\"durationSec\":120}");
  }
  const parsed = FeedbackReqZ.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);
  try {
    const { userId, roleId, transcript, durationSec, skillId } = parsed.data;
    if (!isRole(roleId)) return fail(404, "not_found", `We don't track "${roleId}" yet. Try ml-engineer, software-engineer or data-analyst.`);
    if (!(await getProfile(userId))) return fail(404, "not_found", `No profile ${userId}. Finish onboarding first.`);
    const ctx = await interviewContext(userId, roleId);
    const discussed = skillId ?? ctx.work.skillId;
    return ok(await scoreInterview({
      userId, roleId, roleName: ctx.roleName, transcript, durationSec, skillId: discussed,
      prTitle: discussed === ctx.work.skillId ? ctx.work.issueTitle : undefined, roleKeywords: ctx.roleKeywords,
    }));
  } catch {
    return internal();
  }
}
