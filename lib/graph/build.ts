// The Bridge Map (P2 Task 5): your degree, the job market and your proof, in one graph.
import "server-only";
import { getStore } from "@/lib/store";
import type {
  BridgeEdge, BridgeMap, BridgeNode, EvidenceItem, Level, Profile, Programme, RoleDemand, SkillId, TrendSeries,
} from "@/lib/types";
import {
  bridgemapFixture, getProfile, listEvidence, marketFixture, podFor, programmeFixture, skillMeta, studentSkillsSeed,
  trendsFixture,
} from "./data";
import { planRoadmap } from "./plan";
import { computeReadiness, projectNodes, round2, shiftReadiness } from "./readiness";
import { isTermDone, parseUpcomingLabel, termStart, upcomingLabel } from "./terms";

export { computeReadiness, readiness, projectedReadiness } from "./readiness";

export const NODE_CAP = 80;
export const ROLE_SKILL_CAP = 30;
const PROVEN_LEVEL = 2;
const PROVEN_CONFIDENCE = 0.6;

/** Used when the skills catalogue carries no prereqs for a skill (data/skills.json ships them empty). */
export const CURATED_PREREQS: Record<SkillId, SkillId[]> = {
  numpy: ["python"], pandas: ["python", "numpy"], "scikit-learn": ["python", "numpy"], pytorch: ["python", "numpy"],
  tensorflow: ["python"], "machine-learning": ["python", "statistics", "linear-algebra"],
  "deep-learning": ["machine-learning"], mlops: ["docker", "machine-learning"], docker: ["linux"],
  kubernetes: ["docker"], aws: ["linux"], "cloud-computing": ["linux"], "ci-cd": ["git", "testing"],
  "llm-apps": ["python", "rest-apis"], "llm-evaluation": ["llm-apps"], "vector-databases": ["llm-apps"],
  postgresql: ["sql"], sql: ["databases"], algorithms: ["data-structures"], "system-design": ["algorithms", "databases"],
  react: ["javascript", "html-css"], typescript: ["javascript"], nodejs: ["javascript"], "rest-apis": ["python"],
  "code-review": ["git"], "data-visualisation": ["pandas"],
};

const isProof = (e: Pick<EvidenceItem, "level" | "confidence">) => e.level >= PROVEN_LEVEL && e.confidence >= PROVEN_CONFIDENCE;
const maxLevel = (xs: number[]) => Math.max(0, ...xs) as Level;

function groupBy<T>(xs: T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return m;
}

function prereqEdges(nodes: BridgeNode[]): BridgeEdge[] {
  const ids = new Set(nodes.map((n) => n.skillId));
  const edges: BridgeEdge[] = [];
  for (const n of nodes) {
    const meta = skillMeta(n.skillId).prereqs;
    for (const p of meta.length ? meta : (CURATED_PREREQS[n.skillId] ?? [])) {
      if (p !== n.skillId && ids.has(p)) edges.push({ from: p, to: n.skillId, kind: "prereq" });
    }
  }
  return edges;
}

