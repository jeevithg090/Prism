import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { emit } = vi.hoisted(() => ({ emit: vi.fn() }));
vi.mock("@/lib/agents/events", () => ({ emit }));
const h = vi.hoisted(() => ({ store: null as unknown as ReturnType<typeof import("@/lib/graph/testStore").memStore> }));
vi.mock("@/lib/store", () => ({ getStore: () => h.store }));

import { memStore } from "@/lib/graph/testStore";
import { looksLikePublicProfile, pageToEvidence, parseProfileHtml, profileUrl, syncHackerRankEvidence } from "./hackerrank";

const ENV = ["FIRECRAWL_API_KEY", "DEMO_MODE"] as const;
let saved: Record<string, string | undefined> = {};
beforeEach(() => {
  vi.clearAllMocks();
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  for (const k of ENV) delete process.env[k];
  h.store = memStore();
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const k of ENV) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
});

// Faithful excerpts of the real server-rendered profile page (www.hackerrank.com/profile/<handle>): one
// <div class="hacker-badge"> block per badge, with the badge name in <text class="badge-title">, the earned
// star count as that many class="badge-star" icons, the colour tier in class="ui-badge level-*", plus
// verified certificates keyed by /certificates/<hash> with the name after the Certificate: label.
const badge = (name: string, tier: "gold" | "silver" | "bronze", stars: number) =>
  `<div class="hacker-badge"><div class="ui-tooltip-wrapper"><div location="[object Object]" class="ui-badge level-${tier}"><div class="ui-badge-wrap"><svg viewBox="0 0 91 100" class="hexagon"><g><text class="badge-title" x="50%" y="65.5" font-size="10">${name}</text><g class="star-section" transform="translate(-21.5, 0)">${Array.from({ length: stars }, () => '<svg class="badge-star" viewBox="0 0 6.54904 6.258"><path class="star" d="M55"></path></svg>').join("")}</g></g></svg></div></div></div></div>`;
const cert = (hash: string, name: string) =>
  `<a class="certificate-link hacker-certificate wider-certificate-name" href="/certificates/${hash}"><div class="certificate_v3 certificate_v3-skill"><div class="certificate_v3-folded-corner"></div><div class="certificate_v3-container"><h2 class="certificate_v3-heading"><span class="sr-only">Certificate: </span>${name}</h2></div><span class="certificate_v3-heading-verified" aria-hidden="true"><strong>Verified</strong></span><div class="certificate_v3-ribbon">skill</div></div></a>`;

const PROFILE_HTML = `<html><body><h1>Pavith Bambaravanage</h1>
<section class="section-card hacker-badges"><header class="section-card-header"><h2 class="section-card-heading"> Badges</h2></header>
<div class="section-card-content"><div class="hacker-badges-v2"><div class="badges-wrap">
${badge("Problem Solving", "gold", 5)}${badge("Python", "bronze", 1)}${badge("Days of Code", "silver", 2)}${badge("Functional Programming", "gold", 3)}
</div></div></div></section>
<a class="certificate-link hacker-certificate" href="/certificates/ee63d77d64ac">...</a>${cert("ee63d77d64ac", "Python (Basic)")}
${cert("7d0a91fe2fc3", "SQL (Advanced)")}${cert("fcd73a4796ec", "Problem Solving (Intermediate)")}
${cert("41587c2ae147", "Software Engineer")}</body></html>`;

const ERROR_HTML = "<html><body><h1>Something went wrong!</h1><p>Some error occured while loading page for you. Please try again.</p></body></html>";

describe("parseProfileHtml + looksLikePublicProfile (pure)", () => {
  it("parses badge names with the earned star count and the colour-tier floor when stars are missing", () => {
    const p = parseProfileHtml(PROFILE_HTML);
    expect(p.badges.map((b) => b.name)).toEqual(["Problem Solving", "Python", "Days of Code", "Functional Programming"]);
    expect(p.badges.map((b) => b.stars)).toEqual([5, 1, 2, 3]);
    expect(parseProfileHtml(PROFILE_HTML.replace(new RegExp('<svg class="badge-star"', "g"), "")).badges.find((b) => b.name === "Problem Solving")?.stars).toBe(5);
    expect(parseProfileHtml(PROFILE_HTML.replace(new RegExp('class="ui-badge', "g"), "")).badges[0].stars).toBe(5);
  });

  it("parses verified certificates and tolerates gaps between the link and the heading", () => {
    const names = parseProfileHtml(PROFILE_HTML).certificates.map((c) => c.name);
    expect(names).toEqual(["Python (Basic)", "SQL (Advanced)", "Problem Solving (Intermediate)", "Software Engineer"]);
    expect(parseProfileHtml(PROFILE_HTML).certificates).toHaveLength(4);
  });

  it("returns nothing for a page that isn't a public profile (error / challenge pages)", () => {
    expect(parseProfileHtml(ERROR_HTML)).toEqual({ badges: [], certificates: [] });
    expect(looksLikePublicProfile(PROFILE_HTML)).toBe(true);
    expect(looksLikePublicProfile(ERROR_HTML)).toBe(false);
    expect(looksLikePublicProfile('<html><body><p>Checking your browser before accessing.</p></body></html>')).toBe(false);
  });
});

