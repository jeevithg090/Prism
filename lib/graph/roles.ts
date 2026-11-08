// Role display names (isomorphic). The market agent's RoleDemand.roleName wins when it exists.
const ROLE_NAMES: Record<string, string> = {
  "ml-engineer": "ML engineer",
  "software-engineer": "software engineer",
  "data-analyst": "data analyst",
  "data-scientist": "data scientist",
  "devops-engineer": "DevOps engineer",
  "frontend-engineer": "frontend engineer",
};

/** "ml-engineer" → "ML engineer" (lower-case after the first word, for use mid-sentence). */
export function roleName(roleId: string): string {
  return ROLE_NAMES[roleId] ?? roleId.split("-").join(" ");
}

/** Sentence-start version: "ML engineer", "Software engineer". */
export function roleTitle(roleId: string): string {
  const n = roleName(roleId);
  return n[0].toUpperCase() + n.slice(1);
}

/** "2027-09-01" → "Sept 2027" (UK style). */
export function monthYear(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const m = ["Jan", "Feb", "Mar", "Apr", "May", "June", "July", "Aug", "Sept", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  return `${m} ${d.getUTCFullYear()}`;
}
