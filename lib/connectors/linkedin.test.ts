import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/agents/events", () => ({ emit: vi.fn() }));
import { CONF_EXPERIENCED, CONF_LISTED, textToLinkedInEvidence } from "./linkedin";

const NOW = new Date("2026-11-01T12:00:00Z");

const EXPORT = [
  "Aisha Rahman",
  "Contact",
  "aisha@example.com",
  "Top Skills",
  "Summary",
  "First-year CS student.",
  "Experience",
  "Teaching Assistant, Code Club",
  "Jun 2025 - Sep 2025 · 4 mos",
  "Taught Python to school pupils and wrote small Docker demos.",
  "Skills",
  "Python • SQL • Docker",
  "Licenses & Certifications",
  "AWS Cloud Practitioner — Amazon Web Services (2025)",
  "Languages",
  "Urdu",
].join("\n");

describe("textToLinkedInEvidence", () => {
  it("maps listed skills at level 1 and bumps the ones used in an experience entry to level 2", () => {
    const { items, stats } = textToLinkedInEvidence("aisha", EXPORT, NOW);
    const byId = Object.fromEntries(items.map((i) => [i.skillId, i]));

    expect(byId.sql).toMatchObject({ level: 1, confidence: CONF_LISTED, source: "linkedin-pdf" });
    expect(byId.python).toMatchObject({ level: 2, confidence: CONF_EXPERIENCED });
    expect(byId.docker).toMatchObject({ level: 2, confidence: CONF_EXPERIENCED });
    expect(byId.python.quote).toContain("from your LinkedIn export");
    expect(stats.experienceEntries).toBe(1);
    expect(stats.certifications).toBe(1);
    expect(stats.skills).toBe(items.length);
  });

  it("never fabricates a URL, stamps the given time, and returns one item per skill sorted by id", () => {
    const { items } = textToLinkedInEvidence("aisha", EXPORT, NOW);
    expect(items.every((i) => i.url === "" && i.createdAt === NOW.toISOString() && i.userId === "aisha")).toBe(true);
    const ids = items.map((i) => i.skillId);
    expect(ids).toEqual([...new Set(ids)].sort());
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });

  it("ignores skills that only appear in unrelated sections", () => {
    const text = ["Summary", "I want to learn Kubernetes one day.", "Skills", "SQL"].join("\n");
    const ids = textToLinkedInEvidence("u1", text, NOW).items.map((i) => i.skillId);
    expect(ids).toContain("sql");
    expect(ids).not.toContain("kubernetes");
  });

  it("reads a fused heading line such as 'Skills: Python, SQL'", () => {
    const ids = textToLinkedInEvidence("u1", "Skills: Python, SQL", NOW).items.map((i) => i.skillId);
    expect(ids).toEqual(expect.arrayContaining(["python", "sql"]));
  });

  it("returns nothing for empty text", () => {
    expect(textToLinkedInEvidence("u1", "", NOW)).toEqual({ items: [], stats: { skills: 0, experienceEntries: 0, certifications: 0 } });
  });
});
