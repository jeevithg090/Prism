// GET /api/market/[roleId]?location=uk&refresh=1&demo=1&runId= → RoleDemand (contract §6).
// Live from Adzuna/Reed when keys exist; otherwise (and in DEMO_MODE) the cached snapshot, marked source:"cache".
import { getRoleDemand, isRole } from "@/lib/agents/market";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";
import { MarketQueryZ, RoleParamZ } from "@/lib/schemas/data";
import { withReplayInfo } from "@/lib/replay";

async function handleGET(req: Request, ctx: { params: Promise<{ roleId: string }> }) {
  try {
    const params = RoleParamZ.safeParse(await ctx.params);
    if (!params.success) return badRequest(params.error);
    const query = MarketQueryZ.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!query.success) return badRequest(query.error);
    const { roleId } = params.data;
    if (!isRole(roleId)) return fail(404, "not_found", `We don't track "${roleId}" yet. Try ml-engineer, software-engineer or data-analyst.`);
    const { location, refresh, runId } = query.data;
    const demo = process.env.DEMO_MODE === "true" || query.data.demo;
    return ok(await getRoleDemand(roleId, { location, refresh, runId, demo }));
  } catch {
    return internal();
  }
}

/** Demo toggle: the envelope says whether its AI / connector values were replayed from a real run (lib/replay.ts). */
export const GET = withReplayInfo(handleGET);
