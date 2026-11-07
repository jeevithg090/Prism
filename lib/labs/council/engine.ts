// Keystone Labs · Agent Council engine. Pure and deterministic: the same data always gives the same debate.
// Three advocates score one motion ("learn Docker in week 1") from −1 to +1, each from its own data:
//   Market   → job-ad share, rank among unproven skills, the logit-OLS trend forecast, what the week displaces
//   Degree   → which module teaches it and when (before or after the target date), prerequisite readiness
//   Wellbeing→ planned hours vs Learning DNA hours, constraints, exam weeks, how many modules run that term
// Each cites receipts, rebuts the seat it disagrees with most (once), and a judge weighs the final scores.
import skillsJson from "@/data/skills.json";
import { addDays, isExamWeek, isoDate, nextMonday, termStart } from "@/lib/graph/terms";
import type { BridgeMap, BridgeNode, Module, Programme, Roadmap, RoleDemand, TrendSeries } from "@/lib/types";
import {
  dissentLabel, SEAT_LABEL, SEAT_WEIGHT, SEATS, signed,
  type Adjustment, type CouncilArgument, type CouncilReceipt, type Motion, type MotionSource, type Rebuttal, type Seat,
  type Stance, type Verdict,
} from "./types";

// ---------- inputs ----------

/** What the council may score on. Badges and other demographic fields are not part of it, by construction. */
export interface StudentFacts {
  userId: string;
  startedAt: string;
  year: 1 | 2 | 3 | 4;
  hoursPerWeek: number;
  constraints: string[];
  targetDate: string;
  timelineLabel: string;
}

export interface CouncilInputs {
  facts: StudentFacts;
  roleId: string;
  roleName: string;
  map: BridgeMap;
  roadmap: Roadmap | null;
  programme: Programme | null;
  market: RoleDemand | null;
  trends: TrendSeries[] | null;
  now: Date;
}

/** One placement of the motion's skill, with the plan it implies (swaps keep every other week intact). */
export interface Scenario {
  skillId: string;
  week: number;
  startDate: string;
  hours: number;
  isExamWeek: boolean;
  /** skillId → planned week, after the move. */
  plannedWeek: Map<string, number>;
  /** The skill this placement pushes out of the week: where it goes (null = off the plan). */
  bumped?: { skillId: string; to: number | null };
}

// ---------- small helpers ----------

const DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const round2 = (x: number) => Math.round(x * 100) / 100;
const clamp = (x: number, lo = -1, hi = 1) => Math.min(hi, Math.max(lo, x));
const pct = (x: number) => Math.round(x * 100);
const pct1 = (x: number) => Math.round(x * 1000) / 10;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const fmtDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const fmtMonth = (iso: string) => {
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const listAnd = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

type SkillRow = { id: string; name: string; aliases?: string[] };
const SKILLS = skillsJson as SkillRow[];
const SKILL_NAMES = new Map(SKILLS.map((s) => [s.id, s.name]));

export function skillLabel(id: string, map?: BridgeMap | null): string {
  const n = map?.nodes.find((x) => x.skillId === id)?.name;
  return n || SKILL_NAMES.get(id) || id.split("-").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}

export const isKnownSkill = (id: string, map?: BridgeMap | null) => SKILL_NAMES.has(id) || !!map?.nodes.some((n) => n.skillId === id);

const SKILL_TERMS = SKILLS
  .flatMap((s) => [s.name, s.id, ...(s.aliases ?? [])].map((term) => ({ id: s.id, term: term.toLowerCase() })))
  .filter((x) => x.term.length >= 2)
  .sort((a, b) => b.term.length - a.term.length);

/** The skill a question names ("Should I do Kubernetes first?" → "kubernetes"), longest name first. */
export function detectSkill(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const { id, term } of SKILL_TERMS) {
    const re = new RegExp(`(^|[^a-z0-9+#])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9+#])`, "i");
    if (re.test(lower)) return id;
  }
  return undefined;
}

/** "in week 3" → 3. */
export function detectWeek(text: string): number | undefined {
  const m = text.match(/\bweek\s*(\d{1,2})\b/i);
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : undefined;
}

export const stanceOf = (score: number): Stance => (score >= 0.25 ? "support" : score <= -0.25 ? "oppose" : "caution");

const termLabel = (m: Pick<Module, "year" | "semester">) => `Year ${m.year}, ${m.semester === "full-year" ? "full year" : `Semester ${m.semester}`}`;

function moduleOf(inp: CouncilInputs, node?: Pick<BridgeNode, "moduleCodes"> | null): Module | undefined {
  const code = node?.moduleCodes?.[0];
  return code ? inp.programme?.modules.find((m) => m.code === code) : undefined;
}

const programmeRef = (inp: CouncilInputs, code?: string) => `data/fixtures/programme.${inp.programme?.id ?? "unknown"}.json${code ? `#${code}` : ""}`;
const syllabusSource = (inp: CouncilInputs) => (inp.programme ? `Syllabus agent, ${inp.programme.name}` : "Syllabus agent");

// ---------- the plan and scenarios ----------

/** week → focus skill, from the roadmap. */
export function planOf(roadmap: Roadmap | null): Map<number, string> {
  return new Map((roadmap?.weeks ?? []).map((w) => [w.week, w.focusSkillId]));
}

/** Places `skillId` in `week`. If it was already planned elsewhere, the two weeks swap; otherwise it replaces the week's focus. */
export function place(plan: Map<number, string>, skillId: string, week: number): Map<number, string> {
  const next = new Map(plan);
  const from = [...plan].find(([, s]) => s === skillId)?.[0];
  const occupant = plan.get(week);
  next.set(week, skillId);
  if (from !== undefined && from !== week && occupant !== undefined) next.set(from, occupant);
  return next;
}

const invert = (plan: Map<number, string>) => {
  const out = new Map<string, number>();
  for (const [w, s] of plan) if (!out.has(s)) out.set(s, w);
  return out;
};

