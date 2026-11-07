// GET /api/badges/[userId] → BadgeId[]
import { getStore } from "@/lib/store";
import { badgeContext, computeBadges } from "@/lib/badges";
import { badRequest, fail, internal, ok, UserIdParamZ } from "@/lib/schemas/community";
import type { HelpRequest, InterviewFeedback, Pod, Profile } from "@/lib/types";

export async function GET(_req: Request, ctx: { params: Promise<{ userId: string }> }) {
  try {
    const params = UserIdParamZ.safeParse(await ctx.params);
    if (!params.success) return badRequest(params.error);
    const { userId } = params.data;

    const store = getStore();
    const profile = await store.get<Profile>("profiles", userId);
    if (!profile) return fail(404, "not_found", `We couldn't find a profile for "${userId}".`);

    const [help, pods, interviews] = await Promise.all([
      store.list<HelpRequest>("help"),
      store.list<Pod>("pods"),
      store.list<InterviewFeedback>("interviews", { userId }),
    ]);
    return ok(computeBadges(profile, badgeContext(userId, { help, pods, interviews })));
  } catch {
    return internal();
  }
}
