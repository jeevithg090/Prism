// Shortest Path to Opportunity → Roadmap: pulls a chosen path's skills to the front of the student's roadmap.
// Pure (no store, no events). The agent shows this as a preview and writes it only after the student approves.
import "server-only";
import { hoursSplit, proofFor, SKILL_TASKS } from "@/lib/agents/roadmap";
import { roleName } from "@/lib/graph/roles";
import { addDays, isExamWeek, isoDate, nextMonday } from "@/lib/graph/terms";
import type { Pod, Profile, Receipt, Roadmap, RoadmapTask, RoadmapWeek, SkillCategory, SkillId, SkippedItem } from "@/lib/types";
import { fmtDate } from "./format";
import type { OpportunityPath, PathStep, RoadmapChange, RoadmapPreview } from "./types";

/** A skill gets a second week when its hours are more than 1.25 × your weekly hours (never more than 3 weeks). */
export const SECOND_WEEK_FACTOR = 1.25;
export const MAX_WEEKS_PER_SKILL = 3;

export interface MergeInput {
  roadmap: Roadmap;
  path: OpportunityPath;
  profile: Pick<Profile, "dna">;
  pod?: Pod | null;
  /** Category per skill, for the proof wording of skills the templates don't know. */
  category?: (id: SkillId) => SkillCategory;
  now: Date;
}

function weeksFor(hours: number, hpw: number): number {
  if (hours <= hpw * SECOND_WEEK_FACTOR) return 1;
  return Math.min(MAX_WEEKS_PER_SKILL, Math.ceil(hours / hpw));
}

function receiptFor(step: PathStep, path: OpportunityPath, dependents: string[]): Receipt {
  const o = path.opportunity;
  const closes = o.closesAt ? `, and applications close on ${fmtDate(o.closesAt)}` : "";
  const demand = step.demandPct !== undefined ? ` (${step.demandPct}% of ${roleName(o.roleId)} ads ask for it)` : "";
  const reason = step.required
    ? `Pulled forward for ${o.title} at ${o.employer}: it asks for ${step.name}${demand}${closes}.`
    : `${step.name} comes first: ${dependents.join(" and ") || "the next skill"} builds on it, on your path to ${o.title} at ${o.employer}${closes}.`;
  return {
    demandPct: step.demandPct ?? 0,
    coveredByDegree: step.status === "degree-upcoming" ? "upcoming" : "no",
    ...(step.status === "degree-upcoming" && step.moduleCode ? { moduleCode: step.moduleCode } : {}),
    reason,
  };
}

function newTasks(step: PathStep, week: number, hours: number, deeper: boolean, theoryPractice: number, pod?: Pod | null): RoadmapTask[] {
  const tpl = SKILL_TASKS[step.skillId];
  const again = deeper ? "Go deeper: " : "";
  const repo = pod?.project?.title?.split(":")[0]?.trim();
  const repoLabel = repo ? `your pod repo (${repo})` : "your pod repo";
  const { learn, build } = hoursSplit(hours, theoryPractice);
  const tasks: Omit<RoadmapTask, "id">[] = [];
  if (learn > 0) tasks.push({ type: "learn", title: again + (tpl?.learn ?? `Read the official ${step.name} getting-started guide`), ...(tpl?.url ? { resourceUrl: tpl.url } : {}), free: true, hours: learn });
  if (build > 0) {
    const title = (tpl?.build ?? `Use ${step.name} in a small PR to {repo}`).replaceAll("{repo}", repoLabel);
    if (build >= 3) {
      const practice = Math.max(1, Math.round(build / 3));
      tasks.push({ type: "practice", title: again + (tpl?.practice ?? `Practise ${step.name} on a small exercise`), free: true, hours: practice });
      tasks.push({ type: "build", title: again + title, free: true, hours: build - practice });
    } else tasks.push({ type: "build", title: again + title, free: true, hours: build });
  }
  return tasks.map((t, k) => ({ ...t, id: `t_${week}_${k + 1}` }));
}

/**
 * The path's learn steps become the first weeks (an existing week for the same skill is moved, keeping its ticks;
 * a new skill gets template tasks). The rest of the roadmap follows in its old order, re-dated from the same first
 * Monday. Degree steps go to `skipped` ("don't pay for a course"). Returns the new roadmap and what changed.
 */
