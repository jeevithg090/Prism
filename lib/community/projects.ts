// P5 · Start a pod's project: Architect designs it, then creates the GitHub repo + issues (demo repo in DEMO_MODE).
// Shared by POST /api/projects/create and the `start_pod_project` tool.
import "server-only";
import { createRepoAndIssues, demoResult, designProject } from "@/lib/agents/architect";
import { newRunId } from "@/lib/agents/events";
import { DEMO_FIXTURE_POD_ID, readDemoPod } from "@/lib/agents/matchmaker";
import { getStore } from "@/lib/store";
import type { Pod, ProjectBrief } from "@/lib/types";

export interface StartProjectResult {
  pod: Pod;
  brief: ProjectBrief;
  /** false when the pod already had a repo (idempotent: nothing was created or saved). */
  created: boolean;
}

/**
 * The seeded demo pod still carries the hand-written fixture brief (it ships with a repo link so DEMO_MODE and
 * the proof ladder work). Outside DEMO_MODE, "Start our project" designs it for real instead (Live: the model;
 * Demo toggle: the recorded real run), linked to the demo repo rather than creating a new one.
 */
function isUndesignedDemoPod(pod: Pod): boolean {
  if (process.env.DEMO_MODE === "true" || pod.id !== DEMO_FIXTURE_POD_ID || !pod.project) return false;
  const fixture = readDemoPod();
  return !!fixture?.project && pod.project.title === fixture.project.title && pod.project.pitch === fixture.project.pitch;
}

/** Designs and creates the pod's project once and saves it on the pod. Returns null when the pod doesn't exist. */
export async function startPodProject(podId: string, runId: string = newRunId()): Promise<StartProjectResult | null> {
  const store = getStore();
  const pod = await store.get<Pod>("pods", podId);
  if (!pod) return null;

  if (isUndesignedDemoPod(pod)) {
    const draft = await designProject(pod, runId);
    // The model's brief, linked to the seeded demo repo: no new GitHub repo for the shared demo pod.
    const brief = draft.title === pod.project!.title ? pod.project! : demoResult(draft);
    const saved: Pod = { ...pod, project: brief };
    await store.upsert("pods", pod.id, saved, pod.members[0]?.userId);
    return { pod: saved, brief, created: true };
  }
  if (pod.project?.repoUrl) return { pod, brief: pod.project, created: false }; // idempotent: the repo already exists

  const draft = await designProject(pod, runId);
  const brief = await createRepoAndIssues(pod, draft, runId);
  const saved: Pod = { ...pod, project: brief };
  await store.upsert("pods", pod.id, saved, pod.members[0]?.userId);
  return { pod: saved, brief, created: true };
}