export const plannedWeekOf = (inp: CouncilInputs, skillId: string): number | null =>
  inp.roadmap?.weeks.find((w) => w.focusSkillId === skillId)?.week ?? null;

export const weekCount = (inp: CouncilInputs) => Math.max(1, Math.min(12, inp.roadmap?.weeks.length || 12));

function slotOf(inp: CouncilInputs, week: number) {
  return inp.roadmap?.weeks.find((w) => w.week === week);
}

export function weekStart(inp: CouncilInputs, week: number): string {
  const slot = slotOf(inp, week);
  if (slot) return slot.startDate;
  const first = inp.roadmap?.weeks[0]?.startDate ? new Date(inp.roadmap.weeks[0].startDate) : nextMonday(inp.now);
  return isoDate(addDays(first, 7 * (week - 1)));
}

/** The hour budget of a week: what the roadmap already gives that slot (exam weeks are halved by the planner). */
export function slotHours(inp: CouncilInputs, week: number): { hours: number; isExamWeek: boolean } {
  const slot = slotOf(inp, week);
  const h = Math.max(1, Math.round(inp.facts.hoursPerWeek || 8));
  if (slot) return { hours: sum(slot.tasks.map((t) => t.hours || 0)) || h, isExamWeek: slot.isExamWeek };
  const exam = isExamWeek(new Date(weekStart(inp, week)));
  return { hours: exam ? Math.max(1, Math.round(h * 0.5)) : h, isExamWeek: exam };
}

export function scenarioFor(inp: CouncilInputs, skillId: string, week: number, plan = planOf(inp.roadmap)): Scenario {
  const placed = place(plan, skillId, week);
  const { hours, isExamWeek: exam } = slotHours(inp, week);
  const plannedWeek = invert(placed);
  const occupant = plan.get(week);
  const bumped = occupant && occupant !== skillId ? { skillId: occupant, to: plannedWeek.get(occupant) ?? null } : undefined;
  return { skillId, week, startDate: weekStart(inp, week), hours, isExamWeek: exam, plannedWeek, ...(bumped ? { bumped } : {}) };
}

export function motionFor(inp: CouncilInputs, skillId: string, week?: number): Motion {
  const planned = plannedWeekOf(inp, skillId);
  const skipped = inp.roadmap?.skipped?.some((s) => s.skillId === skillId) ?? false;
  const w = Math.max(1, Math.min(weekCount(inp), week ?? planned ?? 1));
  const source: MotionSource = planned === w ? "roadmap" : planned !== null ? "reschedule" : skipped ? "skipped" : "new";
  const name = skillLabel(skillId, inp.map);
  const label =
    source === "reschedule" ? `${name} in week ${w} instead of week ${planned}`
      : source === "skipped" && w === 1 ? `${name} now`
        : `${name} in week ${w}`;
  return { skillId, skillName: name, week: w, label, source, plannedWeek: planned, startDate: weekStart(inp, w) };
}

// ---------- exams and term load ----------

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

/** The start of the next exam period on or after `from` (11 Jan or 18 May, see lib/graph/terms isExamWeek). */
export function nextExamStart(from: Date): Date {
  const y = from.getUTCFullYear();
  const starts = [utc(y, 1, 11), utc(y, 5, 18), utc(y + 1, 1, 11)];
  return starts.find((d) => d.getTime() >= from.getTime()) ?? starts[2];
}

const semesterAt = (d: Date): "1" | "2" => {
  const m = d.getUTCMonth() + 1;
  return m >= 9 || (m === 1 && d.getUTCDate() < 26) ? "1" : "2";
};

/** Modules running in the term that contains `date`, and those whose assessment includes an exam (with its weight). */
export function termLoad(inp: CouncilInputs, date: Date): { running: Module[]; exams: { code: string; weight?: number }[]; term: string } {
  const sem = semesterAt(date);
  const running = (inp.programme?.modules ?? []).filter((m) => m.year === inp.facts.year && (m.semester === sem || m.semester === "full-year"));
  // January exams belong to semester-1 modules; May exams to semester-2 and full-year modules.
  const examTerm = (m: Module) => (sem === "1" ? m.semester === "1" : m.semester !== "1");
  const exams = running
    .filter((m) => examTerm(m) && /\bexam\b/i.test(m.assessment ?? ""))
    .map((m) => {
      const w = (m.assessment ?? "").match(/exam\s*(\d{1,3})%/i);
      return { code: m.code, ...(w ? { weight: Number(w[1]) } : {}) };
    });
  return { running, exams, term: `Year ${inp.facts.year}, Semester ${sem}` };
}

// ---------- the three cases ----------

interface Case { arg: CouncilArgument; flags: Flags }
interface Flags {
  /** Degree: a module teaches it before the target date (or already did, or it's proven). */
  covered?: boolean;
  coverModule?: string;
  coverDate?: string;
  proven?: boolean;
  /** Degree: a prerequisite is missing from the plan before this week. */
  missingPrereq?: { skillId: string; name: string; week: number | null };
  weakPrereq?: { skillId: string; name: string; level: number; moduleCode?: string };
  /** Market: a higher-demand gap that this week pushes later. */
  displaced?: { name: string; pct: number; week: number | null };
  /** Wellbeing. */
  load?: number;
  exam?: boolean;
  running?: number;
}

const arg = (seat: Seat, score: number, headline: string, body: string, receipts: CouncilReceipt[], adjustment?: Adjustment): CouncilArgument => ({
  seat,
  agent: seat === "market" ? "market" : seat === "degree" ? "syllabus" : "roadmap",
  stance: stanceOf(round2(clamp(score))),
  score: round2(clamp(score)),
  headline,
  body,
  receipts: receipts.slice(0, 5),
  ...(adjustment ? { adjustment } : {}),
  polished: false,
});