export function mergePathIntoRoadmap(i: MergeInput): { roadmap: Roadmap; changes: RoadmapChange[]; degreeNotes: string[]; laterNotes: string[] } {
  const hpw = Math.max(1, Math.round(i.profile.dna?.hoursPerWeek || 8));
  const tp = i.profile.dna?.theoryPractice ?? 50;
  const old = i.roadmap.weeks ?? [];
  const start0 = old[0]?.startDate ? new Date(`${old[0].startDate}T00:00:00Z`) : nextMonday(i.now);
  // Steps the path schedules after a module ends (beyond this roadmap's weeks) wait for the next re-plan.
  const horizon = addDays(start0, 7 * Math.max(old.length, 12)).getTime();
  const allLearn = i.path.steps.filter((s) => s.mode === "learn");
  const learn = allLearn.filter((s) => !s.startsOn || Date.parse(`${s.startsOn}T00:00:00Z`) < horizon);
  const laterNotes = allLearn.filter((s) => !learn.includes(s)).map((s) =>
    `${s.name} starts on ${fmtDate(s.startsOn)}, after the module it builds on, which is beyond your ${Math.max(old.length, 12)}-week roadmap. It joins when the roadmap re-plans.`);
  const pathIds = new Set(learn.map((s) => s.skillId));
  const dependentsOf = (id: SkillId) => learn.filter((s) => s.prereqs.includes(id)).map((s) => s.name);

  type Draft = Omit<RoadmapWeek, "week" | "startDate" | "isExamWeek"> & { fromWeek?: number; fresh: boolean; skill: PathStep | null; deeper: boolean; hours: number };
  const drafts: Draft[] = [];
  const changes: RoadmapChange[] = [];
  for (const step of learn) {
    const existing = old.find((w) => w.focusSkillId === step.skillId);
    const n = existing ? 1 : weeksFor(step.hours, hpw);
    const receipt = receiptFor(step, i.path, dependentsOf(step.skillId));
    for (let k = 0; k < n; k++) {
      const hours = existing ? 0 : Math.max(1, Math.round(step.hours / n));
      drafts.push(existing && k === 0
        ? { ...existing, receipt: { ...existing.receipt, reason: receipt.reason }, fromWeek: existing.week, fresh: false, skill: step, deeper: false, hours }
        : { focusSkillId: step.skillId, tasks: [], proof: proofFor({ skillId: step.skillId, name: step.name, category: i.category?.(step.skillId) ?? "practice" }, i.pod), receipt, fresh: true, skill: step, deeper: k > 0, hours });
    }
    changes.push({
      skillId: step.skillId, name: step.name, kind: existing ? "moved" : "added",
      ...(existing ? { fromWeek: existing.week } : {}), toWeek: 0, hours: step.hours,
    });
  }
  const pathWeeks = drafts.length;
  for (const w of old) {
    if (pathIds.has(w.focusSkillId)) continue;
    drafts.push({ ...w, fromWeek: w.week, fresh: false, skill: null, deeper: false, hours: 0 });
  }

  // The roadmap keeps its length (the tail comes back at the next re-plan) unless the path itself is longer.
  const weeks: RoadmapWeek[] = drafts.slice(0, Math.max(old.length, pathWeeks)).map((d, idx) => {
    const week = idx + 1;
    const start = addDays(start0, 7 * idx);
    const exam = isExamWeek(start);
    const base: RoadmapWeek = {
      week, startDate: isoDate(start), focusSkillId: d.focusSkillId, isExamWeek: exam, proof: d.proof, receipt: d.receipt,
      ...(d.degreeLink ? { degreeLink: d.degreeLink } : {}),
      tasks: d.fresh && d.skill
        ? newTasks(d.skill, week, exam ? Math.max(1, Math.round(Math.min(d.hours, hpw) * 0.5)) : Math.min(d.hours, hpw), d.deeper, tp, i.pod)
        : d.tasks.map((t, k) => ({ ...t, id: `t_${week}_${k + 1}` })),
    };
    return base;
  });
  for (const c of changes) c.toWeek = weeks.find((w) => w.focusSkillId === c.skillId)?.week ?? 0;

  const skipped: SkippedItem[] = [...(i.roadmap.skipped ?? [])];
  const degreeNotes: string[] = [];
  for (const s of i.path.steps.filter((x) => x.mode === "degree")) {
    const mod = s.moduleTitle ? `${s.moduleTitle} (${s.moduleCode})` : s.moduleCode ?? "your module";
    const note = `Don't pay for a ${s.name.toLowerCase()} course: ${mod} covers it by ${fmtDate(s.readyBy)}, in time for ${i.path.opportunity.employer}.`;
    degreeNotes.push(note);
    if (!skipped.some((x) => x.skillId === s.skillId) && s.moduleCode) skipped.push({ skillId: s.skillId, moduleCode: s.moduleCode, message: note });
  }

  return {
    roadmap: { ...i.roadmap, version: (i.roadmap.version ?? 0) + 1, weeks, skipped, generatedAt: i.now.toISOString() },
    changes,
    degreeNotes,
    laterNotes,
  };
}

/** The dialog's before → after view. */
export function previewOf(
  path: OpportunityPath, before: Roadmap, merged: { roadmap: Roadmap; changes: RoadmapChange[]; degreeNotes: string[]; laterNotes: string[] },
  name: (id: SkillId) => string,
): RoadmapPreview {
  const { roadmap: after, changes, degreeNotes, laterNotes } = merged;
  const changed = new Set(changes.map((c) => c.skillId));
  return {
    opportunityId: path.opportunity.id, title: path.opportunity.title, employer: path.opportunity.employer,
    currentVersion: before.version, nextVersion: after.version, changes, degreeNotes, laterNotes,
    weeks: after.weeks.map((w) => ({ week: w.week, startDate: w.startDate, skillId: w.focusSkillId, name: name(w.focusSkillId), changed: changed.has(w.focusSkillId) })),
  };
}
