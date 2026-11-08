import { describe, expect, it } from "vitest";
import type { HelpRequest, Profile } from "@/lib/types";
import { displayName, helpersThisWeek, sortHelpFeed } from "./help";

const profile = (id: string, badges: Profile["badges"]): Profile => ({
  id, name: id.toUpperCase(), programmeId: "uom-bsc-cs", year: 1, startedAt: "2026-09-21", badges,
  interests: [], availability: [],
  dna: { targetRoles: ["ml-engineer"], timelineLabel: "", targetDate: "2027-09-01", hoursPerWeek: 5, theoryPractice: 50, formats: [], budget: "free", constraints: [], accessibility: [], language: "en" },
});
const req = (id: string, fromUserId: string, createdAt: string, extra: Partial<HelpRequest> = {}): HelpRequest => ({
  id, fromUserId, kind: "question", message: `msg ${id}`, status: "open", createdAt, ...extra,
});

describe("sortHelpFeed", () => {
  const profiles = { aisha: profile("aisha", ["new-to-uni", "international"]), leo: profile("leo", ["new-to-uni"]), tom: profile("tom", []) };

  it("puts requests from 🌱 new-to-uni students first, then newest first", () => {
    const input = [
      req("a", "tom", "2026-11-07T12:00:00Z"),
      req("b", "aisha", "2026-11-05T12:00:00Z"),
      req("c", "ghost", "2026-11-07T13:00:00Z"), // no profile → not a newcomer
      req("d", "leo", "2026-11-06T12:00:00Z"),
    ];
    expect(sortHelpFeed(input, profiles).map((r) => r.id)).toEqual(["d", "b", "c", "a"]);
    expect(input.map((r) => r.id)).toEqual(["a", "b", "c", "d"]); // not mutated
  });

  it("falls back to newest first when no profiles are known", () => {
    const input = [req("old", "aisha", "2026-11-01T00:00:00Z"), req("new", "tom", "2026-11-07T00:00:00Z")];
    expect(sortHelpFeed(input, {}).map((r) => r.id)).toEqual(["new", "old"]);
  });
});

describe("helpersThisWeek", () => {
  const now = new Date("2026-11-07T15:00:00Z");
  it("counts accepted/done requests from the last 7 days and keeps the top 5", () => {
    const input = [
      req("1", "aisha", "2026-11-07T10:00:00Z", { status: "accepted", toUserId: "priya" }),
      req("2", "leo", "2026-11-06T10:00:00Z", { status: "done", toUserId: "priya" }),
      req("3", "leo", "2026-11-05T10:00:00Z", { status: "done", toUserId: "tom" }),
      req("4", "leo", "2026-10-20T10:00:00Z", { status: "done", toUserId: "tom" }), // too old
      req("5", "leo", "2026-11-06T10:00:00Z", { status: "open" }), // still open
      ...["v", "w", "x", "y", "z"].map((h, i) => req(`x${i}`, "leo", "2026-11-04T10:00:00Z", { status: "done", toUserId: h })),
    ];
    const top = helpersThisWeek(input, now);
    expect(top).toHaveLength(5);
    expect(top[0]).toEqual({ userId: "priya", count: 2 });
    expect(top.find((h) => h.userId === "tom")).toEqual({ userId: "tom", count: 1 });
  });

  it("is empty when nobody has helped yet", () => {
    expect(helpersThisWeek([req("1", "aisha", "2026-11-07T10:00:00Z")], now)).toEqual([]);
  });
});

describe("displayName", () => {
  it("uses the profile name, else the capitalised id", () => {
    expect(displayName("aisha", profile("aisha", []))).toBe("AISHA");
    expect(displayName("priya")).toBe("Priya");
  });
});
