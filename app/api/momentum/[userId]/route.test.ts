import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MomentumWeek } from "@/lib/types";
import type { MomentumEvent } from "@/lib/schemas/community";

const db = vi.hoisted(() => ({ rows: {} as Record<string, { doc: unknown; userId?: string }[]> }));
vi.mock("@/lib/store", () => ({
  getStore: () => ({
    get: async () => null,
    list: async (c: string, f?: { userId?: string }) => (db.rows[c] ?? []).filter((r) => !f?.userId || r.userId === f.userId).map((r) => r.doc),
    upsert: async () => undefined,
    remove: async () => undefined,
  }),
}));

import { GET } from "./route";

const NOW = new Date("2026-11-07T12:00:00Z");
const put = (e: MomentumEvent) => (db.rows.momentum_events ??= []).push({ doc: e, userId: e.userId });
const call = (userId: string, qs = "") =>
  GET(new Request(`http://localhost/api/momentum/${userId}${qs}`), { params: Promise.resolve({ userId }) });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  db.rows = {};
  delete process.env.DEMO_MODE;
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.DEMO_MODE;
});

describe("GET /api/momentum/[userId]", () => {
  it("computes 6 weeks (latest last) from the user's stored events", async () => {
    put({ id: "e1", userId: "tom", kind: "pr-merged", ts: "2026-11-03T10:00:00Z" });
    put({ id: "e2", userId: "tom", kind: "pr-merged", ts: "2026-11-04T10:00:00Z" });
    put({ id: "e3", userId: "tom", kind: "roadmap-milestone", ts: "2026-11-05T10:00:00Z" });
    put({ id: "x", userId: "mei", kind: "pr-merged", ts: "2026-11-05T10:00:00Z" });
    const res = await call("tom");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: true; data: MomentumWeek[] };
    expect(body.ok).toBe(true);
    expect(body.data).toHaveLength(6);
    expect(body.data.at(-1)).toMatchObject({ userId: "tom", week: "2026-W45", score: 14 });
  });

  it("?view=events returns verified events newest first, with labels", async () => {
    put({ id: "e1", userId: "tom", kind: "pr-merged", ts: "2026-11-03T10:00:00Z", url: "https://github.com/o/r/pull/1" });
    put({ id: "e2", userId: "tom", kind: "helped-newcomer", ts: "2026-11-05T10:00:00Z", label: "Helped Leo with Git" });
    const body = (await (await call("tom", "?view=events")).json()) as { ok: true; data: MomentumEvent[] };
    expect(body.data.map((e) => e.id)).toEqual(["e2", "e1"]);
    expect(body.data[0].label).toBe("Helped Leo with Git");
    expect(body.data[1]).toMatchObject({ label: "Merged a pull request", url: "https://github.com/o/r/pull/1" });
  });

  it("serves Aisha's fixture when she has no stored events", async () => {
    const body = (await (await call("aisha")).json()) as { ok: true; data: MomentumWeek[] };
    expect(body.data).toHaveLength(6);
    expect(body.data.at(-1)).toMatchObject({ week: "2026-W45", changePct: 18 });

    const events = (await (await call("aisha", "?view=events")).json()) as { ok: true; data: MomentumEvent[] };
    expect(events.data.length).toBeGreaterThanOrEqual(8);
    const ts = events.data.map((e) => Date.parse(e.ts));
    expect(ts).toEqual([...ts].sort((a, b) => b - a));
    expect(events.data.every((e) => !!e.label)).toBe(true);
  });

  it("in DEMO_MODE ignores Aisha's stored events and returns the fixture", async () => {
    process.env.DEMO_MODE = "true";
    put({ id: "live1", userId: "aisha", kind: "helped-newcomer", ts: "2026-11-06T10:00:00Z" });
    const body = (await (await call("aisha")).json()) as { ok: true; data: MomentumWeek[] };
    expect(body.data.at(-1)).toMatchObject({ week: "2026-W45", changePct: 18 });
    const events = (await (await call("aisha", "?view=events")).json()) as { ok: true; data: MomentumEvent[] };
    expect(events.data.some((e) => e.id === "live1")).toBe(false);
  });

  it("adds Aisha's live events on top of her history outside DEMO_MODE", async () => {
    put({ id: "live1", userId: "aisha", kind: "helped-newcomer", ts: "2026-11-07T10:00:00Z" });
    const body = (await (await call("aisha")).json()) as { ok: true; data: MomentumWeek[] };
    expect(body.data.at(-1)).toMatchObject({ week: "2026-W45", score: 13, changePct: 53 });
    const events = (await (await call("aisha", "?view=events")).json()) as { ok: true; data: MomentumEvent[] };
    expect(events.data[0].id).toBe("live1");
  });

  it("returns empty weeks for a user with no events", async () => {
    const body = (await (await call("nobody")).json()) as { ok: true; data: MomentumWeek[] };
    expect(body.data.every((w) => w.score === 0 && w.changePct === 0)).toBe(true);
  });

  it("rejects an unknown view with 400", async () => {
    const res = await call("tom", "?view=everything");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: "bad_request" } });
  });
});
