import { beforeEach, describe, expect, it, vi } from "vitest";
import { InterviewFeedbackZ } from "@/lib/schemas/voice";

const { llmJSON, store } = vi.hoisted(() => ({
  llmJSON: vi.fn(),
  store: {
    get: vi.fn(async (): Promise<unknown> => null),
    list: vi.fn(async () => []),
    upsert: vi.fn(async (_c: string, _id: string, doc: unknown, _userId?: string) => doc),
    remove: vi.fn(async () => {}),
  },
}));
vi.mock("@/lib/llm", () => ({ llmJSON, llmText: vi.fn(), LLMError: class LLMError extends Error {} }));
vi.mock("@/lib/store", () => ({ getStore: () => store }));

import { fillerWordsPerMin, scoreInterview } from "./interviewScoring";

const TRANSCRIPT = [
  "ai: Tell me a little about yourself.",
  "user: Um, so I'm a first-year student. Like, I wanted to build things, you know, that help people.",
  "ai: What did you do in your pod?",
  "user: I wrote the Dockerfile and, um, basically cut the image from 3GB to 900MB.",
].join("\n");

function upsertsTo(collection: string) {
  return store.upsert.mock.calls.filter((c) => c[0] === collection);
}

describe("fillerWordsPerMin", () => {
  it("counts um, ', like,' and basically over 60 seconds as 3.0", () => {
    expect(fillerWordsPerMin("user: um I think, like, it was basically fine", 60)).toBe(3.0);
  });

  it("does not count 'like' used as a verb", () => {
    expect(fillerWordsPerMin("user: I like Python", 60)).toBe(0);
  });

  it("counts 'like,' at the start of a clause", () => {
    expect(fillerWordsPerMin("user: Like, I enjoy it. Like, a lot.", 60)).toBe(2);
  });

  it("ignores the interviewer's lines", () => {
    expect(fillerWordsPerMin("ai: um, so, like, basically you know\nuser: I built a REST API.", 60)).toBe(0);
  });

  it("scales by duration and rounds to one decimal place", () => {
    // 7 fillers in 90 seconds = 4.666… per minute
    expect(fillerWordsPerMin("user: um uh erm umm uhh literally sort of fine", 90)).toBe(4.7);
  });

  it("returns 0 for a zero or negative duration", () => {
    expect(fillerWordsPerMin("user: um um", 0)).toBe(0);
    expect(fillerWordsPerMin("user: um um", -5)).toBe(0);
  });
});

describe("scoreInterview", () => {
  beforeEach(() => {
    llmJSON.mockReset();
    store.upsert.mockClear();
    store.get.mockReset();
    store.get.mockResolvedValue(null);
  });

  it("merges the LLM scores with the filler rate and saves the interview, a momentum event and evidence", async () => {
    llmJSON.mockResolvedValue({
      scores: { content: 4, structure: 3, clarity: 4, confidence: 3 },
      strengths: ["Clear Docker example", "Concrete numbers"],
      improvements: ["Use situation → action → result", "Pause instead of 'um'"],
    });

    const fb = await scoreInterview({ userId: "aisha", roleId: "ml-engineer", transcript: TRANSCRIPT, durationSec: 120 });

    expect(InterviewFeedbackZ.parse(fb)).toBeTruthy();
    expect(fb.fillerWordsPerMin).toBe(fillerWordsPerMin(TRANSCRIPT, 120));
    expect(fb.fillerWordsPerMin).toBeGreaterThan(0);
    expect(fb).toMatchObject({ userId: "aisha", roleId: "ml-engineer", transcript: TRANSCRIPT, scores: { content: 4, clarity: 4 } });
    expect(Number.isNaN(Date.parse(fb.createdAt))).toBe(false);

    const call = llmJSON.mock.calls[0][0];
    expect(call.system).toContain("encouraging interview coach");
    expect(call.user).toMatch(/^ROLE: ML engineer\nTRANSCRIPT:\nai: Tell me/);

    const [interview] = upsertsTo("interviews");
    expect(interview[1]).toMatch(/^aisha_\d+$/);
    expect(interview[2]).toEqual({ id: interview[1], ...fb });
    expect(interview[3]).toBe("aisha");

    const [momentum] = upsertsTo("momentum_events");
    expect(momentum[2]).toMatchObject({ id: momentum[1], userId: "aisha", kind: "mock-interview", ts: fb.createdAt });
    expect(momentum[3]).toBe("aisha");

    const [evidence] = upsertsTo("evidence");
    expect(evidence[1]).toBe("ev_communication_keystone-interview_aisha");
    expect(evidence[2]).toMatchObject({
      id: "ev_communication_keystone-interview_aisha",
      userId: "aisha",
      skillId: "communication",
      source: "keystone-interview",
      level: 2, // mean(clarity 4, confidence 3) = 3.5
      confidence: 0.6,
      url: "/interview",
    });
  });

  it("falls back to neutral 3s with a filler tip when the LLM throws", async () => {
    llmJSON.mockRejectedValue(new Error("no_key"));
    const transcript = "ai: Hi\nuser: um um um, like, basically I um built it";

    const fb = await scoreInterview({ userId: "aisha", roleId: "ml-engineer", transcript, durationSec: 60 });

    expect(fb.scores).toEqual({ content: 3, structure: 3, clarity: 3, confidence: 3 });
    expect(fb.fillerWordsPerMin).toBe(6);
    expect(fb.strengths).toHaveLength(2);
    expect(fb.improvements).toHaveLength(2);
    expect(fb.improvements.filter((t) => /filler/i.test(t))).toHaveLength(1);
    expect(upsertsTo("interviews")).toHaveLength(1);
    expect(upsertsTo("momentum_events")).toHaveLength(1);
    expect(upsertsTo("evidence")[0][2]).toMatchObject({ level: 1 });
  });

  it("gives no filler tip in the fallback when the filler rate is low", async () => {
    llmJSON.mockRejectedValue(new Error("timeout"));
    const fb = await scoreInterview({ userId: "aisha", roleId: "ml-engineer", transcript: "user: I built an API.", durationSec: 60 });
    expect(fb.improvements.some((t) => /filler/i.test(t))).toBe(false);
  });

  it("falls back when the LLM returns out-of-range scores", async () => {
    llmJSON.mockResolvedValue({ scores: { content: 9, structure: 3, clarity: 3, confidence: 3 }, strengths: ["a", "b"], improvements: ["c", "d"] });
    const fb = await scoreInterview({ userId: "aisha", roleId: "ml-engineer", transcript: "user: hi", durationSec: 30 });
    expect(fb.scores.content).toBe(3);
  });

  it("never lowers communication evidence the student already earned", async () => {
    llmJSON.mockRejectedValue(new Error("no_key"));
    store.get.mockResolvedValue({ id: "ev_communication_keystone-interview_aisha", userId: "aisha", level: 2, quote: "earlier run" });
    await scoreInterview({ userId: "aisha", roleId: "ml-engineer", transcript: "user: hi", durationSec: 30 });
    expect(upsertsTo("evidence")[0][2]).toMatchObject({ level: 2, quote: "earlier run" });
  });

  it("still returns feedback when the store fails", async () => {
    llmJSON.mockRejectedValue(new Error("no_key"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    store.upsert.mockRejectedValueOnce(new Error("db down"));
    const fb = await scoreInterview({ userId: "aisha", roleId: "ml-engineer", transcript: "user: hi", durationSec: 30 });
    expect(fb.scores.clarity).toBe(3);
    warn.mockRestore();
  });
});
