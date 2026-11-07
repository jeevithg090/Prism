// POST /api/roadmap/generate {userId, roleId?, runId?} → Roadmap (+ runId for the Activity panel).
// Events: orchestrator started → roadmap started/progress/done (with real numbers) → orchestrator done.
import { emit, newRunId } from "@/lib/agents/events";
import { generateRoadmap, loadRoadmap, roadmapFixture } from "@/lib/agents/roadmap";
import { loadGraph } from "@/lib/graph/build";
import { getProfile, marketFixture, podFor, programmeFixture, trendsFixture } from "@/lib/graph/data";
import { RoadmapGenerateReqZ } from "@/lib/graph/schemas";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";

const pct = (x: number) => `${Math.round(x * 100)}%`;

export async function POST(req: Request) {
  let runId: string | undefined;
  try {
    let body: unknown;
    try { body = await req.json(); } catch { return badRequest("Send a JSON body with a userId."); }
    const parsed = RoadmapGenerateReqZ.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error);
    const { userId } = parsed.data;
    const profile = await getProfile(userId);
    if (!profile?.dna) return fail(404, "not_found", `We couldn't find a profile for ${userId}.`);
    const roleId = parsed.data.roleId ?? profile.dna.targetRoles?.[0] ?? "ml-engineer";
    runId = parsed.data.runId ?? newRunId();
    const first = profile.name?.split(" ")[0] || userId;
    emit({ runId, agent: "orchestrator", status: "started", message: `Re-planning ${first}'s roadmap` });

    const map = await loadGraph(userId, roleId);
    if (!map) {
      emit({ runId, agent: "orchestrator", status: "error", message: "No Bridge Map yet: finish onboarding first" });
      return fail(404, "not_found", "No Bridge Map yet. Finish onboarding to build your roadmap.");
    }
    const demo = process.env.DEMO_MODE === "true";
    const [previous, pod] = await Promise.all([loadRoadmap(userId, roleId), podFor(userId)]);
    const roadmap = await generateRoadmap({
      profile, map, pod, previous, runId,
      programme: programmeFixture(profile.programmeId), roleDemand: marketFixture(roleId), trends: trendsFixture(),
      polish: !demo, template: demo ? roadmapFixture(userId, roleId) : null,
    });
    emit({
      runId, agent: "orchestrator", status: "done",
      message: `Roadmap v${roadmap.version} ready · readiness ${pct(roadmap.readinessNow)} → ${pct(roadmap.readinessProjected)}`,
      data: { readinessNow: roadmap.readinessNow, readinessProjected: roadmap.readinessProjected, version: roadmap.version },
    });
    return ok({ ...roadmap, runId });
  } catch {
    if (runId) emit({ runId, agent: "orchestrator", status: "error", message: "Re-planning failed: your last roadmap is unchanged" });
    return internal();
  }
}
