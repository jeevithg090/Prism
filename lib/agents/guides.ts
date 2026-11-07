import "server-only";
// P5 · Guides agent: "learn from practitioners".
// Finds Manchester people who work with the student's top gap skill (GitHub user search + P1's
// Firecrawl web search), then drafts a short first message the STUDENT copies and sends themselves.
// This module is read-only: it only issues GET requests and never contacts anyone.
import { z } from "zod";
import { emit, newRunId } from "@/lib/agents/events";
import { fcSearch } from "@/lib/connectors/firecrawl";
import { llmJSON } from "@/lib/llm";
import { GuideSuggestionZ, skillName } from "@/lib/schemas/community";
import type { BridgeMap, BridgeNode, GuideSuggestion, Profile } from "@/lib/types";

const MAX_GUIDES = 4;
const PYTHON_CATEGORIES = new Set(["ml-ai", "data"]);
const PYTHON_SKILLS = new Set([
  "python", "pandas", "numpy", "statistics", "linear-algebra", "machine-learning", "deep-learning", "pytorch",
  "tensorflow", "scikit-learn", "data-visualisation", "llm-apps", "llm-evaluation", "vector-databases", "mlops",
]);
const ROLE_NAMES: Record<string, string> = {
  "ml-engineer": "ML engineer", "software-engineer": "software engineer", "data-analyst": "data analyst",
};
const YEAR_WORDS: Record<number, string> = { 1: "first-year", 2: "second-year", 3: "third-year", 4: "final-year" };

type Candidate = { name: string; publicUrl: string; source: GuideSuggestion["source"]; context: string };
type Ctx = { skill: string; demandPct: number; roleName: string; language: "python" | "typescript"; studentFirst: string; studentIntro: string };

/** The student's top gap: gap nodes sorted by demand (highest first). */
export function topGap(map: BridgeMap): BridgeNode | undefined {
  return [...map.nodes].filter((n) => n.status === "gap").sort((a, b) => b.demand - a.demand)[0];
}

/** GitHub search language for a skill: python for ML/data skills, otherwise typescript. */
export function githubLanguage(node: Pick<BridgeNode, "skillId" | "category">): "python" | "typescript" {
  return PYTHON_CATEGORIES.has(node.category) || PYTHON_SKILLS.has(node.skillId) ? "python" : "typescript";
}

const isHttpUrl = (u: unknown): u is string => typeof u === "string" && /^https?:\/\/\S+$/.test(u);

async function searchGitHub(language: string, runId: string): Promise<Candidate[]> {
  const url = `https://api.github.com/search/users?q=location:Manchester+language:${language}+followers:>20&per_page=5`;
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "keystone-guides",
  };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      emit({ runId, agent: "guides", status: "progress", message: `GitHub search unavailable (HTTP ${res.status}), using the web only` });
      return [];
    }
    const json = (await res.json()) as { items?: { login?: string; html_url?: string; type?: string }[] };
    const langName = language === "python" ? "Python" : "TypeScript";
    return (json.items ?? [])
      .filter((i) => i.login && isHttpUrl(i.html_url) && i.type !== "Organization")
      .map((i) => ({
        name: i.login as string,
        publicUrl: i.html_url as string,
        source: "github" as const,
        context: `GitHub developer ${i.login}, based in Manchester, writes ${langName}, more than 20 followers.`,
      }));
  } catch {
    return [];
  }
}

function cleanTitle(title: string | undefined): string {
  return (title ?? "").replace(/\s+/g, " ").split(/\s[|·–-]\s/)[0].trim().slice(0, 80);
}

async function searchWeb(skill: string): Promise<Candidate[]> {
  try {
    const results = await fcSearch(`Manchester ${skill} meetup speaker`, { limit: 5 });
    return results
      .filter((r) => isHttpUrl(r.url))
      .map((r) => ({
        name: cleanTitle(r.title) || new URL(r.url).hostname,
        publicUrl: r.url,
        source: "web" as const,
        context: `${r.title ?? ""}. ${r.description ?? ""}`.trim().slice(0, 300),
      }));
  } catch {
    return [];
  }
}

/** GitHub and web results interleaved, de-duplicated by URL, at most `MAX_GUIDES`. */
function pick(github: Candidate[], web: Candidate[]): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (let i = 0; out.length < MAX_GUIDES && (i < github.length || i < web.length); i++) {
    for (const c of [github[i], web[i]]) {
      if (c && !seen.has(c.publicUrl) && out.length < MAX_GUIDES) { seen.add(c.publicUrl); out.push(c); }
    }
  }
  return out;
}

