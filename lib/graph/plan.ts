// The deterministic part of the Roadmap Agent (P2 Task 6): rank gaps, decide what the degree covers,
// and pick one focus skill per week. Pure; shared by the map builder (projected readiness) and the roadmap.
import type { BridgeEdge, BridgeNode, Module, Programme, SkillId, TrendSeries } from "@/lib/types";
import { addDays, isExamWeek, nextMonday, parseUpcomingLabel, termEnd, termStart, upcomingLabel, type TermRef } from "./terms";

export const PLAN_WEEKS = 12;
/** A degree-upcoming skill whose module ends after your target date still counts, at 0.3× priority. */
export const COVERED_LATER_FACTOR = 0.3;
export const PREREQ_NOT_READY = 0.6;
/** Cooling skills wait: half priority for a declining trend. */
export const DECLINING_FACTOR = 0.5;

export interface ModuleRef { code: string; title?: string; term: TermRef | null }

export interface RankedSkill {
  node: BridgeNode;
  priority: number;
  growth: number;
  coveredLater: boolean;
  prereqReady: boolean;
  module?: ModuleRef;
}

export interface PlannedSkip {
  skillId: SkillId;
  name: string;
  module: ModuleRef;
  label: string;
  termStart: Date | null;
  message: string;
}

export interface PlanWeek { week: number; start: Date; isExamWeek: boolean; focus: RankedSkill; repeat: boolean }

export interface Plan {
  candidates: number;
  ranked: RankedSkill[];
  skipped: PlannedSkip[];
  weeks: PlanWeek[];
  /** Degree-upcoming skills taught before the target date (they count as degree-done by then). */
  upcomingByTarget: SkillId[];
  /** Focus skills, in week order, without repeats. */
  planned: SkillId[];
}

export interface PlanInput {
  nodes: BridgeNode[];
  edges: BridgeEdge[];
  startedAt: string;
  targetDate: string;
  programme?: Programme | null;
  trends?: TrendSeries[] | null;
  /** Skills someone in your pod teaches you: the pod stands in for a missing prerequisite. */
  podLearns?: SkillId[];
  now: Date;
  weeks?: number;
}

function modulesFor(node: BridgeNode, programme?: Programme | null): ModuleRef[] {
  const fromProgramme = (programme?.modules ?? []).filter(
    (m: Module) => node.moduleCodes.includes(m.code) || m.skills.some((s) => s.skillId === node.skillId),
  );
  if (fromProgramme.length) return fromProgramme.map((m) => ({ code: m.code, title: m.title, term: { year: m.year, semester: m.semester } }));
  const term = parseUpcomingLabel(node.upcomingLabel);
  return node.moduleCodes.map((code) => ({ code, term }));
}

/** The module that teaches this skill soonest (by term end), if any. */
export function teachingModule(node: BridgeNode, startedAt: string, programme?: Programme | null): ModuleRef | undefined {
  const mods = modulesFor(node, programme);
  const end = (m: ModuleRef) => (m.term ? termEnd(m.term, startedAt).getTime() : Number.POSITIVE_INFINITY);
  return [...mods].sort((a, b) => end(a) - end(b))[0];
}

export function moduleName(m: ModuleRef): string {
  return m.title ? `${m.title} (${m.code})` : m.code;
}

export function growthOf(skillId: SkillId, trends?: TrendSeries[] | null): number | undefined {
  return trends?.find((t) => t.skillId === skillId)?.growthPerYear;
}

/** Lower-cases plain names mid-sentence ("Linear algebra" → "linear algebra"), keeps "PyTorch", "SQL". */
const PROPER = new Set(["Linux", "Docker", "Python", "Java", "Git", "Kubernetes", "React"]);
export function lowerName(name: string): string {
  return /^[A-Z][a-z\s&-]*$/.test(name) && !PROPER.has(name) ? name[0].toLowerCase() + name.slice(1) : name;
}

/** "Don't pay for a statistics course: Maths 2 (COMP1xxx4) covers it in Year 1 · Semester 2." */
export function skipMessage(name: string, m: ModuleRef, label: string): string {
  const by = m.title ? `${m.title} (${m.code}) covers it in ${label}` : `your ${label} module (${m.code}) covers it`;
  return `Don't pay for a ${lowerName(name)} course: ${by}.`;
}

