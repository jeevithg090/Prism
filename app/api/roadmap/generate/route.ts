import "server-only";
import fixtureRoadmap from "@/data/fixtures/roadmap.aisha.ml-engineer.json";
import { getStore } from "@/lib/store";
import { getRoleDemand } from "@/lib/agents/market";
import { extractProgramme } from "@/lib/agents/syllabus";
import { getTrends } from "@/lib/agents/trends";
import { generateRoadmap } from "@/lib/agents/roadmap";
import { loadGraph } from "@/lib/graph/build";
import { RoadmapGenerateZ, ok, fail } from "@/lib/schemas/brain";
import type { BridgeMap, Profile, Roadmap } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const parsed = RoadmapGenerateZ.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(400, "bad_request", "userId and roleId are required");
    const { userId, roleId } = parsed.data;
    const store = getStore();
    const profile = await store.get<Profile>("profiles", userId);
    if (!profile) return fail(404, "not_found", "Profile not found");
    if (process.env.DEMO_MODE === "true" && userId === "aisha" && roleId === "ml-engineer") {
      const previous = await store.get<Roadmap>("roadmaps", userId);
      const roadmap = { ...(fixtureRoadmap as Roadmap), version: (previous?.version ?? 0) + 1, generatedAt: new Date().toISOString() };
      return ok(await store.upsert("roadmaps", userId, roadmap as Roadmap & { id?: string }, userId));
    }
    const [map, programme, roleDemand, trends] = await Promise.all([
      loadGraph(userId, roleId),
      extractProgramme({ programmeId: profile.programmeId }),
      getRoleDemand(roleId), getTrends(),
    ]);
    if (!map) return fail(404, "not_found", "No bridge map for this user and role yet");
    const roadmap = await generateRoadmap({ profile, map: map as BridgeMap, programme, roleDemand, trends });
    return ok(roadmap);
  } catch { return fail(500, "internal", "Something went wrong"); }
}
