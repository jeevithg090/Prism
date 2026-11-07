// Live Lab Pulse: the pure aggregation and recommendation logic (no I/O, no student identity).
// Input: anonymous graded attempts (an opaque student index, the lab minute, which criteria were met).
// Output: a PulseSnapshot the projector shows. Every number is a count over the cohort; nothing per-student leaves.
import {
  KIND_LABEL, MAZUR_PEER_UP_TO, MAZUR_RETEACH_BELOW, PRODUCTIVE_STRUGGLE_MIN, SNOOZE_MINUTES, STUCK_CHECKS,
  STUCK_TRIGGER, WATCH_MINUTES, pct, plural,
  type CriterionState, type Effect, type Explainer, type Intervention, type PulseContext, type PulseSnapshot,
  type PulseSource, type Suggestion, type TimeBucket, type TimelinePoint,
} from "./model";

export type CriterionMeta = {
  id: string; title: string; kind: "rubric" | "check"; concept: string; description: string; hint: string;
};
/** One graded submission. `student` is an opaque index, never an id. */
export type PulseAttempt = { student: number; minute: number; met: string[]; passed: boolean };

export interface AggregateInput {
  sessionId: string;
  source: PulseSource;
  challenge: { id: string; skillId: string; skillName: string; title: string; labMinutes: number };
  criteria: CriterionMeta[];
  /** Talking points per criterion (authored, checked for answer leaks). */
  explainers: Record<string, string[]>;
  attempts: PulseAttempt[];
  cohortSize: number;
  minute: number;
  interventions: Intervention[];
  context: PulseContext | null;
  receipt: string;
}

