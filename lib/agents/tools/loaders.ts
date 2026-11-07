// P5 · Data loaders behind the Keystone tools: profile, Bridge Map, current roadmap week, pod, proofs.
// Each one degrades gracefully (store → P2 builder → fixture) so every tool works in DEMO_MODE.
import "server-only";
import fs from "node:fs";
import path from "node:path";
import { listPodsForUser, readDemoPod } from "@/lib/agents/matchmaker";
import { loadPod } from "@/lib/agents/proof";
import { roleName } from "@/lib/agents/trajectories";
import { loadGraph } from "@/lib/graph/build";
import { skillName } from "@/lib/schemas/community";
import { ProjectProgressZ, type ProjectProgress } from "@/lib/schemas/studio";
import { getStore } from "@/lib/store";
import type { BridgeMap, BridgeNode, EvidenceItem, Pod, Profile, Receipt, Roadmap, RoadmapTask, RoadmapWeek, SkillId } from "@/lib/types";
import { ToolError } from "./errors";

const SAFE_ID = /^[a-z0-9][a-z0-9_-]*$/i;
export const isDemoMode = () => process.env.DEMO_MODE === "true";
/** 0.41 → 41 */
export const pct = (x: number) => Math.round((Number.isFinite(x) ? x : 0) * 100);
export const capitalise = (id: string) => (id ? id[0].toUpperCase() + id.slice(1) : id);
const firstNameOf = (name: string | undefined, id: string) => name?.trim().split(/\s+/)[0] || capitalise(id);

function readJSON(rel: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), "utf8"));
  } catch {
    return undefined;
  }
}

// ---------- profile ----------

export async function requireProfile(userId: string): Promise<Profile> {
  const p = await getStore().get<Profile>("profiles", userId).catch(() => null);
  if (!p) {
    throw new ToolError(
      `No Keystone profile for "${userId}". Check the userId, or ask the student to finish onboarding in Keystone first.`,
      "not_found",
    );
  }
  return p;
}

export const primaryRole = (p: Profile): string => p.dna?.targetRoles?.[0] ?? "ml-engineer";
export const displayRole = (roleId: string): string => roleName(roleId) || roleId;

// ---------- Bridge Map ----------

const hasNodes = (m: BridgeMap | null | undefined): m is BridgeMap => Array.isArray(m?.nodes) && m.nodes.length > 0;

/** The user's map for a role: store `maps` (updated by the proof engine) → P2's loadGraph → the fixture file. */
export async function loadBridgeMap(userId: string, roleId: string): Promise<BridgeMap | null> {
  const stored = await getStore().get<BridgeMap>("maps", `${userId}:${roleId}`).catch(() => null);
  if (hasNodes(stored)) return stored;
  const built = await loadGraph(userId, roleId).catch(() => null);
  if (hasNodes(built)) return built;
  if (!SAFE_ID.test(userId) || !SAFE_ID.test(roleId)) return null;
  const fx = readJSON(`data/fixtures/bridgemap.${userId}.${roleId}.json`) as BridgeMap | undefined;
  return hasNodes(fx) ? fx : null;
}

export async function requireBridgeMap(userId: string, roleId: string): Promise<BridgeMap> {
  const map = await loadBridgeMap(userId, roleId);
  if (!map) {
    throw new ToolError(
      `No Bridge Map yet for "${userId}" (${displayRole(roleId)}). The student needs to add their degree in Keystone onboarding first.`,
      "not_found",
    );
  }
  return map;
}

const byDemand = (a: BridgeNode, b: BridgeNode) => b.demand - a.demand || a.skillId.localeCompare(b.skillId);

/** Role skills (demand > 0) with status `gap`, highest demand first. */
export function gapNodes(map: BridgeMap): BridgeNode[] {
  return map.nodes.filter((n) => n.status === "gap" && n.demand > 0).sort(byDemand);
}

export function nodesWithStatus(map: BridgeMap, status: BridgeNode["status"]): BridgeNode[] {
  return map.nodes.filter((n) => n.status === status).sort(byDemand);
}

