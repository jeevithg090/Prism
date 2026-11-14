import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withCache } from "./cache";

let prev: string | undefined;
beforeEach(() => { prev = process.env.DEMO_MODE; });
afterEach(() => { if (prev === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = prev; });

describe("withCache", () => {
  it("calls the live function outside DEMO_MODE", async () => {
    delete process.env.DEMO_MODE;
    const fn = vi.fn(async () => ({ live: true }));
    expect(await withCache("market-ml-engineer-uk", fn)).toEqual({ live: true });
    expect(fn).toHaveBeenCalledOnce();
  });

  it("serves the committed cache snapshot in DEMO_MODE without calling the live function", async () => {
    process.env.DEMO_MODE = "true";
    const fn = vi.fn(async () => ({ roleId: "live", adsAnalysed: 0 }));
    const out = await withCache("market-ml-engineer-uk", fn);
    expect(out.roleId).toBe("ml-engineer");
    expect(out.adsAnalysed).toBeGreaterThan(0);
    expect(fn).not.toHaveBeenCalled();
  });

  it("falls back to the named fixture when there is no cache file", async () => {
    process.env.DEMO_MODE = "true";
    const fn = vi.fn(async () => ({ roleId: "live" }));
    const out = await withCache("no-such-key", fn, { fixture: "market.data-analyst.json" });
    expect(out.roleId).toBe("data-analyst");
    expect(fn).not.toHaveBeenCalled();
  });

  it("falls through to the live function when neither cache nor fixture exists", async () => {
    process.env.DEMO_MODE = "true";
    const fn = vi.fn(async () => "live");
    expect(await withCache("no-such-key", fn, { fixture: "no-such-fixture.json" })).toBe("live");
  });
});

describe("committed market snapshots", () => {
  it("match the reviewed fixtures (guards against a test or script overwriting data/cache)", async () => {
    process.env.DEMO_MODE = "true";
    for (const role of ["ml-engineer", "software-engineer", "data-analyst"]) {
      const cached = await withCache<{ adsAnalysed: number; sampleAds: { url: string }[] }>(`market-${role}-uk`, async () => null as never);
      const fixture = (await import(`@/data/fixtures/market.${role}.json`)).default as { adsAnalysed: number };
      expect(cached.adsAnalysed).toBe(fixture.adsAnalysed);
      expect(cached.sampleAds.every((a) => !/adzuna\.co\.uk\/\d+$/.test(a.url))).toBe(true);
    }
  });
});
