// P5 · Proof engine: a merged pod PR becomes verified skill evidence for the learner AND the reviewer,
// flips the skill to "proven" on the learner's Bridge Map, and hands off Tech Lead → Evidence → Roadmap.
import "server-only";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getStore } from "@/lib/store";
import { emit, newRunId } from "@/lib/agents/events";
import { loadGraph } from "@/lib/graph/build";
import { skillName } from "@/lib/schemas/community";
import type { MomentumEvent } from "@/lib/schemas/community";
import { ProofResultZ, type ProjectProgress, type ProofResult } from "@/lib/schemas/studio";
import type { BadgeId, BridgeMap, BridgeNode, EvidenceItem, Pod, Profile, Roadmap, SkillStatus } from "@/lib/types";

export class NotFoundError extends Error {
  readonly code = "not_found";
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export const PR_MERGED_POINTS = 5;
export const HELPED_NEWCOMER_POINTS = 3;
export const COVERAGE: Record<SkillStatus, number> = { proven: 1, "degree-done": 0.7, "degree-upcoming": 0.4, gap: 0 };

const capitalise = (id: string) => (id ? id[0].toUpperCase() + id.slice(1) : id);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const round2 = (x: number) => Math.round(x * 100) / 100;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Contract readiness: Σ demand×coverage / Σ demand over role skills (demand > 0). Unrounded. */
export function readinessFormula(nodes: BridgeNode[]): number {
  const role = nodes.filter((n) => n.demand > 0);
  const total = role.reduce((a, n) => a + n.demand, 0);
  if (!total) return 0;
  return role.reduce((a, n) => a + n.demand * (COVERAGE[n.status] ?? 0), 0) / total;
}

function readFixture<T>(rel: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), "utf8")) as T;
  } catch {
    return null;
  }
}

/** A pod from the store, or the seeded demo pod fixture if the id matches (e.g. on a fresh Supabase). */
export async function loadPod(podId: string): Promise<Pod | null> {
  const stored = await getStore().get<Pod>("pods", podId);
  if (stored) return stored;
  const fx = readFixture<Pod>("data/fixtures/pod.aisha.json");
  return fx?.id === podId ? fx : null;
}

export const repoNameOf = (repoUrl?: string) => repoUrl?.replace(/\/+$/, "").split("/").pop() || undefined;

async function profileOf(userId: string): Promise<Profile | null> {
  try { return await getStore().get<Profile>("profiles", userId); } catch { return null; }
}
const firstName = (p: Profile | null, id: string) => p?.name?.split(" ")[0] || capitalise(id);

async function loadMap(userId: string, role: string): Promise<BridgeMap | null> {
  const key = `${userId}:${role}`;
  try {
    const stored = await getStore().get<BridgeMap>("maps", key);
    if (stored && Array.isArray(stored.nodes)) return stored;
  } catch { /* fall through */ }
  try {
    const built = await loadGraph(userId, role);
    if (built && Array.isArray(built.nodes)) return built;
  } catch { /* fall through */ }
  const fx = readFixture<BridgeMap>(`data/fixtures/bridgemap.${userId}.${role}.json`);
  return fx && Array.isArray(fx.nodes) ? fx : null;
}

export interface RecordMergedPRInput {
  podId: string;
  issueIndex: number;
  prUrl?: string;
  runId?: string;
  /** ISO time the PR merged (webhook); defaults to now. */
  mergedAt?: string;
}

const g = globalThis as unknown as { __ksProofInflight?: Map<string, Promise<ProofResult>> };
const inflight: Map<string, Promise<ProofResult>> = (g.__ksProofInflight ??= new Map());

/**
 * Records a merged pod PR as proof of skill. Idempotent per (podId, issueIndex): a second call returns the
 * stored result and writes nothing. Throws NotFoundError for an unknown pod or issue index.
 */
