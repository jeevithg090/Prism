// GET /api/badges/[userId] → BadgeId[]
import { loadBadges } from "@/lib/community/badges";
import { badRequest, fail, internal, ok, UserIdParamZ } from "@/lib/schemas/community";

export async function GET(_req: Request, ctx: { params: Promise<{ userId: string }> }) {
  try {
    const params = UserIdParamZ.safeParse(await ctx.params);
    if (!params.success) return badRequest(params.error);
    const { userId } = params.data;

    const badges = await loadBadges(userId);
    if (!badges) return fail(404, "not_found", `We couldn't find a profile for "${userId}".`);
    return ok(badges);
  } catch {
    return internal();
  }
}