/** Builds the map from the programme, the role's job-ad demand, your evidence and the trends. Pure. */
export function buildBridgeMap(i: {
  profile: Profile; programme: Programme; roleDemand: RoleDemand; evidence: EvidenceItem[]; trends: TrendSeries[];
  now?: Date; podLearns?: SkillId[];
}): BridgeMap {
  const now = i.now ?? new Date();
  const roleSkills = [...i.roleDemand.skills].sort((a, b) => b.share - a.share).slice(0, ROLE_SKILL_CAP);
  const demand = new Map(roleSkills.map((s) => [s.skillId, s.share]));
  const roleTrend = new Map(roleSkills.map((s) => [s.skillId, s.trend]));
  const trendLabel = new Map(i.trends.map((t) => [t.skillId, t.label]));
  const evBySkill = groupBy(i.evidence.filter((e) => e.userId === i.profile.id || !e.userId), (e) => e.skillId);
  const modBySkill = new Map<SkillId, { module: Programme["modules"][number]; level: Level }[]>();
  for (const m of i.programme.modules) for (const s of m.skills) modBySkill.set(s.skillId, [...(modBySkill.get(s.skillId) ?? []), { module: m, level: s.level }]);

  const ids: SkillId[] = [];
  const add = (id: SkillId) => { if (!ids.includes(id)) ids.push(id); };
  roleSkills.forEach((s) => add(s.skillId));
  [...evBySkill.keys()].forEach(add);
  [...modBySkill.entries()].sort((a, b) => maxLevel(b[1].map((x) => x.level)) - maxLevel(a[1].map((x) => x.level))).forEach(([id]) => add(id));
  const kept = ids.slice(0, Math.max(NODE_CAP, roleSkills.length));

  const nodes: BridgeNode[] = kept.map((skillId) => {
    const meta = skillMeta(skillId);
    const ev = [...(evBySkill.get(skillId) ?? [])].sort((a, b) => b.level - a.level || b.confidence - a.confidence);
    const mods = modBySkill.get(skillId) ?? [];
    const done = mods.filter((x) => isTermDone(x.module, i.profile.startedAt, now));
    const upcoming = mods.filter((x) => !isTermDone(x.module, i.profile.startedAt, now))
      .sort((a, b) => termStart(a.module, i.profile.startedAt).getTime() - termStart(b.module, i.profile.startedAt).getTime());
    const status: BridgeNode["status"] = ev[0] && isProof(ev[0]) ? "proven" : done.length ? "degree-done" : upcoming.length ? "degree-upcoming" : "gap";
    const node: BridgeNode = {
      skillId, name: meta.name, category: meta.category, status,
      demand: demand.get(skillId) ?? 0,
      level: (ev[0]?.level ?? (status === "degree-done" ? maxLevel(done.map((x) => x.level)) : 0)) as Level,
      evidenceIds: ev.map((e) => e.id),
      moduleCodes: mods.map((x) => x.module.code),
    };
    const trend = trendLabel.get(skillId) ?? roleTrend.get(skillId);
    if (trend) node.trend = trend;
    if (status === "degree-upcoming" && upcoming[0]) node.upcomingLabel = upcomingLabel(upcoming[0].module);
    return node;
  });

  const edges = prereqEdges(nodes);
  const plan = planRoadmap({
    nodes, edges, startedAt: i.profile.startedAt, targetDate: i.profile.dna.targetDate, programme: i.programme,
    trends: i.trends, podLearns: i.podLearns, now,
  });
  return {
    userId: i.profile.id, roleId: i.roleDemand.roleId, nodes, edges,
    readinessNow: computeReadiness(nodes),
    readinessProjected: computeReadiness(projectNodes(nodes, plan.planned, plan.upcomingByTarget)),
    generatedAt: now.toISOString(),
  };
}

/**
 * Folds evidence into a map at read time: evidence ids and levels are added, and a node with proof (level ≥ 2 at
 * confidence ≥ 0.6) turns proven. Readiness moves by the formula's change. Evidence for a skill the map lacks adds
 * a proven node with demand 0 (it shows on the map but never changes readiness). Pure; never demotes a node.
 */