describe("pageToEvidence (pure mapper)", () => {
  it("maps verified platform facts to skills from the catalogue only, capped at level 2", () => {
    const items = pageToEvidence("hr_user", parseProfileHtml(PROFILE_HTML), profileUrl("Pavith_DB"));
    const bySkill = Object.fromEntries(items.map((e) => [e.skillId, e]));
    expect(Object.keys(bySkill).sort()).toEqual(["algorithms", "data-structures", "python", "sql"]);
    expect(bySkill.python).toMatchObject({
      id: "ev_hr_user_python_hackerrank", userId: "hr_user", level: 1, confidence: 0.75, source: "hackerrank",
      url: "https://www.hackerrank.com/profile/Pavith_DB",
      quote: "HackerRank Python badge with 1 star and a verified Python (Basic) certificate",
    });
    expect(bySkill["data-structures"]).toMatchObject({
      id: "ev_hr_user_data-structures_hackerrank", level: 2, confidence: 0.75,
      quote: "HackerRank Problem Solving badge with 5 stars and a verified Problem Solving (Intermediate) certificate",
    });
    expect(bySkill.algorithms).toMatchObject({ level: 2, confidence: 0.75 });
    expect(bySkill.sql).toMatchObject({
      id: "ev_hr_user_sql_hackerrank", level: 2, confidence: 0.8,
      quote: "HackerRank verified SQL (Advanced) certificate",
    });
  });

  it("merges a badge and its certificate into one skill id and keeps every item within the caps", () => {
    const now = new Date("2026-11-08T10:00:00Z");
    const items = pageToEvidence("aisha", parseProfileHtml(PROFILE_HTML), profileUrl("aisha-demo"), now);
    for (const e of items) {
      expect(e.level).toBeLessThanOrEqual(2);
      expect(e.confidence).toBeLessThanOrEqual(0.8);
      expect(e.id.startsWith("ev_aisha_")).toBe(true);
      expect(e.id.endsWith("_hackerrank")).toBe(true);
      expect(e.createdAt).toBe(now.toISOString());
      expect((e.quote ?? "").match(/\.|!/g) ?? []).toHaveLength(0); // one plain-English sentence
      expect(e.quote?.startsWith("HackerRank")).toBe(true);
    }
    // "Problem Solving" proves two skills; "Days of Code" / "Functional Programming" / the role certificate map to none.
    expect(items.filter((e) => ["data-structures", "algorithms"].includes(e.skillId)).length).toBe(2);
    expect(items.length).toBe(4);
  });

  it("drops badges whose track has no skill id and never invents ids", () => {
    const items = pageToEvidence("hr_user", parseProfileHtml('<div class="hacker-badge">' + badge("Functional Programming", "gold", 3)), profileUrl("x"));
    expect(items).toEqual([]);
  });

  it("names the strongest certificate when several certificates map to the same skill", () => {
    const page: Parameters<typeof pageToEvidence>[1] = {
      badges: [],
      certificates: [{ name: "SQL (Basic)" }, { name: "SQL (Intermediate)" }, { name: "SQL (Advanced)" }],
    };
    expect(pageToEvidence("hr_user", page, profileUrl("Pavith_DB"))).toEqual([
      expect.objectContaining({ skillId: "sql", level: 2, confidence: 0.8, quote: "HackerRank verified SQL (Advanced) certificate" }),
    ]);
  });
});

