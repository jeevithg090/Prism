// P5 · POST /api/projects/create {podId} → ProjectBrief (with repoUrl + issue URLs)
import { newRunId } from "@/lib/agents/events";
import { startPodProject } from "@/lib/community/projects";
import { ProjectCreateReqZ, badRequest, fail, internal, ok } from "@/lib/schemas/community";
import { withReplayInfo } from "@/lib/replay";

async function handlePOST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Body must be JSON like {\"podId\":\"pod_demo01\"}");
  }
  const parsed = ProjectCreateReqZ.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);

  try {
    const runId = newRunId();
    const result = await startPodProject(parsed.data.podId, runId);
    if (!result) return fail(404, "not_found", `We couldn't find pod ${parsed.data.podId}.`);
    return ok(result.created ? { ...result.brief, runId } : result.brief); // idempotent: an existing repo is returned as-is
  } catch {
    return internal();
  }
}

/** Demo toggle: the envelope says whether its AI / connector values were replayed from a real run (lib/replay.ts). */
export const POST = withReplayInfo(handlePOST);
