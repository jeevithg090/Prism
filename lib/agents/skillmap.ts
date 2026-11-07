import { z } from "zod";
import skillsJson from "@/data/skills.json";
import { emit } from "@/lib/agents/events";
import { llmJSON } from "@/lib/llm";
import type { Level, ModuleSkill, Skill, SkillId } from "@/lib/types";

const SKILLS = skillsJson as Skill[];
const IDS = new Set(SKILLS.map((s) => s.id));

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const exactWord = (word: string, notAfter = "") =>
  new RegExp(`(?<![\\w.+#-])${word}(?![\\w+#${notAfter}-])`, "g");

// Everyday words that only mean the technology when written this way.
const EXACT: Record<string, RegExp> = {
  c: exactWord("C", "&"),
  r: exactWord("R", "&"),
  go: exactWord("(?:Go|GO)(?! to\\b)"),
  rust: exactWord("Rust"),
  swift: exactWord("Swift"),
  express: exactWord("Express"),
  spring: exactWord("Spring"),
  excel: exactWord("Excel"),
  ruby: exactWord("Ruby"),
  flask: exactWord("Flask"),
  helm: exactWord("Helm"),
  scala: exactWord("Scala"),
  react: exactWord("React"),
  rest: exactWord("REST"),
  ts: exactWord("TS"),
  ml: exactWord("ML"),
};

const aliasIndex = new Map<string, SkillId>();
for (const s of SKILLS) {
  for (const a of [s.id, s.name.toLowerCase(), ...s.aliases]) {
    if (!aliasIndex.has(a)) aliasIndex.set(a, s.id);
  }
}

const matchers = [...aliasIndex.entries()]
  .sort(([a], [b]) => b.length - a.length)
  .map(([alias, id]) => ({
    id,
    re: EXACT[alias] ?? new RegExp(`(?<![a-z0-9+#.])${escape(alias)}(?![a-z0-9+#])`, "gi"),
  }));

function levelNear(text: string, start: number, end: number): Level {
  const near = text.slice(Math.max(0, start - 40), end + 20).toLowerCase();
  if (/\b(build|builds|building|built|implement\w*|develop\w*|design\w*)\b/.test(near)) return 3;
  if (/\b(use|uses|using|apply|applies|applying|write|writes|writing)\b/.test(near)) return 2;
  return 1;
}

export function getSkills(): Skill[] {
  return SKILLS;
}

export function canonicalize(term: string): SkillId | null {
  const key = term.trim().toLowerCase().replace(/^[^a-z0-9.+#]+|[^a-z0-9+#]+$/g, "");
  return aliasIndex.get(key) ?? null;
}

/** Deterministic alias matching. Longest aliases claim their text first. */
export function matchSkills(text: string): ModuleSkill[] {
  const found = new Map<SkillId, Level>();
  let rest = text;
  for (const { id, re } of matchers) {
    re.lastIndex = 0;
    rest = rest.replace(re, (hit: string, offset: number) => {
      const level = levelNear(text, offset, offset + hit.length);
      found.set(id, Math.max(found.get(id) ?? 0, level) as Level);
      return " ".repeat(hit.length);
    });
  }
  return [...found].map(([skillId, level]) => ({ skillId, level }));
}

const LLMResult = z.object({
  skills: z.array(z.object({
    skillId: z.string(),
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  })),
  unknownTerms: z.array(z.string()),
});

export async function mapTextToSkills(
  text: string,
  opts: { runId?: string; useLLM?: boolean } = {},
): Promise<{ skills: ModuleSkill[]; unknownTerms: string[] }> {
  const levels = new Map(matchSkills(text).map((s) => [s.skillId, s.level]));
  let unknownTerms: string[] = [];

  if (opts.useLLM !== false && process.env.OPENAI_API_KEY) {
    try {
      const llm = await llmJSON({
        agent: "skillmap",
        runId: opts.runId,
        system:
          "You map educational or job text onto a FIXED skill list. Only use ids from the list. If an important technology or skill is not on the list, add it to unknownTerms. Never invent ids.",
        user: `SKILL IDS: ${[...IDS].join(", ")}\n\nTEXT:\n${text.slice(0, 6000)}`,
        schema: LLMResult,
        schemaName: "skill mapping",
      });
      for (const s of llm.skills) {
        if (IDS.has(s.skillId)) levels.set(s.skillId, Math.max(levels.get(s.skillId) ?? 0, s.level) as Level);
      }
      unknownTerms = llm.unknownTerms;
      trackUnknownTerms(unknownTerms);
    } catch {
      // Keep the deterministic matches if the model is unavailable.
    }
  }

  if (opts.runId) {
    emit({ runId: opts.runId, agent: "skillmap", status: "progress", message: `mapped ${levels.size} skills` });
  }
  return { skills: [...levels].map(([skillId, level]) => ({ skillId, level })), unknownTerms };
}

const unknownCounts = new Map<string, number>();

export function trackUnknownTerms(terms: string[]): void {
  for (const t of terms) {
    const key = t.trim().toLowerCase();
    unknownCounts.set(key, (unknownCounts.get(key) ?? 0) + 1);
  }
}

export function emergingCandidates(): string[] {
  return [...unknownCounts].filter(([, n]) => n >= 3).map(([t]) => t);
}
