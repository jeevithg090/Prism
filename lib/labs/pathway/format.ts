// Shortest Path to Opportunity: small isomorphic formatters shared by the solver, the tool and the page.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2027-01-31" → "31 Jan 2027" (UTC, UK order). */
export function fmtDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "1 skill", "2 skills". */
export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

/** "a", "a and b", "a, b and c". */
export function joinAnd(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

/** Whole days from a to b (ISO dates). */
export function daysBetween(a: string, b: string): number {
  const ta = Date.parse(a.length === 10 ? `${a}T00:00:00Z` : a);
  const tb = Date.parse(b.length === 10 ? `${b}T00:00:00Z` : b);
  return Math.round((tb - ta) / 86_400_000);
}

export const KIND_LABEL: Record<string, string> = {
  "summer-internship": "Summer internship",
  "placement-year": "Placement year",
  "spring-insight": "Spring insight week",
  "research-internship": "Research internship",
  "open-source-programme": "Open-source programme",
  "graduate-role": "Graduate role",
};
