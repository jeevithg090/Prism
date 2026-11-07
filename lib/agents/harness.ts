import "server-only";
// Keystone agent harness: every agent runs inside the same governed envelope, the way Reply ships
// enterprise agents (observable, guarded, human-in-the-loop, logged).
//
//   runAgent({ agent, purpose, run, fallback?, outputSchema?, guardrails?, checkpoint?, timeoutMs? })
//
// 1. emits `started` (the purpose), then whatever the agent reports through ctx.emit / ctx.step
// 2. runs with a timeout (default 20s) and validates the output with zod
// 3. on error, timeout, invalid output or a blocking guardrail: runs the deterministic fallback
// 4. applies guardrails in order (each may pass, modify or block the output)
// 5. emits `done` with the duration (or `error`), and appends an entry to the `agent_runs` ledger:
//    who ran, why, how long, ok/fallback/error, guardrail results, the human checkpoint, and a short
//    sha256 digest of the input (never the raw input, so no PII lands in the ledger).
import { createHash, randomBytes } from "node:crypto";
import type { z } from "zod";
import { emit } from "@/lib/agents/events";
import { getStore } from "@/lib/store";
import type { AgentEvent, AgentName } from "@/lib/types";

export const AGENT_RUNS = "agent_runs";
export const DEFAULT_TIMEOUT_MS = 20_000;

export type CheckpointKind = "peer-approval" | "student-approval" | "lecturer-decision" | "student-sends";
/** A consequential step a person decides, never the AI ("You decide"). */
export type Checkpoint = { kind: CheckpointKind; who: string; note: string };

export type GuardrailAction = "pass" | "modified" | "blocked";
export type GuardrailFinding = { name: string; action: GuardrailAction; detail?: string };
export type GuardrailResult<O> = { output: O; action: GuardrailAction; detail?: string };

/** What a guardrail can see: the run, the (raw) input and the scratch values the agent recorded. */
export type GuardrailCtx = { runId: string; agent: AgentName; input: unknown; memo: Record<string, unknown> };
export type Guardrail<O> = { name: string; apply(output: O, ctx: GuardrailCtx): GuardrailResult<O> };

export type RunStatus = "ok" | "fallback" | "error";

export type StepDescribe<T> = (result: T) => string | { message: string; data?: Record<string, unknown> };

export interface AgentCtx extends GuardrailCtx {
  /** Emits an agent event for this run (no-op in quiet mode). Never throws. */
  emit(status: AgentEvent["status"], message: string, data?: Record<string, unknown>): void;
  /** Times a sub-step and emits one `progress` event (message and data from `describe`, else the step name). */
  step<T>(name: string, fn: () => Promise<T> | T, describe?: StepDescribe<T>): Promise<T>;
  /** Sets the message (and data) of the harness's final `done` event. */
  done(message: string, data?: Record<string, unknown>): void;
  /** Records that the agent degraded to a deterministic path internally (ledger status `fallback`). */
  degraded(reason: string): void;
  /** Records a guardrail finding produced inside the run (e.g. PII redaction of an LLM prompt). */
  record(finding: GuardrailFinding): void;
  /** Applies guardrails mid-run, before a side effect (e.g. before posting a comment). Throws if one blocks. */
  guard<T>(value: T, guardrails: Guardrail<T>[]): T;
}

export interface AgentSpec<O> {
  agent: AgentName;
  runId?: string;
  /** One plain-English line: why this agent runs. Shown as the `started` message and in the ledger. Never PII. */
  purpose: string;
  /** Only its sha256 digest is stored. */
  input?: unknown;
  /** Extra data for the `started` event (real numbers, e.g. `{ candidates: 40 }`). */
  startData?: Record<string, unknown>;
  outputSchema?: z.ZodType<O>;
  run: (ctx: AgentCtx) => Promise<O>;
  fallback?: (err: unknown, ctx: AgentCtx) => O | Promise<O>;
  guardrails?: Guardrail<O>[];
  timeoutMs?: number;
  checkpoint?: Checkpoint;
  /** No events (the ledger entry is still written). */
  quiet?: boolean;
}

export interface AgentRunMeta {
  entryId: string;
  runId: string;
  agent: AgentName;
  status: RunStatus;
  usedFallback: boolean;
  durationMs: number;
  guardrails: GuardrailFinding[];
  checkpoint?: Checkpoint;
}

