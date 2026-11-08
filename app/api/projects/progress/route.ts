// P5 · GET /api/projects/progress?podId= → ProjectProgress (which pod issues are merged; empty if none yet; 404 for an unknown pod).
import { z } from "zod";
import { getStore } from "@/lib/store";
import { loadPod } from "@/lib/agents/proof";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";
import { ProjectProgressZ, type ProjectProgress } from "@/lib/schemas/studio";

const QueryZ = z.object({ podId: z.string().min(1) });

export async function GET(req: Request) {
  const parsed = QueryZ.safeParse({ podId: new URL(req.url).searchParams.get("podId") ?? undefined });
  if (!parsed.success) return badRequest(parsed.error);
  try {
    const { podId } = parsed.data;
    const stored = ProjectProgressZ.safeParse(await getStore().get<unknown>("pod_progress", podId));
    if (stored.success) {
      return ok({ ...stored.data, merged: [...stored.data.merged].sort((a, b) => a.issueIndex - b.issueIndex) });
    }
    // No progress yet: an existing pod (store or the seeded demo pod) has nothing merged; an unknown pod is a 404.
    if (!(await loadPod(podId))) return fail(404, "not_found", `We couldn't find pod ${podId}.`);
    const progress: ProjectProgress = { podId, merged: [] };
    return ok(progress);
  } catch {
    return internal();
  }
}
