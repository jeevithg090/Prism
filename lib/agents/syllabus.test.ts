import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emit } from "@/lib/agents/events";
import { clearMemCache } from "@/lib/cache";
import { fcCrawl, fcScrapeJSON, fcScrapeMarkdown, fcSearch } from "@/lib/connectors/firecrawl";
import { llmJSON } from "@/lib/llm";
import { dedupeUnits, extractProgramme, normaliseSemester, yearFromCode } from "./syllabus";

vi.mock("@/lib/connectors/firecrawl", () => ({
  fcCrawl: vi.fn(), fcScrapeJSON: vi.fn(), fcScrapeMarkdown: vi.fn(), fcSearch: vi.fn(),
}));
vi.mock("@/lib/llm", () => ({ llmJSON: vi.fn() }));
vi.mock("@/lib/agents/events", () => ({ emit: vi.fn() }));
vi.mock("node:fs/promises", async (original) => ({
  default: { ...(await original<{ default: object }>()).default, writeFile: vi.fn(), mkdir: vi.fn() },
}));

const unit = { code: "COMP23111", title: "Database Systems", topics: ["SQL"], semester: "Semester 1" };
const pages = (n: number) => Array.from({ length: n }, (_, i) => ({ url: `https://u/${i}`, markdown: "" }));

beforeEach(() => {
  vi.clearAllMocks();
  clearMemCache();
  vi.stubEnv("DEMO_MODE", "false");
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.mocked(fcScrapeMarkdown).mockResolvedValue("# BSc Computer Science");
  vi.mocked(fcScrapeJSON).mockResolvedValue({ units: [unit] });
  vi.mocked(fcSearch).mockResolvedValue(Array.from({ length: 10 }, (_, i) => ({ url: `https://s/${i}`, title: "t" })));
});
afterEach(() => vi.unstubAllEnvs());

describe("normalisation", () => {
  it("maps semester strings and derives the year from the code", () => {
    expect(normaliseSemester("Semester 2")).toBe("2");
    expect(normaliseSemester("Full year")).toBe("full-year");
    expect(yearFromCode("COMP23111")).toBe(2);
  });

  it("falls back to the code's last digit for the semester", () => {
    expect(normaliseSemester(undefined, "COMP16412")).toBe("2");
    expect(normaliseSemester(undefined, "COMP10120")).toBe("full-year");
  });

  it("dedupes units by code", () => {
    expect(dedupeUnits([unit, { ...unit, title: "Same code" }])).toHaveLength(1);
  });
});

describe("extractProgramme", () => {
  it("falls back to search and caps it at 8 results when the crawl finds one page", async () => {
    vi.mocked(fcCrawl).mockResolvedValue(pages(1));
    await extractProgramme({ url: "https://prog", programmeId: "t-fallback" });
    expect(fcSearch).toHaveBeenCalled();
    expect(fcScrapeJSON).toHaveBeenCalledTimes(9); // the programme page plus 8 results
  });

  it("never crawls in text mode", async () => {
    vi.mocked(llmJSON).mockResolvedValue({ units: [unit] });
    const p = await extractProgramme({ text: "x".repeat(60), programmeId: "t-text" });
    expect(fcCrawl).not.toHaveBeenCalled();
    expect(p.modules[0].code).toBe("COMP23111");
  });

  it("emits events in pipeline order", async () => {
    vi.mocked(fcCrawl).mockResolvedValue(pages(3));
    await extractProgramme({ url: "https://prog", programmeId: "t-events", runId: "r" });
    const events = vi.mocked(emit).mock.calls.map(([e]) => e).filter((e) => e.agent === "syllabus");
    expect(events.map((e) => e.status)).toEqual(["started", "progress", "progress", "progress", "done"]);
    expect(events[1].message).toContain("crawled 3 pages");
    expect(events[2].message).toContain("extracted 1 course units");
    expect(events[3].message).toContain("mapped");
  });

  it("uses the stored data in demo mode without touching Firecrawl", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const p = await extractProgramme({ url: "https://prog", programmeId: "uom-bsc-cs" });
    expect(p.id).toBe("uom-bsc-cs");
    expect(fcCrawl).not.toHaveBeenCalled();
  });
});
