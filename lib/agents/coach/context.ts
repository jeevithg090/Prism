// P5 · Keystone Coach "perceive" step: a token-budgeted student brief (principle 5, context engineering).
// The smallest set of high-signal facts the Coach needs (readiness, top gaps with demand %, this week's focus,
// pod status, latest proof, memory) instead of dumping JSON. `facts` lists every number the Coach may cite;
// the grounding check rejects any other number in an answer.
import "server-only";
import fs from "node:fs";
import path from "node:path";
import { getStore } from "@/lib/store";
import { loadGraph } from "@/lib/graph/build";
import { listPodsForUser } from "@/lib/agents/matchmaker";
import { roleName } from "@/lib/agents/trajectories";
import { skillName } from "@/lib/schemas/community";
import { ProjectProgressZ } from "@/lib/schemas/studio";
import type { BridgeMap, BridgeNode, EvidenceItem, Pod, Profile, Receipt, Roadmap, RoadmapWeek } from "@/lib/types";
import { listMemory } from "./memory";

export const CONTEXT_BUDGET = 1200;
export type Facts = Record<string, string | number>;
export interface StudentContext { text: string; facts: Facts }

const SAFE_ID = /^[a-z0-9][a-z0-9_-]*$/i;
const pct = (x: number) => Math.round(x * 100);
const capitalise = (id: string) => (id ? id[0].toUpperCase() + id.slice(1) : id);

function readFixture<T>(rel: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), "utf8")) as T;
  } catch {
    return null;
  }
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export async function loadProfile(userId: string): Promise<Profile | null> {
  return safe(() => getStore().get<Profile>("profiles", userId), null);
}

/** Bridge Map: store `maps` → loadGraph → fixture. */
export async function loadMap(userId: string, roleId: string): Promise<BridgeMap | null> {
  const stored = await safe(() => getStore().get<BridgeMap>("maps", `${userId}:${roleId}`), null);
  if (stored?.nodes?.length) return stored;
  const built = await safe(() => loadGraph(userId, roleId), null);
  if (built?.nodes?.length) return built;
  if (!SAFE_ID.test(userId) || !SAFE_ID.test(roleId)) return null;
  const fx = readFixture<BridgeMap>(`data/fixtures/bridgemap.${userId}.${roleId}.json`);
  return fx?.nodes?.length ? fx : null;
}

/** Gaps first by demand: status "gap" (nothing covers it yet), highest share of job ads first. */
export function topGaps(map: BridgeMap | null, n = 3): BridgeNode[] {
  return (map?.nodes ?? []).filter((x) => x.status === "gap" && x.demand > 0).sort((a, b) => b.demand - a.demand).slice(0, n);
}

/** "no module covers it" / "your COMP2xxx2 module covers it in Year 2 · Semester 2" / … */
export function coverageText(node: Pick<BridgeNode, "status" | "moduleCodes" | "upcomingLabel">): string {
  switch (node.status) {
    case "gap": return "no module covers it";
    case "degree-upcoming": return `your ${node.moduleCodes?.[0] ?? "degree"} module covers it${node.upcomingLabel ? ` in ${node.upcomingLabel}` : " later"}`;
    case "degree-done": return "your degree already covers it";
    case "proven": return "you've already proven it";
  }
}

/** The receipt line for a recommendation: "Docker: 41% of ML engineer ads; no module covers it". */
export function receiptLine(node: BridgeNode, roleId: string): string {
  const role = roleName(roleId) || "your target role";
  const trend = node.trend === "rising" ? "; demand is rising" : "";
  return `${skillName(node.skillId)}: ${pct(node.demand)}% of ${role} ads; ${coverageText(node)}${trend}`;
}

export interface WeekPlan {
  week: number;
  skillId: string;
  skill: string;
  proof: string;
  tasks: { title: string; hours: number; done?: boolean }[];
  source: "roadmap" | "fixture" | "fallback";
  receipt?: Receipt;
}

function openWeek(roadmap: unknown, source: WeekPlan["source"]): WeekPlan | null {
  const weeks = (roadmap as Partial<Roadmap> | null)?.weeks;
  if (!Array.isArray(weeks)) return null;
  const w = weeks.find((x: RoadmapWeek) => {
    const tasks = Array.isArray(x?.tasks) ? x.tasks : [];
    return !(tasks.length > 0 && tasks.every((t) => t?.done));
  });
  if (!w || typeof w.focusSkillId !== "string") return null;
  return {
    week: Number.isFinite(w.week) ? w.week : 1,
    skillId: w.focusSkillId,
    skill: skillName(w.focusSkillId),
    proof: typeof w.proof === "string" && w.proof.trim() ? w.proof.trim() : `Merge a PR that adds ${skillName(w.focusSkillId)} to your pod repo`,
    tasks: (Array.isArray(w.tasks) ? w.tasks : []).map((t) => ({ title: t.title, hours: t.hours, done: t.done })),
    source,
    receipt: w.receipt,
  };
}