export interface AgentRunEntry {
  id: string;
  runId: string;
  agent: AgentName;
  purpose: string;
  startedAt: string;
  durationMs: number;
  status: RunStatus;
  usedFallback: boolean;
  /** Why the fallback ran (short, plain English). */
  fallbackReason?: string;
  guardrails: GuardrailFinding[];
  checkpoint?: Checkpoint;
  /** First 12 hex chars of sha256(JSON input). Never the raw input. */
  inputDigest: string;
  model: string;
  steps: { name: string; durationMs: number }[];
  /** Short error message when status is `error`. */
  error?: string;
}

// ---------- errors ----------
export class AgentTimeoutError extends Error {
  constructor(public readonly ms: number) {
    super(`timed out after ${ms}ms`);
    this.name = "AgentTimeoutError";
  }
}
export class OutputSchemaError extends Error {
  constructor(message: string) {
    super(`output failed validation: ${message}`);
    this.name = "OutputSchemaError";
  }
}
export class GuardrailBlockedError extends Error {
  constructor(public readonly guardrail: string, detail?: string) {
    super(`blocked by ${guardrail}${detail ? `: ${detail}` : ""}`);
    this.name = "GuardrailBlockedError";
  }
}

// ---------- helpers ----------
const LABELS: Record<AgentName, string> = {
  orchestrator: "Orchestrator", syllabus: "Syllabus Agent", skillmap: "Skill Mapper", market: "Market Agent",
  trends: "Trend Forecaster", evidence: "Evidence Agent", roadmap: "Roadmap Agent", matchmaker: "Matchmaker",
  architect: "Project Architect", techlead: "AI Tech Lead", trajectories: "Trajectories", guides: "Guides",
  voice: "Voice", n8n: "Automations",
};
export const agentLabel = (a: AgentName): string => LABELS[a] ?? a;

/** Short, non-reversible digest of the input (12 hex chars of sha256). */
export function digestInput(input: unknown): string {
  let json: string;
  try {
    json = JSON.stringify(input ?? null) ?? "null";
  } catch {
    json = "[unserialisable]";
  }
  return createHash("sha256").update(json).digest("hex").slice(0, 12);
}

const shortError = (e: unknown): string => {
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "unknown error";
  return msg.split("\n")[0].slice(0, 200);
};

const localRunId = () => `run_${randomBytes(4).toString("hex")}`;

type G = { __ksRunSeq?: Map<string, number> };
const seq: Map<string, number> = ((globalThis as unknown as G).__ksRunSeq ??= new Map());
function nextEntryId(runId: string, agent: AgentName): string {
  const key = `${runId}:${agent}`;
  const n = (seq.get(key) ?? 0) + 1;
  seq.set(key, n);
  return `${key}:${n}`;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) return p;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const t = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AgentTimeoutError(ms)), ms);
  });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

function applyGuardrails<O>(value: O, guardrails: Guardrail<O>[], ctx: GuardrailCtx, findings: GuardrailFinding[]): O {
  let out = value;
  for (const g of guardrails) {
    let r: GuardrailResult<O>;
    try {
      r = g.apply(out, ctx);
    } catch (e) {
      r = { output: out, action: "blocked", detail: `guardrail error: ${shortError(e)}` }; // fail closed
    }
    findings.push({ name: g.name, action: r.action, ...(r.detail ? { detail: r.detail } : {}) });
    if (r.action === "blocked") throw new GuardrailBlockedError(g.name, r.detail);
    out = r.output;
  }
  return out;
}

