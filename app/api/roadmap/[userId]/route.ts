// GET /api/roadmap/[userId] → Roadmap (the stored plan, or the user's demo fixture), 404 if none.
import { loadRoadmap } from "@/lib/agents/roadmap";
import { getProfile } from "@/lib/graph/data";
import { UserParamZ } from "@/lib/graph/schemas";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";

export async function GET(_req: Request, ctx: { params: Promise<{ userId: string }> }) {
  try {
    const params = UserParamZ.safeParse(await ctx.params);
    if (!params.success) return badRequest(params.error);
    const { userId } = params.data;
    const profile = await getProfile(userId);
    const roadmap = await loadRoadmap(userId, profile?.dna?.targetRoles?.[0]);
    if (!roadmap) return fail(404, "not_found", "No roadmap yet. Build one from your Bridge Map.");
    return ok(roadmap);
  } catch {
    return internal();
  }
}
