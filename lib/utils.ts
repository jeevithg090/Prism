import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
export function pct(n: number) { return `${Math.round(n * 100)}%`; }
/** Whole pounds under £1,000, otherwise rounded thousands ("£33k"). Rounds first so £999.60 reads "£1k", not "£1000". */
export function fmtGBP(n: number) {
  const pounds = Math.round(n);
  return pounds >= 1000 ? `£${Math.round(pounds / 1000)}k` : `£${pounds}`;
}
