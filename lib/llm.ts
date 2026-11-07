import "server-only";
import OpenAI from "openai";
import { z } from "zod";
import type { AgentName } from "@/lib/types";
import { emit } from "@/lib/agents/events";
import { LLMError } from "@/lib/llm-error";
import { formatRecordedAt, replayOrRecord, type ReplayMatch, type ReplayRecord } from "@/lib/replay";

// Keystone's single LLM wrapper (contract §8). OpenAI-backed when OPENAI_API_KEY is set and DEMO_MODE is
// off; otherwise every call throws LLMError so callers use their deterministic fallbacks (demo stays instant).
// Structured output first (json_schema from the zod schema), then JSON mode + zod parse with one repair retry.
// The Demo toggle (lib/replay.ts): in Live mode every answer is recorded; in Demo mode the recorded answer of
// the same call from a real run is replayed (and the Activity panel says so).

export { LLMError };

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

function progress(runId: string | undefined, agent: AgentName, message: string, data?: Record<string, unknown>) {
  if (!runId) return;
  try {
    emit({ runId, agent, status: "progress", message, ...(data ? { data } : {}) });
  } catch {
    /* events are best-effort */
  }
}

/** Activity panel line for a replayed answer: it came from a real run, not a template. */
function replayed(runId: string | undefined, agent: AgentName) {
  return (rec: ReplayRecord, match: ReplayMatch = "exact") =>
    progress(
      runId, agent,
      `replayed from a ${match === "exact" ? "" : "similar "}real run (${rec.meta.model ?? "AI model"}, recorded ${formatRecordedAt(rec.recordedAt)})`,
      { replay: true, match, recordedAt: rec.recordedAt, model: rec.meta.model ?? null },
    );
}

/** Activity panel line for a Demo miss: say plainly that no real run was recorded for this call. */
function missed(runId: string | undefined, agent: AgentName) {
  return (live: boolean) =>
    progress(runId, agent, live ? "not recorded yet: asking the AI model live" : "not recorded: used Keystone's template", {
      replay: false, missed: true, live,
    });
}

/** A Demo miss without a key behaves exactly like a call without a key. */
const REPLAY = { requires: ["OPENAI_API_KEY"], missError: () => new LLMError("no_key") };

/** JSON Schema for OpenAI structured outputs; strict mode needs every property required and no extras. */
function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> {
  try {
    return z.toJSONSchema(schema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  } catch {
    return { type: "object" };
  }
}

type JSONCall<T> = {
  agent: AgentName; runId?: string; system: string; user: string;
  schema: z.ZodType<T>; schemaName: string; model?: string; temperature?: number; cacheKey?: string;
  /**
   * Demo toggle: coarser key parts for a last-resort replay when the app's state differs from the recorded
   * run (e.g. the coach step without its student-context system prompt). See ReplayOptions.alt.
   */
  replayAlt?: unknown;
};

async function liveJSON<T>(o: JSONCall<T>, modelName: string): Promise<T> {
  const c = client();
  progress(o.runId, o.agent, "thinking…");
  const base = { model: modelName, temperature: o.temperature ?? 0.2 };
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
  return result;
}

export async function llmJSON<T>(o: JSONCall<T>): Promise<T> {
  if (o.cacheKey && cache.has(o.cacheKey)) return cache.get(o.cacheKey) as T;
  if (isDemo()) throw new LLMError("demo_mode");
  const m = model(o.model);
  const result = await replayOrRecord<T>(
    "llm",
    { fn: "llmJSON", agent: o.agent, schemaName: o.schemaName, system: o.system, user: o.user, model: m },
    () => liveJSON(o, m),
    {
      ...REPLAY,
      meta: { agent: o.agent, schemaName: o.schemaName, model: m, label: o.user },
      // A recording only replays while it still matches the caller's schema.
      validate: (v) => o.schema.safeParse(v).success,
      onReplay: replayed(o.runId, o.agent),
      onMiss: missed(o.runId, o.agent),
      ...(o.replayAlt === undefined ? {} : { alt: { fn: "llmJSON", agent: o.agent, schemaName: o.schemaName, model: m, alt: o.replayAlt } }),
    },
  );
  if (o.cacheKey) cache.set(o.cacheKey, result);
  return result;
}

export async function llmText(o: { agent: AgentName; runId?: string; system: string; user: string; model?: string; replayAlt?: unknown }): Promise<string> {
  if (isDemo()) throw new LLMError("demo_mode");
  const m = model(o.model);
  return replayOrRecord<string>(
    "llm",
    { fn: "llmText", agent: o.agent, system: o.system, user: o.user, model: m },
    async () => {
      const c = client();
      progress(o.runId, o.agent, "thinking…");
      try {
        const res = await c.chat.completions.create({
          model: m,
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
    },
    {
      ...REPLAY,
      meta: { agent: o.agent, model: m, label: o.user },
      validate: (v) => typeof v === "string" && v.trim().length > 0,
      onReplay: replayed(o.runId, o.agent),
      onMiss: missed(o.runId, o.agent),
      ...(o.replayAlt === undefined ? {} : { alt: { fn: "llmText", agent: o.agent, model: m, alt: o.replayAlt } }),
    },
  );
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

/** 6 decimals keep cosine similarity identical to ~1e-6 and halve the size of recorded vectors. */
const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

export async function embed(texts: string[]): Promise<number[][]> {
  if (isDemo() || texts.length === 0) return hashedEmbed(texts);
  const m = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
  try {
    return await replayOrRecord<number[][]>(
      "embed",
      { fn: "embed", texts, model: m },
      async () => {
        if (!process.env.OPENAI_API_KEY) throw new LLMError("no_key");
        const res = await client().embeddings.create({ model: m, input: texts });
        return res.data.map((d) => d.embedding.map(round6));
      },
      {
        ...REPLAY,
        meta: { kind: "embedding", model: m, label: `${texts.length} texts: ${texts.join(" | ")}` },
        validate: (v) => Array.isArray(v) && v.length === texts.length && v.every((row) => Array.isArray(row) && row.length > 0),
        loose: false,
      },
    );
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
