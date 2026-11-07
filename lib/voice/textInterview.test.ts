import { beforeEach, describe, expect, it, vi } from "vitest";

const { llmText } = vi.hoisted(() => ({ llmText: vi.fn() }));
vi.mock("@/lib/llm", () => ({ llmText, llmJSON: vi.fn(), LLMError: class LLMError extends Error {} }));

import { nextQuestion } from "./textInterview";

type Turn = { role: "ai" | "user"; text: string };

const VARS = {
  name: "Aisha",
  year: "1",
  role: "ML engineer",
  top_skills: "Python, Git, HTML and CSS",
  gaps: "Docker, PyTorch, SQL",
  project_title: "VisionAid: accessible image captioning API",
  week_focus: "Docker",
};

const CLOSING = "That's the end of your practice interview. Your feedback is on screen.";

describe("nextQuestion", () => {
  beforeEach(() => {
    llmText.mockReset();
    llmText.mockRejectedValue(new Error("no_key"));
  });

  it("runs the full five-question script without an LLM and ends with done:true", async () => {
    const history: Turn[] = [];
    const asked: string[] = [];
    for (let i = 0; i < 5; i++) {
      const q = await nextQuestion(history, VARS);
      expect(q.done).toBe(false);
      asked.push(q.text);
      history.push({ role: "ai", text: q.text }, { role: "user", text: `Answer ${i + 1}` });
    }

    expect(asked[0]).toBe(
      "Hi Aisha, thanks for joining. This is a five-minute practice interview for the ML engineer role. Ready? Tell me a little about yourself and what got you into computing.",
    );
    expect(asked[1]).toContain("Python");
    expect(asked[2]).toContain("VisionAid: accessible image captioning API");
    expect(asked[2]).toMatch(/challenge/);
    expect(asked[3]).toContain("Docker");
    expect(asked[3]).toMatch(/learning/);
    expect(asked[4]).toMatch(/feedback/);
    expect(new Set(asked).size).toBe(5);
    for (const q of asked.slice(1)) expect(q.split(/\s+/).length).toBeLessThanOrEqual(30);

    await expect(nextQuestion(history, VARS)).resolves.toEqual({ text: CLOSING, done: true });
  });

  it("uses the LLM for follow-up questions with the interviewer prompt filled in", async () => {
    llmText.mockResolvedValue('Interviewer: "Nice! How would you profile a slow Python function?"');
    const history: Turn[] = [
      { role: "ai", text: "Hi Aisha…" },
      { role: "user", text: "I'm a first-year CS student." },
    ];

    const q = await nextQuestion(history, VARS);

    expect(q).toEqual({ text: "Nice! How would you profile a slow Python function?", done: false });
    const call = llmText.mock.calls[0][0];
    expect(call.system).toContain("You are interviewing Aisha, a year 1 Computer Science student");
    expect(call.system).toContain('Their current team project: "VisionAid: accessible image captioning API"');
    expect(call.system).not.toMatch(/\{\{/);
    expect(call.user).toContain("Candidate: I'm a first-year CS student.");
    expect(call.user).toContain("question 2");
  });

  it("always opens with the fixed first message, even when the LLM is available", async () => {
    llmText.mockResolvedValue("Something else");
    const q = await nextQuestion([], VARS);
    expect(q.text).toMatch(/^Hi Aisha, thanks for joining/);
    expect(llmText).not.toHaveBeenCalled();
  });

  it("ends after five answers without calling the LLM", async () => {
    llmText.mockResolvedValue("Another question?");
    const history: Turn[] = Array.from({ length: 5 }, (_, i) => [
      { role: "ai" as const, text: `Q${i}` },
      { role: "user" as const, text: `A${i}` },
    ]).flat();
    await expect(nextQuestion(history, VARS)).resolves.toEqual({ text: CLOSING, done: true });
    expect(llmText).not.toHaveBeenCalled();
  });

  it("falls back to the script when the LLM returns an empty reply", async () => {
    llmText.mockResolvedValue("   ");
    const q = await nextQuestion([{ role: "ai", text: "Hi" }, { role: "user", text: "Hello" }], VARS);
    expect(q.text).toContain("Python");
  });

  it("fills sensible defaults when variables are missing", async () => {
    const q = await nextQuestion([], {});
    expect(q.text).toMatch(/^Hi there, thanks for joining/);
    expect(q.text).not.toMatch(/\{\{|undefined/);
  });

  it("rejects invalid history", async () => {
    await expect(nextQuestion([{ role: "bot", text: "x" }] as unknown as Turn[], VARS)).rejects.toThrow(/invalid/i);
  });
});
