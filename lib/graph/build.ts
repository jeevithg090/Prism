import "server-only";
import skillsJson from "@/data/skills.json";
import { getSkills } from "@/lib/agents/skillmap";
import { getRoleDemand } from "@/lib/agents/market";
import { extractProgramme } from "@/lib/agents/syllabus";
import { getTrends } from "@/lib/agents/trends";
import { getStore } from "@/lib/store";
import { readiness, projectedReadiness } from "@/lib/graph/readiness";
import type { BridgeMap, BridgeNode, EvidenceItem, Module, Profile, Programme, RoleDemand, Skill, SkillId, TrendSeries } from "@/lib/types";

const catalogue = skillsJson as Skill[];
const skillById = new Map(catalogue.map((skill) => [skill.id, skill]));
const round2 = (n: number) => Math.round(n * 100) / 100;

export function termStart(module: Module, startedAt: string): Date {
  const startYear = new Date(`${startedAt}T00:00:00`).getFullYear() + module.year - 1;
  const month = module.semester === "2" ? 0 : 8;
  const day = module.semester === "2" ? 26 : 22;
  return new Date(startYear, month, day);
}
export function termEnd(module: Module, startedAt: string): Date {
  const startYear = new Date(`${startedAt}T00:00:00`).getFullYear() + module.year - 1;
  if (module.semester === "1") return new Date(startYear + 1, 0, 23);
  if (module.semester === "2") return new Date(startYear, 5, 12);
  return new Date(startYear + 1, 5, 12);
}
const labelFor = (module: Module) => `Year ${module.year} · ${module.semester === "full-year" ? "Full year" : `Semester ${module.semester}`}`;

export function buildBridgeMap(input: { profile: Profile; programme: Programme; roleDemand: RoleDemand; evidence: EvidenceItem[]; trends: TrendSeries[]; now?: Date }): BridgeMap {
  const { profile, programme, roleDemand, evidence, trends } = input;
  const now = input.now ?? new Date();
  const role = roleDemand.skills.slice(0, 30);
  const demand = new Map(role.map((item) => [item.skillId, item.share]));
  const evidenceIds = [...new Set(evidence.map((item) => item.skillId))];
  const moduleSkills = [...new Set(programme.modules.flatMap((module) => module.skills.map((item) => item.skillId)))];
  const ordered = [...new Set([...role.map((item) => item.skillId), ...evidenceIds, ...moduleSkills])];
  const ids = ordered.slice(0, Math.max(80, role.length));
  const trendById = new Map(trends.map((trend) => [trend.skillId, trend]));
  const nodes: BridgeNode[] = ids.map((skillId) => {
    const skill = skillById.get(skillId) ?? getSkills().find((candidate) => candidate.id === skillId);
    const skillEvidence = evidence.filter((item) => item.skillId === skillId).sort((a, b) => b.level - a.level || b.confidence - a.confidence);
    const modules = programme.modules.filter((module) => module.skills.some((item) => item.skillId === skillId));
    const done = modules.filter((module) => termEnd(module, profile.startedAt) < now).sort((a, b) => termEnd(b, profile.startedAt).getTime() - termEnd(a, profile.startedAt).getTime());
    const upcoming = modules.filter((module) => termEnd(module, profile.startedAt) >= now).sort((a, b) => termStart(a, profile.startedAt).getTime() - termStart(b, profile.startedAt).getTime());
    const maxEv = skillEvidence[0];
    const status: BridgeNode["status"] = maxEv && maxEv.level >= 2 && maxEv.confidence >= 0.6 ? "proven" : done.length ? "degree-done" : upcoming.length ? "degree-upcoming" : "gap";
    const moduleLevel = done.length ? Math.max(...done.map((module) => module.skills.find((item) => item.skillId === skillId)?.level ?? 0)) : 0;
    const trend = trendById.get(skillId);
    return {
      skillId, name: skill?.name ?? skillId, category: skill?.category ?? "practice", status,
      demand: demand.get(skillId) ?? 0, trend: trend?.label ?? role.find((item) => item.skillId === skillId)?.trend,
      level: maxEv?.level ?? (status === "degree-done" ? moduleLevel as BridgeNode["level"] : 0),
      evidenceIds: skillEvidence.map((item) => item.id), moduleCodes: modules.map((module) => module.code),
      ...(status === "degree-upcoming" && upcoming[0] ? { upcomingLabel: labelFor(upcoming[0]) } : {}),
    };
  });
  const nodeIds = new Set(nodes.map((node) => node.skillId));
  const edges: BridgeMap["edges"] = [];
  for (const node of nodes) for (const prereq of skillById.get(node.skillId)?.prereqs ?? []) {
    if (nodeIds.has(prereq)) edges.push({ from: prereq, to: node.skillId, kind: "prereq" });
  }
  const beforeTarget = new Date(`${profile.dna.targetDate}T23:59:59`);
  const upcomingByTarget = nodes.filter((node) => node.status === "degree-upcoming" && programme.modules.some((module) => module.skills.some((item) => item.skillId === node.skillId) && termEnd(module, profile.startedAt) < beforeTarget)).map((node) => node.skillId);
  const capacity = Math.max(0, Math.min(52, Math.ceil((beforeTarget.getTime() - now.getTime()) / (7 * 86400000)))) * profile.dna.hoursPerWeek;
  const planned = nodes.filter((node) => node.status === "gap" && node.demand > 0).sort((a, b) => b.demand - a.demand).slice(0, Math.floor(capacity / 8)).map((node) => node.skillId);
  return {
    userId: profile.id, roleId: roleDemand.roleId, nodes, edges,
    readinessNow: readiness(nodes), readinessProjected: projectedReadiness(nodes, planned, upcomingByTarget), generatedAt: now.toISOString(),
  };
}

export async function loadGraph(userId: string, roleId: string, options: { runId?: string } = {}): Promise<BridgeMap | null> {
  const store = getStore();
  const profile = await store.get<Profile>("profiles", userId);
  if (!profile) return null;
  if ((process.env.NODE_ENV === "test" || process.env.DEMO_MODE === "true") && userId === "aisha" && roleId === "ml-engineer") {
    const fixture = await import("@/data/fixtures/bridgemap.aisha.ml-engineer.json");
    return fixture.default as BridgeMap;
  }
  const [programme, roleDemand, evidence, trends] = await Promise.all([
    extractProgramme({ programmeId: profile.programmeId, runId: options.runId }),
    getRoleDemand(roleId, { runId: options.runId }),
    store.list<EvidenceItem>("evidence", { userId }), getTrends(),
  ]);
  const map = buildBridgeMap({ profile, programme, roleDemand, evidence, trends });
  await store.upsert("maps", `${userId}:${roleId}`, map as BridgeMap & { id?: string }, userId);
  return map;
}
