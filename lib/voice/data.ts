import "server-only";
// P4 · Read-only loaders shared by the interview, briefing and voice-tool routes.
// Teammates' data may not exist on every branch, so every read is guarded: store first, then the fixture
// file by path, then a deterministic fallback that matches Aisha's demo story.
import fs from "node:fs";
import path from "node:path";
import { getStore } from "@/lib/store";
import { skillName } from "@/lib/schemas/community";
import type { BridgeMap, EvidenceItem, Pod, Profile, RoleDemand, Roadmap, RoadmapWeek, TrendSeries } from "@/lib/types";

export const DEFAULT_USER = "aisha";
export const DEFAULT_ROLE = "ml-engineer";
export const FALLBACK_PR_TITLE = "Containerise the captioning API with Docker";

const ROLE_NAMES: Record<string, string> = {
  "ml-engineer": "ML engineer",
  "software-engineer": "Software engineer",
  "data-analyst": "Data analyst",
};
export function roleName(roleId: string): string {
  return ROLE_NAMES[roleId] ?? roleId.split("-").map((w, i) => (i === 0 ? w[0]?.toUpperCase() + w.slice(1) : w)).join(" ");
}

export function readJSON<T>(rel: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), "utf8")) as T;
  } catch {
    return null;
  }
}

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
export const firstName = (p: Pick<Profile, "name"> | null | undefined, id: string) => p?.name?.split(" ")[0] || cap(id);

export async function loadProfile(userId: string): Promise<Profile | null> {
  const stored = await safe(getStore().get<Profile>("profiles", userId), null);
  if (stored) return stored;
  const fx = readJSON<Profile>(`data/fixtures/profile.${userId}.json`);
  return fx?.id === userId ? fx : null;
}

export async function loadMap(userId: string, roleId: string): Promise<BridgeMap | null> {
  const stored = await safe(getStore().get<BridgeMap>("maps", `${userId}:${roleId}`), null);
  if (stored && Array.isArray(stored.nodes)) return stored;
  const fx = readJSON<BridgeMap>(`data/fixtures/bridgemap.${userId}.${roleId}.json`);
  return fx && Array.isArray(fx.nodes) ? fx : null;
}

export interface RoleSkill { skillId: string; name: string; share: number }

/** The role's most-demanded skills: P1's market fixture if present, else the Bridge Map's demand weights. */
export async function roleTopSkills(roleId: string, userId = DEFAULT_USER, limit = 5): Promise<RoleSkill[]> {
  const market = readJSON<RoleDemand>(`data/fixtures/market.${roleId}.json`);
  if (market && Array.isArray(market.skills) && market.skills.length) {
    return [...market.skills].sort((a, b) => b.share - a.share).slice(0, limit)
      .map((s) => ({ skillId: s.skillId, name: skillName(s.skillId), share: s.share }));
  }
  const map = await loadMap(userId, roleId);
  return (map?.nodes ?? []).filter((n) => n.demand > 0).sort((a, b) => b.demand - a.demand).slice(0, limit)
    .map((n) => ({ skillId: n.skillId, name: n.name || skillName(n.skillId), share: n.demand }));
}

export interface SkillSplit { proven: RoleSkill[]; gaps: RoleSkill[] }

/** Top proven skills and top gaps on the user's Bridge Map, by demand. */
export async function provenAndGaps(userId: string, roleId: string, limit = 3): Promise<SkillSplit> {
  const map = await loadMap(userId, roleId);
  const nodes = [...(map?.nodes ?? [])].sort((a, b) => b.demand - a.demand);
  const pick = (status: string) => nodes.filter((n) => n.status === status).slice(0, limit)
    .map((n) => ({ skillId: n.skillId, name: n.name || skillName(n.skillId), share: n.demand }));
  return { proven: pick("proven"), gaps: pick("gap") };
}

export interface CurrentWeek { week: number; focusSkillId: string; focusName: string; tasks: string[]; proof: string; startDate?: string }

/** The roadmap's current week (the first week whose tasks aren't all done). */
export async function currentRoadmapWeek(userId: string, roleId: string): Promise<CurrentWeek> {
  const stored = await safe(getStore().get<Roadmap>("roadmaps", userId), null);
  const roadmap = stored && Array.isArray(stored.weeks) ? stored : readJSON<Roadmap>(`data/fixtures/roadmap.${userId}.${roleId}.json`);
  const weeks: RoadmapWeek[] = Array.isArray(roadmap?.weeks) ? roadmap.weeks : [];
  const wk = weeks.find((w) => !(w.tasks?.length && w.tasks.every((t) => t.done))) ?? weeks[0];
  if (wk) {
    return {
      week: wk.week, focusSkillId: wk.focusSkillId, focusName: skillName(wk.focusSkillId),
      tasks: (wk.tasks ?? []).filter((t) => !t.done).slice(0, 3).map((t) => t.title), proof: wk.proof, startDate: wk.startDate,
    };
  }
  return {
    week: 1, focusSkillId: "docker", focusName: "Docker",
    tasks: ["Watch a 20-minute Docker basics primer", "Write a Dockerfile for a small Flask app", "Open your pod PR: Containerise the captioning API"],
    proof: "A merged pod PR: Containerise the captioning API with Docker",
  };
}

export async function podsFor(userId: string): Promise<Pod[]> {
  const pods = (await safe(getStore().list<Pod>("pods"), [] as Pod[])).filter((p) => p?.members?.some((m) => m.userId === userId));
  const fx = readJSON<Pod>("data/fixtures/pod.aisha.json");
  if (fx?.members?.some((m) => m.userId === userId) && !pods.some((p) => p.id === fx.id)) pods.push(fx);
  return pods;
}

