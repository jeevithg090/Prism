// POST /api/labs/whatif/adopt: the human checkpoint between a simulated plan and your real roadmap.
//   {action:"propose", userId, plan} → a proposal (the roadmap it would write and what changes); nothing changes yet
//   {action:"approve"|"decline"|"undo", userId, proposalId} → only "approve" writes store "roadmaps" (and your weekly hours)
// The server re-simulates and rebuilds the roadmap itself; it never trusts numbers from the client.
import { newRunId } from "@/lib/agents/events";
import { decideAdoption, loadWhatIfWorld, proposeAdoption, WhatIfConflict, WhatIfNotFound } from "@/lib/labs/whatif/agent";
import { AdoptReqZ } from "@/lib/labs/whatif/schemas";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Send JSON like {\"action\":\"propose\",\"userId\":\"aisha\",\"plan\":{...}}");
  }
  const parsed = AdoptReqZ.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);
  const runId = newRunId();
  try {
    const r = parsed.data;
    if (r.action === "propose") {
      const world = await loadWhatIfWorld(r.userId);
      if (!world) return fail(404, "not_found", "No Bridge Map yet. Finish onboarding so the simulator has a map to start from.");
      if (r.plan.firstSkillId && !world.ctx.queue.includes(r.plan.firstSkillId)) return badRequest(`plan: ${r.plan.firstSkillId} isn't on your roadmap`);
      return ok({ ...(await proposeAdoption({ world, plan: r.plan, runId })), runId });
    }
    return ok({ ...(await decideAdoption({ userId: r.userId, proposalId: r.proposalId, action: r.action, runId })), runId });
  } catch (e) {
    if (e instanceof WhatIfNotFound) return fail(404, "not_found", e.message);
    if (e instanceof WhatIfConflict) return fail(409, "conflict", e.message);
    return internal();
  }
}
