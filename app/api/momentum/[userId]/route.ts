// STUB (P5 PR1): GET /api/momentum/[userId] → Aisha's 6-week momentum fixture ([] for other users).
import momentumFixture from "@/data/fixtures/momentum.aisha.json";
import { MomentumWeekZ, UserIdParamZ, badRequest, internal, ok } from "@/lib/schemas/community";

export async function GET(_req: Request, ctx: { params: Promise<{ userId: string }> }) {
  try {
    const parsed = UserIdParamZ.safeParse(await ctx.params);
    if (!parsed.success) return badRequest(parsed.error);
    return ok(parsed.data.userId === "aisha" ? MomentumWeekZ.array().parse(momentumFixture) : []);
  } catch {
    return internal();
  }
}