export function marketCase(inp: CouncilInputs, sc: Scenario): Case {
  const node = inp.map.nodes.find((n) => n.skillId === sc.skillId);
  const name = skillLabel(sc.skillId, inp.map);
  const demand = node?.demand ?? inp.market?.skills.find((s) => s.skillId === sc.skillId)?.share ?? 0;
  const ads = inp.market?.adsAnalysed;
  const unproven = inp.map.nodes.filter((n) => n.status !== "proven").sort((a, b) => b.demand - a.demand || a.skillId.localeCompare(b.skillId));
  const rank = unproven.findIndex((n) => n.skillId === sc.skillId) + 1;
  const series = inp.trends?.find((t) => t.skillId === sc.skillId);
  const growth = series?.growthPerYear;
  const role = inp.roleName;

  const receipts: CouncilReceipt[] = [{
    label: ads ? `${pct(demand)}% of ${ads} ${role} ads ask for ${name}` : `${pct(demand)}% of ${role} ads ask for ${name}`,
    source: inp.market ? `Market agent, job-ad snapshot of ${fmtDay(inp.market.snapshotAt)}` : "Bridge Map demand weights",
    ref: inp.market ? `data/fixtures/market.${inp.roleId}.json#${sc.skillId}` : `maps/${inp.facts.userId}:${inp.roleId}#${sc.skillId}`,
  }];

  if (node?.status === "proven") {
    const n = node.evidenceIds.length;
    receipts.push({ label: n ? `${plural(n, "piece")} of evidence ${n === 1 ? "proves" : "prove"} ${name}` : `Your Bridge Map marks ${name} as proven`, source: n ? "Evidence agent" : "Bridge Map", ref: `evidence/${inp.facts.userId}#${sc.skillId}` });
    return {
      arg: arg("market", -0.8, `You've already proven ${name}`, `Employers ask for it, and you already have the proof. A week on it buys nothing new in the market; your next rung is teaching it.`, receipts),
      flags: { proven: true },
    };
  }

  let score = clamp((demand - 0.15) / 0.3) + clamp(growth ?? 0, -0.3, 0.5) * 0.6;
  const parts: string[] = [];
  if (rank) {
    parts.push(`${name} is number ${rank} of the ${unproven.length} skills you haven't proven yet.`);
    receipts.push({ label: `Rank ${rank} of ${unproven.length} unproven skills by job-ad demand`, source: "Bridge Map", ref: `maps/${inp.facts.userId}:${inp.roleId}` });
  }
  if (series && typeof growth === "number") {
    const target = inp.facts.targetDate.slice(0, 7);
    const proj = series.projection.find((p) => p.month === target) ?? series.projection[series.projection.length - 1];
    const dir = series.label === "rising" ? "rising" : series.label === "declining" ? "cooling" : "steady";
    if (proj) {
      parts.push(`The Trend Forecaster has it ${dir} at ${growth >= 0 ? "+" : "−"}${Math.abs(pct(growth))}% a year, heading for ${pct1(proj.share)}% of Who's Hiring posts by ${fmtMonth(`${proj.month}-01`)}.`);
      receipts.push({
        label: `${dir === "steady" ? "Steady" : dir === "rising" ? "Rising" : "Cooling"}, ${growth >= 0 ? "+" : "−"}${Math.abs(pct(growth))}% a year; forecast ${pct1(proj.share)}% of posts by ${fmtMonth(`${proj.month}-01`)} (range ${pct1(proj.low)} to ${pct1(proj.high)}%)`,
        source: `Trend Forecaster, logit OLS on ${series.history.length} months of HN Who's Hiring`,
        ref: `data/fixtures/trends.json#${sc.skillId}`,
      });
    }
  }

  // Timing: what this placement pushes out of the week, if that skill is in clearly more ads.
  let displaced: Flags["displaced"];
  const bumped = sc.bumped ? inp.map.nodes.find((n) => n.skillId === sc.bumped!.skillId) : undefined;
  if (sc.bumped && bumped && bumped.status !== "proven" && bumped.demand >= demand + 0.1) {
    displaced = { name: bumped.name || skillLabel(bumped.skillId), pct: pct(bumped.demand), week: sc.bumped.to };
    score -= 0.3;
    parts.push(displaced.week === null
      ? `It would replace ${displaced.name} (${displaced.pct}% of ads) in week ${sc.week}.`
      : `${displaced.name} (${displaced.pct}% of ads) would move back to week ${displaced.week}.`);
  }
  if (rank && rank <= 3 && sc.week >= 6) {
    score -= 0.15;
    parts.push(`For a top-3 skill, week ${sc.week} is late.`);
  }

  const s = round2(clamp(score));
  const st = stanceOf(s);
  // The headline leans the same way as the score, so a dissent always reads as one.
  const headline =
    st === "support" ? `${pct(demand)}% of ${role} ads ask for ${name}${series?.label === "rising" ? ", and it's rising" : ""}`
      : s > 0 ? `Useful, not urgent: ${pct(demand)}% of ${role} ads`
        : displaced ? `Not first: ${displaced.name} is in more ads (${displaced.pct}%)`
          : `Only ${pct(demand)}% of ${role} ads ask for ${name}`;
  return { arg: arg("market", s, headline, parts.join(" ") || `${pct(demand)}% of ${role} ads ask for ${name}.`, receipts), flags: { displaced } };
}

