// Shortest Path to Opportunity: the deterministic solver (pure, no I/O, no LLM).
//
// For one opportunity it finds the cheapest way from what you can show today to "can apply":
//  - the skill graph is an AND/OR graph: an opportunity needs every requirement group (AND), any option inside a
//    group will do (OR: "PyTorch or TensorFlow"), and a skill needs all its prerequisites (AND, from the Bridge Map's
//    prereq edges, else the catalogue's curated prerequisites);
//  - a skill costs the hours your roadmap already budgets for it (else a labelled Keystone estimate), 0 if you have it
//    (proven or taught), and 0 if a module teaches it before the deadline (you wait for your degree);
//  - every OR combination is evaluated exactly (≤ 256), with shared prerequisites counted once, and the winner is the
//    one that makes the deadline with the fewest self-study hours (then the earliest date);
//  - the chosen path is scheduled week by week at your Learning DNA hours (half in exam weeks), after the modules it
//    waits for, which gives "2 skills and 3 weeks from applying".
import type { BridgeMap, BridgeNode, Module, Profile, Programme, Roadmap, RoleDemand, SkillCategory, SkillId, SkillStatus } from "@/lib/types";
import { COVERAGE } from "@/lib/graph/readiness";
import { teachingModule } from "@/lib/graph/plan";
import { addDays, isExamWeek, isoDate, isTermDone, nextMonday, parseUpcomingLabel, termEnd, type TermRef } from "@/lib/graph/terms";
import { daysBetween, fmtDate, joinAnd, plural } from "./format";
import type {
  EffortTable, KeystoneSkill, Opportunity, OpportunityPath, PathAlternative, PathEdge, PathState, PathStep,
} from "./types";

export const MAX_COMBOS = 256;
export const NICE_WEIGHT = 0.5;
/** Level-1 evidence ("tried it") cuts the hours to this share. */
export const STARTED_FACTOR = 0.6;
const DAY = 86_400_000;

export type SkillMeta = (id: SkillId) => { name: string; category: SkillCategory; prereqs: SkillId[] };

export interface SolverInput {
  map: BridgeMap;
  profile: Pick<Profile, "id" | "name" | "startedAt" | "dna">;
  programme?: Programme | null;
  roadmap?: Roadmap | null;
  effort: EffortTable;
  meta: SkillMeta;
  /** Fallback prerequisites when neither the map nor the catalogue has any. */
  curated: Record<SkillId, SkillId[]>;
  market?: (roleId: string) => RoleDemand | null;
  now: Date;
}

interface SkillState {
  skillId: SkillId;
  name: string;
  category: SkillCategory;
  status: SkillStatus;
  level: number;
  have: boolean;
  degreeReady?: Date;
  moduleCode?: string;
  moduleTitle?: string;
}

interface Evaluation {
  chosen: SkillId[];
  steps: PathStep[];
  hours: number;
  readyBy: string;
  studyWeeks: number;
  feasible: boolean;
  learn: SkillId[];
}