type StudentState = {
  checks: number; met: Set<string>; passed: boolean; lastProgress: number; allMet: boolean; firstPass: number | null;
  /** Consecutive latest checks in which each unmet criterion stayed unmet. */
  unmetStreak: Map<string, number>;
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Each student's position at `minute`, from their attempts so far. */
export function studentStates(attempts: PulseAttempt[], criteriaIds: string[], minute: number): Map<number, StudentState> {
  const by = new Map<number, PulseAttempt[]>();
  for (const a of attempts) {
    if (a.minute > minute) continue;
    const list = by.get(a.student);
    if (list) list.push(a);
    else by.set(a.student, [a]);
  }
  const out = new Map<number, StudentState>();
  for (const [student, list] of by) {
    list.sort((x, y) => x.minute - y.minute);
    let prev = new Set<string>();
    let lastProgress = list[0].minute;
    let firstPass: number | null = null;
    const unmetStreak = new Map<string, number>();
    for (const a of list) {
      const now = new Set(a.met);
      if ([...now].some((id) => !prev.has(id))) lastProgress = a.minute;
      if (a.passed && firstPass === null) firstPass = a.minute;
      for (const id of criteriaIds) unmetStreak.set(id, now.has(id) ? 0 : (unmetStreak.get(id) ?? 0) + 1);
      prev = now;
    }
    const latest = list[list.length - 1];
    const allMet = criteriaIds.every((id) => prev.has(id));
    out.set(student, { checks: list.length, met: prev, passed: latest.passed, lastProgress, allMet, firstPass, unmetStreak });
  }
  return out;
}

export function criterionStates(criteria: CriterionMeta[], states: Map<number, StudentState>, cohortSize: number): CriterionState[] {
  const started = states.size;
  return criteria.map((c) => {
    let met = 0;
    let stuck = 0;
    for (const s of states.values()) {
      if (s.met.has(c.id)) met++;
      else if ((s.unmetStreak.get(c.id) ?? 0) >= STUCK_CHECKS) stuck++;
    }
    return {
      id: c.id, title: c.title, kind: c.kind, concept: c.concept,
      met, stuck, working: Math.max(0, started - met - stuck), notStarted: Math.max(0, cohortSize - started),
      metPct: pct(met, cohortSize), stuckPct: pct(stuck, cohortSize),
    };
  });
}

export function timeOnTask(states: Map<number, StudentState>, cohortSize: number, minute: number): TimeBucket[] {
  const b = { "not-started": Math.max(0, cohortSize - states.size), lt2: 0, "2to4": 0, "4to6": 0, "6plus": 0, finished: 0 };
  for (const s of states.values()) {
    if (s.allMet) { b.finished++; continue; }
    const since = minute - s.lastProgress;
    if (since < 2) b.lt2++;
    else if (since < 4) b["2to4"]++;
    else if (since < 6) b["4to6"]++;
    else b["6plus"]++;
  }
  return [
    { id: "not-started", label: "Not started yet", students: b["not-started"] },
    { id: "lt2", label: "Under 2 minutes", students: b.lt2 },
    { id: "2to4", label: "2 to 4 minutes", students: b["2to4"] },
    { id: "4to6", label: "4 to 6 minutes", students: b["4to6"] },
    { id: "6plus", label: "6 minutes or more", students: b["6plus"] },
    { id: "finished", label: "Finished every criterion", students: b.finished },
  ];
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return round1(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
}

/** Highest stuck count; ties go to the criterion fewer students have met, then rubric order. */
export function pickHotspot(criteria: CriterionState[]): CriterionState | null {
  const ranked = criteria
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.stuck > 0)
    .sort((a, b) => b.c.stuck - a.c.stuck || a.c.met - b.c.met || a.i - b.i);
  return ranked[0]?.c ?? null;
}

const AVOID_EXPLAIN = "Don't write the fixed file on the board: every student still makes the change themselves.";
const AVOID_PEER = "Don't show a finished file: pairs reason it out from their own versions.";

/** The explainer drafted from the challenge rubric: talking points, the rubric's own question, and what not to do. */
export function buildExplainer(kind: "explain" | "peer" | "nudge", meta: CriterionMeta, explainers: Record<string, string[]>): Explainer {
  const points = (explainers[meta.id]?.length ? explainers[meta.id] : [meta.description]).slice(0, 3);
  if (kind === "explain") {
    return { title: `${cap(meta.concept)} in 3 minutes`, minutes: 3, points, askTheRoom: meta.hint, avoid: AVOID_EXPLAIN };
  }
  if (kind === "peer") {
    return {
      title: `Compare ${meta.concept} with a neighbour`, minutes: 2,
      points: [`In pairs, one person explains their choice for ${meta.concept} in their own words and the other asks why.`, points[0]],
      askTheRoom: meta.hint, avoid: AVOID_PEER,
    };
  }
  return { title: `Hint on screen: ${meta.concept}`, minutes: 1, points: [meta.description], askTheRoom: meta.hint, avoid: AVOID_PEER };
}

/** Minutes after a run intervention during which the board watches it (its own length plus two minutes). */
export const COOLDOWN_MINUTES: Record<"explain" | "peer" | "nudge", number> = { explain: 5, peer: 4, nudge: 2 };

/** "5" or "5.5": lab minutes as the board shows them. */
export const fmtMinute = (m: number) => (Number.isInteger(m) ? String(m) : m.toFixed(1));

function watch(e: Effect, n: number): Suggestion {
  const fewerStuck = e.stuckNow < e.stuckBefore ? ` Stuck on it: ${e.stuckBefore} then, ${e.stuckNow} now.` : "";
  return {
    kind: "watch", criterionId: e.criterionId, minutes: 0, explainer: null,
    headline: `Watching ${e.concept} after your ${KIND_LABEL[e.kind]}`,
    action: e.metNow > e.metBefore
      ? `${e.metNow} of ${n} have it now, up from ${e.metBefore} at minute ${fmtMinute(e.minute)}.`
      : `${e.metNow} of ${n} have it so far, as at minute ${fmtMinute(e.minute)}.`,
    rationale: `Students show the change at their next check, so give it a few minutes.${fewerStuck}`,
  };
}

export interface RecommendInput {
  minute: number;
  cohortSize: number;
  criteria: CriterionState[];
  metas: CriterionMeta[];
  explainers: Record<string, string[]>;
  interventions: Intervention[];
  effects: Effect[];
}

/** What the lecturer could do now: hold, re-teach, peer discussion or a hint, by Peer Instruction bands. */
export function recommend(input: RecommendInput): Suggestion {
  const { minute, cohortSize: n, criteria, metas, explainers, interventions, effects } = input;
  if (minute < PRODUCTIVE_STRUGGLE_MIN) {
    return {
      kind: "hold", criterionId: null, minutes: 0, explainer: null,
      headline: `Minute ${fmtMinute(minute)}: let them work`,
      action: `Lab Pulse starts suggesting help at minute ${PRODUCTIVE_STRUGGLE_MIN}.`,
      rationale: "A few minutes of struggle before any help leads to deeper learning (productive failure, Kapur 2008).",
    };
  }
  // While an intervention is running and just after, watch its effect instead of suggesting the next one.
  const lastRun = interventions.filter((i) => i.decision === "run" && i.minute <= minute).at(-1);
  const lastEffect = lastRun && effects.find((e) => e.interventionId === lastRun.id);
  if (lastRun && lastEffect && minute - lastRun.minute < COOLDOWN_MINUTES[lastRun.kind]) return watch(lastEffect, n);
  const resting = new Set(
    interventions
      .filter((i) => minute - i.minute < (i.decision === "run" ? WATCH_MINUTES : SNOOZE_MINUTES))
      .map((i) => i.criterionId),
  );
  const top = criteria
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => !resting.has(c.id) && n > 0 && c.stuck / n >= STUCK_TRIGGER)
    .sort((a, b) => b.c.stuck - a.c.stuck || a.c.met - b.c.met || a.i - b.i)[0]?.c;

  if (!top) {
    const watching = effects.filter((e) => e.minutesSince < WATCH_MINUTES).at(-1);
    if (watching) return watch(watching, n);
    const most = [...criteria].sort((a, b) => b.stuck - a.stuck)[0];
    return {
      kind: "hold", criterionId: null, minutes: 0, explainer: null,
      headline: "No sticking point right now",
      action: "Keep circulating.",
      rationale: most && most.stuck
        ? `The most students stuck on one criterion is ${most.stuck} of ${n}, on ${most.concept}. Lab Pulse suggests help at 30% of the room.`
        : `Nobody has missed the same criterion ${STUCK_CHECKS} checks in a row.`,
    };
  }

  const meta = metas.find((m) => m.id === top.id)!;
  const share = n > 0 ? top.met / n : 0;
  const headline = `${top.stuck} of ${n} students (${top.stuckPct}%) are stuck on ${top.concept}`;
  if (share < MAZUR_RETEACH_BELOW) {
    return {
      kind: "explain", criterionId: top.id, minutes: 3, headline,
      action: `A 3-minute mini-explanation now: only ${top.met} of ${n} have it so far.`,
      rationale: "With under 30% of the room getting it, peer discussion has too few students to learn from, so re-teach (Peer Instruction, Crouch and Mazur 2001).",
      explainer: buildExplainer("explain", meta, explainers),
    };
  }
  if (share <= MAZUR_PEER_UP_TO) {
    return {
      kind: "peer", criterionId: top.id, minutes: 2, headline,
      action: `Two minutes of peer discussion: ${top.met} of ${n} already have it.`,
      rationale: "Between 30% and 70% of the room has it, where explaining to a neighbour helps both sides most (Peer Instruction, Crouch and Mazur 2001).",
      explainer: buildExplainer("peer", meta, explainers),
    };
  }
  return {
    kind: "nudge", criterionId: top.id, minutes: 1, headline,
    action: `Put the hint on screen for the ${plural(n - top.met, "student")} still working on it.`,
    rationale: "Over 70% of the room has it, so move on. The hint is the rubric's own question, never the answer.",
    explainer: buildExplainer("nudge", meta, explainers),
  };
}

