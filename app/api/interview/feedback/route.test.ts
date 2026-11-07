import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InterviewFeedbackZ } from "@/lib/schemas/voice";

const { llmJSON } = vi.hoisted(() => ({ llmJSON: vi.fn() }));
vi.mock("@/lib/llm", () => ({ llmJSON, llmText: vi.fn(), LLMError: class LLMError extends Error {} }));

import { getStore } from "@/lib/store";
import { POST } from "./route";

const URL_ = "http://localhost/api/interview/feedback";
const post = (body: unknown) =>
  new Request(URL_, { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });

const VALID = {
  userId: "aisha",
  roleId: "ml-engineer",
  transcript: "ai: Tell me about yourself.\nuser: Um, I'm a first-year student and, like, I love building things.",
  durationSec: 60,
};

beforeEach(() => {
  llmJSON.mockReset();
  llmJSON.mockRejectedValue(new Error("no_key"));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock("@/lib/voice/interviewScoring");
  vi.resetModules();
});

describe("POST /api/interview/feedback", () => {
  it("returns 400 for an empty transcript", async () => {
    const res = await POST(post({ ...VALID, transcript: "" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: "bad_request" } });
  });

  it("returns 400 for a whitespace-only transcript, a bad duration or a non-JSON body", async () => {
    expect((await POST(post({ ...VALID, transcript: "  \n " }))).status).toBe(400);
    expect((await POST(post({ ...VALID, durationSec: 0 }))).status).toBe(400);
    expect((await POST(post("not json"))).status).toBe(400);
  });

  it("scores with the LLM and returns InterviewFeedback in the envelope", async () => {
    llmJSON.mockResolvedValue({
      scores: { content: 4, structure: 3, clarity: 4, confidence: 4 },
      strengths: ["Warm intro", "Clear motivation"],
      improvements: ["Add an example", "Fewer fillers"],
    });
    const res = await POST(post(VALID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    const fb = InterviewFeedbackZ.parse(body.data);
    expect(fb.scores.confidence).toBe(4);
    expect(fb.fillerWordsPerMin).toBe(2);
  });

  it("works in DEMO_MODE with no LLM key via the neutral fallback, and saves the interview", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const res = await POST(post({ ...VALID, userId: "demo-user" }));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.scores).toEqual({ content: 3, structure: 3, clarity: 3, confidence: 3 });
    expect(await getStore().list("interviews", { userId: "demo-user" })).toHaveLength(1);
    expect(await getStore().list("momentum_events", { userId: "demo-user" })).toHaveLength(1);
  });

  it("returns 500 without leaking details when scoring crashes", async () => {
    vi.resetModules();
    vi.doMock("@/lib/voice/interviewScoring", () => ({
      scoreInterview: vi.fn(async () => {
        throw new Error("secret stack");
      }),
    }));
    const { POST: post500 } = await import("./route");
    const res = await post500(post(VALID));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: { code: "internal", message: "Something went wrong" } });
  });
});
