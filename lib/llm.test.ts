import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ parse: vi.fn(), create: vi.fn() }));
vi.mock("openai", () => ({
  default: class { chat = { completions: { parse: m.parse, create: m.create } }; embeddings = { create: vi.fn() }; },
}));
vi.mock("openai/helpers/zod", () => ({ zodResponseFormat: () => ({}) }));
import { llmJSON, LLMError, embed, cosine } from "./llm";

const schema = z.object({ n: z.number() });
const opts = { agent: "roadmap" as const, system: "s", user: "u", schema, schemaName: "T" };
const reply = (content: string) => ({ choices: [{ message: { content } }] });

beforeEach(() => { m.parse.mockReset(); m.create.mockReset(); process.env.OPENAI_API_KEY = "test"; process.env.DEMO_MODE = "false"; });

describe("llmJSON", () => {
  it("returns parsed output from structured outputs", async () => {
    m.parse.mockResolvedValue({ choices: [{ message: { parsed: { n: 1 } } }] });
    expect(await llmJSON(opts)).toEqual({ n: 1 });
  });
  it("falls back to JSON mode and retries once on invalid output", async () => {
    m.parse.mockRejectedValue(new Error("unsupported"));
    m.create.mockResolvedValueOnce(reply('{"n":"x"}')).mockResolvedValueOnce(reply('{"n":2}'));
    expect(await llmJSON(opts)).toEqual({ n: 2 });
    expect(m.create).toHaveBeenCalledTimes(2);
  });
  it("throws LLMError when invalid twice", async () => {
    m.parse.mockRejectedValue(new Error("unsupported"));
    m.create.mockResolvedValue(reply("nope"));
    await expect(llmJSON(opts)).rejects.toBeInstanceOf(LLMError);
  });
  it("calls the client once per cacheKey", async () => {
    m.parse.mockResolvedValue({ choices: [{ message: { parsed: { n: 3 } } }] });
    await llmJSON({ ...opts, cacheKey: "k1" }); await llmJSON({ ...opts, cacheKey: "k1" });
    expect(m.parse).toHaveBeenCalledTimes(1);
  });
  it("throws LLMError(no_key) without a key", async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(llmJSON(opts)).rejects.toThrow("no_key");
  });
});

describe("embed fallback", () => {
  it("is deterministic, unit length, and cosine(self)=1", async () => {
    delete process.env.OPENAI_API_KEY;
    const [a] = await embed(["Docker and Python"]); const [b] = await embed(["Docker and Python"]);
    expect(a).toEqual(b);
    expect(Math.hypot(...a)).toBeCloseTo(1);
    expect(cosine(a, b)).toBeCloseTo(1);
  });
});
