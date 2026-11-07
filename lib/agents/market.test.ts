import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearMemCache } from "@/lib/cache";
import { fcScrapeMarkdown } from "@/lib/connectors/firecrawl";
import { RoleDemandZ } from "@/lib/schemas/data";
import { dedupeAds, getRoleDemand, salaryStats, shareOfAds } from "./market";

vi.mock("@/lib/connectors/firecrawl", () => ({ fcScrapeMarkdown: vi.fn() }));
vi.mock("@/lib/llm", () => ({ llmJSON: vi.fn() }));
vi.mock("@/lib/agents/events", () => ({ emit: vi.fn() }));
vi.mock("node:fs/promises", async (original) => ({
  default: { ...(await original<{ default: object }>()).default, writeFile: vi.fn(), mkdir: vi.fn() },
}));

const ad = (over: object = {}) => ({ title: "Dev", company: "Acme", description: "Python", url: "https://a", ...over });
const adzunaRow = (title: string, description: string) => ({
  title, description, redirect_url: `https://ad/${title}`, company: { display_name: "Acme" },
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  clearMemCache();
  vi.stubEnv("DEMO_MODE", "false");
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("ADZUNA_APP_ID", "id");
  vi.stubEnv("ADZUNA_APP_KEY", "key");
  vi.stubEnv("REED_API_KEY", "reed");
  vi.mocked(fcScrapeMarkdown).mockReset().mockRejectedValue(new Error("no"));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("market helpers", () => {
  it("dedupes ads by title and company, ignoring case", () => {
    expect(dedupeAds([ad(), ad({ title: "DEV", company: "ACME" }), ad({ title: "Other" })])).toHaveLength(2);
  });

  it("computes shares sorted descending", () => {
    const docker = new Set(["docker"]);
    const both = new Set(["docker", "python"]);
    expect(shareOfAds([docker, docker, both, new Set(["sql"])])).toEqual([
      { skillId: "docker", share: 0.75 },
      { skillId: "python", share: 0.25 },
      { skillId: "sql", share: 0.25 },
    ]);
  });

  it("computes salary percentiles from midpoints", () => {
    const ads = [30, 40, 50, 60, 70].map((k) => ad({ salaryMin: k * 1000, salaryMax: k * 1000 }));
    expect(salaryStats(ads)?.median).toBe(50000);
  });

  it("leaves salary undefined with fewer than 5 values", () => {
    expect(salaryStats([ad({ salaryMin: 1, salaryMax: 2 })])).toBeUndefined();
  });
});

describe("getRoleDemand", () => {
  it("uses Reed when Adzuna fails", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
      String(url).includes("adzuna")
        ? json({}, 500)
        : json({ results: [{ jobTitle: "Dev", employerName: "Acme", jobDescription: "Docker", jobUrl: "https://r" }] }));
    const r = await getRoleDemand("data-analyst", { refresh: true });
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("reed.co.uk"))).toBe(true);
    expect(r.source).toBe("reed");
  });

  it("keeps an ad when Firecrawl fails, using its description", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      json({ results: [adzunaRow("A", "Uses Docker"), adzunaRow("B", "Uses Python")] }));
    const r = await getRoleDemand("software-engineer", { refresh: true });
    expect(r.adsAnalysed).toBe(2);
    expect(r.skills.map((s) => s.skillId)).toEqual(expect.arrayContaining(["docker", "python"]));
    RoleDemandZ.parse(r);
  });

  it("falls back to stored data when no job API keys are set", async () => {
    vi.stubEnv("ADZUNA_APP_ID", "");
    vi.stubEnv("ADZUNA_APP_KEY", "");
    vi.stubEnv("REED_API_KEY", "");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const r = await getRoleDemand("ml-engineer");
    expect(r.roleId).toBe("ml-engineer");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
