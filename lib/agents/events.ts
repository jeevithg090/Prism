import "server-only";
import { nanoid } from "nanoid";
import type { AgentEvent, AgentName } from "@/lib/types";

// In-memory agent event bus (contract §8). One log per run (last MAX_PER_RUN events), replayed to late
// subscribers, so the SSE stream and the `?poll=1` fallback both see the whole run. State lives on
// globalThis because Next bundles each route separately and dev reloads modules.
const MAX_PER_RUN = 200;
const MAX_RUNS = 100;

type Listener = (e: AgentEvent) => void;
type G = { __ksEvents?: Map<string, AgentEvent[]>; __ksSubs?: Map<string, Set<Listener>> };
const g = globalThis as unknown as G;
const logs: Map<string, AgentEvent[]> = (g.__ksEvents ??= new Map());
const subs: Map<string, Set<Listener>> = (g.__ksSubs ??= new Map());

/** True when an event ends a run: the stream closes and the client stops listening. */
export function isTerminal(e: Pick<AgentEvent, "agent" | "status">): boolean {
  return e.agent === "orchestrator" && (e.status === "done" || e.status === "error");
}

export function emit(e: Omit<AgentEvent, "ts">): AgentEvent {
  const ev: AgentEvent = { ...e, ts: new Date().toISOString() };
  let log = logs.get(e.runId);
  if (!log) {
    log = [];
    logs.set(e.runId, log);
    // Forget the oldest runs so a long-running server doesn't grow without bound.
    while (logs.size > MAX_RUNS) {
      const oldest = logs.keys().next().value as string;
      logs.delete(oldest);
      if (!subs.get(oldest)?.size) subs.delete(oldest);
    }
  }
  log.push(ev);
  if (log.length > MAX_PER_RUN) log.shift();
  for (const cb of [...(subs.get(e.runId) ?? [])]) {
    try { cb(ev); } catch { /* one broken listener never stops the others */ }
  }
  return ev;
}

/** Emit only when there is a run to report to (agents called outside a run pass `runId: undefined`). */
export function emitIf(runId: string | undefined, agent: AgentName, status: AgentEvent["status"], message: string, data?: Record<string, unknown>): void {
  if (runId) emit({ runId, agent, status, message, ...(data ? { data } : {}) });
}

/** Replays the run's past events to `cb`, then streams new ones. Returns the unsubscribe function. */
export function subscribe(runId: string, cb: Listener): () => void {
  let active = true;
  const listener: Listener = (e) => { if (active) cb(e); };
  for (const e of [...(logs.get(runId) ?? [])]) {
    if (!active) break;
    cb(e);
  }
  let set = subs.get(runId);
  if (!set) { set = new Set(); subs.set(runId, set); }
  set.add(listener);
  return () => {
    active = false;
    subs.get(runId)?.delete(listener);
  };
}

/** Snapshot of the run's events so far (the `?poll=1` fallback). */
export function getRunEvents(runId: string): AgentEvent[] {
  return [...(logs.get(runId) ?? [])];
}

export function newRunId(): string {
  return `run_${nanoid(10)}`;
}