export function degreeCoverage(node: BridgeNode): Receipt["coveredByDegree"] {
  if (node.status === "degree-done") return "done";
  if (node.status === "degree-upcoming") return "upcoming";
  if (node.status === "proven") return node.moduleCodes?.length ? "done" : "no";
  return "no";
}

/** The "why" for one skill, in the contract's Receipt shape. */
export function receiptFor(node: BridgeNode, roleId: string): Receipt {
  const s = node.name || skillName(node.skillId);
  const d = pct(node.demand);
  const role = displayRole(roleId);
  const covered = degreeCoverage(node);
  const moduleCode = node.moduleCodes?.[0];
  const rising = node.trend === "rising" ? " and demand is rising" : node.trend === "declining" ? ", though demand is declining" : "";
  let reason: string;
  if (node.status === "proven") {
    reason = `${s} is already proven on your Bridge Map, so it stays off your plan; keep it fresh by reviewing teammates' ${s} work.`;
  } else if (node.status === "degree-done") {
    reason = `${s} (${d}% of ${role} ads) was covered by ${moduleCode ?? "a module you've done"}; one small project turns that into proof.`;
  } else if (node.status === "degree-upcoming") {
    reason = `${s} is in ${d}% of ${role} ads, but ${moduleCode ?? "your degree"} covers it${node.upcomingLabel ? ` in ${node.upcomingLabel}` : " later"}, so Keystone won't make you study it twice.`;
  } else {
    reason = `${s} is in ${d}% of ${role} ads${rising}, and no module in your degree covers it, so it's worth learning now.`;
  }
  return {
    demandPct: d,
    ...(node.trend ? { trend: node.trend } : {}),
    coveredByDegree: covered,
    ...(moduleCode ? { moduleCode } : {}),
    ...(node.evidenceIds?.length ? { evidenceIds: node.evidenceIds } : {}),
    reason,
  };
}

// ---------- roadmap week ----------

export interface WeekPlan {
  week: number;
  focusSkillId: SkillId;
  focusSkillName: string;
  isExamWeek: boolean;
  tasks: Pick<RoadmapTask, "id" | "type" | "title" | "hours" | "free" | "done" | "resourceUrl">[];
  proof: string;
  degreeLink?: string;
  receipt?: Receipt;
  /** roadmap = the student's saved plan · fixture = P2's demo roadmap · fallback = built here from the top gap. */
  source: "roadmap" | "fixture" | "fallback";
  totalWeeks?: number;
}

/** First week whose tasks aren't all done. */
function openWeek(roadmap: unknown): { week: RoadmapWeek; total: number } | null {
  const weeks = (roadmap as Partial<Roadmap> | null | undefined)?.weeks;
  if (!Array.isArray(weeks)) return null;
  const week = weeks.find((w: RoadmapWeek) => {
    const tasks = Array.isArray(w?.tasks) ? w.tasks : [];
    return !(tasks.length > 0 && tasks.every((t) => t?.done));
  });
  return week && typeof week.focusSkillId === "string" ? { week, total: weeks.length } : null;
}

function fromRoadmapWeek(w: RoadmapWeek, source: WeekPlan["source"], total: number): WeekPlan {
  const focus = w.focusSkillId;
  return {
    week: Number.isFinite(w.week) ? w.week : 1,
    focusSkillId: focus,
    focusSkillName: skillName(focus),
    isExamWeek: !!w.isExamWeek,
    tasks: (Array.isArray(w.tasks) ? w.tasks : []).map((t) => ({
      id: t.id, type: t.type, title: t.title, hours: t.hours, free: t.free,
      ...(t.done ? { done: true } : {}), ...(t.resourceUrl ? { resourceUrl: t.resourceUrl } : {}),
    })),
    proof: w.proof?.trim() || `Merge a PR that adds ${skillName(focus)} to your pod repo`,
    ...(w.degreeLink ? { degreeLink: w.degreeLink } : {}),
    ...(w.receipt ? { receipt: w.receipt } : {}),
    source,
    totalWeeks: total,
  };
}

