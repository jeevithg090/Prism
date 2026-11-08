// P4 · GET /api/briefing/[userId] → Briefing. n8n W2 calls it with x-keystone-secret; in the app it also
// answers in DEMO_MODE or to the signed-in user themselves (same ks_uid cookie).
import { buildBriefing } from "@/lib/briefing";
import { verifySecret } from "@/lib/n8n";
import { badRequest, fail, internal, ok, UserIdParamZ } from "@/lib/schemas/community";
import { readJSON } from "@/lib/voice/data";
import { BriefingZ } from "@/lib/voice/schemas";
import { withReplayInfo } from "@/lib/replay";

function cookieUser(req: Request): string | null {
  const m = (req.headers.get("cookie") ?? "").match(/(?:^|;\s*)ks_uid=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function handleGET(req: Request, ctx: { params: Promise<{ userId: string }> }) {
  const params = UserIdParamZ.safeParse(await ctx.params);
  if (!params.success) return badRequest(params.error);
  const { userId } = params.data;
  const allowed = verifySecret(req) || process.env.DEMO_MODE === "true" || cookieUser(req) === userId;
  if (!allowed) return fail(401, "unauthorized", "Send x-keystone-secret, or sign in as this user.");
  try {
    return ok(await buildBriefing(userId));
  } catch {
    const fx = BriefingZ.safeParse(readJSON(`data/fixtures/briefing.${userId}.json`));
    return fx.success ? ok(fx.data) : internal();
  }
}

/** Demo toggle: the envelope says whether its AI / connector values were replayed from a real run (lib/replay.ts). */
export const GET = withReplayInfo(handleGET);
