import "server-only";
import { getStore } from "@/lib/store";
import { RoadmapGenerateZ, ok, fail } from "@/lib/schemas/brain";
import type { Profile, Roadmap } from "@/lib/types";
import aishaRoadmap from "@/data/fixtures/roadmap.aisha.ml-engineer.json";

// STUB (PR2): fixture for aisha. Real agent lands in PR6.
export async function POST(req: Request) {
  try {
    const parsed = RoadmapGenerateZ.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(400, "bad_request", "userId and roleId are required");
    const { userId, roleId } = parsed.data;
    const store = getStore();
    if (!(await store.get<Profile>("profiles", userId))) return fail(404, "not_found", "Profile not found");
    if (userId !== "aisha" || roleId !== "ml-engineer") return fail(404, "not_found", "No roadmap for this user and role yet");
    const prev = await store.get<Roadmap>("roadmaps", userId);
    const roadmap = { ...(aishaRoadmap as Roadmap), version: (prev?.version ?? 0) + 1, generatedAt: new Date().toISOString() };
    return ok(await store.upsert("roadmaps", userId, roadmap as Roadmap & { id?: string }, userId));
  } catch { return fail(500, "internal", "Something went wrong"); }
}
