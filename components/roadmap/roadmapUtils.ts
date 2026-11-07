// Pure helpers for the roadmap UI.
import type { Roadmap, RoadmapWeek } from "@/lib/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const at = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);

export const dayMonth = (iso: string) => { const d = at(iso); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };

/** "9–15 Nov" or "28 Dec – 3 Jan". */
export function weekRange(startIso: string): string {
  const s = at(startIso);
  const e = new Date(s.getTime() + 6 * 86_400_000);
  return s.getUTCMonth() === e.getUTCMonth()
    ? `${s.getUTCDate()}–${e.getUTCDate()} ${MONTHS[e.getUTCMonth()]}`
    : `${s.getUTCDate()} ${MONTHS[s.getUTCMonth()]} – ${e.getUTCDate()} ${MONTHS[e.getUTCMonth()]}`;
}

export const weekHours = (w: RoadmapWeek) => w.tasks.reduce((s, t) => s + t.hours, 0);
export const isWeekDone = (w: RoadmapWeek) => w.tasks.length > 0 && w.tasks.every((t) => t.done);

/** The first week you haven't finished (or the last week when everything is done). */
export function currentWeekIndex(rm: Roadmap): number {
  const i = rm.weeks.findIndex((w) => !isWeekDone(w));
  return i === -1 ? Math.max(0, rm.weeks.length - 1) : i;
}

export function withTaskDone(rm: Roadmap | undefined, taskId: string, done: boolean): Roadmap | undefined {
  if (!rm) return rm;
  return { ...rm, weeks: rm.weeks.map((w) => (w.tasks.some((t) => t.id === taskId) ? { ...w, tasks: w.tasks.map((t) => (t.id === taskId ? { ...t, done } : t)) } : w)) };
}

/** Is `today` (YYYY-MM-DD) inside the week starting `startIso`? */
export function isThisWeek(startIso: string, today: string | null): boolean {
  if (!today) return false;
  const s = at(startIso).getTime();
  const t = at(today).getTime();
  return t >= s && t < s + 7 * 86_400_000;
}
