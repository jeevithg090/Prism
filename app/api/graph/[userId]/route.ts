// GET /api/graph/[userId]?roleId= → BridgeMap (contract §6). roleId defaults to the profile's first target role.
import { loadGraph } from "@/lib/graph/build";
import { getProfile } from "@/lib/graph/data";
import { GraphQueryZ, UserParamZ } from "@/lib/graph/schemas";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";

export async function GET(req: Request, ctx: { params: Promise<{ userId: string }> }) {
  try {
    const params = UserParamZ.safeParse(await ctx.params);
    if (!params.success) return badRequest(params.error);
    const query = GraphQueryZ.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!query.success) return badRequest(query.error);
    const { userId } = params.data;
    const profile = await getProfile(userId);
    const roleId = query.data.roleId ?? profile?.dna?.targetRoles?.[0] ?? "ml-engineer";
    const map = await loadGraph(userId, roleId);
    if (!map) return fail(404, "not_found", "No Bridge Map yet. Finish onboarding to build it.");
    return ok(map);
  } catch {
    return internal();
  }
}