export function degreeCase(inp: CouncilInputs, sc: Scenario): Case {
  const node = inp.map.nodes.find((n) => n.skillId === sc.skillId);
  const name = skillLabel(sc.skillId, inp.map);
  const mod = moduleOf(inp, node);
  const target = new Date(inp.facts.targetDate);
  const start = new Date(sc.startDate);
  const nModules = inp.programme?.modules.length ?? 0;
  const receipts: CouncilReceipt[] = [];
  const flags: Flags = {};
  let score: number;
  let headline: string;
  const parts: string[] = [];

  const modReceipt = (m: Module, skillId: string, skillName: string) => {
    const lvl = m.skills.find((x) => x.skillId === skillId)?.level;
    receipts.push({
      label: `${m.code} ${m.title}, ${termLabel(m)}${lvl ? `: ${skillName} at level ${lvl} of 3` : ""}`,
      source: syllabusSource(inp),
      ref: programmeRef(inp, m.code),
    });
  };

  if (node?.status === "proven") {
    score = -0.6;
    headline = `Already proven: no module needed`;
    parts.push(`Your evidence already proves ${name}, so neither your degree nor a new week adds to it.`);
    receipts.push({ label: `${name} is proven on your Bridge Map`, source: "Bridge Map", ref: `maps/${inp.facts.userId}:${inp.roleId}#${sc.skillId}` });
    Object.assign(flags, { covered: true, proven: true });
  } else if (node?.status === "degree-done" && mod) {
    score = -0.7;
    headline = `${mod.code} already taught you ${name}`;
    parts.push(`You covered it in ${mod.title} (${termLabel(mod)}).`);
    modReceipt(mod, sc.skillId, name);
    Object.assign(flags, { covered: true, coverModule: mod.code });
  } else if (node?.status === "degree-upcoming" && mod) {
    const ts = termStart(mod, inp.facts.startedAt);
    modReceipt(mod, sc.skillId, name);
    if (ts.getTime() < target.getTime()) {
      const weeksUntil = Math.floor((ts.getTime() - start.getTime()) / (7 * DAY));
      if (weeksUntil >= 0 && weeksUntil <= 2) {
        score = 0.2;
        headline = `A primer, just before ${mod.code} starts`;
        parts.push(`${mod.title} starts on ${fmtDay(isoDate(ts))}, ${plural(weeksUntil, "week")} later. A short preview helps; a full week duplicates it.`);
      } else {
        score = -0.8;
        headline = `${mod.code} teaches ${name} from ${fmtDay(isoDate(ts))}`;
        parts.push(`That's before your ${fmtMonth(inp.facts.targetDate)} target, free and for credit, so a week on it now would duplicate a module you'll take.`);
        Object.assign(flags, { covered: true, coverModule: mod.code, coverDate: fmtDay(isoDate(ts)) });
      }
    } else {
      score = 0.3;
      headline = `A head start: ${mod.code} only teaches it in ${termLabel(mod)}`;
      parts.push(`That's after your ${fmtMonth(inp.facts.targetDate)} target, so learning it now isn't wasted; the module will take you further later.`);
    }
  } else {
    score = 0.5;
    headline = nModules ? `None of your ${nModules} modules teach ${name}` : `No module on your syllabus teaches ${name}`;
    parts.push(`If you don't learn it yourself, your degree won't give it to you before ${fmtMonth(inp.facts.targetDate)}.`);
    receipts.push({ label: `0 of ${nModules} modules list ${name}`, source: syllabusSource(inp), ref: programmeRef(inp) });
  }

  // Prerequisites (Bridge Map edges), judged against the plan this scenario implies.
  let adjustment: Adjustment | undefined;
  const prereqs = inp.map.edges.filter((e) => e.kind === "prereq" && e.to === sc.skillId && e.from !== sc.skillId).map((e) => e.from).slice(0, 2);
  for (const p of prereqs) {
    const pn = inp.map.nodes.find((n) => n.skillId === p);
    if (!pn || flags.proven) continue;
    const pName = pn.name || skillLabel(p);
    const pm = moduleOf(inp, pn);
    if (pn.status === "proven") {
      score += 0.1;
      parts.push(`It builds on ${pName}, which you've proven.`);
    } else if (pn.status === "degree-done") {
      if (pn.level >= 2) {
        score += 0.1;
        parts.push(`It builds on ${pName}${pm ? ` from ${pm.code}` : ""}.`);
      } else {
        score -= 0.15;
        parts.push(`It builds on ${pName}, and ${pm ? pm.code : "your degree"} only took you to level ${pn.level} of 3.`);
        if (pm) modReceipt(pm, p, pName);
        flags.weakPrereq = { skillId: p, name: pName, level: pn.level, ...(pm ? { moduleCode: pm.code } : {}) };
        adjustment ??= { kind: "refresher", skillId: p, skillName: pName, hours: 1, ...(pm ? { moduleCode: pm.code } : {}), text: `Start with a 1-hour ${pName} refresher${pm ? ` from ${pm.code}` : ""}` };
      }
    } else if (pn.status === "degree-upcoming" && pm) {
      const pts = termStart(pm, inp.facts.startedAt);
      if (pts.getTime() > start.getTime()) {
        score -= 0.6;
        parts.push(`It builds on ${pName}, which ${pm.code} only teaches from ${fmtDay(isoDate(pts))}.`);
        modReceipt(pm, p, pName);
        flags.missingPrereq = { skillId: p, name: pName, week: null };
      }
    } else {
      const pw = sc.plannedWeek.get(p) ?? null;
      if (pw !== null && pw < sc.week) {
        score += 0.05;
        parts.push(`It builds on ${pName}, planned first in week ${pw}.`);
      } else {
        score -= 0.6;
        parts.push(pw !== null ? `It builds on ${pName}, which wouldn't come until week ${pw}.` : `It builds on ${pName}, which isn't on your plan yet.`);
        receipts.push({
          label: pw !== null ? `${pName} is a prerequisite of ${name}, planned for week ${pw}` : `${pName} is a prerequisite of ${name}, not on the plan`,
          source: "Bridge Map prerequisite edges",
          ref: `maps/${inp.facts.userId}:${inp.roleId}#${p}->${sc.skillId}`,
        });
        flags.missingPrereq = { skillId: p, name: pName, week: pw };
      }
    }
  }
  if (flags.missingPrereq) headline = `Not before ${flags.missingPrereq.name}: ${name} builds on it`;
  if (!receipts.length) receipts.push({ label: `${name} on your ${inp.roleName} Bridge Map`, source: "Bridge Map", ref: `maps/${inp.facts.userId}:${inp.roleId}#${sc.skillId}` });
  return { arg: arg("degree", score, headline, parts.join(" "), receipts, adjustment), flags };
}

