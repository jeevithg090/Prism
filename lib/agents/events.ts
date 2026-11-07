import "server-only";
import { EventEmitter } from "node:events";
import { nanoid } from "nanoid";
import type { AgentEvent, AgentName } from "@/lib/types";

const g = globalThis as unknown as { __ksBus?: EventEmitter; __ksLog?: Map<string, AgentEvent[]> };
const bus = (g.__ksBus ??= new EventEmitter().setMaxListeners(100));
const log = (g.__ksLog ??= new Map<string, AgentEvent[]>());

export const newRunId = () => `run_${nanoid(10)}`;

export function emit(e: Omit<AgentEvent, "ts">): void {
  const ev: AgentEvent = { ...e, ts: new Date().toISOString() };
  const arr = log.get(e.runId) ?? [];
  arr.push(ev);
  if (arr.length > 200) arr.shift();
  log.set(e.runId, arr);
  bus.emit(e.runId, ev);
}

/** No-op when runId is undefined, so agents can call it unconditionally. */
export function emitIf(
  runId: string | undefined, agent: AgentName, status: AgentEvent["status"],
  message: string, data?: Record<string, unknown>,
): void {
  if (runId) emit({ runId, agent, status, message, data });
}

export function subscribe(runId: string, cb: (e: AgentEvent) => void): () => void {
  [...(log.get(runId) ?? [])].forEach(cb); // replay for late subscribers
  bus.on(runId, cb);
  return () => { bus.off(runId, cb); };
}

/** Logged events for a run (used by the SSE poll mode). */
export const getLog = (runId: string): AgentEvent[] => [...(log.get(runId) ?? [])];
