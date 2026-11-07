// P5 · Start a pod's project: Architect designs it, then creates the GitHub repo + issues (demo repo in DEMO_MODE).
// Shared by POST /api/projects/create and the `start_pod_project` tool.
import "server-only";
import { createRepoAndIssues, designProject } from "@/lib/agents/architect";
import { newRunId } from "@/lib/agents/events";
import { getStore } from "@/lib/store";
import type { Pod, ProjectBrief } from "@/lib/types";

export interface StartProjectResult {
  pod: Pod;
  brief: ProjectBrief;
  /** false when the pod already had a repo (idempotent: nothing was created or saved). */
  created: boolean;
}

/** Designs and creates the pod's project once and saves it on the pod. Returns null when the pod doesn't exist. */
export async function startPodProject(podId: string, runId: string = newRunId()): Promise<StartProjectResult | null> {
  const store = getStore();
  const pod = await store.get<Pod>("pods", podId);
  if (!pod) return null;
  if (pod.project?.repoUrl) return { pod, brief: pod.project, created: false }; // idempotent: the repo already exists

  const draft = await designProject(pod, runId);
  const brief = await createRepoAndIssues(pod, draft, runId);
  const saved: Pod = { ...pod, project: brief };
  await store.upsert("pods", pod.id, saved, pod.members[0]?.userId);
  return { pod: saved, brief, created: true };
}