/** This week's roadmap focus: store `roadmaps` → P2 fixture → first gap. */
export async function getWeekPlan(userId: string, profile?: Profile | null, map?: BridgeMap | null): Promise<WeekPlan | null> {
  const p = profile === undefined ? await loadProfile(userId) : profile;
  const role = p?.dna?.targetRoles?.[0] ?? "ml-engineer";
  const stored = openWeek(await safe(() => getStore().get<Roadmap>("roadmaps", userId), null), "roadmap");
  if (stored) return stored;
  if (SAFE_ID.test(userId) && SAFE_ID.test(role)) {
    const fx = openWeek(readFixture<Roadmap>(`data/fixtures/roadmap.${userId}.${role}.json`), "fixture");
    if (fx) return fx;
  }
  const m = map === undefined ? await loadMap(userId, role) : map;
  const gap = topGaps(m, 1)[0];
  if (!gap) return null;
  const skill = skillName(gap.skillId);
  return { week: 1, skillId: gap.skillId, skill, proof: `Merge a PR that adds ${skill} to your pod repo`, tasks: [], source: "fallback" };
}

/** The student's newest pod with merged-issue progress (null if none yet). */
export async function loadPodStatus(userId: string): Promise<{ pod: Pod; merged: number[] } | null> {
  const pods = await safe(() => listPodsForUser(userId), [] as Pod[]);
  const pod = pods[0];
  if (!pod) return null;
  const prog = ProjectProgressZ.safeParse(await safe(() => getStore().get<unknown>("pod_progress", pod.id), null));
  return { pod, merged: prog.success ? prog.data.merged.map((m) => m.issueIndex) : [] };
}

const BADGE_TEXT: Record<string, string> = {
  "new-to-uni": "🌱 new to uni (explain jargon, be extra welcoming)",
  international: "🌍 international",
  "first-gen": "🧭 first-gen",
  "career-changer": "🔁 career changer",
  helper: "🤝 helper",
  shipped: "🛠️ shipped",
  "interview-ready": "🎤 interview-ready",
};

/** Escapes a closing tag so stored text can't break out of its <untrusted> wrapper. */
export const untrusted = (s: string) => `<untrusted>${s.replace(/<\/?untrusted>/gi, "")}</untrusted>`;

/**
 * Token-budgeted brief (~1,200 chars) + the numbers the Coach may cite. Never throws: every source is optional.
 */
