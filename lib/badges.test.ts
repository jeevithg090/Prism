import { describe, expect, it } from "vitest";
import { badgeContext, computeBadges } from "@/lib/badges";
import type { HelpRequest, InterviewFeedback, Pod, Profile } from "@/lib/types";

const NOW = new Date("2026-11-07T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function profile(over: Partial<Profile> = {}): Profile {
  return {
    id: "u1", name: "Test Student", programmeId: "uom-bsc-cs", year: 1, startedAt: daysAgo(30), badges: [],
    interests: [], availability: [],
    dna: { targetRoles: ["ml-engineer"], timelineLabel: "", targetDate: "2027-09-01", hoursPerWeek: 8, theoryPractice: 50, formats: [], budget: "free", constraints: [], accessibility: [], language: "en" },
    ...over,
  };
}
const ctx = { helpsGiven: 0, shipped: false, now: NOW };

describe("computeBadges", () => {
  it("keeps new-to-uni for someone who started 30 days ago", () => {
    expect(computeBadges(profile({ badges: ["new-to-uni"], startedAt: daysAgo(30) }), ctx)).toEqual(["new-to-uni"]);
  });
  it("drops new-to-uni after 100 days", () => {
    expect(computeBadges(profile({ badges: ["new-to-uni"], startedAt: daysAgo(100) }), ctx)).toEqual([]);
  });
  it("never adds new-to-uni unless the student opted in", () => {
    expect(computeBadges(profile({ startedAt: daysAgo(5) }), ctx)).toEqual([]);
  });
  it("adds helper at 2 helps", () => {
    expect(computeBadges(profile(), { ...ctx, helpsGiven: 1 })).toEqual([]);
    expect(computeBadges(profile(), { ...ctx, helpsGiven: 2 })).toEqual(["helper"]);
  });
  it("adds interview-ready at an average of 3.6", () => {
    expect(computeBadges(profile(), { ...ctx, interviewAvg: 3.6 })).toEqual(["interview-ready"]);
    expect(computeBadges(profile(), { ...ctx, interviewAvg: 3.4 })).toEqual([]);
  });
  it("passes through opt-in badges and adds shipped", () => {
    const p = profile({ badges: ["international", "first-gen", "career-changer", "helper", "shipped"], startedAt: daysAgo(400) });
    expect(computeBadges(p, { ...ctx, shipped: true })).toEqual(["international", "first-gen", "career-changer", "shipped"]);
  });
});

describe("badgeContext", () => {
  const help = (id: string, toUserId: string | undefined, status: HelpRequest["status"]): HelpRequest =>
    ({ id, fromUserId: "x", toUserId, kind: "question", message: "hi", status, createdAt: NOW.toISOString() });
  const interview = (n: number): InterviewFeedback =>
    ({ userId: "u1", roleId: "ml-engineer", scores: { content: n, structure: n, clarity: n, confidence: n }, fillerWordsPerMin: 2, strengths: [], improvements: [], createdAt: NOW.toISOString() });
  const pod = (members: string[], repoUrl?: string): Pod =>
    ({ id: "p", name: "Pod", members: members.map((userId) => ({ userId, learns: [], teaches: [], role: "" })), explanations: [], score: 0.8, createdAt: NOW.toISOString(), project: { title: "t", pitch: "p", milestones: [], issues: [], repoUrl } });

  it("counts accepted/done helps given, shipped pods and the interview mean", () => {
    const c = badgeContext("u1", {
      help: [help("1", "u1", "accepted"), help("2", "u1", "done"), help("3", "u1", "open"), help("4", "u2", "done"), help("5", undefined, "accepted")],
      pods: [pod(["u2"], "https://github.com/o/r"), pod(["u1"], "https://github.com/o/r2")],
      interviews: [interview(3), interview(4)],
    });
    expect(c).toEqual({ helpsGiven: 2, shipped: true, interviewAvg: 3.5 });
  });
  it("is not shipped without a repo and has no average without interviews", () => {
    expect(badgeContext("u1", { help: [], pods: [pod(["u1"])], interviews: [] })).toEqual({ helpsGiven: 0, shipped: false, interviewAvg: undefined });
  });
});
