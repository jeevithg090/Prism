// A minimal Evidence Agent: public GitHub repos → languages → skills, at conservative levels.
// Language bytes alone never prove a skill (confidence 0.5 < 0.6): they add links and levels to the map.
import "server-only";
import { emit } from "@/lib/agents/events";
import { getStore } from "@/lib/store";
import type { EvidenceItem, Level, SkillId } from "@/lib/types";
import { listEvidence, skillMeta } from "./data";

export const LANGUAGE_SKILL: Record<string, SkillId> = {
  Python: "python", "Jupyter Notebook": "python", TypeScript: "typescript", JavaScript: "javascript",
  HTML: "html-css", CSS: "html-css", SCSS: "html-css", Java: "java", C: "c", "C++": "cpp",
  Dockerfile: "docker", Shell: "linux", SQL: "sql", PLpgSQL: "postgresql", TSQL: "sql",
};
export const LEVEL_2_BYTES = 50_000;
export const LANGUAGE_CONFIDENCE = 0.5;
const MAX_REPOS = 8;

type Repo = { name: string; html_url: string; fork: boolean; pushed_at: string | null; languages_url: string };

function headers(): HeadersInit {
  const h: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "keystone-evidence-agent" };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  return (await res.json()) as T;
}

/** Bytes per language summed into skills, with the repo that holds most of each. Pure. */
export function languagesToEvidence(
  userId: string,
  perRepo: { repo: Pick<Repo, "name" | "html_url">; languages: Record<string, number> }[],
  now = new Date(),
): EvidenceItem[] {
  const acc = new Map<SkillId, { bytes: number; repos: Set<string>; top: { url: string; name: string; bytes: number } }>();
  for (const { repo, languages } of perRepo) {
    for (const [lang, bytes] of Object.entries(languages)) {
      const skillId = LANGUAGE_SKILL[lang];
      if (!skillId || !(bytes > 0)) continue;
      const a = acc.get(skillId) ?? { bytes: 0, repos: new Set<string>(), top: { url: repo.html_url, name: repo.name, bytes: 0 } };
      a.bytes += bytes;
      a.repos.add(repo.name);
      const inRepo = Object.entries(languages).filter(([l]) => LANGUAGE_SKILL[l] === skillId).reduce((s, [, b]) => s + b, 0);
      if (inRepo > a.top.bytes) a.top = { url: repo.html_url, name: repo.name, bytes: inRepo };
      acc.set(skillId, a);
    }
  }
  return [...acc.entries()].map(([skillId, a]) => {
    const kb = Math.max(1, Math.round(a.bytes / 1000));
    return {
      id: `ev_${userId}_${skillId}_github`, userId, skillId,
      level: (a.bytes > LEVEL_2_BYTES ? 2 : 1) as Level, confidence: LANGUAGE_CONFIDENCE, source: "github" as const,
      url: a.top.url,
      quote: `${kb} KB of ${skillMeta(skillId).name} across ${a.repos.size} ${a.repos.size === 1 ? "repo" : "repos"} (most in ${a.top.name})`,
      createdAt: now.toISOString(),
    };
  });
}

/**
 * Reads up to 8 recently pushed, non-fork public repos and turns their languages into evidence. Saves each item to
 * the store. On any GitHub failure it emits an error-status progress event and returns the evidence you already have.
 */
export async function syncGithubEvidence(i: { userId: string; githubLogin: string; runId?: string }): Promise<EvidenceItem[]> {
  const { userId, githubLogin, runId } = i;
  const say = (status: "started" | "progress" | "done" | "error", message: string, data?: Record<string, unknown>) => {
    if (runId) emit({ runId, agent: "evidence", status, message, data });
  };
  say("started", `Evidence Agent: reading GitHub for @${githubLogin}`);
  try {
    const repos = (await getJSON<Repo[]>(`https://api.github.com/users/${encodeURIComponent(githubLogin)}/repos?sort=pushed&per_page=30`))
      .filter((r) => !r.fork)
      .sort((a, b) => (b.pushed_at ?? "").localeCompare(a.pushed_at ?? ""))
      .slice(0, MAX_REPOS);
    const perRepo = await Promise.all(repos.map(async (repo) => ({ repo, languages: await getJSON<Record<string, number>>(repo.languages_url).catch(() => ({})) })));
    const langs = new Set(perRepo.flatMap((r) => Object.keys(r.languages)));
    say("progress", `read ${repos.length} repos · ${langs.size} languages`, { repos: repos.length, languages: langs.size });
    const items = languagesToEvidence(userId, perRepo);
    const store = getStore();
    await Promise.all(items.map((e) => store.upsert("evidence", e.id, e, userId)));
    const level2 = items.filter((e) => e.level >= 2).length;
    say("done", `found ${items.length} skills in your code (${level2} at level 2)`, { skills: items.length, level2 });
    return listEvidence(userId);
  } catch (err) {
    say("error", "GitHub unavailable: using the evidence you already have", { reason: err instanceof Error ? err.message : "unknown" });
    return listEvidence(userId);
  }
}
