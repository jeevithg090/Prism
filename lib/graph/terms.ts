// University of Manchester term timing (P2 Task 5). Pure helpers, all dates in UTC.
// Semester 1: 22 Sep → 23 Jan · Semester 2: 26 Jan → 12 Jun · full year: Sep → Jun.
import type { Module } from "@/lib/types";

export type TermRef = Pick<Module, "year" | "semester">;

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const startYear = (startedAt: string) => new Date(startedAt).getUTCFullYear();

/** First day of the module's teaching, given when the student started university. */
export function termStart(m: TermRef, startedAt: string): Date {
  const y0 = startYear(startedAt) + (m.year - 1);
  return m.semester === "2" ? utc(y0 + 1, 1, 26) : utc(y0, 9, 22);
}

/** Last day of the module's term (exams included). */
export function termEnd(m: TermRef, startedAt: string): Date {
  const y0 = startYear(startedAt) + (m.year - 1);
  return m.semester === "1" ? utc(y0 + 1, 1, 23) : utc(y0 + 1, 6, 12);
}

export function isTermDone(m: TermRef, startedAt: string, now: Date): boolean {
  return termEnd(m, startedAt).getTime() < now.getTime();
}

/** "Year 1 · Semester 2" or "Year 2 · Full year". */
export function upcomingLabel(m: TermRef): string {
  return `Year ${m.year} · ${m.semester === "full-year" ? "Full year" : `Semester ${m.semester}`}`;
}

/** The reverse of upcomingLabel, for maps that only carry the label. */
export function parseUpcomingLabel(label?: string): TermRef | null {
  const m = label?.match(/Year\s+([1-4])\s*·\s*(?:Semester\s+([12])|(Full year))/i);
  if (!m) return null;
  return { year: Number(m[1]) as TermRef["year"], semester: m[3] ? "full-year" : (m[2] as "1" | "2") };
}

/** Exam periods: 11–24 Jan and 18 May–5 Jun of any year. True if [start, start+7d) overlaps one. */
export function isExamWeek(start: Date): boolean {
  const end = new Date(start.getTime() + 6 * 86_400_000);
  for (const y of new Set([start.getUTCFullYear(), end.getUTCFullYear()])) {
    const periods: [Date, Date][] = [[utc(y, 1, 11), utc(y, 1, 24)], [utc(y, 5, 18), utc(y, 6, 5)]];
    if (periods.some(([a, b]) => start.getTime() <= b.getTime() && end.getTime() >= a.getTime())) return true;
  }
  return false;
}

/** The Monday after `now` (a Monday `now` gives the following Monday), at 00:00 UTC. */
export function nextMonday(now: Date): Date {
  const d = utc(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
  const dow = d.getUTCDay(); // 0 Sun … 6 Sat
  const add = ((8 - dow) % 7) || 7;
  return new Date(d.getTime() + add * 86_400_000);
}

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
