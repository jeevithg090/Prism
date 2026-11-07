// P5 · POST /api/projects/create {podId} → ProjectBrief (with repoUrl + issue URLs)
import { getStore } from "@/lib/store";
import { newRunId } from "@/lib/agents/events";
import { createRepoAndIssues, designProject } from "@/lib/agents/architect";
import { ProjectCreateReqZ, badRequest, fail, internal, ok } from "@/lib/schemas/community";
import type { Pod } from "@/lib/types";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Body must be JSON like {\"podId\":\"pod_demo01\"}");
  }
  const parsed = ProjectCreateReqZ.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);

  try {
    const store = getStore();
    const pod = await store.get<Pod>("pods", parsed.data.podId);
    if (!pod) return fail(404, "not_found", `We couldn't find pod ${parsed.data.podId}.`);
    if (pod.project?.repoUrl) return ok(pod.project); // idempotent: the repo already exists

    const runId = newRunId();
    const draft = await designProject(pod, runId);
    const brief = await createRepoAndIssues(pod, draft, runId);
    await store.upsert("pods", pod.id, { ...pod, project: brief }, pod.members[0]?.userId);
    return ok({ ...brief, runId });
  } catch {
    return internal();
  }
}