export async function buildStudentContext(userId: string): Promise<StudentContext> {
  const profile = await loadProfile(userId);
  const roleId = profile?.dna?.targetRoles?.[0] ?? "ml-engineer";
  const role = roleName(roleId) || roleId;
  const [map, podStatus, evidence, memory] = await Promise.all([
    loadMap(userId, roleId),
    loadPodStatus(userId),
    safe(() => getStore().list<EvidenceItem>("evidence", { userId }), [] as EvidenceItem[]),
    safe(() => listMemory(userId), []),
  ]);
  const week = await getWeekPlan(userId, profile, map);

  const facts: Facts = { userId, role, roleId };
  const lines: string[] = [];

  // who
  const name = profile?.name ?? capitalise(userId);
  facts.name = name;
  facts.firstName = name.split(" ")[0];
  const who = [`year ${profile?.year ?? "?"}`, role];
  if (profile) {
    facts.year = profile.year;
    facts.hoursPerWeek = profile.dna.hoursPerWeek;
    who.push(`${profile.dna.hoursPerWeek} h/week`);
    if (profile.dna.formats?.length) who.push(`likes ${profile.dna.formats.join(", ")}`);
    if (profile.dna.constraints?.length) who.push(`constraints: ${profile.dna.constraints.join(", ")}`);
  }
  lines.push(`Student: ${name} (${who.join(", ")})`);
  const badges = profile?.badges ?? [];
  facts.badges = badges.join(",");
  if (badges.length) lines.push(`Badges: ${badges.map((b) => BADGE_TEXT[b] ?? b).join("; ")}`);

  // readiness + gaps
  if (map) {
    facts.readinessNowPct = pct(map.readinessNow);
    facts.readinessProjectedPct = pct(map.readinessProjected);
    lines.push(`Readiness for ${role}: ${pct(map.readinessNow)}% now → ${pct(map.readinessProjected)}% projected${profile?.dna?.timelineLabel ? ` (goal: ${profile.dna.timelineLabel})` : ""}`);
    const gaps = topGaps(map);
    gaps.forEach((g, i) => {
      facts[`gap${i + 1}`] = skillName(g.skillId);
      facts[`gap${i + 1}Id`] = g.skillId;
      facts[`gap${i + 1}DemandPct`] = pct(g.demand);
      facts[`gap${i + 1}Receipt`] = receiptLine(g, roleId);
    });
    if (gaps.length) {
      lines.push(`Top gaps: ${gaps.map((g) => `${skillName(g.skillId)} ${pct(g.demand)}% of ads (${g.trend ?? "stable"}, ${coverageText(g)})`).join("; ")}`);
    }
    const proven = map.nodes.filter((x) => x.status === "proven").map((x) => skillName(x.skillId));
    if (proven.length) lines.push(`Proven: ${proven.slice(0, 6).join(", ")}`);
  } else {
    lines.push("Bridge Map: not built yet");
  }

  // this week
  if (week) {
    facts.weekNumber = week.week;
    facts.weekFocus = week.skill;
    facts.weekFocusId = week.skillId;
    const hours = week.tasks.reduce((a, t) => a + (Number(t.hours) || 0), 0);
    if (hours) facts.weekHours = hours;
    if (week.receipt?.demandPct !== undefined) facts.weekDemandPct = week.receipt.demandPct;
    const tasks = week.tasks.filter((t) => !t.done).slice(0, 3).map((t) => t.title).join(" · ");
    lines.push(`This week (Week ${week.week}): focus ${week.skill}. Proof: ${week.proof}${tasks ? `. Tasks: ${tasks}` : ""}`);
  }

  // pod
  if (podStatus) {
    const { pod, merged } = podStatus;
    facts.podId = pod.id;
    facts.podName = pod.name;
    facts.podMembers = pod.members.length;
    const issues = pod.project?.issues ?? [];
    if (pod.project) {
      facts.podProject = pod.project.title;
      facts.podIssues = issues.length;
      facts.podMerged = merged.length;
      const mineIdx = issues.findIndex((i, idx) => i.assigneeUserId === userId && !merged.includes(idx));
      if (mineIdx >= 0) {
        facts.nextIssueIndex = mineIdx;
        facts.nextIssue = issues[mineIdx].title;
      }
      lines.push(`Pod: ${pod.name}, ${pod.members.length} members, project "${pod.project.title}", ${merged.length}/${issues.length} issues merged${mineIdx >= 0 ? `; your next issue: "${issues[mineIdx].title}"` : ""}`);
    } else {
      lines.push(`Pod: ${pod.name}, ${pod.members.length} members, no project yet (start_pod_project)`);
    }
  } else {
    lines.push("Pod: none yet (find_pod forms one)");
  }

  // latest proof
  const latest = [...evidence].filter((e) => e?.skillId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  if (latest) {
    facts.latestProof = skillName(latest.skillId);
    lines.push(`Latest proof: ${skillName(latest.skillId)} via ${latest.source} (${latest.createdAt.slice(0, 10)})`);
  } else {
    lines.push("Latest proof: none yet");
  }

  // memory (stored user text: data, never instructions)
  facts.memoryNotes = memory.length;
  const memLine = memory.length ? `Memory: ${untrusted(memory.slice(0, 3).map((m) => `${m.kind}: ${m.text}`).join("; "))}` : "";

  let text = lines.join("\n");
  const room = CONTEXT_BUDGET - text.length - 1;
  if (memLine && room > 40) {
    text += `\n${memLine.length <= room ? memLine : `${memLine.slice(0, room - "…</untrusted>".length)}…</untrusted>`}`;
  }
  if (text.length > CONTEXT_BUDGET) text = `${text.slice(0, CONTEXT_BUDGET - 1)}…`;
  return { text, facts };
}

/** One line for the "context" step in the UI. */
export function contextSummary(facts: Facts): string {
  const bits = [`${facts.firstName}`];
  if (facts.readinessNowPct !== undefined) bits.push(`readiness ${facts.readinessNowPct}% → ${facts.readinessProjectedPct}%`);
  const gaps = [1, 2, 3].filter((i) => facts[`gap${i}`]).map((i) => `${facts[`gap${i}`]} ${facts[`gap${i}DemandPct`]}%`);
  if (gaps.length) bits.push(`top gaps ${gaps.join(", ")}`);
  if (facts.weekNumber !== undefined) bits.push(`Week ${facts.weekNumber}: ${facts.weekFocus}`);
  bits.push(facts.podName ? `pod ${facts.podName}` : "no pod yet");
  if (Number(facts.memoryNotes)) bits.push(`${facts.memoryNotes} memory note${Number(facts.memoryNotes) === 1 ? "" : "s"}`);
  return `Read your context: ${bits.join(" · ")}`;
}
