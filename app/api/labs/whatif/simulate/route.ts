// POST /api/labs/whatif/simulate {userId, plans: [PlanSpec, PlanSpec?], runId?} → SimulationResult (+ runId).
// The Roadmap Agent runs the plans across the same 200 seeded futures inside the agent harness (ledger + events).
import { newRunId } from "@/lib/agents/events";
import { loadWhatIfWorld, simulateWhatIf } from "@/lib/labs/whatif/agent";
import { SimulateReqZ } from "@/lib/labs/whatif/schemas";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Send JSON like {\"userId\":\"aisha\",\"plans\":[{\"id\":\"a\",\"label\":\"Docker first\",\"hoursPerWeek\":8,\"firstSkillId\":\"docker\",\"jobHoursLost\":0,\"placement\":false}]}");
  }
  const parsed = SimulateReqZ.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);
  const { userId, plans } = parsed.data;
  if (plans.length === 2 && plans[0].id === plans[1].id) return badRequest("plans: give the two plans different ids (a and b)");
  try {
    const world = await loadWhatIfWorld(userId);
    if (!world) return fail(404, "not_found", "No Bridge Map yet. Finish onboarding so the simulator has a map to start from.");
    const known = new Set(world.ctx.queue);
    const unknown = plans.find((p) => p.firstSkillId && !known.has(p.firstSkillId));
    if (unknown) return badRequest(`plans: ${unknown.firstSkillId} isn't on your roadmap; pick one of ${world.ctx.queue.join(", ")}`);
    const runId = parsed.data.runId ?? newRunId();
    return ok(await simulateWhatIf({ world, plans, runId }));
  } catch {
    return internal();
  }
}
