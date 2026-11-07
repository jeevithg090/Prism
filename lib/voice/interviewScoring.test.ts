import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ upsert: vi.fn(async (...a: unknown[]) => a[2]), llm: vi.fn() }));
vi.mock("@/lib/store", () => ({ getStore: () => ({ upsert: h.upsert, get: async () => null, list: async () => [], remove: async () => {} }) }));
vi.mock("@/lib/llm", () => ({ llmJSON: h.llm, llmText: vi.fn(), LLMError: class extends Error {} }));
vi.mock("@/lib/agents/events", () => ({ emit: vi.fn(), newRunId: () => "run_iv", subscribe: vi.fn() }));

import { fillerWordsPerMin, scoreInterview, scoreTranscript, userText } from "./interviewScoring";
import { formatTranscript, practiceQuestions, sampleAnswers } from "./questions";
import { InterviewResultZ } from "./schemas";

beforeEach(() => { h.upsert.mockClear(); h.llm.mockReset(); delete process.env.DEMO_MODE; });

describe("fillerWordsPerMin", () => {
  it("counts um, comma-wrapped like and basically: 3 over 60 s = 3.0", () => {
    expect(fillerWordsPerMin("user: um I think, like, it was basically fine", 60)).toBe(3);
  });
  it("doesn't count 'like' as a verb", () => {
    expect(fillerWordsPerMin("user: I like Python", 60)).toBe(0);
  });
  it("ignores the interviewer's lines", () => {
    expect(fillerWordsPerMin("ai: um, basically, you know\nuser: I built it.", 60)).toBe(0);
  });
  it("rounds to one decimal and handles a zero duration", () => {
    expect(fillerWordsPerMin("user: um uh erm", 90)).toBe(2);
    expect(fillerWordsPerMin("user: um", 0)).toBe(0);
  });
  it("treats an unlabelled transcript as the candidate's words", () => {
    expect(userText("um so I built it")).toBe("um so I built it");
  });
});

describe("scoreTranscript (rules)", () => {
  const vars = { name: "Aisha", pr_title: "Containerise the captioning API with Docker", pr_skill: "Docker", pr_skill_id: "docker", reviewer: "Priya", week_focus: "PyTorch", pod_name: "Pod Orbit", project_title: "VisionAid", pr_status: "merged" };
  const qs = practiceQuestions(vars);
  const ans = sampleAnswers(vars);
  const transcript = formatTranscript(qs.flatMap((q, i) => [{ speaker: "ai" as const, text: q }, { speaker: "user" as const, text: ans[i] }]));

  it("scores a strong STAR answer with Docker detail highly", () => {
    const r = scoreTranscript({ transcript, durationSec: 180, skillId: "docker" });
    expect(r.scores.content).toBeGreaterThanOrEqual(4);
    expect(r.scores.structure).toBe(5);
    expect(r.detail.star).toEqual(["situation", "task", "action", "result"]);
    expect(r.detail.keywordHits).toEqual(expect.arrayContaining(["dockerfile", "container", "layer"]));
    expect(r.strengths).toHaveLength(2);
    expect(r.improvements).toHaveLength(2);
  });
  it("scores a vague, hesitant answer low on content, structure and confidence", () => {
    const r = scoreTranscript({ transcript: "user: um I basically, like, did some stuff, you know, um it was kind of fine I guess", durationSec: 30, skillId: "docker" });
    expect(r.scores.content).toBeLessThanOrEqual(2);
    expect(r.scores.structure).toBeLessThanOrEqual(2);
    expect(r.scores.confidence).toBe(1);
    expect(r.improvements.join(" ")).toMatch(/um|filler/i);
  });
  it("penalises very long sentences on clarity", () => {
    const long = Array.from({ length: 50 }, (_, i) => `word${i}`).join(" ");
    const r = scoreTranscript({ transcript: `user: ${long}.`, durationSec: 60, skillId: "docker" });
    expect(r.scores.clarity).toBe(1);
  });
});

describe("scoreInterview", () => {
  const input = { userId: "aisha", roleId: "ml-engineer", roleName: "ML engineer", transcript: "ai: Q\nuser: In our pod my issue was to containerise the API. I wrote the Dockerfile from a slim base image and moved pip install above COPY so the layer cache works, because builds were slow. As a result builds went from 4 minutes to 20 seconds and Priya approved it.", durationSec: 60, skillId: "docker", prTitle: "Containerise the captioning API with Docker" };

  it("falls back to rule scores when the LLM throws, and saves interview, momentum and evidence", async () => {
    h.llm.mockRejectedValue(new Error("no_key"));
    const r = await scoreInterview(input);
    expect(InterviewResultZ.safeParse(r).success).toBe(true);
    expect(r.scoredBy).toBe("rules");
    const cols = h.upsert.mock.calls.map((c) => c[0]);
    expect(cols).toEqual(expect.arrayContaining(["interviews", "momentum_events", "evidence"]));
    const iv = h.upsert.mock.calls.find((c) => c[0] === "interviews")!;
    expect(iv[3]).toBe("aisha");
    expect(iv[2]).toMatchObject({ userId: "aisha", roleId: "ml-engineer", scores: r.scores });
    const mom = h.upsert.mock.calls.find((c) => c[0] === "momentum_events")![2] as { kind: string };
    expect(mom.kind).toBe("mock-interview");
    const ev = h.upsert.mock.calls.filter((c) => c[0] === "evidence").map((c) => c[2] as { skillId: string; source: string; level: number });
    expect(ev.map((e) => e.skillId)).toEqual(["communication", "docker"]);
    expect(ev.every((e) => e.source === "keystone-interview")).toBe(true);
    expect(ev[1].level).toBe(3);
    expect(r.evidence.map((e) => e.label)).toEqual(["Communication", "Docker (explained)"]);
  });

  it("blends in the LLM's scores and uses its strengths when it answers", async () => {
    h.llm.mockResolvedValue({ scores: { content: 3, structure: 3, clarity: 3, confidence: 3 }, strengths: ["A", "B"], improvements: ["C", "D"] });
    const r = await scoreInterview(input);
    expect(r.scoredBy).toBe("rules+llm");
    expect(r.strengths).toEqual(["A", "B"]);
    expect(r.fillerWordsPerMin).toBe(0);
  });

  it("skips the LLM in DEMO_MODE and doesn't save skill proof when the content is thin", async () => {
    process.env.DEMO_MODE = "true";
    const r = await scoreInterview({ ...input, transcript: "user: um it was fine" });
    expect(h.llm).not.toHaveBeenCalled();
    expect(r.evidence.map((e) => e.skillId)).toEqual(["communication"]);
  });
});
