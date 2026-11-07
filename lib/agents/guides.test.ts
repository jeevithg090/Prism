import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuideSuggestionZ } from "@/lib/schemas/community";
import type { BridgeMap, BridgeNode, Profile } from "@/lib/types";

const { llmJSON, fcSearch } = vi.hoisted(() => ({ llmJSON: vi.fn(), fcSearch: vi.fn() }));
vi.mock("@/lib/llm", () => ({
  llmJSON,
  llmText: vi.fn(),
  LLMError: class LLMError extends Error {},
}));
vi.mock("@/lib/connectors/firecrawl", () => ({ fcSearch }));

import { findGuides, githubLanguage, topGap } from "./guides";

const aisha: Profile = {
  id: "aisha", name: "Aisha Rahman", programmeId: "uom-bsc-cs", year: 1, startedAt: "2026-09-21",
  badges: ["new-to-uni", "international"], interests: ["computer vision", "healthcare AI"], availability: ["tue-eve"],
  dna: { targetRoles: ["ml-engineer"], timelineLabel: "Placement 2027", targetDate: "2027-09-01", hoursPerWeek: 8, theoryPractice: 70, formats: ["projects"], budget: "free", constraints: [], accessibility: [], language: "en" },
};
const node = (skillId: string, name: string, category: BridgeNode["category"], status: BridgeNode["status"], demand: number): BridgeNode => ({
  skillId, name, category, status, demand, level: 0, evidenceIds: [], moduleCodes: [],
});
const map = (nodes: BridgeNode[]): BridgeMap => ({
  userId: "aisha", roleId: "ml-engineer", nodes, edges: [], readinessNow: 0.38, readinessProjected: 0.6, generatedAt: "2026-11-07T10:00:00Z",
});
const DOCKER_MAP = map([
  node("python", "Python", "language", "proven", 0.62),
  node("pytorch", "PyTorch", "ml-ai", "gap", 0.38),
  node("docker", "Docker", "cloud-devops", "gap", 0.41),
  node("sql", "SQL", "data", "gap", 0.35),
]);

const githubItems = {
  items: [
    { login: "mcr-dev", html_url: "https://github.com/mcr-dev", type: "User" },
    { login: "northern-ts", html_url: "https://github.com/northern-ts", type: "User" },
    { login: "some-org", html_url: "https://github.com/some-org", type: "Organization" },
    { login: "third-dev", html_url: "https://github.com/third-dev", type: "User" },
  ],
};
const webResults = [
  { url: "https://www.meetup.com/docker-manchester/", title: "Docker Manchester | Meetup", description: "Monthly talks on containers." },
  { url: "https://example.org/talks/containers-101", title: "Containers 101 - Jo Smith", description: "A talk at Manchester Tech Week." },
];

let fetchSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify(githubItems), { status: 200 }));
  fcSearch.mockResolvedValue(webResults);
});
afterEach(() => {
  fetchSpy.mockRestore();
  delete process.env.GITHUB_TOKEN;
});

describe("topGap / githubLanguage", () => {
  it("picks the highest-demand gap and maps ML/data skills to python", () => {
    expect(topGap(DOCKER_MAP)?.skillId).toBe("docker");
    expect(githubLanguage({ skillId: "docker", category: "cloud-devops" })).toBe("typescript");
    expect(githubLanguage({ skillId: "pytorch", category: "ml-ai" })).toBe("python");
    expect(githubLanguage({ skillId: "sql", category: "data" })).toBe("python");
  });
});

describe("findGuides", () => {
  it("returns at most 4 valid suggestions written by the LLM", async () => {
    llmJSON.mockImplementation(async (o: { user: string }) => {
      const people = JSON.parse(o.user).people as { publicUrl: string; name: string }[];
      return {
        guides: people.map((p) => ({
          publicUrl: p.publicUrl,
          whyRelevant: `${p.name} works with Docker in Manchester.`,
          suggestedQuestion: "How did you learn Docker?",
          draftMessage: `Hi ${p.name}, I'm Aisha, a first-year student learning Docker.`,
        })),
      };
    });
    process.env.GITHUB_TOKEN = "test-token";
    const out = await findGuides(aisha, DOCKER_MAP);

    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(4);
    for (const g of out) expect(GuideSuggestionZ.safeParse(g).success).toBe(true);
    expect(out.map((g) => g.source)).toEqual(["github", "web", "github", "web"]);
    expect(out.some((g) => g.publicUrl === "https://github.com/some-org")).toBe(false); // organisations skipped
    expect(out[0].whyRelevant).toBe("mcr-dev works with Docker in Manchester.");

    // GitHub search: Manchester, top-gap language, followers > 20, 5 per page, token header, GET only.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe("https://api.github.com/search/users?q=location:Manchester+language:typescript+followers:>20&per_page=5");
    expect(init?.method ?? "GET").toBe("GET");
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer test-token");
    expect(fcSearch).toHaveBeenCalledWith("Manchester Docker meetup speaker", expect.anything());
    expect(llmJSON).toHaveBeenCalledWith(expect.objectContaining({ agent: "guides", schemaName: "guide_drafts" }));
    // The LLM prompt never receives demographic badges.
    expect(llmJSON.mock.calls[0][0].user).not.toMatch(/international|new-to-uni/);
  });

  it("uses python for an ML gap and deterministic templates when the LLM throws", async () => {
    llmJSON.mockRejectedValue(new Error("no_key"));
    const mlMap = map([node("pytorch", "PyTorch", "ml-ai", "gap", 0.5), node("docker", "Docker", "cloud-devops", "gap", 0.2)]);
    const out = await findGuides(aisha, mlMap);

    expect(out).toHaveLength(4);
    for (const g of out) {
      expect(GuideSuggestionZ.safeParse(g).success).toBe(true);
      expect(g.draftMessage).toContain("Aisha");
      expect(g.draftMessage).toContain("PyTorch");
      expect(g.whyRelevant).toContain("50% of ML engineer ads");
    }
    expect(String(fetchSpy.mock.calls[0][0])).toContain("language:python");
    expect(fcSearch).toHaveBeenCalledWith("Manchester PyTorch meetup speaker", expect.anything());
  });

  it("still works when GitHub fails, and returns [] when nothing is found", async () => {
    llmJSON.mockRejectedValue(new Error("no_key"));
    fetchSpy.mockImplementation(async () => new Response("rate limited", { status: 403 }));
    const webOnly = await findGuides(aisha, DOCKER_MAP);
    expect(webOnly.map((g) => g.source)).toEqual(["web", "web"]);

    fcSearch.mockResolvedValue([]);
    expect(await findGuides(aisha, DOCKER_MAP)).toEqual([]);
  });

  it("has no outbound messaging code path (it never sends anything)", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "lib/agents/guides.ts"), "utf8");
    expect(src).not.toMatch(/method:\s*["'`](POST|PUT|PATCH|DELETE)["'`]/i);
    expect(src).not.toMatch(/["'`]POST["'`]/);
    expect(src).not.toContain("/messages");
    expect(src).not.toMatch(/octokit|nodemailer|sendMail|triggerWorkflow|webhook|discord|smtp/i);
  });
});
