import "server-only";
import type { AgentEvent } from "@/lib/types";
type G = { __ksEvents?: Map<string, AgentEvent[]>; __ksSubs?: Map<string, Set<(e: AgentEvent) => void>> };
const g = globalThis as unknown as G;
const logs: Map<string, AgentEvent[]> = (g.__ksEvents ??= new Map());
const subs: Map<string, Set<(e: AgentEvent) => void>> = (g.__ksSubs ??= new Map());
export function emit(e: Omit<AgentEvent, "ts">): void {
  const ev: AgentEvent = { ...e, ts: new Date().toISOString() };
  const log = logs.get(e.runId) ?? []; log.push(ev); if (log.length > 200) log.shift(); logs.set(e.runId, log);
  subs.get(e.runId)?.forEach((cb) => cb(ev));
}
export function subscribe(runId: string, cb: (e: AgentEvent) => void): () => void {
  (logs.get(runId) ?? []).forEach(cb);
  const set = subs.get(runId) ?? new Set(); set.add(cb); subs.set(runId, set);
  return () => set.delete(cb);
}
export function newRunId(): string { return `run_${Math.random().toString(36).slice(2, 10)}`; }