export function wellbeingCase(inp: CouncilInputs, sc: Scenario): Case {
  const hours = Math.max(1, Math.round(inp.facts.hoursPerWeek || 8));
  const planned = sc.hours;
  const start = new Date(sc.startDate);
  const load = planned / hours;
  const { running, exams, term } = termLoad(inp, start);
  const parts: string[] = [];
  const receipts: CouncilReceipt[] = [{
    label: `${planned} h planned in week ${sc.week}; you have ${hours} h a week`,
    source: "Your Learning DNA and roadmap",
    ref: `profiles/${inp.facts.userId}#dna.hoursPerWeek`,
  }];
  let trimTo: number | undefined;
  let score = 0.4;

  if (load > 1) {
    score -= Math.min(0.6, (load - 1) * 1.5);
    parts.push(`It plans ${planned} hours, ${planned - hours} more than the ${hours} you said you have.`);
    trimTo = hours;
  } else if (load >= 1) {
    score -= 0.15;
    parts.push(`It uses all ${hours} of your weekly hours, with no slack.`);
  } else if (load <= 0.6 && !sc.isExamWeek) {
    score += 0.1;
    parts.push(`It uses ${planned} of your ${hours} hours, leaving room.`);
  }

  const examList = exams.map((e) => (e.weight ? `${e.code} (exam ${e.weight}%)` : e.code));
  if (sc.isExamWeek) {
    const half = Math.max(1, Math.ceil(hours / 2));
    if (planned <= half) {
      score -= 0.35;
      parts.push(`It's an exam week${exams.length ? ` with ${plural(exams.length, "exam")}` : ""}; the plan already halves it to ${planned} hours.`);
    } else {
      score -= 0.7;
      parts.push(`It's an exam week${exams.length ? ` with ${plural(exams.length, "exam")}` : ""}, at full load.`);
      trimTo = Math.min(trimTo ?? half, half);
    }
    receipts.push({ label: `Exam week${examList.length ? `: ${listAnd(examList.slice(0, 4))}` : ""}`, source: "UoM exam periods and module assessments", ref: "lib/graph/terms.ts#isExamWeek" });
  } else {
    const next = nextExamStart(start);
    const weeksTo = Math.ceil((next.getTime() - start.getTime()) / (7 * DAY));
    receipts.push({ label: `No exams this week; the next exam period starts ${fmtDay(isoDate(next))}, ${plural(weeksTo, "week")} later`, source: "UoM exam periods", ref: "lib/graph/terms.ts#isExamWeek" });
    if (weeksTo <= 2) {
      score -= 0.2;
      parts.push(`Exams start ${plural(weeksTo, "week")} later, so this is revision time.`);
      trimTo = Math.min(trimTo ?? hours, Math.max(1, Math.round(hours * 0.75)));
    }
  }

  const constraints = inp.facts.constraints.filter(Boolean).slice(0, 3);
  if (constraints.length) {
    score -= 0.15 * constraints.length;
    parts.push(`You told Keystone about: ${listAnd(constraints)}.`);
    receipts.push({ label: `Constraints you set: ${listAnd(constraints)}`, source: "Your Learning DNA", ref: `profiles/${inp.facts.userId}#dna.constraints` });
    if (load >= 0.9) trimTo = Math.min(trimTo ?? hours, Math.max(1, Math.round(hours * 0.75)));
  }

  if (running.length >= 5) {
    score -= 0.1;
    parts.push(`${running.length} modules run in ${term}.`);
  }
  if (running.length) {
    receipts.push({
      label: `${plural(running.length, "module")} running in ${term}${exams.length ? `, ${exams.length} ending in an exam` : ""}`,
      source: syllabusSource(inp),
      ref: programmeRef(inp),
    });
  }
  if (trimTo === undefined && load >= 1 && running.length >= 5 && hours > 2) trimTo = hours - 1;

  const s = round2(clamp(score));
  const st = stanceOf(s);
  const headline =
    sc.isExamWeek && planned > Math.ceil(hours / 2) ? `Exam week at full load: ${planned} of ${hours} hours`
      : sc.isExamWeek ? `Exam week: the lighter ${planned} hours just about fit`
        : st === "support" ? `It fits: ${planned} of your ${hours} hours, no exams near`
          : st === "caution" ? `It fits, just: ${planned} of ${hours} hours${running.length >= 5 ? ` with ${running.length} modules running` : ""}`
            : `Too much for this week: ${planned} of ${hours} hours`;
  const adjustment: Adjustment | undefined = trimTo !== undefined && trimTo < planned
    ? { kind: "trim", toHours: trimTo, text: trimTo === hours - 1 && load >= 1 ? `Plan ${trimTo} of your ${hours} hours, leaving an hour of slack` : `Trim the week to ${trimTo} hours` }
    : undefined;
  return { arg: arg("wellbeing", s, headline, parts.join(" ") || `It uses ${planned} of your ${hours} hours.`, receipts, adjustment), flags: { load, exam: sc.isExamWeek, running: running.length } };
}

const CASES: Record<Seat, (inp: CouncilInputs, sc: Scenario) => Case> = { market: marketCase, degree: degreeCase, wellbeing: wellbeingCase };

export function openingCase(seat: Seat, inp: CouncilInputs, sc: Scenario): Case {
  return CASES[seat](inp, sc);
}

