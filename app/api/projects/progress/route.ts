// P5 · GET /api/projects/progress?podId= → ProjectProgress (which pod issues are merged; empty if none yet).
import { z } from "zod";
import { getStore } from "@/lib/store";
import { badRequest, internal, ok } from "@/lib/schemas/community";
import { ProjectProgressZ, type ProjectProgress } from "@/lib/schemas/studio";

const QueryZ = z.object({ podId: z.string().min(1) });

export async function GET(req: Request) {
  const parsed = QueryZ.safeParse({ podId: new URL(req.url).searchParams.get("podId") ?? undefined });
  if (!parsed.success) return badRequest(parsed.error);
  try {
    const { podId } = parsed.data;
    const stored = ProjectProgressZ.safeParse(await getStore().get<unknown>("pod_progress", podId));
    const progress: ProjectProgress = stored.success
      ? { ...stored.data, merged: [...stored.data.merged].sort((a, b) => a.issueIndex - b.issueIndex) }
      : { podId, merged: [] };
    return ok(progress);
  } catch {
    return internal();
  }
}