function validate<O>(schema: z.ZodType<O> | undefined, value: O): O {
  if (!schema) return value;
  const r = schema.safeParse(value);
  if (!r.success) throw new OutputSchemaError(r.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "));
  return r.data;
}

// ---------- the harness ----------
export async function runAgent<O>(spec: AgentSpec<O>): Promise<{ output: O; meta: AgentRunMeta }> {
  const runId = spec.runId ?? localRunId();
  const { agent } = spec;
  const startedAt = new Date();
  const t0 = performance.now();
  const findings: GuardrailFinding[] = [];
  const steps: { name: string; durationMs: number }[] = [];
  let doneMsg: { message: string; data?: Record<string, unknown> } | null = null;
  let degradedReason: string | undefined;

  const send = (status: AgentEvent["status"], message: string, data?: Record<string, unknown>) => {
    if (spec.quiet) return;
    try {
      emit({ runId, agent, status, message, ...(data ? { data } : {}) });
    } catch {
      /* the event bus never breaks an agent */
    }
  };

  // A context goes quiet once its path is abandoned (e.g. the primary run timed out and the fallback took over).
  const makeCtx = (active: () => boolean = () => true): AgentCtx => {
    const ctx: AgentCtx = {
      runId, agent, input: spec.input, memo: {},
      emit: (status, message, data) => { if (active()) send(status, message, data); },
      async step<T>(name: string, fn: () => Promise<T> | T, describe?: StepDescribe<T>): Promise<T> {
        const s0 = performance.now();
        const result = await fn();
        const durationMs = Math.round(performance.now() - s0);
        steps.push({ name, durationMs });
        let message = name;
        let data: Record<string, unknown> | undefined;
        try {
          const d = describe?.(result);
          if (typeof d === "string") message = d;
          else if (d) ({ message, data } = d);
        } catch {
          /* keep the step name */
        }
        if (active()) send("progress", message, { ...(data ?? {}), step: name, durationMs });
        return result;
      },
      done(message, data) { if (active()) doneMsg = { message, data }; },
      degraded(reason) { if (active()) degradedReason ??= reason; },
      record(f) { if (active()) findings.push(f); },
      guard<T>(value: T, guardrails: Guardrail<T>[]): T { return applyGuardrails(value, guardrails, ctx, findings); },
    };
    return ctx;
  };

  send("started", spec.purpose, spec.startData);

  const timeoutMs = spec.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const guardrails = spec.guardrails ?? [];
  let status: RunStatus = "ok";
  let usedFallback = false;
  let fallbackReason: string | undefined;
  let output: O | undefined;
  let failure: unknown;

  let primaryActive = true;
  try {
    const ctx = makeCtx(() => primaryActive);
    const raw = await withTimeout(Promise.resolve().then(() => spec.run(ctx)), timeoutMs);
    output = applyGuardrails(validate(spec.outputSchema, raw), guardrails, ctx, findings);
    if (degradedReason) {
      status = "fallback";
      usedFallback = true;
      fallbackReason = degradedReason;
    }
  } catch (err) {
    primaryActive = false;
    if (spec.fallback) {
      usedFallback = true;
      status = "fallback";
      fallbackReason = shortError(err);
      doneMsg = null;
      try {
        const fctx = makeCtx(); // fresh memo: guardrails judge the fallback on its own path
        const raw = await spec.fallback(err, fctx);
        output = applyGuardrails(validate(spec.outputSchema, raw), guardrails, fctx, findings);
        send("progress", `${agentLabel(agent)} hit a problem, so it used its safe fallback`, { reason: fallbackReason });
      } catch (fallbackErr) {
        status = "error";
        failure = fallbackErr;
      }
    } else {
      status = "error";
      failure = err;
    }
  }

  const durationMs = Math.round(performance.now() - t0);
  const entryId = nextEntryId(runId, agent);
  const entry: AgentRunEntry = {
    id: entryId,
    runId,
    agent,
    purpose: spec.purpose,
    startedAt: startedAt.toISOString(),
    durationMs,
    status,
    usedFallback,
    ...(fallbackReason ? { fallbackReason } : {}),
    guardrails: findings,
    ...(spec.checkpoint ? { checkpoint: spec.checkpoint } : {}),
    inputDigest: digestInput(spec.input),
    model: process.env.LLM_MODEL || "deterministic",
    steps,
    ...(status === "error" ? { error: shortError(failure) } : {}),
  };
  try {
    await getStore().upsert(AGENT_RUNS, entryId, entry);
  } catch {
    /* the ledger never breaks an agent */
  }

  if (status === "error") {
    send("error", `${agentLabel(agent)}: ${shortError(failure)}`, { durationMs });
    throw failure;
  }
  const final = doneMsg as { message: string; data?: Record<string, unknown> } | null;
  send("done", final?.message ?? `${agentLabel(agent)} finished`, {
    ...(final?.data ?? {}),
    durationMs,
    usedFallback,
    ...(spec.checkpoint ? { checkpoint: spec.checkpoint.kind } : {}),
  });
  return {
    output: output as O,
    meta: { entryId, runId, agent, status, usedFallback, durationMs, guardrails: findings, ...(spec.checkpoint ? { checkpoint: spec.checkpoint } : {}) },
  };
}

// ---------- ledger reads (GET /api/agents/runs) ----------
export async function listRuns(filter: { runId?: string; agent?: AgentName | string; limit?: number } = {}): Promise<AgentRunEntry[]> {
  const limit = Math.max(1, Math.min(200, filter.limit ?? 50));
  const all = await getStore().list<AgentRunEntry>(AGENT_RUNS);
  return all
    .filter((e) => e && typeof e.id === "string")
    .filter((e) => !filter.runId || e.runId === filter.runId)
    .filter((e) => !filter.agent || e.agent === filter.agent)
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : b.id.localeCompare(a.id)))
    .slice(0, limit);
}