describe("syncHackerRankEvidence", () => {
  it("reads the public profile, upserts items with deterministic ids, emits and returns the full list", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("hackerrank.com/profile")) return new Response(PROFILE_HTML, { status: 200 });
      throw new Error(`unexpected fetch ${url}`);
    });
    const out = await syncHackerRankEvidence({ userId: "hr_user", handle: "Pavith_DB", runId: "run_t" });

    expect(spy.mock.calls.every((c) => String(c[0]).includes("hackerrank.com/profile"))).toBe(true);
    expect(spy.mock.calls.some((c) => String(c[0]).includes("api.firecrawl.dev"))).toBe(false);
    expect(out.map((e) => e.id).sort()).toEqual([
      "ev_hr_user_algorithms_hackerrank", "ev_hr_user_data-structures_hackerrank", "ev_hr_user_python_hackerrank", "ev_hr_user_sql_hackerrank",
    ]);
    expect(h.store.dump().get("evidence")?.size).toBe(4);
    expect(out.map((e) => e.skillId)).toContain("python");
    expect(out.every((e) => e.source === "hackerrank")).toBe(true);

    expect(emit.mock.calls.map((c) => c[0].status)).toEqual(["started", "progress", "done"]);
    expect(emit.mock.calls[0][0]).toMatchObject({ agent: "evidence", message: "Evidence Agent: reading HackerRank for @Pavith_DB" });
    expect(emit.mock.calls[1][0]).toMatchObject({ message: "read 4 badges · 4 certificates", data: { badges: 4, certificates: 4 } });
    expect(emit.mock.calls[2][0]).toMatchObject({ message: "found 4 skills on HackerRank (3 at level 2)", data: { skills: 4, level2: 3 } });
  });

  it("upserts to the same ids again, so a re-sync refreshes instead of duplicating", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(PROFILE_HTML, { status: 200 }));
    const first = (await syncHackerRankEvidence({ userId: "hr_user", handle: "Pavith_DB" })).map((e) => e.id).sort();
    emit.mockClear();
    const second = (await syncHackerRankEvidence({ userId: "hr_user", handle: "Pavith_DB" })).map((e) => e.id).sort();
    expect(second).toEqual(first);
    expect(h.store.dump().get("evidence")?.size).toBe(4);
  });

  it("falls back to a Firecrawl scrape when the direct page is blocked", async () => {
    process.env.FIRECRAWL_API_KEY = "fckey";
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("hackerrank.com/profile")) return new Response("Access denied", { status: 403 });
      if (url.includes("api.firecrawl.dev/v2/scrape")) return Response.json({ data: { html: PROFILE_HTML } });
      throw new Error(`unexpected fetch ${url}`);
    });
    const out = await syncHackerRankEvidence({ userId: "hr_user", handle: "Pavith_DB", runId: "run_t" });

    expect(spy.mock.calls.some((c) => String(c[0]).includes("api.firecrawl.dev/v2/scrape"))).toBe(true);
    expect(out.map((e) => e.skillId).sort()).toEqual(["algorithms", "data-structures", "python", "sql"]);
    expect(emit.mock.calls[0][0].status).toBe("started");
    expect(emit.mock.calls.at(-1)?.[0]).toMatchObject({ status: "done", message: "found 4 skills on HackerRank (3 at level 2)" });
  });

  it("keeps the evidence we already have and emits a kind error when every path is blocked", async () => {
    process.env.FIRECRAWL_API_KEY = "fckey";
    h.store.upsert("evidence", "ev_hr_user_git_github", { id: "ev_hr_user_git_github", userId: "hr_user", skillId: "git", level: 1, confidence: 0.5, source: "github", url: "https://github.com/x", createdAt: "2026-11-01" }, "hr_user");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("api.firecrawl.dev")) throw new Error("firecrawl down");
      return new Response("Forbidden", { status: 403 });
    });
    const out = await syncHackerRankEvidence({ userId: "hr_user", handle: "Pavith_DB", runId: "run_t" });

    expect(out.map((e) => e.id)).toEqual(["ev_hr_user_git_github"]); // existing evidence kept, nothing invented
    expect(emit.mock.calls.at(-1)?.[0]).toMatchObject({
      agent: "evidence", status: "error",
      message: "HackerRank wasn't available just now: keeping the evidence we already have",
      data: { reason: "firecrawl down" },
    });
  });

  it("degrades without crashing when FIRECRAWL_API_KEY is missing and the direct page is blocked (and never scrapes)", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("hackerrank.com/profile")) return new Response("Forbidden", { status: 403 });
      throw new Error(`unexpected fetch ${String(input)}`);
    });
    const out = await syncHackerRankEvidence({ userId: "hr_user", handle: "Pavith_DB", runId: "run_t" });

    expect(out).toEqual([]);
    expect(spy.mock.calls.filter((c) => String(c[0]).includes("api.firecrawl.dev"))).toHaveLength(0);
    expect(emit.mock.calls.map((c) => c[0].status)).toEqual(["started", "error"]);
    expect(emit.mock.calls.at(-1)?.[0]).toMatchObject({ data: { reason: "no_key" } });
  });

  it("reads an empty or unknown profile as a plain 'nothing found' result, not an error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(ERROR_HTML, { status: 200 }));
    const out = await syncHackerRankEvidence({ userId: "hr_user", handle: "Pavith_DB", runId: "run_t" });

    expect(out).toEqual([]);
    expect(h.store.dump().get("evidence")?.size ?? 0).toBe(0);
    expect(emit.mock.calls.map((c) => c[0].status)).toEqual(["started", "done"]);
    expect(emit.mock.calls.at(-1)?.[0]).toMatchObject({
      status: "done",
      message: "no public HackerRank badges or certificates found for @Pavith_DB — nothing new yet",
      data: { badges: 0, certificates: 0 },
    });
  });

  it("treats a Cloudflare challenge page as blocked and recovers through Firecrawl when a key exists", async () => {
    process.env.FIRECRAWL_API_KEY = "fckey";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).includes("api.firecrawl.dev")
        ? Response.json({ data: { html: PROFILE_HTML } })
        : new Response("<html>Checking your browser before accessing www.hackerrank.com</html>", { status: 200 }),
    );
    const out = await syncHackerRankEvidence({ userId: "hr_user", handle: "Pavith_DB" });
    expect(out.map((e) => e.skillId)).toContain("sql");
  });
});