/** The facts each seat actually scores on (inspected by the noDemographicSignals guardrail). */
export function scoringInputs(seat: Seat, inp: CouncilInputs, sc: Scenario): Record<string, unknown> {
  const node = inp.map.nodes.find((n) => n.skillId === sc.skillId);
  if (seat === "market") return { skillId: sc.skillId, week: sc.week, demand: node?.demand, adsAnalysed: inp.market?.adsAnalysed, trend: inp.trends?.find((t) => t.skillId === sc.skillId)?.growthPerYear };
  if (seat === "degree") return { skillId: sc.skillId, week: sc.week, status: node?.status, moduleCodes: node?.moduleCodes, targetDate: inp.facts.targetDate };
  return { week: sc.week, hoursPerWeek: inp.facts.hoursPerWeek, constraints: inp.facts.constraints, plannedHours: sc.hours, isExamWeek: sc.isExamWeek, year: inp.facts.year };
}

// ---------- one round of rebuttals ----------

export interface Opening { seat: Seat; arg: CouncilArgument; flags: Flags }

function monthlyPoints(inp: CouncilInputs, skillId: string): number | null {
  const s = inp.trends?.find((t) => t.skillId === skillId);
  const last = s?.history[s.history.length - 1]?.share;
  const proj = s?.projection[s.projection.length - 1]?.share;
  if (typeof last !== "number" || typeof proj !== "number" || !s?.projection.length) return null;
  return Math.round((Math.abs(proj - last) * 100 * 100) / s.projection.length) / 100;
}

function rebuttalText(from: Opening, to: Opening, inp: CouncilInputs, sc: Scenario, openings: Record<Seat, Opening>): { text: string; lands: boolean; shift: number } {
  const name = skillLabel(sc.skillId, inp.map);
  const node = inp.map.nodes.find((n) => n.skillId === sc.skillId);
  const demandPct = pct(node?.demand ?? 0);
  const against = from.arg.score < to.arg.score; // the rebutter is more sceptical than its target
  const deg = openings.degree.flags;
  const well = openings.wellbeing.flags;
  const hours = Math.max(1, Math.round(inp.facts.hoursPerWeek || 8));
  const mpts = monthlyPoints(inp, sc.skillId);

  if (from.seat === "market") {
    if (against) {
      return from.flags.displaced
        ? { text: `Fitting the week isn't the question: ${from.flags.displaced.name} is in ${from.flags.displaced.pct}% of ads and would ${from.flags.displaced.week === null ? "drop off the plan" : `move back to week ${from.flags.displaced.week}`}.`, lands: true, shift: 0.15 }
        : from.flags.proven
          ? { text: `You already have the proof for ${name}; the hours are worth more on a gap.`, lands: true, shift: 0.1 }
        : { text: `No module covering it doesn't make it worth a week: only ${demandPct}% of ads ask for ${name}.`, lands: from.arg.score <= -0.25, shift: 0.1 };
    }
    if (to.seat === "wellbeing") {
      const deps = inp.map.edges
        .filter((e) => e.kind === "prereq" && e.from === sc.skillId)
        .map((e) => ({ id: e.to, w: sc.plannedWeek.get(e.to), d: inp.map.nodes.find((n) => n.skillId === e.to)?.demand ?? 0 }))
        .filter((x): x is { id: string; w: number; d: number } => typeof x.w === "number" && x.w > sc.week)
        .sort((a, b) => a.w - b.w);
      if (deps.length) {
        const list = listAnd(deps.slice(0, 2).map((d) => `${skillLabel(d.id, inp.map)} (${pct(d.d)}% of ads, week ${d.w})`));
        return { text: `Delay has a knock-on cost: ${list} ${deps.length === 1 ? "builds" : "build"} on ${name}.`, lands: !sc.isExamWeek, shift: 0.05 };
      }
      const weeksLeft = Math.max(0, Math.round((new Date(inp.facts.targetDate).getTime() - new Date(sc.startDate).getTime()) / (7 * DAY)));
      return { text: `Demand won't wait for a quieter week: ${weeksLeft} weeks until your ${fmtMonth(inp.facts.targetDate)} target.`, lands: !sc.isExamWeek && to.arg.score > -0.3, shift: 0.05 };
    }
    if (deg.covered) return { text: `Fair, but ${demandPct}% of ads ask for ${name}: make ${deg.coverModule ?? "the module"}'s coursework count as a proof when it comes.`, lands: false, shift: 0 };
    return { text: `${demandPct}% of ads ask for ${name} today, whatever the syllabus does later.`, lands: !!deg.weakPrereq && !deg.missingPrereq, shift: 0.1 };
  }

  if (from.seat === "degree") {
    if (against) {
      if (deg.covered && deg.proven) return { text: `You have the proof already: another week on ${name} adds nothing the map can show.`, lands: true, shift: 0.35 };
      if (deg.covered) return { text: `Demand isn't a reason to learn it twice: ${deg.coverModule} teaches it${deg.coverDate ? ` from ${deg.coverDate}` : ""}, for credit.`, lands: true, shift: 0.35 };
      if (deg.missingPrereq) return { text: `Demand doesn't help if the foundation isn't there: ${deg.missingPrereq.name} ${deg.missingPrereq.week ? `comes in week ${deg.missingPrereq.week}` : "isn't planned"}.`, lands: true, shift: 0.25 };
      if (deg.weakPrereq) return { text: `The demand is real, but ${deg.weakPrereq.name} only reached level ${deg.weakPrereq.level} of 3${deg.weakPrereq.moduleCode ? ` in ${deg.weakPrereq.moduleCode}` : ""}: refresh it first.`, lands: true, shift: 0.1 };
      return { text: `Nothing in the syllabus makes ${name} urgent this week.`, lands: false, shift: 0 };
    }
    if (to.seat === "wellbeing") {
      const gap = !node || node.status === "gap";
      return { text: `If not now, when? No module covers ${name} before ${fmtMonth(inp.facts.targetDate)}, so the hours have to come from somewhere.`, lands: gap && !sc.isExamWeek, shift: 0.05 };
    }
    return { text: `The syllabus agrees: no module will cover ${name} for you in time.`, lands: false, shift: 0 };
  }

  // wellbeing
  if (against) {
    if (to.seat === "market") {
      if (sc.isExamWeek) return { text: `Demand won't move in a fortnight${mpts !== null ? `: the forecast shifts about ${mpts} points a month` : ""}. Exams will.`, lands: true, shift: 0.3 };
      if ((well.load ?? 0) >= 1 || inp.facts.constraints.length) {
        return { text: `${mpts !== null ? `The forecast moves about ${mpts} points a month, so an hour of slack costs nothing in demand` : "An hour of slack costs nothing in demand"}; ${sc.hours} of ${hours} hours is the real limit.`, lands: true, shift: 0.1 };
      }
      return { text: `The demand case is fine; the week just has to fit.`, lands: false, shift: 0 };
    }
    return { text: `Even with no module covering it, ${sc.hours} of ${hours} hours${sc.isExamWeek ? " in an exam week" : (well.running ?? 0) >= 5 ? ` with ${well.running} modules running` : ""} is a lot.`, lands: (well.load ?? 0) >= 1 || sc.isExamWeek, shift: 0.1 };
  }
  return to.seat === "market"
    ? { text: `It fits your week (${sc.hours} of ${hours} hours), so time isn't the problem here.`, lands: false, shift: 0 }
    : { text: `It fits your week, but fitting isn't a reason to ${deg.covered ? "duplicate a module" : "rush it"}.`, lands: false, shift: 0 };
}