export function computeEffects(interventions: Intervention[], criteria: CriterionState[], minute: number): Effect[] {
  return interventions
    .filter((i) => i.decision === "run" && i.minute <= minute)
    .flatMap((i) => {
      const c = criteria.find((x) => x.id === i.criterionId);
      return c ? [{
        interventionId: i.id, criterionId: i.criterionId, concept: i.concept, kind: i.kind, minute: i.minute,
        minutesSince: round1(minute - i.minute), metBefore: i.metBefore, metNow: c.met, stuckBefore: i.stuckBefore, stuckNow: c.stuck,
      }] : [];
    });
}

/** The full board at `minute`. */
export function computePulse(input: AggregateInput): PulseSnapshot {
  const { criteria: metas, cohortSize: n, interventions } = input;
  const minute = round1(Math.max(0, Math.min(input.minute, input.challenge.labMinutes)));
  const ids = metas.map((m) => m.id);
  const states = studentStates(input.attempts, ids, minute);
  const criteria = criterionStates(metas, states, n);
  const hotspot = pickHotspot(criteria);
  const effects = computeEffects(interventions, criteria, minute);
  const lastRun = interventions.filter((i) => i.decision === "run" && i.minute <= minute).at(-1);
  const focusId = lastRun?.criterionId ?? hotspot?.id ?? [...criteria].filter((c) => c.kind === "rubric").sort((a, b) => a.met - b.met)[0]?.id ?? null;

  const timeline: TimelinePoint[] = [];
  const marks = Array.from({ length: Math.floor(minute) + 1 }, (_, i) => i);
  if (minute % 1) marks.push(minute);
  for (const m of marks) {
    const st = m === minute ? states : studentStates(input.attempts, ids, m);
    let passed = 0;
    let focusMet = 0;
    for (const s of st.values()) {
      if (s.passed) passed++;
      if (focusId && s.met.has(focusId)) focusMet++;
    }
    timeline.push({ minute: m, focusMetPct: pct(focusMet, n), passedPct: pct(passed, n) });
  }

  let passed = 0;
  let finished = 0;
  let submissions = 0;
  const passTimes: number[] = [];
  for (const s of states.values()) {
    if (s.passed) passed++;
    if (s.allMet) finished++;
    submissions += s.checks;
    if (s.firstPass !== null) passTimes.push(s.firstPass);
  }

  return {
    sessionId: input.sessionId, source: input.source,
    challengeId: input.challenge.id, skillId: input.challenge.skillId, skillName: input.challenge.skillName,
    challengeTitle: input.challenge.title, labMinutes: input.challenge.labMinutes, minute,
    cohortSize: n, started: states.size, passed, finished, submissions, medianPassMinutes: median(passTimes),
    suppressed: false, criteria, timeOnTask: timeOnTask(states, n, minute), focusCriterionId: focusId,
    hotspot: hotspot ? {
      criterionId: hotspot.id, concept: hotspot.concept, title: hotspot.title,
      stuck: hotspot.stuck, stuckPct: hotspot.stuckPct, met: hotspot.met, metPct: hotspot.metPct,
    } : null,
    suggestion: recommend({ minute, cohortSize: n, criteria, metas, explainers: input.explainers, interventions, effects }),
    effects, timeline, context: input.context, receipt: input.receipt,
  };
}

/** Below the anonymity threshold nothing but the group size is shown. */
export function suppressSnapshot(s: PulseSnapshot): PulseSnapshot {
  return {
    ...s, suppressed: true, started: 0, passed: 0, finished: 0, submissions: 0, medianPassMinutes: null,
    criteria: [], timeOnTask: [], timeline: [], effects: [], hotspot: null, suggestion: null, focusCriterionId: null,
  };
}
