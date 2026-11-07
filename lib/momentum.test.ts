import { describe, expect, it } from "vitest";
import { computeMomentum, dedupeEvents, describeBreakdown, formatChange, isoWeek, newestFirst, POINTS, scoreWeek } from "@/lib/momentum";
import fixture from "@/data/fixtures/momentum-events.aisha.json";

const NOW = new Date("2026-11-07T12:00:00Z"); // Saturday of 2026-W45
const ev = (kind: string, ts: string, userId = "u1") => ({ userId, kind, ts });
const at = (day: string, i = 0) => `${day}T${String(9 + (i % 12)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00Z`;

describe("POINTS", () => {
  it("matches the agreed point values", () => {
    expect(POINTS).toEqual({ "pr-merged": 5, "roadmap-milestone": 4, "helped-newcomer": 3, "mock-interview": 3, "problem-solved": 1 });
  });
});

describe("isoWeek", () => {
  it("uses ISO-8601 week-years", () => {
    expect(isoWeek(new Date("2026-11-07T12:00:00Z"))).toBe("2026-W45");
    expect(isoWeek(new Date("2026-11-02T00:00:00Z"))).toBe("2026-W45"); // Monday
    expect(isoWeek(new Date("2026-11-01T23:59:59Z"))).toBe("2026-W44"); // Sunday before
    expect(isoWeek(new Date("2027-01-01T12:00:00Z"))).toBe("2026-W53");
    expect(isoWeek(new Date("2024-12-30T12:00:00Z"))).toBe("2025-W01");
    expect(isoWeek(new Date("2021-01-03T12:00:00Z"))).toBe("2020-W53");
  });
});