export async function recordMergedPR(input: RecordMergedPRInput): Promise<ProofResult> {
  const key = `${input.podId}:${input.issueIndex}`;
  const running = inflight.get(key);
  if (running) return running;
  const p = doRecord(input).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function doRecord({ podId, issueIndex, prUrl, runId, mergedAt }: RecordMergedPRInput): Promise<ProofResult> {
  const store = getStore();
  const pod = await loadPod(podId);
  if (!pod) throw new NotFoundError(`We couldn't find pod ${podId}.`);
  const issue = pod.project?.issues?.[issueIndex];
  if (!issue || !Number.isInteger(issueIndex) || issueIndex < 0) {
    throw new NotFoundError(`Pod ${podId} has no issue #${issueIndex + 1}.`);
  }

  const proofId = `${podId}:${issueIndex}`;
  const existing = ProofResultZ.safeParse(await store.get<unknown>("proofs", proofId));
  if (existing.success) return existing.data;

  const rid = runId ?? newRunId();
  const now = new Date().toISOString();
  const ts = mergedAt ?? now;
  const learnerId = issue.assigneeUserId;
  const reviewerId = issue.reviewerUserId;
  const hasReviewer = !!reviewerId && reviewerId !== learnerId;
  const skillId = issue.skillId;
  const skill = skillName(skillId);
  const [learnerP, reviewerP] = await Promise.all([profileOf(learnerId), hasReviewer ? profileOf(reviewerId) : null]);
  const learner = firstName(learnerP, learnerId);
  const reviewer = hasReviewer ? firstName(reviewerP, reviewerId) : learner;
  const repoUrl = pod.project?.repoUrl;
  const repo = repoNameOf(repoUrl) ?? pod.name;
  const url = prUrl || issue.githubIssueUrl || repoUrl || "";

  emit({
    runId: rid, agent: "techlead", status: "done",
    message: `PR merged: '${issue.title}'${hasReviewer ? ` (reviewed by ${reviewer})` : ""}`,
    data: { podId, issueIndex, prUrl: url },
  });

  // 1. Evidence: the learner's skill, and the reviewer's code review (teaching is assessed too).
  const base = `ev_pod_${podId}_${issueIndex}`;
  const learnerEv: EvidenceItem = {
    id: `${base}_${learnerId}`, userId: learnerId, skillId, level: 2, confidence: 0.9, source: "keystone-pod", url,
    quote: `Merged '${issue.title}' in ${repo}${hasReviewer ? `, reviewed by ${reviewer}` : ""}`, createdAt: now,
  };
  await store.upsert("evidence", learnerEv.id, learnerEv, learnerId);
  const evidenceIds = [learnerEv.id];
  emit({
    runId: rid, agent: "evidence", status: "done", message: `${skill} proven for ${learner} · source: Keystone pod`,
    data: { evidenceId: learnerEv.id, userId: learnerId, skillId, level: 2, confidence: 0.9 },
  });

  if (hasReviewer) {
    const reviewEv: EvidenceItem = {
      id: `${base}_${reviewerId}_review`, userId: reviewerId, skillId: "code-review", level: 2, confidence: 0.8,
      source: "keystone-pod", url, quote: `Reviewed ${learner}'s ${skill} PR`, createdAt: now,
    };
    await store.upsert("evidence", reviewEv.id, reviewEv, reviewerId);
    evidenceIds.push(reviewEv.id);
    emit({
      runId: rid, agent: "evidence", status: "done", message: `Code review proven for ${reviewer}`,
      data: { evidenceId: reviewEv.id, userId: reviewerId, skillId: "code-review", level: 2, confidence: 0.8 },
    });
  }

  // 2. Momentum: pr-merged for the learner; helped-newcomer for the reviewer of a 🌱 learner.
  const merged: MomentumEvent = { id: `pr-merged-${podId}-${issueIndex}`, userId: learnerId, kind: "pr-merged", ts, label: `Merged PR in ${repo}`, url };
  await store.upsert("momentum_events", merged.id!, merged, learnerId);
  if (hasReviewer && learnerP?.badges?.includes("new-to-uni")) {
    const helped: MomentumEvent = {
      id: `helped-newcomer-${podId}-${issueIndex}`, userId: reviewerId, kind: "helped-newcomer", ts,
      label: `Reviewed ${learner}'s first ${skill} PR`, url,
    };
    await store.upsert("momentum_events", helped.id!, helped, reviewerId);
  }

  // 3. Bridge Map: flip the node to proven and move readiness by the formula's delta.
  const role = learnerP?.dna?.targetRoles?.[0];
  const map = role ? await loadMap(learnerId, role) : null;
  let readinessBefore = 0;
  let readinessAfter = 0;
  if (map) {
    readinessBefore = typeof map.readinessNow === "number" ? map.readinessNow : round2(readinessFormula(map.nodes));
    readinessAfter = readinessBefore;
    const node = map.nodes.find((n) => n.skillId === skillId);
    if (node) {
      const fBefore = readinessFormula(map.nodes);
      const nodes = map.nodes.map((n) =>
        n.skillId !== skillId ? n : {
          ...n, status: "proven" as const, level: (Math.max(n.level ?? 0, 2) as BridgeNode["level"]),
          evidenceIds: [...new Set([...(n.evidenceIds ?? []), learnerEv.id])],
        });
      readinessAfter = round2(clamp01(readinessBefore + (readinessFormula(nodes) - fBefore)));
      const updated: BridgeMap & { id?: string } = {
        ...map, nodes, readinessNow: readinessAfter,
        readinessProjected: Math.max(map.readinessProjected ?? 0, readinessAfter),
      };
      await store.upsert("maps", `${learnerId}:${role}`, updated, learnerId);
    }
  }

  // 4. Roadmap re-plan: the week whose proof this was is done; the next week becomes current.
  let nextWeek = Number(issue.body.match(/\*\*Roadmap:\*\*\s*Week\s+(\d+)/)?.[1] ?? 1) + 1;
  try {
    const roadmap = await store.get<Roadmap>("roadmaps", learnerId);
    const wk = Array.isArray(roadmap?.weeks)
      ? roadmap.weeks.find((w) => w.focusSkillId === skillId && !(w.tasks?.length && w.tasks.every((t) => t.done)))
      : undefined;
    if (roadmap && wk) {
      nextWeek = wk.week + 1;
      const weeks = roadmap.weeks.map((w) => (w === wk ? { ...w, tasks: w.tasks.map((t) => ({ ...t, done: true })) } : w));
      await store.upsert("roadmaps", learnerId, { ...roadmap, weeks } as Roadmap & { id?: string }, learnerId);
    }
  } catch { /* the roadmap is P2's; re-planning is best-effort */ }
  emit({
    runId: rid, agent: "roadmap", status: "done",
    message: map
      ? `${learner}'s readiness ${pct(readinessBefore)} → ${pct(readinessAfter)} · re-planning week ${nextWeek}`
      : `${skill} marked proven on ${learner}'s roadmap · re-planning week ${nextWeek}`,
    data: { userId: learnerId, readinessBefore, readinessAfter, nextWeek },
  });

  // 5. Badges + pod progress.
  const allProgress = await store.list<ProjectProgress>("pod_progress");
  const shippedBefore = allProgress.some((pp) => pp?.merged?.some((m) => m.userId === learnerId));
  const badgesEarned: BadgeId[] = shippedBefore ? [] : ["shipped"];
  if (!shippedBefore && learnerP && !learnerP.badges?.includes("shipped")) {
    await store.upsert("profiles", learnerId, { ...learnerP, badges: [...(learnerP.badges ?? []), "shipped"] }, learnerId);
  }
  const progress = (await store.get<ProjectProgress>("pod_progress", podId)) ?? { podId, merged: [] };
  const entry: ProjectProgress["merged"][number] = { issueIndex, userId: learnerId, skillId, mergedAt: ts, ...(url ? { prUrl: url } : {}) };
  const nextProgress: ProjectProgress & { id: string } = {
    id: podId, podId, merged: [...(progress.merged ?? []).filter((m) => m.issueIndex !== issueIndex), entry],
  };
  await store.upsert("pod_progress", podId, nextProgress, pod.members[0]?.userId);

  const message = map
    ? `${skill} is now proven on ${learner}'s Bridge Map · readiness ${pct(readinessBefore)} → ${pct(readinessAfter)}`
    : `${skill} is now proven for ${learner}${hasReviewer ? ` · reviewed by ${reviewer}` : ""}`;
  const result: ProofResult = {
    podId, issueIndex, userId: learnerId, skillId, skillName: skill, reviewerUserId: reviewerId,
    evidenceIds, readinessBefore, readinessAfter, badgesEarned, momentumPoints: PR_MERGED_POINTS, message, runId: rid,
  };
  await store.upsert("proofs", proofId, { id: proofId, ...result }, learnerId);
  emit({ runId: rid, agent: "orchestrator", status: "done", message, data: { readinessBefore, readinessAfter, badgesEarned } });
  return result;
}

// ---------- GitHub webhook → proof ----------

const MergedPREventZ = z.object({
  action: z.string(),
  pull_request: z.object({
    number: z.number(),
    title: z.string().nullable().optional(),
    body: z.string().nullable().optional(),
    html_url: z.string().optional(),
    merged: z.boolean().nullable().optional(),
    merged_at: z.string().nullable().optional(),
    user: z.object({ login: z.string() }).nullable().optional(),
  }),
  repository: z.object({
    name: z.string(),
    full_name: z.string().optional(),
    html_url: z.string().optional(),
    owner: z.object({ login: z.string() }),
  }),
});

const normRepo = (u?: string) => (u ?? "").trim().toLowerCase().replace(/\.git$/, "").replace(/\/+$/, "");

/** `Closes #3` / `fixes #3` first, then any `#3`, in the PR title or body. */
export function referencedIssueNumber(text: string): number | null {
  const m = text.match(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)\b/i) ?? text.match(/(?:^|[^\w&])#(\d+)\b/);
  return m ? Number(m[1]) : null;
}

/** Issue number n → the issue whose GitHub URL ends in /issues/n, else index n−1. */
function indexForIssueNumber(pod: Pod, n: number): number | null {
  const issues = pod.project?.issues ?? [];
  const byUrl = issues.findIndex((i) => i.githubIssueUrl?.replace(/\/+$/, "").endsWith(`/issues/${n}`));
  if (byUrl >= 0) return byUrl;
  return n >= 1 && n <= issues.length ? n - 1 : null;
}

/**
 * For a `pull_request` closed+merged event on a pod repo: maps the PR to an issue and records proof.
 * Returns null when it isn't a merged PR, no pod uses the repo, or the PR can't be matched to an issue.
 */
export async function proofFromPullRequestEvent(event: unknown): Promise<ProofResult | null> {
  const parsed = MergedPREventZ.safeParse(event);
  if (!parsed.success) return null;
  const e = parsed.data;
  if (e.action !== "closed" || e.pull_request.merged !== true) return null;

  const repoUrl = normRepo(e.repository.html_url ?? `https://github.com/${e.repository.full_name ?? `${e.repository.owner.login}/${e.repository.name}`}`);
  const store = getStore();
  const pods = [...(await store.list<Pod>("pods"))];
  const fx = readFixture<Pod>("data/fixtures/pod.aisha.json");
  if (fx && !pods.some((p) => p.id === fx.id)) pods.push(fx);
  const pod = pods.find((p) => p?.project?.repoUrl && normRepo(p.project.repoUrl) === repoUrl);
  if (!pod?.project) return null;

  let issueIndex: number | null = null;
  const n = referencedIssueNumber(`${e.pull_request.title ?? ""}\n${e.pull_request.body ?? ""}`);
  if (n !== null) issueIndex = indexForIssueNumber(pod, n);

  const login = e.pull_request.user?.login?.toLowerCase();
  if (issueIndex === null && login) {
    const profiles = await Promise.all(pod.members.map((m) => profileOf(m.userId)));
    const member = profiles.find((p) => p?.githubLogin?.toLowerCase() === login);
    if (member) {
      const progress = await store.get<ProjectProgress>("pod_progress", pod.id);
      const done = new Set((progress?.merged ?? []).map((m) => m.issueIndex));
      const mine = pod.project.issues.map((i, idx) => ({ i, idx })).filter(({ i }) => i.assigneeUserId === member.id);
      issueIndex = (mine.find(({ idx }) => !done.has(idx)) ?? mine[0])?.idx ?? null;
    }
  }
  if (issueIndex === null) return null;

  return recordMergedPR({
    podId: pod.id, issueIndex, prUrl: e.pull_request.html_url, mergedAt: e.pull_request.merged_at ?? undefined,
  });
}