export function mergeEvidence(map: BridgeMap, evidence: EvidenceItem[]): BridgeMap {
  const mine = evidence.filter((e) => e && (!e.userId || e.userId === map.userId));
  if (!mine.length) return map;
  const bySkill = groupBy(mine, (e) => e.skillId);
  let changed = false;
  const nodes = map.nodes.map((n) => {
    const ev = bySkill.get(n.skillId);
    if (!ev) return n;
    const evidenceIds = [...new Set([...(n.evidenceIds ?? []), ...ev.map((e) => e.id)])];
    const level = maxLevel([n.level ?? 0, ...ev.map((e) => e.level)]);
    const status = n.status !== "proven" && ev.some(isProof) ? ("proven" as const) : n.status;
    if (status === n.status && level === n.level && evidenceIds.length === (n.evidenceIds ?? []).length) return n;
    changed = true;
    return { ...n, status, level, evidenceIds };
  });
  const known = new Set(map.nodes.map((n) => n.skillId));
  for (const [skillId, ev] of bySkill) {
    if (known.has(skillId) || !ev.some(isProof)) continue;
    const meta = skillMeta(skillId);
    nodes.push({
      skillId, name: meta.name, category: meta.category, status: "proven", demand: 0,
      level: maxLevel(ev.map((e) => e.level)), evidenceIds: ev.map((e) => e.id), moduleCodes: [],
    });
    changed = true;
  }
  if (!changed) return map;
  const readinessNow = shiftReadiness(map.readinessNow ?? computeReadiness(map.nodes), map.nodes, nodes);
  return { ...map, nodes, readinessNow, readinessProjected: Math.max(map.readinessProjected ?? 0, readinessNow) };
}

/**
 * A seeded student's map: the same skills as the demo map for the role (or the role's market demand), with
 * status from data/seed/student-skills.json. Degree statuses follow the student's own start date.
 */
export function deriveSeededMap(i: {
  userId: string; roleId: string; skills: { proven: SkillId[]; gaps: SkillId[] }; base: BridgeMap | null;
  roleDemand: RoleDemand | null; profile: Profile | null; now: Date;
}): BridgeMap | null {
  const proven = new Set(i.skills.proven);
  const gaps = new Set(i.skills.gaps);
  const startedAt = i.profile?.startedAt;
  let universe: BridgeNode[];
  if (i.base) universe = i.base.nodes.map((n) => ({ ...n, evidenceIds: [] }));
  else if (i.roleDemand) {
    universe = i.roleDemand.skills.slice(0, ROLE_SKILL_CAP).map((s) => {
      const meta = skillMeta(s.skillId);
      return { skillId: s.skillId, name: meta.name, category: meta.category, status: "gap" as const, demand: s.share, level: 0 as Level, evidenceIds: [], moduleCodes: [], ...(s.trend ? { trend: s.trend } : {}) };
    });
  } else return null;
  if (i.roleDemand) {
    const share = new Map(i.roleDemand.skills.map((s) => [s.skillId, s.share]));
    universe = universe.map((n) => ({ ...n, demand: share.get(n.skillId) ?? 0 }));
  }
  const ids = new Set(universe.map((n) => n.skillId));
  for (const id of [...proven, ...gaps]) {
    if (ids.has(id)) continue;
    const meta = skillMeta(id);
    universe.push({ skillId: id, name: meta.name, category: meta.category, status: "gap", demand: 0, level: 0, evidenceIds: [], moduleCodes: [] });
    ids.add(id);
  }
  const nodes: BridgeNode[] = universe.map((n) => {
    if (proven.has(n.skillId)) {
      const { upcomingLabel: _drop, ...rest } = n;
      void _drop;
      return { ...rest, status: "proven", level: Math.max(2, n.level) as Level };
    }
    if (gaps.has(n.skillId)) {
      const { upcomingLabel: _drop, ...rest } = n;
      void _drop;
      return { ...rest, status: "gap", level: 0 };
    }
    if (n.status === "degree-upcoming" && startedAt) {
      const term = parseUpcomingLabel(n.upcomingLabel);
      if (term && isTermDone(term, startedAt, i.now)) {
        const { upcomingLabel: _drop, ...rest } = n;
        void _drop;
        return { ...rest, status: "degree-done", level: Math.max(1, n.level) as Level };
      }
    }
    return n.status === "proven" ? { ...n, status: "gap", level: 0 } : n;
  });
  const edges = (i.base?.edges ?? prereqEdges(nodes)).filter((e) => ids.has(e.from) && ids.has(e.to));
  const readinessNow = computeReadiness(nodes);
  let readinessProjected = readinessNow;
  if (i.profile?.dna?.targetDate && startedAt) {
    const plan = planRoadmap({ nodes, edges, startedAt, targetDate: i.profile.dna.targetDate, now: i.now });
    readinessProjected = computeReadiness(projectNodes(nodes, plan.planned, plan.upcomingByTarget));
  }
  return { userId: i.userId, roleId: i.roleId, nodes, edges, readinessNow, readinessProjected: round2(Math.max(readinessNow, readinessProjected)), generatedAt: i.now.toISOString() };
}