/** Deterministic week 1 for the top gap, sized to the student's weekly hours. */
function fallbackWeek(node: BridgeNode, roleId: string, hoursPerWeek: number, podIssue?: { title: string; number: number }): WeekPlan {
  const s = node.name || skillName(node.skillId);
  const scale = Math.min(1, Math.max(0.3, hoursPerWeek / 7));
  const h = (x: number) => Math.max(0.5, Math.round(x * scale * 2) / 2);
  return {
    week: 1,
    focusSkillId: node.skillId,
    focusSkillName: s,
    isExamWeek: false,
    tasks: [
      { id: `w1-learn-${node.skillId}`, type: "learn", title: `Work through an official ${s} getting-started guide`, hours: h(2), free: true },
      { id: `w1-practice-${node.skillId}`, type: "practice", title: `Practise ${s} on a tiny example of your own`, hours: h(2), free: true },
      {
        id: `w1-build-${node.skillId}`, type: "build",
        title: podIssue ? `Open a PR for pod issue #${podIssue.number}: ${podIssue.title}` : `Use ${s} in one small part of your pod project`,
        hours: h(3), free: true,
      },
    ],
    proof: podIssue ? `Merge "${podIssue.title}" (pod issue #${podIssue.number}), reviewed by a teammate` : `Merge a PR that adds ${s} to your pod repo`,
    receipt: receiptFor(node, roleId),
    source: "fallback",
  };
}

/** Current roadmap week: store `roadmaps` → data/fixtures/roadmap.<user>.<role>.json → fallback from the first gap. */
export async function loadWeekPlan(profile: Profile, roleId: string, map: BridgeMap | null, pod?: Pod | null): Promise<WeekPlan | null> {
  const store = getStore();
  for (const key of [profile.id, `${profile.id}:${roleId}`]) {
    const open = openWeek(await store.get<Roadmap>("roadmaps", key).catch(() => null));
    if (open) return fromRoadmapWeek(open.week, "roadmap", open.total);
  }
  if (SAFE_ID.test(profile.id) && SAFE_ID.test(roleId)) {
    const open = openWeek(readJSON(`data/fixtures/roadmap.${profile.id}.${roleId}.json`));
    if (open) return fromRoadmapWeek(open.week, "fixture", open.total);
  }
  const top = map ? gapNodes(map)[0] : undefined;
  if (!top) return null;
  let podIssue: { title: string; number: number } | undefined;
  if (pod?.project) {
    const merged = new Set((await loadProgress(pod.id)).merged.map((m) => m.issueIndex));
    const idx = pod.project.issues.findIndex((i, n) => i.assigneeUserId === profile.id && i.skillId === top.skillId && !merged.has(n));
    if (idx >= 0) podIssue = { title: pod.project.issues[idx].title, number: idx + 1 };
  }
  return fallbackWeek(top, roleId, profile.dna?.hoursPerWeek ?? 7, podIssue);
}

// ---------- pods ----------

/**
 * The pod a tool acts on. With `podId`: that pod, if the user is a member. Without: the user's newest pod;
 * in DEMO_MODE the seeded demo pod (pod_demo01) when the user is in it. null when there's none.
 */
export async function resolvePod(userId: string, podId?: string): Promise<Pod | null> {
  if (podId) {
    const pod = await loadPod(podId).catch(() => null);
    if (!pod) throw new ToolError(`No pod "${podId}". Call get_my_pod to see the student's pod, or omit podId.`, "not_found");
    if (!pod.members.some((m) => m.userId === userId)) {
      throw new ToolError(`"${userId}" isn't a member of ${pod.name}. Call get_my_pod to find their own pod.`, "forbidden");
    }
    return pod;
  }
  const mine = await listPodsForUser(userId).catch(() => [] as Pod[]);
  if (mine[0]) return mine[0];
  if (isDemoMode()) {
    const demo = readDemoPod();
    if (demo?.members.some((m) => m.userId === userId)) return (await loadPod(demo.id).catch(() => null)) ?? demo;
  }
  return null;
}