/** The solver for one student: shared caches across all opportunities. */
export function createSolver(i: SolverInput) {
  const nodes = new Map<SkillId, BridgeNode>(i.map.nodes.map((n) => [n.skillId, n]));
  const prereqIn = new Map<SkillId, SkillId[]>();
  for (const e of i.map.edges ?? []) {
    if (e.kind !== "prereq" || e.from === e.to) continue;
    prereqIn.set(e.to, [...(prereqIn.get(e.to) ?? []), e.from]);
  }
  const startedAt = i.profile.startedAt;
  const hpw = Math.max(1, Math.round(i.profile.dna?.hoursPerWeek || 8));
  const target = i.profile.dna?.targetDate ? new Date(i.profile.dna.targetDate) : addDays(i.now, 365);
  const start0 = nextMonday(i.now);
  const today = isoDate(i.now);
  const states = new Map<SkillId, SkillState>();

  const modulesTeaching = (id: SkillId): Module[] => (i.programme?.modules ?? []).filter((m) => m.skills.some((s) => s.skillId === id));

  function stateOf(id: SkillId): SkillState {
    const hit = states.get(id);
    if (hit) return hit;
    const meta = i.meta(id);
    const node = nodes.get(id);
    let status: SkillStatus = node?.status ?? "gap";
    let degreeReady: Date | undefined;
    let moduleCode: string | undefined;
    let moduleTitle: string | undefined;
    if (node) {
      if (status === "degree-upcoming") {
        const mod = teachingModule(node, startedAt, i.programme);
        const term: TermRef | null = mod?.term ?? parseUpcomingLabel(node.upcomingLabel);
        if (term) degreeReady = termEnd(term, startedAt);
        moduleCode = mod?.code ?? node.moduleCodes[0];
        moduleTitle = mod?.title;
      }
    } else {
      // Not on your map: ask the programme directly (a data-analyst listing can need a skill an ML map leaves out).
      const mods = modulesTeaching(id);
      if (mods.some((m) => isTermDone(m, startedAt, i.now))) status = "degree-done";
      else if (mods.length) {
        const first = [...mods].sort((a, b) => termEnd(a, startedAt).getTime() - termEnd(b, startedAt).getTime())[0];
        status = "degree-upcoming";
        degreeReady = termEnd(first, startedAt);
        moduleCode = first.code;
        moduleTitle = first.title;
      }
    }
    // A module that has already finished by today counts as taught.
    if (status === "degree-upcoming" && degreeReady && degreeReady.getTime() <= i.now.getTime()) status = "degree-done";
    const s: SkillState = {
      skillId: id, name: node?.name ?? meta.name, category: node?.category ?? meta.category, status,
      level: node?.level ?? 0, have: status === "proven" || status === "degree-done",
      ...(degreeReady ? { degreeReady } : {}), ...(moduleCode ? { moduleCode } : {}), ...(moduleTitle ? { moduleTitle } : {}),
    };
    states.set(id, s);
    return s;
  }

  function prereqsOf(id: SkillId): SkillId[] {
    const fromMap = prereqIn.get(id);
    if (fromMap?.length) return [...new Set(fromMap)];
    const fromCatalogue = i.meta(id).prereqs;
    return [...new Set((fromCatalogue.length ? fromCatalogue : i.curated[id] ?? []).filter((p) => p !== id))];
  }

  function hoursOf(s: SkillState): Pick<PathStep, "hours" | "hoursSource" | "roadmapWeek" | "started"> {
    const week = i.roadmap?.weeks?.find((w) => w.focusSkillId === s.skillId);
    let hours: number;
    let out: Pick<PathStep, "hours" | "hoursSource" | "roadmapWeek" | "started">;
    if (week) {
      const left = week.tasks.filter((t) => !t.done).reduce((a, t) => a + (Number.isFinite(t.hours) ? t.hours : 0), 0);
      hours = Math.max(1, Math.round(left));
      out = { hours, hoursSource: "roadmap", roadmapWeek: week.week };
    } else {
      hours = i.effort.hours[s.skillId] ?? i.effort.byCategory[s.category] ?? 10;
      out = { hours, hoursSource: "estimate" };
    }
    if (s.level >= 1) return { ...out, hours: Math.max(1, Math.round(out.hours * STARTED_FACTOR)), started: true };
    return out;
  }

  const demandCache = new Map<string, Map<SkillId, number>>();
  function demandPct(roleId: string, id: SkillId): number | undefined {
    let m = demandCache.get(roleId);
    if (!m) {
      m = new Map((i.market?.(roleId)?.skills ?? []).map((s) => [s.skillId, Math.round(s.share * 100)]));
      if (!m.size && roleId === i.map.roleId) for (const n of i.map.nodes) if (n.demand > 0) m.set(n.skillId, Math.round(n.demand * 100));
      demandCache.set(roleId, m);
    }
    return m.get(id);
  }

  /** Weeks are counted from the Monday after today; exam weeks carry half your hours. */
  const capacity = (w: number) => (isExamWeek(addDays(start0, 7 * w)) ? Math.max(1, Math.round(hpw * 0.5)) : hpw);
  const weekIndexFrom = (d: Date) => Math.max(0, Math.round((nextMonday(addDays(d, -1)).getTime() - start0.getTime()) / (7 * DAY)));

  function evaluate(opp: Opportunity, chosen: SkillId[]): Evaluation {
    const deadline = opp.closesAt ? new Date(`${opp.closesAt}T23:59:59Z`) : target;
    const steps = new Map<SkillId, PathStep>();
    const order: SkillId[] = [];
    const visiting = new Set<SkillId>();
    const visit = (id: SkillId, required: boolean) => {
      const existing = steps.get(id);
      if (existing) { if (required) existing.required = true; return; }
      if (visiting.has(id)) return; // a cycle in the data: stop here
      const s = stateOf(id);
      const base = { skillId: id, name: s.name, status: s.status, required, prereqs: [] as SkillId[] };
      const demand = demandPct(opp.roleId, id);
      const withDemand = demand !== undefined ? { demandPct: demand } : {};
      if (s.have) {
        steps.set(id, { ...base, ...withDemand, mode: "have", hours: 0, hoursSource: "none" });
        order.push(id);
        return;
      }
      if (s.status === "degree-upcoming" && s.degreeReady && s.degreeReady.getTime() <= deadline.getTime()) {
        steps.set(id, {
          ...base, ...withDemand, mode: "degree", hours: 0, hoursSource: "none", readyBy: isoDate(s.degreeReady),
          ...(s.moduleCode ? { moduleCode: s.moduleCode } : {}), ...(s.moduleTitle ? { moduleTitle: s.moduleTitle } : {}),
        });
        order.push(id);
        return;
      }
      visiting.add(id);
      const pre = prereqsOf(id);
      for (const p of pre) visit(p, false);
      visiting.delete(id);
      steps.set(id, {
        ...base, ...withDemand, mode: "learn", ...hoursOf(s), prereqs: pre.filter((p) => steps.has(p)),
        ...(s.moduleCode ? { moduleCode: s.moduleCode } : {}), ...(s.moduleTitle ? { moduleTitle: s.moduleTitle } : {}),
      });
      order.push(id);
    };
    for (const c of chosen) visit(c, true);

    // Earliest start: a step waits for the modules its prerequisites wait for (propagated down the chain).
    const release = new Map<SkillId, number>();
    const releaseOf = (id: SkillId): number => {
      const hit = release.get(id);
      if (hit !== undefined) return hit;
      const st = steps.get(id);
      let r = 0;
      if (st?.mode === "degree" && st.readyBy) r = Date.parse(`${st.readyBy}T00:00:00Z`);
      else if (st?.mode === "learn") for (const p of st.prereqs) r = Math.max(r, releaseOf(p));
      release.set(id, r);
      return r;
    };
    const dfs = order.filter((id) => steps.get(id)?.mode === "learn");
    const pos = new Map(dfs.map((id, k) => [id, k]));
    // Topological order (Kahn) that prefers, among the steps that are free to start: the earliest release, then the
    // order your roadmap already has, then discovery order. So a path keeps your plan's order wherever it can.
    const inPath = new Set(dfs);
    const waiting = new Map(dfs.map((id) => [id, steps.get(id)!.prereqs.filter((p) => inPath.has(p)).length]));
    const key = (id: SkillId): [number, number, number] => [releaseOf(id), steps.get(id)!.roadmapWeek ?? Number.MAX_SAFE_INTEGER, pos.get(id) ?? 0];
    const cmp = (a: SkillId, b: SkillId) => { const ka = key(a), kb = key(b); return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2]; };
    const learn: SkillId[] = [];
    const placed = new Set<SkillId>();
    while (learn.length < dfs.length) {
      const free = dfs.filter((id) => !placed.has(id) && (waiting.get(id) ?? 0) <= 0).sort(cmp);
      const next = free[0] ?? dfs.find((id) => !placed.has(id))!; // a cycle in the data: fall back to discovery order
      learn.push(next);
      placed.add(next);
      for (const id of dfs) if (steps.get(id)!.prereqs.includes(next)) waiting.set(id, (waiting.get(id) ?? 0) - 1);
    }

    let w = 0;
    let used = 0;
    const weeks = new Set<number>();
    for (const id of learn) {
      const st = steps.get(id)!;
      const rel = releaseOf(id);
      if (rel) {
        const rw = weekIndexFrom(new Date(rel));
        if (rw > w) { w = rw; used = 0; }
      }
      if (capacity(w) - used <= 0) { w++; used = 0; }
      const startW = w;
      let remaining = st.hours;
      while (remaining > 0) {
        const avail = capacity(w) - used;
        if (avail <= 0) { w++; used = 0; continue; }
        const take = Math.min(avail, remaining);
        used += take;
        remaining -= take;
        weeks.add(w);
        if (remaining > 0) { w++; used = 0; }
      }
      st.startsOn = isoDate(addDays(start0, 7 * startW));
      st.readyBy = isoDate(addDays(start0, 7 * w + 6));
    }

    const all = [...steps.values()];
    const dated = all.map((s) => s.readyBy).filter((d): d is string => !!d).sort();
    const readyBy = dated.length ? dated[dated.length - 1] : today;
    const hours = all.reduce((a, s) => a + (s.mode === "learn" ? s.hours : 0), 0);
    const have = all.filter((s) => s.mode === "have");
    const timeline = all.filter((s) => s.mode !== "have").sort((a, b) => (a.readyBy ?? "").localeCompare(b.readyBy ?? "") || order.indexOf(a.skillId) - order.indexOf(b.skillId));
    return {
      chosen, steps: [...have, ...timeline], hours, readyBy, studyWeeks: weeks.size,
      feasible: Date.parse(`${readyBy}T00:00:00Z`) <= deadline.getTime(), learn,
    };
  }

  const better = (a: Evaluation, b: Evaluation) =>
    Number(b.feasible) - Number(a.feasible) || a.hours - b.hours || a.readyBy.localeCompare(b.readyBy) ||
    a.learn.length - b.learn.length || a.chosen.join(",").localeCompare(b.chosen.join(","));

  function coverage(id: SkillId): number {
    return COVERAGE[stateOf(id).status] ?? 0;
  }

  function fit(opp: Opportunity, after?: Evaluation): number {
    const covAfter = (id: SkillId) => {
      const st = after?.steps.find((s) => s.skillId === id);
      if (st?.mode === "learn") return 1;
      if (st?.mode === "degree") return COVERAGE["degree-done"];
      return coverage(id);
    };
    const cov = after ? covAfter : coverage;
    const groups = opp.requires.map((g) => Math.max(...g.map(cov)));
    const nice = (opp.nice ?? []).map(cov);
    const total = groups.length + NICE_WEIGHT * nice.length;
    if (!total) return 100;
    return Math.round(((groups.reduce((a, x) => a + x, 0) + NICE_WEIGHT * nice.reduce((a, x) => a + x, 0)) / total) * 100);
  }

  function solve(opp: Opportunity): OpportunityPath {
    // Options per group: a group you already satisfy has no choice to make.
    const groups = opp.requires.map((g) => {
      const opts = [...new Set(g)];
      const owned = opts.find((id) => stateOf(id).have);
      return owned ? [owned] : opts;
    });
    const cache = new Map<string, Evaluation>();
    const run = (chosen: SkillId[]) => {
      const k = chosen.join("|");
      let r = cache.get(k);
      if (!r) { r = evaluate(opp, chosen); cache.set(k, r); }
      return r;
    };
    let options = groups;
    const product = (gs: SkillId[][]) => gs.reduce((a, g) => a * g.length, 1);
    if (product(options) > MAX_COMBOS) {
      // Too many combinations: keep each group's two cheapest options on their own.
      options = groups.map((g) => [...g].sort((a, b) => run([a]).hours - run([b]).hours || a.localeCompare(b)).slice(0, 2));
    }
    let best: Evaluation | null = null;
    let combos = 0;
    const walk = (k: number, acc: SkillId[]) => {
      if (k === options.length) {
        combos++;
        const r = run(acc);
        if (!best || better(r, best) < 0) best = r;
        return;
      }
      for (const o of options[k]) walk(k + 1, [...acc, o]);
    };
    walk(0, []);
    const win = best as unknown as Evaluation;

    // The paths not taken: swap one OR choice and say what it would have cost.
    const alternatives: PathAlternative[] = [];
    options.forEach((g, k) => {
      if (g.length < 2) return;
      const chosen = win.chosen[k];
      for (const o of g) {
        if (o === chosen) continue;
        const alt = run(win.chosen.map((c, j) => (j === k ? o : c)));
        const extra = alt.learn.filter((id) => !win.learn.includes(id) && id !== o).map((id) => stateOf(id).name);
        const chosenName = stateOf(chosen).name;
        const insteadName = stateOf(o).name;
        const extraHours = alt.hours - win.hours;
        const reason = !alt.feasible && win.feasible
          ? `${insteadName} would get you there after applications close.`
          : extra.length
            ? `${insteadName} needs ${joinAnd(extra.map(lower))} first, so it adds ${plural(extraHours, "hour")}.`
            : extraHours > 0
              ? `${insteadName} takes ${plural(extraHours, "hour")} more than ${chosenName}.`
              : `${chosenName} and ${insteadName} cost about the same; ${chosenName} is ready sooner.`;
        alternatives.push({ chosen, chosenName, instead: o, insteadName, extraHours, extraSkills: extra, reason });
      }
    });

    const learnSteps = win.steps.filter((s) => s.mode === "learn");
    const degreeSteps = win.steps.filter((s) => s.mode === "degree");
    const deadline = opp.closesAt;
    const state: PathState = !learnSteps.length && !degreeSteps.length
      ? "apply-now"
      : !deadline ? "no-deadline" : win.feasible ? "within-reach" : "next-round";
    const readyBy = state === "apply-now" ? today : win.readyBy;
    const edges: PathEdge[] = [];
    for (const s of win.steps) for (const p of s.prereqs) edges.push({ source: p, target: s.skillId, kind: "prereq" });
    for (const c of win.chosen) edges.push({ source: c, target: "goal", kind: "requires" });
    for (const a of alternatives) edges.push({ source: a.instead, target: "goal", kind: "alternative" });

    const path: OpportunityPath = {
      opportunity: opp, state, skillsToLearn: learnSteps.length, degreeSkills: degreeSteps.length,
      studyHours: win.hours, studyWeeks: win.studyWeeks, readyBy,
      ...(deadline ? { slackDays: daysBetween(readyBy, deadline) } : {}),
      fitNow: fit(opp), fitReady: fit(opp, win), steps: win.steps, edges,
      alternatives: alternatives.sort((a, b) => a.extraHours - b.extraHours).slice(0, 3), combosSearched: combos, headline: "",
    };
    path.headline = headlineFor(path);
    return path;
  }

  return { solve, stateOf, prereqsOf, hoursPerWeek: hpw, today };
}