/** Each seat rebuts the seat it disagrees with most (if they're ≥ 0.3 apart). Pure. */
export function rebuttalRound(inp: CouncilInputs, sc: Scenario, openings: Record<Seat, Opening>): Rebuttal[] {
  const out: Rebuttal[] = [];
  for (const seat of SEATS) {
    const me = openings[seat];
    const target = SEATS.filter((s) => s !== seat)
      .map((s) => openings[s])
      .sort((a, b) => Math.abs(b.arg.score - me.arg.score) - Math.abs(a.arg.score - me.arg.score) || SEATS.indexOf(a.seat) - SEATS.indexOf(b.seat))[0];
    if (!target || Math.abs(target.arg.score - me.arg.score) < 0.3) continue;
    const r = rebuttalText(me, target, inp, sc, openings);
    out.push({ from: seat, target: target.seat, text: r.text, lands: r.lands, shift: r.lands ? r.shift : 0 });
  }
  return out;
}

/** Moves each target's score toward its rebutter's by the rebuttal's shift (never past it). */
export function applyRebuttals(scores: Record<Seat, number>, rebuttals: Rebuttal[]): Record<Seat, number> {
  const out = { ...scores };
  for (const r of rebuttals) {
    if (!r.lands || !r.shift) continue;
    const from = scores[r.from];
    const cur = out[r.target];
    const gap = from - cur;
    out[r.target] = round2(cur + Math.sign(gap) * Math.min(Math.abs(gap), r.shift));
  }
  return out;
}

// ---------- the judge ----------

export const netOf = (scores: Record<Seat, number>) => round2(SEATS.reduce((a, s) => a + SEAT_WEIGHT[s] * scores[s], 0));

const scoresOf = (openings: Record<Seat, Opening>) => Object.fromEntries(SEATS.map((s) => [s, openings[s].arg.score])) as Record<Seat, number>;

/** Opening-statement net score for one skill in one week of a plan (used to compare alternative weeks). */
function netAt(inp: CouncilInputs, plan: Map<number, string>, week: number): number {
  const skill = plan.get(week);
  if (!skill) return 0;
  const sc = scenarioFor(inp, skill, week, plan);
  return netOf(Object.fromEntries(SEATS.map((s) => [s, openingCase(s, inp, sc).arg.score])) as Record<Seat, number>);
}

/**
 * The best other week for the motion's skill, by the summed council score of every week a swap touches.
 * A plan week is compared with every other week; a proposed move is compared with keeping the plan.
 */
export function bestAlternative(inp: CouncilInputs, motion: Motion): { week: number; gain: number; swapWith?: string } | null {
  if (motion.plannedWeek === null || !inp.roadmap?.weeks.length) return null;
  const base = planOf(inp.roadmap);
  const motionPlan = place(base, motion.skillId, motion.week);
  const candidates = motion.source === "reschedule" ? [motion.plannedWeek] : [...base.keys()].sort((x, y) => x - y);
  let best: { week: number; gain: number; swapWith?: string } | null = null;
  for (const w of candidates) {
    if (w === motion.week) continue;
    const cand = place(base, motion.skillId, w);
    const touched = [...new Set([...cand.keys(), ...motionPlan.keys()])].filter((k) => cand.get(k) !== motionPlan.get(k));
    const gain = round2(sum(touched.map((k) => netAt(inp, cand, k) - netAt(inp, motionPlan, k))));
    if (!best || gain > best.gain) {
      const swapWith = w === motion.plannedWeek ? undefined : base.get(w);
      best = { week: w, gain, ...(swapWith && swapWith !== motion.skillId ? { swapWith } : {}) };
    }
  }
  return best;
}

function dedupeChanges(args: CouncilArgument[]): Adjustment[] {
  const out: Adjustment[] = [];
  const refreshers = args.map((a) => a.adjustment).filter((a): a is Extract<Adjustment, { kind: "refresher" }> => a?.kind === "refresher");
  const trims = args.map((a) => a.adjustment).filter((a): a is Extract<Adjustment, { kind: "trim" }> => a?.kind === "trim");
  for (const r of refreshers) if (!out.some((x) => x.kind === "refresher" && x.skillId === r.skillId)) out.push(r);
  if (trims.length) out.push(trims.reduce((a, b) => (b.toHours < a.toHours ? b : a)));
  return out.slice(0, 3);
}

