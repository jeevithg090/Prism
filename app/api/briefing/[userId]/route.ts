import { z } from "zod";
import { BriefingUnavailable, getBriefing, isOwnUserRequest } from "@/lib/briefing";
import { verifySecret } from "@/lib/n8n";
import { badRequest, fail, internal, ok, unauthorized } from "@/lib/voice/http";


const ParamsZ = z.object({ userId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) });

// GET /api/briefing/[userId] → ApiResult<Briefing>.
// Allowed for n8n (x-keystone-secret) or for the signed-in browser user asking for their own briefing (ks_uid cookie, same origin).
// `?refresh=1` rebuilds this week's briefing instead of returning the stored one; only n8n (the secret) may ask, since it spends LLM credits.
export async function GET(req: Request, ctx: { params: Promise<{ userId: string }> }): Promise<Response> {
  try {
    const parsed = ParamsZ.safeParse(await ctx.params);
    if (!parsed.success) return badRequest("Invalid user id");
    const { userId } = parsed.data;
    const trusted = verifySecret(req);
    if (!trusted && !isOwnUserRequest(req, userId)) return unauthorized();

    const refresh = trusted && new URL(req.url).searchParams.get("refresh") === "1";
    return ok(await getBriefing(userId, { refresh }));
  } catch (e) {
    if (e instanceof BriefingUnavailable) return fail("not_found", "No briefing yet. Your first one arrives Monday.", 404);
    console.error("[briefing] failed", e);
    return internal();
  }
}