const lower = (name: string) => (/^[A-Z][a-z\s-]*$/.test(name) && !["Docker", "Python", "Linux", "Git", "Java", "Kubernetes", "React"].includes(name) ? name[0].toLowerCase() + name.slice(1) : name);

/** "You're 2 skills and 3 weeks from applying to ML Engineering Summer Intern at Quayline Health." */
export function headlineFor(p: OpportunityPath): string {
  const o = p.opportunity;
  const at = `${o.title} at ${o.employer}`;
  if (p.state === "apply-now") return `You can apply to ${at} today: you already have every skill it asks for.`;
  const degree = p.steps.filter((s) => s.mode === "degree");
  const degreeBit = degree.length
    ? ` Your degree covers ${joinAnd(degree.map((s) => lower(s.name)))} by ${fmtDate(degree.map((s) => s.readyBy ?? "").sort().pop())}.`
    : "";
  const away = p.skillsToLearn
    ? `${plural(p.skillsToLearn, "skill")} and ${plural(p.studyWeeks, "week")}`
    : `a module away`;
  if (p.state === "next-round") {
    const late = Math.abs(p.slackDays ?? 0);
    return `You're ${away} from ${at}, but applications close on ${fmtDate(o.closesAt)}, ${plural(late, "day")} before you'd be ready. Aim for next year's round.${degreeBit}`;
  }
  const by = ` You could apply from ${fmtDate(p.readyBy)}${p.slackDays !== undefined ? `, ${plural(Math.floor(p.slackDays / 7), "week")} before it closes` : ""}.`;
  return `You're ${away} from applying to ${at}.${by}${degreeBit}`;
}

