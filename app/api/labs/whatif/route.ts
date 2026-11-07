// GET /api/labs/whatif?userId=aisha → the What-if Simulator's starting point: readiness, the roadmap's focus
// skills (with demand, trend, effort and prerequisites), the two default plans and the stated assumptions.
import { contextView, loadWhatIfWorld } from "@/lib/labs/whatif/agent";
import { ContextQueryZ } from "@/lib/labs/whatif/schemas";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";

export async function GET(req: Request) {
  try {
    const parsed = ContextQueryZ.safeParse({ userId: new URL(req.url).searchParams.get("userId") ?? "" });
    if (!parsed.success) return badRequest(parsed.error);
    const world = await loadWhatIfWorld(parsed.data.userId);
    if (!world) return fail(404, "not_found", "No Bridge Map yet. Finish onboarding so the simulator has a map to start from.");
    return ok(contextView(world));
  } catch {
    return internal();
  }
}
