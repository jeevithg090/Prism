// Display names for the role catalogue (contract §5 fixed ids). Mirrors P1's getRoles() so P4 code works before it lands.
export const ROLE_NAMES: Record<string, string> = {
  "ml-engineer": "ML engineer",
  "software-engineer": "Software engineer",
  "data-analyst": "Data analyst",
};

export function roleName(roleId: string): string {
  return ROLE_NAMES[roleId] ?? roleId.replace(/-/g, " ");
}

// "llm-evaluation" -> "LLM evaluation" style labels when no skill name is available.
const ACRONYMS = new Set(["llm", "ml", "ai", "sql", "aws", "api", "apis", "ci", "cd", "css", "html", "rest"]);
export function skillLabel(skillId: string): string {
  const words = skillId.split("-").map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w));
  const s = words.join(" ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