export interface PodWork {
  podId?: string; podName?: string; projectTitle?: string;
  issueTitle: string; skillId: string; skillName: string;
  reviewerId?: string; reviewerName?: string;
  merged: boolean; prUrl?: string; mergedAt?: string; mergedCount: number;
}

type Merged = { issueIndex: number; userId: string; skillId: string; mergedAt: string; prUrl?: string };

/**
 * The pod work the interview asks about: the user's latest merged pod PR (pod_progress, then keystone-pod
 * evidence), else the pod issue they're working on, else the demo story's Docker issue.
 */
export async function latestPodWork(userId: string): Promise<PodWork> {
  const store = getStore();
  const pods = await podsFor(userId);
  const merged: { pod: Pod; m: Merged }[] = [];
  let mergedCount = 0;
  for (const pod of pods) {
    const prog = await safe(store.get<{ merged?: Merged[] }>("pod_progress", pod.id), null);
    const all = Array.isArray(prog?.merged) ? prog.merged : [];
    mergedCount += all.length;
    for (const m of all) if (m?.userId === userId) merged.push({ pod, m });
  }
  const reviewer = async (id?: string) => (id ? firstName(await loadProfile(id), id) : undefined);

  merged.sort((a, b) => (b.m.mergedAt ?? "").localeCompare(a.m.mergedAt ?? ""));
  const top = merged[0];
  if (top) {
    const issue = top.pod.project?.issues?.[top.m.issueIndex];
    const skillId = issue?.skillId ?? top.m.skillId;
    return {
      podId: top.pod.id, podName: top.pod.name, projectTitle: top.pod.project?.title,
      issueTitle: issue?.title ?? `${skillName(skillId)} pull request`, skillId, skillName: skillName(skillId),
      reviewerId: issue?.reviewerUserId, reviewerName: await reviewer(issue?.reviewerUserId),
      merged: true, prUrl: top.m.prUrl, mergedAt: top.m.mergedAt, mergedCount,
    };
  }

  const evidence = (await safe(store.list<EvidenceItem>("evidence", { userId }), [] as EvidenceItem[]))
    .filter((e) => e?.source === "keystone-pod" && e.userId === userId && e.skillId !== "code-review")
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  const pod = pods[0];
  if (evidence[0]) {
    const e = evidence[0];
    const title = e.quote?.match(/Merged '([^']+)'/)?.[1];
    const issue = pod?.project?.issues?.find((i) => i.title === title);
    return {
      podId: pod?.id, podName: pod?.name, projectTitle: pod?.project?.title,
      issueTitle: title ?? `${skillName(e.skillId)} pull request`, skillId: e.skillId, skillName: skillName(e.skillId),
      reviewerId: issue?.reviewerUserId, reviewerName: await reviewer(issue?.reviewerUserId),
      merged: true, prUrl: e.url || undefined, mergedAt: e.createdAt, mergedCount,
    };
  }

  const mine = pod?.project?.issues?.find((i) => i.assigneeUserId === userId);
  if (pod && mine) {
    return {
      podId: pod.id, podName: pod.name, projectTitle: pod.project?.title,
      issueTitle: mine.title, skillId: mine.skillId, skillName: skillName(mine.skillId),
      reviewerId: mine.reviewerUserId, reviewerName: await reviewer(mine.reviewerUserId),
      merged: false, prUrl: mine.githubIssueUrl, mergedCount,
    };
  }
  return { issueTitle: FALLBACK_PR_TITLE, skillId: "docker", skillName: "Docker", merged: false, mergedCount };
}

/** Momentum change vs the user's usual week (latest MomentumWeek), if known. */
export async function momentumChange(userId: string): Promise<number | null> {
  try {
    const { loadMomentumWeeks } = await import("@/components/momentum/server");
    const weeks = await loadMomentumWeeks(userId);
    const last = weeks[weeks.length - 1];
    return typeof last?.changePct === "number" ? last.changePct : null;
  } catch {
    const fx = readJSON<{ userId: string; changePct: number }[]>(`data/fixtures/momentum.${userId}.json`);
    const last = Array.isArray(fx) ? fx[fx.length - 1] : undefined;
    return typeof last?.changePct === "number" ? last.changePct : null;
  }
}

/** 1–2 market moves for the role, with their numbers (P1's trends fixture, else demand shares). */
export async function marketMoves(roleId: string, userId: string, limit = 2): Promise<string[]> {
  const top = await roleTopSkills(roleId, userId, 8);
  const role = roleName(roleId);
  const trends = readJSON<TrendSeries[]>("data/fixtures/trends.json");
  if (Array.isArray(trends) && trends.length) {
    const ids = new Set(top.map((s) => s.skillId));
    const moving = trends.filter((t) => ids.has(t.skillId) || t.label === "rising")
      .sort((a, b) => Math.abs(b.growthPerYear) - Math.abs(a.growthPerYear)).slice(0, limit);
    if (moving.length) {
      return moving.map((t) => {
        const g = Math.round(t.growthPerYear * 100);
        return g === 0 ? `${skillName(t.skillId)} steady in hiring threads` : `${skillName(t.skillId)} ${g > 0 ? "up" : "down"} ${Math.abs(g)}% a year`;
      });
    }
  }
  const map = await loadMap(userId, roleId);
  const rising = (map?.nodes ?? []).filter((n) => n.trend === "rising" && n.demand > 0).sort((a, b) => b.demand - a.demand);
  if (rising.length) {
    return rising.slice(0, limit).map((n) => `${n.name || skillName(n.skillId)} is rising, in ${Math.round(n.demand * 100)}% of ${role} ads`);
  }
  return top.slice(0, limit).map((s) => `${s.name} in ${Math.round(s.share * 100)}% of ${role} ads`);
}
