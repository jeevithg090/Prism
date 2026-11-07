// GET /api/momentum/[userId] → MomentumWeek[] (6 weeks, latest last)
// GET /api/momentum/[userId]?view=events → MomentumEvent[] (verified events for the Build Log, newest first)
import { z } from "zod";
import { badRequest, internal, ok, UserIdParamZ } from "@/lib/schemas/community";
import { loadBuildLog, loadMomentumWeeks } from "@/components/momentum/server";

const ViewZ = z.enum(["weeks", "events"]).default("weeks");

export async function GET(req: Request, ctx: { params: Promise<{ userId: string }> }) {
  try {
    const params = UserIdParamZ.safeParse(await ctx.params);
    if (!params.success) return badRequest(params.error);
    const view = ViewZ.safeParse(new URL(req.url).searchParams.get("view") ?? undefined);
    if (!view.success) return badRequest("view must be \"weeks\" or \"events\"");

    const { userId } = params.data;
    return ok(view.data === "events" ? await loadBuildLog(userId) : await loadMomentumWeeks(userId));
  } catch {
    return internal();
  }
}
