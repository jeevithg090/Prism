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

/** The hours most weeks of the plan carry (8 for an 8-hour plan whose exam weeks drop to 4). */
export function usualWeekHours(weeks: RoadmapWeek[]): number | undefined {
  const counts = new Map<number, number>();
  for (const w of weeks) counts.set(weekHours(w), (counts.get(weekHours(w)) ?? 0) + 1);
  let best: number | undefined;
  for (const [h, n] of counts) if (best === undefined || n > (counts.get(best) ?? 0)) best = h;
  return best;
}

/** A module's everyday name: the part of its title before any colon ("Mathematics for Computer Science"). */
export const shortModuleTitle = (title: string) => title.split(":")[0].trim();

/** Term labels read as words: "Year 1 · Semester 2" becomes "Year 1, Semester 2". */
export const termText = (label: string) => label.replace(/\s*·\s*/g, ", ");

/**
 * Puts module titles where a sentence names a module by its code, and reads term labels as words:
 * "Builds on Linux in COMP1xxx3" becomes "Builds on Linux in Computer Systems and the Command Line".
 * `titles` maps a module code to its full title.
 */
export function readableModules(text: string, titles?: Record<string, string>): string {
  let out = text;
  for (const [code, title] of Object.entries(titles ?? {})) {
    const short = shortModuleTitle(title);
    out = out.split(`${title} (${code})`).join(short).split(`(${code})`).join(`(${short})`).split(code).join(short);
  }
  return termText(out);
}
