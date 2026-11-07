import "server-only";
import { InterviewConfigQueryZ } from "@/lib/schemas/voice";
import { badRequest, fail, internal, ok } from "@/lib/voice/http";
import { buildInterviewConfig, InterviewNotFoundError } from "@/lib/voice/interviewConfig";


// The current user id lives in the `ks_uid` cookie (contract §8), so it's used when the query leaves userId out.
function cookieUserId(req: Request): string | undefined {
  const m = req.headers.get("cookie")?.match(/(?:^|;\s*)ks_uid=([^;]+)/);
  if (!m) return undefined;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return undefined;
  }
}

// GET /api/interview/config?userId=&roleId=&agent=interview|onboard
// -> { agentId, signedUrl?, dynamicVariables }. agentId "text-mode" means voice is unavailable and the page uses text mode.
export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams;
    const parsed = InterviewConfigQueryZ.safeParse({
      userId: q.get("userId") || cookieUserId(req),
      roleId: q.get("roleId") || undefined,
      agent: q.get("agent") || undefined,
    });
    if (!parsed.success) return badRequest("Expected ?userId=…&roleId=…&agent=interview|onboard");

    return ok(await buildInterviewConfig(parsed.data));
  } catch (e) {
    if (e instanceof InterviewNotFoundError) return fail("not_found", "We couldn't find that student.", 404);
    return internal();
  }
}
