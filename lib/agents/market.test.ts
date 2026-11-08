import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { emit } = vi.hoisted(() => ({ emit: vi.fn() }));
vi.mock("@/lib/agents/events", () => ({ emit, newRunId: () => "run_test" }));

import { analyseAds, computeShares, dedupeAds, fetchAds, getRoleDemand, getRoles, percentile, salaryStats, UnknownRoleError } from "./market";
import { RoleDemandZ } from "@/lib/schemas/data";
import type { JobAd } from "@/lib/connectors/adzuna";

const ad = (title: string, company: string, description = "", extra: Partial<JobAd> = {}): JobAd => ({ title, company, description, url: `https://example.com/${encodeURIComponent(title)}`, ...extra });

const ENV = ["ADZUNA_APP_ID", "ADZUNA_APP_KEY", "REED_API_KEY", "DEMO_MODE"] as const;
let saved: Record<string, string | undefined> = {};
beforeEach(() => {
  vi.clearAllMocks();
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  for (const k of ENV) delete process.env[k];
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const k of ENV) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
});

describe("pure helpers", () => {
  it("dedupes by title + company, ignoring case", () => {
    const out = dedupeAds([ad("ML Engineer", "Arm"), ad("ml engineer", "ARM"), ad("ML Engineer", "BBC")]);
    expect(out).toHaveLength(2);
  });

  it("share = ads mentioning / ads analysed, sorted descending", () => {
    const shares = computeShares([["docker", "python"], ["docker"], ["docker", "docker"], ["sql"]]);
    expect(shares[0]).toEqual({ skillId: "docker", share: 0.75 });
    expect(shares.map((s) => s.share)).toEqual([0.75, 0.25, 0.25]);
  });

  it("salary percentiles from midpoints; fewer than 5 salaries gives undefined", () => {
    const five = [30, 40, 50, 60, 70].map((k) => ({ salaryMin: k * 1000, salaryMax: k * 1000 }));
    expect(salaryStats(five)).toEqual({ p25: 40000, median: 50000, p75: 60000, currency: "GBP" });
    expect(salaryStats(five.slice(0, 4))).toBeUndefined();
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
  });

  it("analyses ads into a valid RoleDemand", () => {
    const ads = [
      ad("Machine Learning Engineer", "Arm", "Python, PyTorch and Docker. Deploy models on AWS.", { salaryMin: 45000, salaryMax: 55000 }),
      ad("ML Engineer", "Arm", "Python and SQL", { salaryMin: 50000, salaryMax: 60000 }),
      ad("Graduate ML Engineer", "Ocado", "Python; experience with Docker", { salaryMin: 38000, salaryMax: 42000 }),
      ad("machine learning engineer", "ARM", "duplicate"),
    ];
    const d = analyseAds({ id: "ml-engineer", name: "ML engineer" }, ads, { location: "UK", source: "adzuna", trends: new Map([["docker", "rising"]]), now: new Date("2026-11-07T10:00:00Z") });
    expect(RoleDemandZ.parse(d)).toBeTruthy();
    expect(d.adsAnalysed).toBe(3);
    expect(d.skills.slice(0, 2)).toEqual([{ skillId: "machine-learning", share: 1 }, { skillId: "python", share: 1 }]); // ties → alphabetical
    expect(d.skills.find((s) => s.skillId === "docker")).toEqual({ skillId: "docker", share: 0.67, trend: "rising" });
    expect(d.topCompanies[0]).toEqual({ name: "Arm", count: 2 });
    expect(d.salary).toBeUndefined();
  });
});

describe("connectors", () => {
  it("falls back to Reed when Adzuna returns 500", async () => {
    process.env.ADZUNA_APP_ID = "id"; process.env.ADZUNA_APP_KEY = "key"; process.env.REED_API_KEY = "reed";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("adzuna")) return new Response("boom", { status: 500 });
      return Response.json({ results: [{ jobTitle: "Data Analyst", employerName: "Co-op", jobDescription: "SQL and Tableau", jobUrl: "https://www.reed.co.uk/jobs/1" }] });
    });
    const { ads, source } = await fetchAds("data analyst", "UK");
    expect(source).toBe("reed");
    expect(ads).toEqual([expect.objectContaining({ title: "Data Analyst", company: "Co-op", url: "https://www.reed.co.uk/jobs/1" })]);
    expect(fetchSpy.mock.calls.some(([u]) => String(u).includes("reed.co.uk"))).toBe(true);
  });

  it("maps Adzuna results and pages until a short page", async () => {
    process.env.ADZUNA_APP_ID = "id"; process.env.ADZUNA_APP_KEY = "key";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
      results: [{ title: "<strong>ML</strong> Engineer", company: { display_name: "Arm" }, description: "Python", redirect_url: "https://adzuna.co.uk/x", salary_min: 50000, salary_max: 60000 }],
    }));
    const { ads, source } = await fetchAds("machine learning engineer", "UK");
    expect(source).toBe("adzuna");
    expect(ads[0]).toMatchObject({ title: "ML Engineer", company: "Arm", url: "https://adzuna.co.uk/x", salaryMin: 50000 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("getRoleDemand", () => {
  it("lists 3 roles", () => {
    expect(getRoles().map((r) => r.id)).toEqual(["ml-engineer", "software-engineer", "data-analyst"]);
  });

  it("serves the cached snapshot without keys and never calls fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const d = await getRoleDemand("ml-engineer", { runId: "run_m" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(d.source).toBe("cache");
    expect(d.adsAnalysed).toBe(214);
    expect(emit).toHaveBeenLastCalledWith(expect.objectContaining({ agent: "market", status: "done", message: "Market Agent: 214 ML engineer ads analysed · top skill python 62% (cached snapshot)" }));
  });

  it("goes live with a key, and falls back to the snapshot when the board fails", async () => {
    process.env.ADZUNA_APP_ID = "id"; process.env.ADZUNA_APP_KEY = "key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
      results: Array.from({ length: 6 }, (_, i) => ({ title: `Data Analyst ${i}`, company: { display_name: i < 4 ? "Co-op" : "NHS" }, description: "SQL and Python", redirect_url: `https://adzuna.co.uk/${i}`, salary_min: 28000 + i * 1000, salary_max: 32000 + i * 1000 })),
    }));
    const live = await getRoleDemand("data-analyst", { refresh: true });
    expect(live.source).toBe("adzuna");
    expect(live.adsAnalysed).toBe(6);
    expect(live.skills.slice(0, 2).map((s) => s.skillId).sort()).toEqual(["python", "sql"]);
    expect(live.salary?.median).toBe(32500);

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const fallback = await getRoleDemand("software-engineer", { refresh: true });
    expect(fallback.source).toBe("cache");
  });

  it("throws for unknown roles", async () => {
    await expect(getRoleDemand("astronaut")).rejects.toBeInstanceOf(UnknownRoleError);
  });
});
