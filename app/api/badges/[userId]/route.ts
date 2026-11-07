// STUB (P5 PR1): GET /api/badges/[userId] → the profile's badges. Replaced by computeBadges (PR5).
import { getStore } from "@/lib/store";
import { UserIdParamZ, badRequest, fail, internal, ok } from "@/lib/schemas/community";
import type { Profile } from "@/lib/types";

export async function GET(_req: Request, ctx: { params: Promise<{ userId: string }> }) {
  try {
    const parsed = UserIdParamZ.safeParse(await ctx.params);
    if (!parsed.success) return badRequest(parsed.error);
    const profile = await getStore().get<Profile>("profiles", parsed.data.userId);
    if (!profile) return fail(404, "not_found", `No profile for ${parsed.data.userId}`);
    return ok(profile.badges);
  } catch {
    return internal();
  }
}