function templateFor(c: Candidate, ctx: Ctx): Omit<GuideSuggestion, "name" | "publicUrl" | "source"> {
  const gapLine = `${ctx.skill} is your top gap: it shows up in ${ctx.demandPct}% of ${ctx.roleName} ads.`;
  const whyRelevant = c.source === "github"
    ? `${c.name} is a Manchester developer on GitHub who writes ${ctx.language === "python" ? "Python" : "TypeScript"} and has more than 20 followers. ${gapLine}`
    : `They speak or organise around ${ctx.skill} in Manchester ("${c.name}"). ${gapLine}`;
  const suggestedQuestion = `What's one small ${ctx.skill} project you'd recommend to someone just starting out?`;
  const found = c.source === "github" ? "your GitHub profile" : `"${c.name}"`;
  const greeting = c.source === "github" ? `Hi ${c.name},` : "Hi there,";
  const draftMessage =
    `${greeting} I'm ${ctx.studentFirst}, ${ctx.studentIntro}. I'm learning ${ctx.skill} at the moment and came across ${found}. ` +
    `If you have a spare minute, I'd love to know: ${suggestedQuestion} No pressure at all if you're busy. Thank you! ${ctx.studentFirst}`;
  return { whyRelevant, suggestedQuestion, draftMessage };
}

const DraftsZ = z.object({
  guides: z.array(z.object({
    publicUrl: z.string(),
    whyRelevant: z.string(),
    suggestedQuestion: z.string(),
    draftMessage: z.string(),
  })),
});

const SYSTEM = [
  "You help a university student learn from practitioners through near-peer mentoring.",
  "For each person, write: whyRelevant (one or two sentences, factual, based only on the context given),",
  "suggestedQuestion (one specific, answerable question about the skill), and draftMessage",
  "(a warm, short first message under 90 words that the student will copy and send themselves).",
  "Never invent facts about the person, never flatter, never claim the student knows them, never mention",
  "demographics. Plain, kind English. Return the publicUrl unchanged for each person.",
].join(" ");

/**
 * Suggest up to 4 practitioners for the student's top gap skill, each with a draft message the
 * student sends themselves. Falls back to deterministic template text when the LLM is unavailable.
 */
export async function findGuides(profile: Profile, map: BridgeMap): Promise<GuideSuggestion[]> {
  const runId = newRunId();
  const gap = topGap(map) ?? [...map.nodes].filter((n) => n.status !== "proven").sort((a, b) => b.demand - a.demand)[0];
  const skillId = gap?.skillId ?? "python";
  const skill = gap?.name || skillName(skillId);
  const language = gap ? githubLanguage(gap) : "python";
  const studentFirst = profile.name.trim().split(/\s+/)[0] || profile.id;
  const yearWord = YEAR_WORDS[profile.year] ?? "university";
  const ctx: Ctx = {
    skill,
    demandPct: Math.round((gap?.demand ?? 0) * 100),
    roleName: ROLE_NAMES[map.roleId] ?? map.roleId.replace(/-/g, " "),
    language,
    studentFirst,
    studentIntro: profile.programmeId.startsWith("uom") ? `a ${yearWord} student at the University of Manchester` : `a ${yearWord} student`,
  };

  emit({ runId, agent: "guides", status: "started", message: `Looking for Manchester practitioners who work with ${skill}` });
  const [github, web] = await Promise.all([searchGitHub(language, runId), searchWeb(skill)]);
  emit({ runId, agent: "guides", status: "progress", message: `Found ${github.length} GitHub profiles and ${web.length} web pages`, data: { github: github.length, web: web.length } });

  const people = pick(github, web);
  if (people.length === 0) {
    emit({ runId, agent: "guides", status: "done", message: "No practitioners found this time", data: { count: 0 } });
    return [];
  }

  let drafts: z.infer<typeof DraftsZ>["guides"] = [];
  try {
    const out = await llmJSON({
      agent: "guides",
      runId,
      system: SYSTEM,
      user: JSON.stringify({
        student: { firstName: studentFirst, intro: ctx.studentIntro, interests: profile.interests, targetRole: ctx.roleName },
        topGap: { skill, demandPct: ctx.demandPct },
        people: people.map(({ name, publicUrl, source, context }) => ({ name, publicUrl, source, context })),
      }),
      schema: DraftsZ,
      schemaName: "guide_drafts",
      temperature: 0.4,
    });
    drafts = out.guides;
  } catch {
    emit({ runId, agent: "guides", status: "progress", message: "Writing drafts from a template (AI writer unavailable)" });
  }

  const suggestions = people.flatMap((c, i) => {
    const t = templateFor(c, ctx);
    const d = drafts.find((x) => x.publicUrl === c.publicUrl) ?? (drafts.length === people.length ? drafts[i] : undefined);
    const pickText = (v: string | undefined, fallback: string, max: number) => (v?.trim() ? v.trim().slice(0, max) : fallback);
    const parsed = GuideSuggestionZ.safeParse({
      name: c.name,
      publicUrl: c.publicUrl,
      source: c.source,
      whyRelevant: pickText(d?.whyRelevant, t.whyRelevant, 400),
      suggestedQuestion: pickText(d?.suggestedQuestion, t.suggestedQuestion, 300),
      draftMessage: pickText(d?.draftMessage, t.draftMessage, 1200),
    });
    return parsed.success ? [parsed.data] : [];
  }).slice(0, MAX_GUIDES);

  emit({ runId, agent: "guides", status: "done", message: `${suggestions.length} guides ready. You send the messages yourself.`, data: { count: suggestions.length, skillId } });
  return suggestions;
}
