import "server-only";
import { z } from "zod";
import { withCache } from "@/lib/cache";
import { emitIf } from "@/lib/agents/events";
import { getSkills } from "@/lib/agents/skillmap";
import { llmJSON } from "@/lib/llm";
import { getStore } from "@/lib/store";
import { getGithubProfile } from "@/lib/connectors/github";
import { getLeetCodeProfile } from "@/lib/connectors/leetcode";
import type { EvidenceItem, EvidenceSource, Level, SkillId } from "@/lib/types";

const Judgement = z.object({ items: z.array(z.object({ skillId: z.string(), level: z.union([z.literal(1), z.literal(2), z.literal(3)]), confidence: z.number().min(0).max(1), quote: z.string(), path: z.string() })) });
const LANGUAGE_SKILL: Record<string, SkillId> = {
  python: "python", typescript: "typescript", javascript: "javascript", java: "java", c: "c", "c++": "cpp", sql: "sql", html: "html-css", css: "html-css", "jupyter notebook": "python", go: "go", rust: "rust",
};
const makeItem = (userId: string, skillId: SkillId, level: Level, confidence: number, source: EvidenceSource, url: string, quote?: string): EvidenceItem => ({
  id: `ev_${skillId}_${source}`, userId, skillId, level, confidence, source, url, quote, createdAt: new Date().toISOString(),
});

export async function syncEvidence(input: { userId: string; githubLogin?: string; leetcodeUser?: string; runId?: string }): Promise<EvidenceItem[]> {
  const { userId, runId } = input;
  const key = `evidence-${input.githubLogin ?? userId}`;
  return withCache(key, async () => {
    emitIf(runId, "evidence", "started", "Evidence Agent: reading GitHub");
    const items = new Map<SkillId, EvidenceItem>();
    const known = new Set(getSkills().map((s) => s.id));
    let github: Awaited<ReturnType<typeof getGithubProfile>> | null = null;
    if (input.githubLogin) {
      try { github = await getGithubProfile(input.githubLogin); }
      catch { emitIf(runId, "evidence", "error", "GitHub unavailable; using other evidence sources"); }
    }
    if (github) {
      for (const entry of github.languages) for (const [language, bytes] of Object.entries(entry.languages)) {
        const id = LANGUAGE_SKILL[language.toLowerCase()];
        if (!id || !known.has(id)) continue;
        const current = items.get(id);
        const item = makeItem(userId, id, bytes > 50_000 ? 2 : 1, 0.5, "github", entry.repo.html_url, `${language}: ${bytes} bytes across ${entry.repo.name}`);
        if (!current || item.level > current.level) items.set(id, item);
      }
      if (github.rateLimitLow) emitIf(runId, "evidence", "progress", "GitHub rate limit low: using languages + READMEs");

      for (const repo of github.repos) {
        const paths = github.filePaths.filter((f) => f.repo === repo.name).map((f) => f.path);
        const checks: [RegExp, SkillId, Level, string][] = [
          [/^Dockerfile$/i, "docker", 2, "Dockerfile present"],
          [/^\.github\/workflows\//i, "ci-cd", 2, "GitHub Actions workflow present"],
          [/(^|\/)(test_[^/]*|[^/]*\.test\.[^/]*|__tests__)(\/|$)/i, "testing", 1, "Test files present"],
        ];
        for (const [re, skill, level, quote] of checks) {
          const path = paths.find((p) => re.test(p));
          if (path && known.has(skill)) {
            const old = items.get(skill);
            if (!old || level > old.level) items.set(skill, makeItem(userId, skill, level, 0.65, "github", `${repo.html_url}/tree/${repo.default_branch}`, quote));
          }
        }
      }
      if (github.commits.length && known.has("git")) items.set("git", makeItem(userId, "git", 2, 0.7, "github", `https://github.com/${input.githubLogin}`, "Authored recent commits across public repositories"));

      if (github.files.length) {
        try {
          const judgement = await llmJSON({
            agent: "evidence", runId,
            system: "You assess a student's demonstrated skills ONLY from the code shown. Be conservative. For each skill, give level 1 (aware), 2 (applies it correctly), or 3 (builds non-trivial things with it), a confidence 0..1, and a short quote naming file and line. Only use skill ids from the list.",
            user: `SKILL IDS: ${[...known].join(", ")}\n\nREADMES:\n${github.readmes.map((r) => `--- ${r.repo.name}\n${r.text}`).join("\n")}\n\nFILES:\n${github.files.map((f) => `--- ${f.repo}/${f.path}\n${f.text}`).join("\n")}\n\nCOMMIT PATCHES:\n${github.commits.flatMap((c) => c.patches).join("\n")}`,
            schema: Judgement, schemaName: "evidence judgement",
          });
          for (const ev of judgement.items) {
            if (!known.has(ev.skillId)) continue;
            const file = github.files.find((f) => f.path === ev.path || `${f.repo}/${f.path}` === ev.path);
            if (!file) continue;
            const item = makeItem(userId, ev.skillId, ev.level, ev.confidence, "github", file.url, ev.quote);
            const old = items.get(ev.skillId);
            if (!old || item.level > old.level || (item.level === old.level && item.confidence > old.confidence)) items.set(ev.skillId, item);
          }
        } catch { emitIf(runId, "evidence", "progress", "code review skipped: using languages"); }
      }
    }

    if (input.leetcodeUser) {
      const result = await withCache(`leetcode-${input.leetcodeUser}`, () => getLeetCodeProfile(input.leetcodeUser!), { ttlSec: 86400 });
      const groups = result?.matchedUser?.tagProblemCounts ?? {};
      const counts = new Map<SkillId, number>();
      for (const group of Object.values(groups)) for (const tag of group) {
        const name = tag.tagName.toLowerCase();
        const skill = ["array", "hash table", "linked list", "tree", "stack", "heap", "graph"].includes(name) ? "data-structures"
          : ["dynamic programming", "greedy", "binary search", "sorting", "backtracking"].includes(name) ? "algorithms"
          : name === "database" ? "sql" : undefined;
        if (skill) counts.set(skill, (counts.get(skill) ?? 0) + tag.problemsSolved);
      }
      for (const [skill, count] of counts) if (known.has(skill) && count >= 10) {
        const level: Level = count >= 50 ? 2 : 1;
        items.set(skill, makeItem(userId, skill, level, 0.7, "leetcode", `https://leetcode.com/u/${input.leetcodeUser}/`, `Solved ${count} tagged problems`));
      }
    }

    const result = [...items.values()];
    const store = getStore();
    await Promise.all(result.map((item) => store.upsert("evidence", item.id, item, userId)));
    emitIf(runId, "evidence", "progress", `read ${github?.repos.length ?? 0} repos, ${github?.files.length ?? 0} files, ${github?.commits.length ?? 0} commits`);
    emitIf(runId, "evidence", "progress", `proved ${result.filter((item) => item.level >= 2).length} skills (level ≥ 2)`);
    emitIf(runId, "evidence", "done", "Evidence ready");
    return result;
  }, { ttlSec: 3600, fixture: userId === "aisha" ? "evidence.aisha.json" : undefined });
}
