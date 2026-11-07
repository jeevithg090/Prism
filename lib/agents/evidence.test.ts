import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/connectors/github", () => ({ getGithubProfile: vi.fn(async () => ({
  user: { login: "evidence-test", html_url: "https://github.com/evidence-test" },
  repos: [{ name: "demo", full_name: "evidence-test/demo", html_url: "https://github.com/evidence-test/demo", default_branch: "main", pushed_at: "2026-11-01" }],
  languages: [{ repo: { name: "demo", full_name: "evidence-test/demo", html_url: "https://github.com/evidence-test/demo", default_branch: "main", pushed_at: "2026-11-01" }, languages: { Python: 80_000, HTML: 2_000 } }],
  readmes: [], files: [{ repo: "demo", path: "train.py", branch: "main", text: "# model", url: "https://github.com/evidence-test/demo/blob/main/train.py" }],
  filePaths: [{ repo: "demo", path: "Dockerfile" }, { repo: "demo", path: ".github/workflows/ci.yml" }],
  commits: [], rateLimitLow: false,
})) }));
vi.mock("@/lib/connectors/leetcode", () => ({ getLeetCodeProfile: vi.fn(async () => null) }));
vi.mock("@/lib/llm", () => ({ llmJSON: vi.fn(async () => ({ items: [
  { skillId: "python", level: 3, confidence: 0.8, quote: "train.py:1 builds a model", path: "train.py" },
  { skillId: "made-up-skill", level: 3, confidence: 1, quote: "bad", path: "train.py" },
] })) }));
import { syncEvidence } from "@/lib/agents/evidence";

describe("syncEvidence", () => {
  it("merges code judgement with language and repository signals, dropping unknown skills", async () => {
    const items = await syncEvidence({ userId: "evidence-test-user", githubLogin: "evidence-test" });
    const bySkill = new Map(items.map((item) => [item.skillId, item]));
    expect(bySkill.get("python")?.level).toBe(3);
    expect(bySkill.get("python")?.confidence).toBe(0.8);
    expect(bySkill.get("python")?.quote).toContain("train.py");
    expect(bySkill.get("docker")?.level).toBe(2);
    expect(bySkill.get("ci-cd")?.level).toBe(2);
    expect(bySkill.has("made-up-skill")).toBe(false);
  });
});