const STATE_RANK: Record<PathState, number> = { "apply-now": 0, "within-reach": 1, "no-deadline": 2, "next-round": 3 };

/** Ranks paths: apply now, then within reach by hours, then no deadline, then next round. */
export function rankPaths(paths: OpportunityPath[]): OpportunityPath[] {
  return [...paths].sort((a, b) =>
    STATE_RANK[a.state] - STATE_RANK[b.state] || a.studyHours - b.studyHours || a.readyBy.localeCompare(b.readyBy) ||
    a.opportunity.id.localeCompare(b.opportunity.id));
}

/** The skill to learn that sits on the most open paths (at least 2), the one that unlocks the most doors. */
export function keystoneSkill(paths: OpportunityPath[]): KeystoneSkill | undefined {
  const open = paths.filter((p) => p.state === "within-reach" || p.state === "no-deadline");
  const count = new Map<SkillId, { name: string; n: number; demand: number }>();
  for (const p of open) {
    for (const s of p.steps) {
      if (s.mode !== "learn") continue;
      const c = count.get(s.skillId) ?? { name: s.name, n: 0, demand: 0 };
      c.n++;
      c.demand += s.demandPct ?? 0;
      count.set(s.skillId, c);
    }
  }
  const top = [...count.entries()].sort((a, b) => b[1].n - a[1].n || b[1].demand - a[1].demand || a[0].localeCompare(b[0]))[0];
  if (!top || top[1].n < 2) return undefined;
  return { skillId: top[0], name: top[1].name, count: top[1].n, of: paths.length };
}

/** Listings whose deadline is before today. */
export function isClosed(o: Opportunity, now: Date): boolean {
  return !!o.closesAt && Date.parse(`${o.closesAt}T23:59:59Z`) < now.getTime();
}