const seatName = (s: Seat) => SEAT_LABEL[s].replace(" advocate", "");
/** "Start with…" → "start with…", but "COMP1xxx4…" and "MLOps…" keep their capitals. */
const lowerFirst = (t: string) => (/^[A-Z][a-z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);

/** The judge: weighs the final scores, picks keep / adjust / move / skip, and keeps the strongest dissent. Pure. */
export function judge(inp: CouncilInputs, motion: Motion, openings: Record<Seat, Opening>, rebuttals: Rebuttal[]): Verdict {
  const initial = scoresOf(openings);
  const final = applyRebuttals(initial, rebuttals);
  const net = netOf(final);
  const args = SEATS.map((s) => openings[s].arg);
  const deg = openings.degree.flags;
  const name = motion.skillName;
  const changes = dedupeChanges(args);
  const onPlan = motion.source === "roadmap" || motion.source === "reschedule";

  let decision: Verdict["decision"];
  let moveTo: Verdict["moveTo"];
  if ((deg.covered || openings.market.flags.proven) && net < 0.25) decision = "skip";
  else if (net >= 0.15) decision = changes.length ? "adjust" : "keep";
  else if (!onPlan) decision = "skip"; // a week off the plan has to clear the bar: it displaces planned work
  else {
    const alt = bestAlternative(inp, motion);
    // A proposed move has to beat the plan; a plan week only moves when another week is clearly better.
    if (alt && alt.gain >= (motion.source === "reschedule" ? 0.02 : 0.15)) {
      decision = "move";
      moveTo = { week: alt.week, gain: alt.gain, ...(alt.swapWith ? { swapWithSkillId: alt.swapWith, swapWithSkillName: skillLabel(alt.swapWith, inp.map) } : {}) };
    } else decision = net >= -0.05 ? (changes.length ? "adjust" : "keep") : "skip";
  }
  const pro = decision === "keep" || decision === "adjust";

  // The strongest case against the ruling: the most sceptical seat for a "yes", the most supportive for a "no".
  const ranked = [...SEATS].sort((a, b) => (pro ? final[a] - final[b] : final[b] - final[a]) || SEATS.indexOf(a) - SEATS.indexOf(b));
  const d = openings[ranked[0]].arg;
  const dissent = { seat: d.seat, stance: stanceOf(final[d.seat]), headline: d.headline, receipt: d.receipts[0] };
  const stances = SEATS.map((s) => stanceOf(final[s]));
  const agreement: Verdict["agreement"] =
    stances.every((s) => s === (pro ? "support" : "oppose")) ? "unanimous"
      : stances.some((s) => s === (pro ? "oppose" : "support")) ? "split" : "majority";

  const w = motion.week;
  const yes = motion.source === "reschedule" ? `Move ${name} to week ${w}` : motion.source === "roadmap" ? `Keep ${name} in week ${w}` : `Yes to ${motion.label}`;
  const title =
    decision === "keep" ? (motion.source === "reschedule" ? `${yes}, as you asked` : yes)
      : decision === "adjust" ? `${yes}, with ${plural(changes.length, "change")}`
        : decision === "move" ? (moveTo!.week === motion.plannedWeek ? `Keep ${name} in week ${moveTo!.week}, as planned` : `Move ${name} to week ${moveTo!.week}`)
          : openings.market.flags.proven || deg.proven ? `Skip ${name}: you've already proven it`
            : deg.covered ? `Skip ${name}: ${deg.coverModule} teaches it`
              : `Not now: the case against ${name} is stronger`;

  // Summary: who carried it (with their first receipt), what the judge changes, and the dissent on record.
  const carriers = SEATS.filter((s) => (pro ? final[s] >= 0.25 : final[s] <= -0.25));
  const leadSeat = carriers.length ? [...carriers].sort((a, b) => (pro ? final[b] - final[a] : final[a] - final[b]))[0] : ranked[ranked.length - 1];
  const lead = openings[leadSeat].arg;
  const carried = carriers.length
    ? pro
      ? `${listAnd(carriers.map(seatName))} ${carriers.length === 1 ? "carries" : "carry"} it: ${lowerFirst(lead.receipts[0].label)}.`
      : `${listAnd(carriers.map(seatName))} ${carriers.length === 1 ? "carries" : "carry"} the case against: "${lead.headline}".`
    : `${seatName(leadSeat)} leans ${pro ? "for" : "against"} it: "${lead.headline}".`;
  const changeText = decision === "adjust" && changes.length ? ` The judge adds: ${listAnd(changes.map((c) => lowerFirst(c.text)))}.` : "";
  const moveText = decision === "move" && moveTo
    ? ` Week ${moveTo.week} scores ${signed(moveTo.gain ?? 0)} better across the weeks a swap touches${moveTo.swapWithSkillName ? ` (it swaps with ${moveTo.swapWithSkillName})` : ""}.`
    : "";
  const dissentText = d.seat === leadSeat ? "" : ` ${dissentLabel(decision, dissent.stance)}: ${seatName(d.seat)}, "${d.headline}".`;
  return {
    decision, title, summary: `${carried}${changeText}${moveText}${dissentText}`.trim(), net,
    initialScores: initial, finalScores: final, changes: decision === "adjust" ? changes : [],
    ...(moveTo ? { moveTo } : {}), dissent, agreement,
  };
}

/** The whole deliberation in one call (no LLM, no store, no events). */
export function deliberate(inp: CouncilInputs, motion: Motion): { openings: Record<Seat, Opening>; rebuttals: Rebuttal[]; verdict: Verdict; scenario: Scenario } {
  const sc = scenarioFor(inp, motion.skillId, motion.week);
  const openings = Object.fromEntries(SEATS.map((s) => {
    const c = openingCase(s, inp, sc);
    return [s, { seat: s, arg: c.arg, flags: c.flags }];
  })) as Record<Seat, Opening>;
  const rebuttals = rebuttalRound(inp, sc, openings);
  return { openings, rebuttals, verdict: judge(inp, motion, openings, rebuttals), scenario: sc };
}