export function planRoadmap(i: PlanInput): Plan {
  const target = new Date(i.targetDate).getTime();
  const nWeeks = i.weeks ?? PLAN_WEEKS;
  const prereqsOf = new Map<SkillId, SkillId[]>();
  for (const e of i.edges) if (e.kind === "prereq") prereqsOf.set(e.to, [...(prereqsOf.get(e.to) ?? []), e.from]);
  const byId = new Map(i.nodes.map((n) => [n.skillId, n]));
  const podLearns = new Set(i.podLearns ?? []);

  const skipped: PlannedSkip[] = [];
  const upcomingByTarget: SkillId[] = [];
  const queue: Omit<RankedSkill, "priority" | "prereqReady">[] = [];

  for (const node of i.nodes) {
    if (node.demand <= 0) continue;
    if (node.status === "proven" || node.status === "degree-done") continue;
    if (node.category === "professional") continue; // practised in your pod every week, never a study week
    const growth = growthOf(node.skillId, i.trends) ?? 0;
    if (node.status === "degree-upcoming") {
      const mod = teachingModule(node, i.startedAt, i.programme);
      const ends = mod?.term ? termEnd(mod.term, i.startedAt).getTime() : Number.POSITIVE_INFINITY;
      if (mod && ends <= target) {
        const label = node.upcomingLabel ?? (mod.term ? upcomingLabel(mod.term) : "a later semester");
        upcomingByTarget.push(node.skillId);
        skipped.push({
          skillId: node.skillId, name: node.name, module: mod, label,
          termStart: mod.term ? termStart(mod.term, i.startedAt) : null,
          message: skipMessage(node.name, mod, label),
        });
        continue;
      }
      queue.push({ node, growth, coveredLater: true, module: mod });
      continue;
    }
    queue.push({ node, growth, coveredLater: false });
  }

  const scheduled = new Set<SkillId>();
  const isReady = (id: SkillId) => {
    if (podLearns.has(id)) return true;
    return (prereqsOf.get(id) ?? []).every((p) => {
      const pn = byId.get(p);
      return !pn || pn.status === "proven" || pn.status === "degree-done" || scheduled.has(p);
    });
  };
  const score = (q: (typeof queue)[number]): RankedSkill => {
    const prereqReady = isReady(q.node.skillId);
    const priority =
      q.node.demand * (1 + Math.max(q.growth, 0)) * (prereqReady ? 1 : PREREQ_NOT_READY) *
      (q.coveredLater ? COVERED_LATER_FACTOR : 1) * (q.node.trend === "declining" ? DECLINING_FACTOR : 1);
    return { ...q, prereqReady, priority };
  };
  const better = (a: RankedSkill, b: RankedSkill) =>
    b.priority - a.priority || b.node.demand - a.node.demand || a.node.skillId.localeCompare(b.node.skillId);

  // Greedy: each week takes the highest-priority skill whose priority reflects what's already scheduled.
  const ranked: RankedSkill[] = [];
  const remaining = [...queue];
  while (remaining.length) {
    const scored = remaining.map(score).sort(better);
    const top = scored[0];
    ranked.push(top);
    scheduled.add(top.node.skillId);
    remaining.splice(remaining.findIndex((q) => q.node.skillId === top.node.skillId), 1);
  }

  const start0 = nextMonday(i.now);
  const weeks: PlanWeek[] = [];
  for (let w = 0; w < nWeeks && ranked.length; w++) {
    const repeat = w >= ranked.length;
    const focus = repeat ? ranked[(w - ranked.length) % ranked.length] : ranked[w];
    const start = addDays(start0, 7 * w);
    weeks.push({ week: w + 1, start, isExamWeek: isExamWeek(start), focus, repeat });
  }
  const planned = [...new Set(weeks.map((w) => w.focus.node.skillId))];
  return { candidates: queue.length, ranked, skipped, weeks, upcomingByTarget, planned };
}