const validMap = (m: unknown): m is BridgeMap =>
  !!m && typeof m === "object" && Array.isArray((m as BridgeMap).nodes) && (m as BridgeMap).nodes.length > 0 && Array.isArray((m as BridgeMap).edges);

/**
 * Pod evidence counts once its proof is recorded. While the proof loop is mid-run it applies the evidence to the
 * map itself (and measures readiness before → after), so folding it in early would erase that delta.
 */
async function committedEvidence(userId: string): Promise<EvidenceItem[]> {
  const all = await listEvidence(userId);
  if (!all.some((e) => e.source === "keystone-pod" && e.id.startsWith("ev_pod_"))) return all;
  let recorded: Set<string>;
  try {
    const proofs = await getStore().list<{ evidenceIds?: string[] }>("proofs");
    recorded = new Set(proofs.flatMap((p) => (Array.isArray(p?.evidenceIds) ? p.evidenceIds : [])));
  } catch {
    return all;
  }
  return all.filter((e) => !(e.source === "keystone-pod" && e.id.startsWith("ev_pod_")) || recorded.has(e.id));
}

async function buildFromInputs(userId: string, roleId: string, now: Date): Promise<BridgeMap | null> {
  const profile = await getProfile(userId);
  const programme = programmeFixture(profile?.programmeId);
  const roleDemand = marketFixture(roleId);
  if (!profile?.dna || !programme || !roleDemand) return null;
  const [evidence, pod] = await Promise.all([listEvidence(userId), podFor(userId)]);
  return buildBridgeMap({
    profile, programme, roleDemand, evidence, trends: trendsFixture() ?? [], now,
    podLearns: pod?.members.find((m) => m.userId === userId)?.learns,
  });
}

async function seededMap(userId: string, roleId: string, now: Date): Promise<BridgeMap | null> {
  const skills = studentSkillsSeed()[userId];
  if (!skills) return null;
  const base = bridgemapFixture("aisha", roleId);
  const roleDemand = marketFixture(roleId);
  return deriveSeededMap({ userId, roleId, skills, base, roleDemand, profile: await getProfile(userId), now });
}

/**
 * A user's Bridge Map for a role. Reads, in order: the store map `${userId}:${roleId}` (the proof loop writes
 * there, so merged pod PRs show up) → (DEMO_MODE) the curated fixture → for seeded students, a map derived from
 * their seed skills (their only proof: building from their empty evidence would mark proven skills as gaps) → a
 * map built from the programme and market fixtures plus evidence → the fixture. Store evidence (pod proofs,
 * micro-challenges, GitHub) is then merged in. Null if the user has no map.
 */
export async function loadGraph(userId: string, roleId: string): Promise<BridgeMap | null> {
  const now = new Date();
  let base: BridgeMap | null = null;
  try {
    const stored = await getStore().get<BridgeMap>("maps", `${userId}:${roleId}`);
    if (validMap(stored)) base = stored;
  } catch { /* store down: rebuild */ }
  if (!base && process.env.DEMO_MODE === "true") base = bridgemapFixture(userId, roleId);
  if (!base) base = await seededMap(userId, roleId, now).catch(() => null);
  if (!base) base = await buildFromInputs(userId, roleId, now).catch(() => null);
  if (!base) base = bridgemapFixture(userId, roleId);
  if (!base) return null;
  const evidence = await committedEvidence(userId).catch(() => [] as EvidenceItem[]);
  return mergeEvidence(base, evidence);
}
