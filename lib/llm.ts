import "server-only";
import OpenAI from "openai";
import { z } from "zod";
import type { AgentName } from "@/lib/types";
import { emit } from "@/lib/agents/events";

// Keystone's single LLM wrapper (contract §8). OpenAI-backed when OPENAI_API_KEY is set and DEMO_MODE is
// off; otherwise every call throws LLMError so callers use their deterministic fallbacks (demo stays instant).
// Structured output first (json_schema from the zod schema), then JSON mode + zod parse with one repair retry.

export class LLMError extends Error {
  constructor(msg: string, public cause?: unknown) {
    super(msg);
    this.name = "LLMError";
  }
}

type G = { __ksOpenAI?: OpenAI | null; __ksLLMCache?: Map<string, unknown> };
const g = globalThis as unknown as G;
const cache: Map<string, unknown> = (g.__ksLLMCache ??= new Map());

function isDemo() {
  return process.env.DEMO_MODE === "true";
}

function client(): OpenAI {
  if (isDemo()) throw new LLMError("demo_mode");
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new LLMError("no_key");
  if (!g.__ksOpenAI) g.__ksOpenAI = new OpenAI({ apiKey, timeout: 45_000, maxRetries: 1 });
  return g.__ksOpenAI;
}

function model(o?: string) {
  return o ?? process.env.LLM_MODEL ?? "gpt-4.1-mini";
}

function progress(runId: string | undefined, agent: AgentName, message: string) {
  if (!runId) return;
  try {
    emit({ runId, agent, status: "progress", message });
  } catch {
    /* events are best-effort */
  }
}

/** JSON Schema for OpenAI structured outputs; strict mode needs every property required and no extras. */
function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> {
  try {
    return z.toJSONSchema(schema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  } catch {
    return { type: "object" };
  }
}

export async function llmJSON<T>(o: {
  agent: AgentName; runId?: string; system: string; user: string;
  schema: z.ZodType<T>; schemaName: string; model?: string; temperature?: number; cacheKey?: string;
}): Promise<T> {
  if (o.cacheKey && cache.has(o.cacheKey)) return cache.get(o.cacheKey) as T;
  const c = client();
  progress(o.runId, o.agent, "thinking…");
  const base = { model: model(o.model), temperature: o.temperature ?? 0.2 };
  const messages = [
    { role: "system" as const, content: o.system },
    { role: "user" as const, content: o.user },
  ];

  let result: T | undefined;
  // 1) Structured outputs from the zod schema (non-strict so optional fields and unions are allowed).
  try {
    const res = await c.chat.completions.create({
      ...base,
      messages,
      response_format: { type: "json_schema", json_schema: { name: o.schemaName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64), schema: jsonSchemaFor(o.schema), strict: false } },
    });
    const parsed = o.schema.safeParse(JSON.parse(res.choices[0]?.message?.content ?? "null"));
    if (parsed.success) result = parsed.data;
  } catch {
    /* fall through to JSON mode */
  }

  // 2) JSON mode + zod parse, with one repair retry that shows the model its validation error.
  if (result === undefined) {
    const suffix = `\n\nRespond with JSON only, matching this JSON Schema:\n${JSON.stringify(jsonSchemaFor(o.schema)).slice(0, 6000)}`;
    let lastErr = "";
    for (let attempt = 0; attempt < 2 && result === undefined; attempt++) {
      try {
        const res = await c.chat.completions.create({
          ...base,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: o.system + suffix },
            { role: "user", content: attempt === 0 ? o.user : `${o.user}\n\nYour previous JSON failed validation: ${lastErr.slice(0, 800)}. Fix it.` },
          ],
        });
        const parsed = o.schema.safeParse(JSON.parse(res.choices[0]?.message?.content ?? "null"));
        if (parsed.success) result = parsed.data;
        else lastErr = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
      }
    }
    if (result === undefined) throw new LLMError(`invalid_json: ${lastErr}`);
  }

  if (o.cacheKey) cache.set(o.cacheKey, result);
  return result;
}

export async function llmText(o: { agent: AgentName; runId?: string; system: string; user: string; model?: string }): Promise<string> {
  const c = client();
  progress(o.runId, o.agent, "thinking…");
  try {
    const res = await c.chat.completions.create({
      model: model(o.model),
      temperature: 0.4,
      messages: [
        { role: "system", content: o.system },
        { role: "user", content: o.user },
      ],
    });
    const text = res.choices[0]?.message?.content?.trim();
    if (!text) throw new LLMError("empty_response");
    return text;
  } catch (e) {
    if (e instanceof LLMError) throw e;
    throw new LLMError("llm_failed", e);
  }
}

function fnv1a(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic fallback: hashed bag-of-words into 256 buckets, L2-normalised. */
function hashedEmbed(texts: string[]): number[][] {
  return texts.map((t) => {
    const v = new Array(256).fill(0);
    for (const tok of t.toLowerCase().match(/[a-z0-9]+/g) ?? []) v[fnv1a(tok) % 256] += 1;
    const n = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
    return v.map((x) => x / n);
  });
}

export async function embed(texts: string[]): Promise<number[][]> {
  if (isDemo() || !process.env.OPENAI_API_KEY || texts.length === 0) return hashedEmbed(texts);
  try {
    const res = await client().embeddings.create({ model: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small", input: texts });
    return res.data.map((d) => d.embedding);
  } catch {
    return hashedEmbed(texts);
  }
}

export function cosine(a: number[], b: number[]) {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    d += a[i] * b[i];
    na += a[i] ** 2;
    nb += b[i] ** 2;
  }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}
