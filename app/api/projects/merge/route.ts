// P5 · POST /api/projects/merge {podId, issueIndex, prUrl?} → ProofResult. The "Mark as merged" demo button,
// and the same path the GitHub webhook takes when a pod PR really merges.
import { newRunId } from "@/lib/agents/events";
import { NotFoundError, recordMergedPR } from "@/lib/agents/proof";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";
import { ProjectMergeReqZ } from "@/lib/schemas/studio";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Body must be JSON like {\"podId\":\"pod_demo01\",\"issueIndex\":0}");
  }
  const parsed = ProjectMergeReqZ.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);

  try {
    return ok(await recordMergedPR({ ...parsed.data, runId: newRunId() }));
  } catch (e) {
    if (e instanceof NotFoundError) return fail(404, "not_found", e.message);
    return internal();
  }
}
