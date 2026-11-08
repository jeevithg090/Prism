import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const create = vi.fn();
const embCreate = vi.fn();
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create } };
    embeddings = { create: embCreate };
  },
}));
vi.mock("@/lib/agents/events", () => ({ emit: vi.fn() }));

const reply = (content: string) => ({ choices: [{ message: { content } }] });
const Schema = z.object({ skill: z.string(), weeks: z.number() });

async function fresh() {
  vi.resetModules();
  (globalThis as { __ksOpenAI?: unknown; __ksLLMCache?: unknown }).__ksOpenAI = undefined;
  (globalThis as { __ksLLMCache?: unknown }).__ksLLMCache = undefined;
  return import("./llm");
}

beforeEach(() => {
  create.mockReset();
  embCreate.mockReset();
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("DEMO_MODE", "false");
});
afterEach(() => vi.unstubAllEnvs());

describe("llmJSON", () => {
  it("returns the structured-output result", async () => {
    const { llmJSON } = await fresh();
    create.mockResolvedValueOnce(reply('{"skill":"docker","weeks":2}'));
    await expect(llmJSON({ agent: "roadmap", system: "s", user: "u", schema: Schema, schemaName: "plan" })).resolves.toEqual({ skill: "docker", weeks: 2 });
    expect(create.mock.calls[0][0].response_format.type).toBe("json_schema");
  });

  it("falls back to JSON mode and repairs once after a validation error", async () => {
    const { llmJSON } = await fresh();
    create
      .mockRejectedValueOnce(new Error("json_schema unsupported"))
      .mockResolvedValueOnce(reply('{"skill":"docker"}'))
      .mockResolvedValueOnce(reply('{"skill":"docker","weeks":3}'));
    await expect(llmJSON({ agent: "roadmap", system: "s", user: "u", schema: Schema, schemaName: "plan" })).resolves.toEqual({ skill: "docker", weeks: 3 });
    expect(create).toHaveBeenCalledTimes(3);
    expect(create.mock.calls[2][0].messages[1].content).toContain("failed validation");
  });

  it("throws LLMError when the JSON stays invalid", async () => {
    const { llmJSON, LLMError } = await fresh();
    create.mockResolvedValue(reply('{"nope":true}'));
    await expect(llmJSON({ agent: "roadmap", system: "s", user: "u", schema: Schema, schemaName: "plan" })).rejects.toBeInstanceOf(LLMError);
  });

  it("calls the model once per cacheKey", async () => {
    const { llmJSON } = await fresh();
    create.mockResolvedValue(reply('{"skill":"sql","weeks":1}'));
    const o = { agent: "roadmap" as const, system: "s", user: "u", schema: Schema, schemaName: "plan", cacheKey: "k1" };
    await llmJSON(o);
    await llmJSON(o);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("throws demo_mode / no_key so callers use their deterministic fallbacks", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    let m = await fresh();
    await expect(m.llmText({ agent: "techlead", system: "s", user: "u" })).rejects.toThrow("demo_mode");
    vi.stubEnv("DEMO_MODE", "false");
    vi.stubEnv("OPENAI_API_KEY", "");
    m = await fresh();
    await expect(m.llmText({ agent: "techlead", system: "s", user: "u" })).rejects.toThrow("no_key");
    expect(create).not.toHaveBeenCalled();
  });
});

describe("embed", () => {
  it("uses OpenAI embeddings when available and falls back to the hashed vectors on error", async () => {
    const { embed, cosine } = await fresh();
    embCreate.mockResolvedValueOnce({ data: [{ embedding: [1, 0] }] });
    await expect(embed(["docker"])).resolves.toEqual([[1, 0]]);
    embCreate.mockRejectedValueOnce(new Error("down"));
    const [a, b] = await embed(["docker python", "docker python"]);
    expect(a).toHaveLength(256);
    expect(cosine(a, b)).toBeCloseTo(1);
  });
});