describe("computeMomentum", () => {
  it("2 pr-merged + 1 milestone gives 14", () => {
    const weeks = computeMomentum(
      [ev("pr-merged", "2026-11-03T10:00:00Z"), ev("pr-merged", "2026-11-04T10:00:00Z"), ev("roadmap-milestone", "2026-11-05T10:00:00Z")],
      "u1",
      NOW,
    );
    const last = weeks[weeks.length - 1];
    expect(last.week).toBe("2026-W45");
    expect(last.score).toBe(14);
    expect(last.breakdown).toEqual([
      { kind: "pr-merged", points: 10, count: 2 },
      { kind: "roadmap-milestone", points: 4, count: 1 },
    ]);
  });

  it("caps problem-solved at 10 points a week (15 events → 10)", () => {
    const events = Array.from({ length: 15 }, (_, i) => ev("problem-solved", at("2026-11-04", i)));
    const last = computeMomentum(events, "u1", NOW).at(-1)!;
    expect(last.score).toBe(10);
    expect(last.breakdown).toEqual([{ kind: "problem-solved", points: 10, count: 15 }]);
  });

  it("counts each kind at most 5 times a week", () => {
    const events = Array.from({ length: 7 }, (_, i) => ev("pr-merged", at("2026-11-03", i)));
    expect(computeMomentum(events, "u1", NOW).at(-1)!.score).toBe(25);
  });

  it("counts duplicate events (same kind and ts) once", () => {
    const e = ev("pr-merged", "2026-11-03T10:00:00Z");
    const last = computeMomentum([e, { ...e }, ev("pr-merged", "2026-11-03T10:00:00.000Z")], "u1", NOW).at(-1)!;
    expect(last.score).toBe(5);
    expect(last.breakdown[0].count).toBe(1);
  });

  it("baseline: previous weeks [4, 6, 8, 10] and this week 12 give baseline 7 and changePct 71", () => {
    const events = [
      ev("roadmap-milestone", "2026-10-06T10:00:00Z"), // W41: 4
      ev("mock-interview", "2026-10-13T10:00:00Z"), ev("mock-interview", "2026-10-14T10:00:00Z"), // W42: 6
      ev("roadmap-milestone", "2026-10-20T10:00:00Z"), ev("roadmap-milestone", "2026-10-21T10:00:00Z"), // W43: 8
      ev("pr-merged", "2026-10-27T10:00:00Z"), ev("pr-merged", "2026-10-28T10:00:00Z"), // W44: 10
      ev("roadmap-milestone", "2026-11-02T10:00:00Z"), ev("roadmap-milestone", "2026-11-03T10:00:00Z"), ev("roadmap-milestone", "2026-11-04T10:00:00Z"), // W45: 12
    ];
    const weeks = computeMomentum(events, "u1", NOW);
    expect(weeks.map((w) => w.score)).toEqual([0, 4, 6, 8, 10, 12]);
    const last = weeks.at(-1)!;
    expect(last.baseline).toBe(7);
    expect(last.changePct).toBe(71);
  });

  it("returns the last 6 ISO weeks oldest first, with empty weeks, ending at now's week", () => {
    const weeks = computeMomentum([], "u1", NOW);
    expect(weeks.map((w) => w.week)).toEqual(["2026-W40", "2026-W41", "2026-W42", "2026-W43", "2026-W44", "2026-W45"]);
    for (const w of weeks) expect(w).toMatchObject({ userId: "u1", score: 0, baseline: 1, changePct: 0, breakdown: [] });
  });

  it("crosses ISO year boundaries", () => {
    const weeks = computeMomentum([], "u1", new Date("2027-01-06T12:00:00Z"));
    expect(weeks.map((w) => w.week)).toEqual(["2026-W49", "2026-W50", "2026-W51", "2026-W52", "2026-W53", "2027-W01"]);
  });

  it("ignores other users, unknown kinds and bad dates", () => {
    const last = computeMomentum(
      [ev("pr-merged", "2026-11-03T10:00:00Z", "someone-else"), ev("bogus", "2026-11-03T10:00:00Z"), ev("pr-merged", "not a date"), ev("helped-newcomer", "2026-11-03T10:00:00Z")],
      "u1",
      NOW,
    ).at(-1)!;
    expect(last.score).toBe(3);
  });

  it("the bundled Aisha events rise to +18% in 2026-W45", () => {
    const weeks = computeMomentum(fixture, "aisha", NOW);
    expect(weeks.map((w) => w.score)).toEqual([4, 7, 8, 9, 10, 10]);
    expect(weeks.at(-1)).toMatchObject({ week: "2026-W45", changePct: 18 });
    expect(fixture.length).toBeGreaterThanOrEqual(8);
    expect(fixture.length).toBeLessThanOrEqual(12);
  });
});

describe("helpers", () => {
  it("scoreWeek orders the breakdown by kind", () => {
    expect(scoreWeek(["problem-solved", "helped-newcomer", "pr-merged"]).breakdown.map((b) => b.kind)).toEqual(["pr-merged", "helped-newcomer", "problem-solved"]);
  });
  it("describeBreakdown reads like a sentence", () => {
    expect(describeBreakdown([
      { kind: "pr-merged", points: 10, count: 2 },
      { kind: "roadmap-milestone", points: 4, count: 1 },
      { kind: "helped-newcomer", points: 3, count: 1 },
    ])).toBe("2 merged PRs · 1 milestone · helped 1 newcomer");
    expect(describeBreakdown([])).toBe("");
  });
  it("formatChange signs the number", () => {
    expect(formatChange(18)).toBe("+18%");
    expect(formatChange(0)).toBe("0%");
    expect(formatChange(-12)).toBe("−12%");
  });
  it("dedupeEvents and newestFirst", () => {
    const a = { kind: "pr-merged", ts: "2026-11-03T10:00:00Z" };
    const b = { kind: "pr-merged", ts: "2026-11-05T10:00:00Z" };
    expect(dedupeEvents([a, { ...a }, b])).toHaveLength(2);
    expect(newestFirst([a, b])[0]).toBe(b);
  });
});
