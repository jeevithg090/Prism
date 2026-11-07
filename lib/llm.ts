import "server-only";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { z } from "zod";
import type { AgentName } from "@/lib/types";
import { emitIf } from "@/lib/agents/events";

export class LLMError extends Error {
  constructor(msg: string, public cause?: unknown) { super(msg); this.name = "LLMError"; }
}

const g = globalThis as unknown as { __ksLlmCache?: Map<string, unknown> };
const memo = (g.__ksLlmCache ??= new Map<string, unknown>());

const client = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const modelOf = (m?: string) => m ?? process.env.LLM_MODEL ?? "gpt-4o-mini";

export async function llmJSON<T>(o: {
  agent: AgentName; runId?: string; system: string; user: string; schema: z.ZodType<T>;
  schemaName: string; model?: string; temperature?: number; cacheKey?: string;
}): Promise<T> {
  if (o.cacheKey && memo.has(o.cacheKey)) return memo.get(o.cacheKey) as T;
  if (!process.env.OPENAI_API_KEY) throw new LLMError("no_key");
  emitIf(o.runId, o.agent, "progress", "thinking…");
  const c = client();
  const model = modelOf(o.model);
  const temperature = o.temperature ?? 0.2;

  let result: T | undefined;
  try {
    const res = await c.chat.completions.parse({
      model, temperature,
      messages: [{ role: "system", content: o.system }, { role: "user", content: o.user }],
      response_format: zodResponseFormat(o.schema as never, o.schemaName),
    });
    const parsed = res.choices[0]?.message?.parsed;
    if (parsed == null) throw new Error("empty parse");
    result = parsed as T;
  } catch {
    // Fallback: JSON mode + zod parse + 1 retry with the error appended.
    let user = o.user;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2 && result === undefined; attempt++) {
      try {
        const res = await c.chat.completions.create({
          model, temperature, response_format: { type: "json_object" },
          messages: [
            { role: "system", content: `${o.system}\n\nRespond with JSON only matching the requested fields (${o.schemaName}).` },
            { role: "user", content: user },
          ],
        });
        result = o.schema.parse(JSON.parse(res.choices[0]?.message?.content ?? ""));
      } catch (err) {
        lastErr = err;
        user = `${o.user}\n\nYour previous reply was invalid: ${(err as Error).message}. Return corrected JSON only.`;
      }
    }
    if (result === undefined) throw new LLMError(`llmJSON failed for ${o.schemaName}`, lastErr);
  }
  if (o.cacheKey) memo.set(o.cacheKey, result);
  return result as T;
}

export async function llmText(o: { agent: AgentName; runId?: string; system: string; user: string; model?: string }): Promise<string> {
  if (!process.env.OPENAI_API_KEY) throw new LLMError("no_key");
  emitIf(o.runId, o.agent, "progress", "thinking…");
  try {
    const res = await client().chat.completions.create({
      model: modelOf(o.model),
      messages: [{ role: "system", content: o.system }, { role: "user", content: o.user }],
    });
    return (res.choices[0]?.message?.content ?? "").trim();
  } catch (err) { throw new LLMError("llmText failed", err); }
}

const DIM = 256;
function fallbackEmbed(text: string): number[] {
  const v = new Array<number>(DIM).fill(0);
  for (const tok of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    let h = 0x811c9dc5; // FNV-1a
    for (let i = 0; i < tok.length; i++) { h ^= tok.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    v[h % DIM] += 1;
  }
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}

export async function embed(texts: string[]): Promise<number[][]> {
  if (process.env.OPENAI_API_KEY && process.env.DEMO_MODE !== "true") {
    try {
      const res = await client().embeddings.create({ model: "text-embedding-3-small", input: texts });
      return res.data.map((d) => d.embedding);
    } catch { /* fall through to deterministic fallback */ }
  }
  return texts.map(fallbackEmbed);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
