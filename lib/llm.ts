import "server-only";
import type { z } from "zod";
import type { AgentName } from "@/lib/types";
// SCAFFOLD STUB (owner: P2). Contract signatures; llmJSON/llmText throw LLMError("no_key") so callers use their deterministic fallbacks until P2 lands the OpenAI-backed version.
export class LLMError extends Error { constructor(msg: string, public cause?: unknown) { super(msg); } }
export async function llmJSON<T>(o: { agent: AgentName; runId?: string; system: string; user: string; schema: z.ZodType<T>; schemaName: string; model?: string; temperature?: number; cacheKey?: string }): Promise<T> {
  void o; throw new LLMError("no_key");
}
export async function llmText(o: { agent: AgentName; runId?: string; system: string; user: string; model?: string }): Promise<string> {
  void o; throw new LLMError("no_key");
}
function fnv1a(s: string) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
export async function embed(texts: string[]): Promise<number[][]> {
  return texts.map((t) => {
    const v = new Array(256).fill(0);
    for (const tok of t.toLowerCase().match(/[a-z0-9]+/g) ?? []) v[fnv1a(tok) % 256] += 1;
    const n = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
    return v.map((x) => x / n);
  });
}
export function cosine(a: number[], b: number[]) { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; } return na && nb ? d / Math.sqrt(na * nb) : 0; }
