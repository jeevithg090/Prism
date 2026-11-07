// Keystone Labs · Agent Council: turning a decision into a roadmap change. Pure; the caller saves the result.
// A swap moves a week's focus (tasks, proof, receipt, degree link) into another slot and re-times its tasks to that
// slot's hour budget, so exam weeks stay light. Refreshers and trims change one week's tasks. Task ids are
// renumbered `t_<week>_<n>` so the roadmap page and setTaskDone keep working; ticks travel with their tasks.
import type { Roadmap, RoadmapTask, RoadmapWeek } from "@/lib/types";
import type { Adjustment, CouncilDecision, CouncilSession } from "./types";

const total = (tasks: RoadmapTask[]) => tasks.reduce((a, t) => a + (t.hours || 0), 0);
const renumber = (tasks: RoadmapTask[], week: number) => tasks.map((t, i) => ({ ...t, id: `t_${week}_${i + 1}` }));

/** Takes `hours` off the tasks, largest learn/practice/primer first and the build task last, never below 1 h each. */
function shave(tasks: RoadmapTask[], hours: number): RoadmapTask[] {
  const out = tasks.map((t) => ({ ...t }));
  let left = hours;
  const order = (t: RoadmapTask) => (t.type === "build" ? 1 : 0);
  while (left > 0) {
    const cand = out
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => t.hours > 1)
      .sort((a, b) => order(a.t) - order(b.t) || b.t.hours - a.t.hours || a.i - b.i)[0];
    if (!cand) break;
    out[cand.i].hours -= 1;
    left -= 1;
  }
  return out;
}

/** Re-times a week's tasks to a new hour budget (proportional, at least 1 h each, build task absorbs the rest). */
export function retime(tasks: RoadmapTask[], budget: number, week: number): RoadmapTask[] {
  const have = total(tasks);
  let out = tasks.map((t) => ({ ...t }));
  if (have === budget || !tasks.length) return renumber(out, week);
  if (budget > have) {
    const build = out.findIndex((t) => t.type === "build");
    out[build >= 0 ? build : out.length - 1].hours += budget - have;
    return renumber(out, week);
  }
  out = shave(out, have - budget);
  // Still over budget (more tasks than hours): drop practice, then primer tasks.
  for (const type of ["practice", "primer", "learn"] as const) {
    while (total(out) > budget && out.length > 1 && out.some((t) => t.type === type)) out.splice(out.findIndex((t) => t.type === type), 1);
  }
  return renumber(out, week);
}

/** Swaps the focus of two weeks. Each slot keeps its date, exam flag and hour budget. */
export function swapWeeks(roadmap: Roadmap, a: number, b: number): Roadmap {
  if (a === b) return roadmap;
  const A = roadmap.weeks.find((w) => w.week === a);
  const B = roadmap.weeks.find((w) => w.week === b);
  if (!A || !B) return roadmap;
  const into = (slot: RoadmapWeek, from: RoadmapWeek): RoadmapWeek => {
    const next: RoadmapWeek = {
      week: slot.week, startDate: slot.startDate, isExamWeek: slot.isExamWeek,
      focusSkillId: from.focusSkillId, tasks: retime(from.tasks, total(slot.tasks), slot.week), proof: from.proof, receipt: from.receipt,
    };
    if (from.degreeLink) next.degreeLink = from.degreeLink;
    return next;
  };
  return { ...roadmap, weeks: roadmap.weeks.map((w) => (w.week === a ? into(A, B) : w.week === b ? into(B, A) : w)) };
}

/** Applies the judge's changes to one week. `refresherUrl` resolves a free resource for a refresher skill. */
export function adjustWeek(roadmap: Roadmap, week: number, changes: Adjustment[], refresherUrl?: (skillId: string) => string | undefined): Roadmap {
  return {
    ...roadmap,
    weeks: roadmap.weeks.map((w) => {
      if (w.week !== week) return w;
      let tasks = w.tasks.map((t) => ({ ...t }));
      for (const c of changes) {
        if (c.kind === "refresher") {
          if (tasks.some((t) => t.type === "primer" && t.title.includes(c.skillName))) continue;
          const url = refresherUrl?.(c.skillId);
          const refresher: RoadmapTask = {
            id: "", type: "primer", free: true, hours: c.hours,
            title: `Refresh ${c.skillName}${c.moduleCode ? ` from ${c.moduleCode}` : ""} before you start`,
            ...(url ? { resourceUrl: url } : {}),
          };
          tasks = [refresher, ...shave(tasks, c.hours)];
        } else if (c.kind === "trim") {
          const over = total(tasks) - c.toHours;
          if (over > 0) tasks = shave(tasks, over);
        }
      }
      return { ...w, tasks: renumber(tasks, w.week) };
    }),
  };
}

export interface RoadmapPlanChange {
  /** Swap these two weeks first (null = no swap). */
  swap: [number, number] | null;
  /** The week the motion's skill ends up in (for the changes). */
  week: number;
  changes: Adjustment[];
}

/**
 * What a decision does to the roadmap. "accept" follows the ruling; "overrule" keeps what the student proposed
 * (the plan as it was, or their own move). Null when the decision only goes in the ledger.
 */
export function planChange(session: Pick<CouncilSession, "motion" | "verdict">, choice: CouncilDecision["choice"]): RoadmapPlanChange | null {
  const { motion, verdict } = session;
  const planned = motion.plannedWeek;
  if (planned === null) return null; // skipped or new skills: the decision is logged, the plan isn't rewritten
  const toMotion = (changes: Adjustment[]): RoadmapPlanChange | null =>
    planned === motion.week && !changes.length ? null : { swap: planned === motion.week ? null : [planned, motion.week], week: motion.week, changes };
  if (choice === "overrule") return motion.source === "reschedule" ? toMotion([]) : null;
  switch (verdict.decision) {
    case "keep": return toMotion([]);
    case "adjust": return toMotion(verdict.changes);
    case "move": {
      const to = verdict.moveTo?.week;
      if (!to || to === planned) return null;
      return { swap: [planned, to], week: to, changes: [] };
    }
    default: return null;
  }
}

export function applyPlanChange(roadmap: Roadmap, change: RoadmapPlanChange, refresherUrl?: (skillId: string) => string | undefined): { roadmap: Roadmap; changedWeeks: number[] } {
  let next = change.swap ? swapWeeks(roadmap, change.swap[0], change.swap[1]) : roadmap;
  if (change.changes.length) next = adjustWeek(next, change.week, change.changes, refresherUrl);
  const changedWeeks = [...new Set([...(change.swap ?? []), ...(change.changes.length ? [change.week] : [])])].sort((a, b) => a - b);
  return { roadmap: next, changedWeeks };
}
