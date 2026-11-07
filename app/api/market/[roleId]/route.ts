import { getRoleDemand, isKnownRole } from "@/lib/agents/market";
import type { ApiResult, RoleDemand } from "@/lib/types";

const fail = (status: number, code: string, message: string) => {
  const body: ApiResult<never> = { ok: false, error: { code, message } };
  return Response.json(body, { status });
};

export async function GET(req: Request, ctx: { params: Promise<{ roleId: string }> }) {
  const { roleId } = await ctx.params;
  if (!isKnownRole(roleId)) return fail(404, "not_found", `Unknown role: ${roleId}`);
  const params = new URL(req.url).searchParams;
  try {
    const data = await getRoleDemand(roleId, {
      location: params.get("location") ?? undefined,
      refresh: params.get("refresh") === "1",
    });
    const body: ApiResult<RoleDemand> = { ok: true, data };
    return Response.json(body);
  } catch {
    return fail(502, "market_failed", "We couldn't load job data right now.");
  }
}