export async function requirePod(userId: string, podId?: string): Promise<Pod> {
  const pod = await resolvePod(userId, podId);
  if (!pod) throw new ToolError("No pod yet: call find_pod first.", "not_found");
  return pod;
}

export async function loadProgress(podId: string): Promise<ProjectProgress> {
  const stored = ProjectProgressZ.safeParse(await getStore().get<unknown>("pod_progress", podId).catch(() => null));
  return stored.success
    ? { ...stored.data, merged: [...stored.data.merged].sort((a, b) => a.issueIndex - b.issueIndex) }
    : { podId, merged: [] };
}

/** userId → first name for the pod's members. */
export async function memberNames(pod: Pick<Pod, "members">): Promise<Record<string, string>> {
  const store = getStore();
  const entries = await Promise.all(
    pod.members.map(async (m) => {
      const p = await store.get<Profile>("profiles", m.userId).catch(() => null);
      return [m.userId, firstNameOf(p?.name, m.userId)] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export interface CompactIssue {
  index: number; // 0-based (record_merged_pr's issueIndex)
  number: number; // 1-based, as on GitHub
  title: string;
  skillId: SkillId;
  assigneeUserId: string;
  assignee: string;
  reviewerUserId: string;
  reviewer: string;
  milestone: string;
  merged: boolean;
  url?: string;
}

export interface CompactPod {
  id: string;
  name: string;
  score: number;
  createdAt: string;
  members: { userId: string; name: string; role: string; learns: SkillId[]; teaches: SkillId[] }[];
  explanations: string[];
  project: { title: string; pitch: string; repoUrl?: string; milestones: string[]; issues: CompactIssue[]; merged: number; total: number } | null;
}

export async function compactPod(pod: Pod): Promise<CompactPod> {
  const [names, progress] = await Promise.all([memberNames(pod), loadProgress(pod.id)]);
  const nameOf = (id: string) => names[id] ?? capitalise(id);
  const merged = new Set(progress.merged.map((m) => m.issueIndex));
  const issues: CompactIssue[] = (pod.project?.issues ?? []).map((i, index) => ({
    index, number: index + 1, title: i.title, skillId: i.skillId,
    assigneeUserId: i.assigneeUserId, assignee: nameOf(i.assigneeUserId),
    reviewerUserId: i.reviewerUserId, reviewer: nameOf(i.reviewerUserId),
    milestone: i.milestone, merged: merged.has(index), ...(i.githubIssueUrl ? { url: i.githubIssueUrl } : {}),
  }));
  return {
    id: pod.id,
    name: pod.name,
    score: pod.score,
    createdAt: pod.createdAt,
    members: pod.members.map((m) => ({ userId: m.userId, name: nameOf(m.userId), role: m.role, learns: m.learns, teaches: m.teaches })),
    explanations: pod.explanations.map((e) => e.text),
    project: pod.project
      ? {
          title: pod.project.title, pitch: pod.project.pitch, ...(pod.project.repoUrl ? { repoUrl: pod.project.repoUrl } : {}),
          milestones: pod.project.milestones, issues, merged: issues.filter((i) => i.merged).length, total: issues.length,
        }
      : null,
  };
}

/** The viewer's next unmerged issue in the pod (their own assignment). */
export const nextIssueFor = (pod: CompactPod, userId: string): CompactIssue | undefined =>
  pod.project?.issues.find((i) => i.assigneeUserId === userId && !i.merged);

// ---------- proofs ----------

/** The user's newest evidence item (a merged pod PR, a certificate, …), or null. */
export async function latestEvidence(userId: string): Promise<EvidenceItem | null> {
  const rows = await getStore().list<EvidenceItem>("evidence", { userId }).catch(() => [] as EvidenceItem[]);
  const mine = rows.filter((e) => e?.userId === userId && typeof e.createdAt === "string");
  mine.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return mine[0] ?? null;
}
