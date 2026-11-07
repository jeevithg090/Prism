import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { AgentEvent } from "@/lib/types";

const h = vi.hoisted(() => ({ events: [] as Omit<AgentEvent, "ts">[], rows: new Map<string, unknown>(), failBus: false, failLedger: false }));
vi.mock("@/lib/agents/events", () => ({
  emit: (e: Omit<AgentEvent, "ts">) => { if (h.failBus) throw new Error("bus down"); h.events.push(e); },
}));
vi.mock("@/lib/store", () => ({
  getStore: () => ({
    get: async (_c: string, id: string) => h.rows.get(id) ?? null,
    list: async (c: string) => (c === "agent_runs" ? [...h.rows.values()] : []),
    upsert: async (_c: string, id: string, doc: unknown) => { if (h.failLedger) throw new Error("db down"); h.rows.set(id, doc); return doc; },
    remove: async () => {},
  }),
}));

import { AgentTimeoutError, digestInput, listRuns, runAgent, type AgentRunEntry, type Guardrail } from "./harness";

beforeEach(() => {
  h.events.length = 0;
  h.rows.clear();
  h.failBus = false;
  h.failLedger = false;
  delete process.env.LLM_MODEL;
});

const upper: Guardrail<string> = { name: "upper", apply: (o) => ({ output: o.toUpperCase(), action: "modified", detail: "shouted" }) };
const blocker: Guardrail<string> = { name: "blocker", apply: (o) => ({ output: o, action: o.includes("bad") ? "blocked" : "pass" }) };

describe("runAgent", () => {
  it("emits started → progress (step) → done, applies guardrails in order and writes the ledger", async () => {
    const { output, meta } = await runAgent({
      agent: "matchmaker", runId: "run_a", purpose: "Form a pod", input: { userId: "aisha", email: "a@x.org" },
      startData: { candidates: 4 },
      guardrails: [upper, blocker],
      checkpoint: { kind: "peer-approval", who: "a podmate", note: "A podmate merges" },
      run: async (ctx) => {
        const n = await ctx.step("compare", async () => 4, (k) => `compared ${k} students`);
        ctx.done(`pod of ${n} ready`, { size: n });
        return "ok pod";
      },
    });
    expect(output).toBe("OK POD");
    expect(h.events.map((e) => e.status)).toEqual(["started", "progress", "done"]);
    expect(h.events[0]).toMatchObject({ runId: "run_a", agent: "matchmaker", message: "Form a pod", data: { candidates: 4 } });
    expect(h.events[1]).toMatchObject({ message: "compared 4 students", data: { step: "compare" } });
    expect(h.events[2]).toMatchObject({ message: "pod of 4 ready", data: { size: 4, usedFallback: false, checkpoint: "peer-approval" } });
    expect(typeof h.events[2].data?.durationMs).toBe("number");

    expect(meta).toMatchObject({ entryId: "run_a:matchmaker:1", status: "ok", usedFallback: false });
    const entry = h.rows.get(meta.entryId) as AgentRunEntry;
    expect(entry).toMatchObject({
      id: "run_a:matchmaker:1", runId: "run_a", agent: "matchmaker", purpose: "Form a pod", status: "ok", usedFallback: false,
      guardrails: [{ name: "upper", action: "modified", detail: "shouted" }, { name: "blocker", action: "pass" }],
      checkpoint: { kind: "peer-approval", who: "a podmate", note: "A podmate merges" },
      model: "deterministic", steps: [{ name: "compare" }],
    });
    expect(entry.inputDigest).toBe(digestInput({ userId: "aisha", email: "a@x.org" }));
    expect(entry.inputDigest).toMatch(/^[0-9a-f]{12}$/);
    expect(JSON.stringify(entry)).not.toContain("a@x.org"); // never the raw input
  });

  it("numbers repeated runs of the same agent in one runId", async () => {
    const spec = { agent: "guides" as const, runId: "run_n", purpose: "p", run: async () => 1 };
    await runAgent(spec);
    const { meta } = await runAgent(spec);
    expect(meta.entryId).toBe("run_n:guides:2");
  });

  it("uses the fallback on error and marks usedFallback", async () => {
    process.env.LLM_MODEL = "gpt-test";
    const { output, meta } = await runAgent({
      agent: "architect", runId: "run_f", purpose: "Design",
      run: async () => { throw new Error("no_key"); },
      fallback: (err, ctx) => { ctx.done("Used the ready-made plan"); return `template (${(err as Error).message})`; },
    });
    expect(output).toBe("template (no_key)");
    expect(meta).toMatchObject({ status: "fallback", usedFallback: true });
    expect(h.events.map((e) => e.status)).toEqual(["started", "progress", "done"]);
    expect(h.events[2].message).toBe("Used the ready-made plan");
    expect(h.rows.get(meta.entryId)).toMatchObject({ status: "fallback", usedFallback: true, fallbackReason: "no_key", model: "gpt-test" });
  });

  it("falls back on timeout and on output that fails the schema", async () => {
    const slow = await runAgent({
      agent: "guides", purpose: "p", timeoutMs: 20,
      run: () => new Promise<number>((r) => setTimeout(() => r(1), 500)),
      fallback: (err) => (err instanceof AgentTimeoutError ? -1 : 0),
    });
    expect(slow.output).toBe(-1);
    const bad = await runAgent({
      agent: "guides", purpose: "p", outputSchema: z.number().int(),
      run: async () => 1.5,
      fallback: () => 2,
    });
    expect(bad).toMatchObject({ output: 2, meta: { status: "fallback" } });
    expect((h.rows.get(bad.meta.entryId) as AgentRunEntry).fallbackReason).toMatch(/output failed validation/);
  });

  it("a blocking guardrail triggers the fallback, which is guarded too", async () => {
    const { output, meta } = await runAgent({ agent: "techlead", purpose: "p", guardrails: [blocker], run: async () => "bad", fallback: () => "safe" });
    expect(output).toBe("safe");
    expect(meta.guardrails).toEqual([{ name: "blocker", action: "blocked" }, { name: "blocker", action: "pass" }]);
  });

  it("rethrows without a fallback, emits error and logs status error", async () => {
    await expect(runAgent({ agent: "trajectories", runId: "run_e", purpose: "p", run: async () => { throw new Error("boom"); } })).rejects.toThrow("boom");
    expect(h.events.map((e) => e.status)).toEqual(["started", "error"]);
    expect(h.events[1].message).toBe("Trajectories: boom");
    expect(h.rows.get("run_e:trajectories:1")).toMatchObject({ status: "error", error: "boom", usedFallback: false });
  });

  it("rethrows what the fallback throws (e.g. a NotFoundError it chooses not to mask)", async () => {
    class NotFound extends Error {}
    await expect(runAgent({ agent: "matchmaker", purpose: "p", run: async () => { throw new NotFound("nobody"); }, fallback: (e) => { throw e; } }))
      .rejects.toBeInstanceOf(NotFound);
  });

  it("ctx.degraded marks an internal fallback; ctx.guard and ctx.record add findings; quiet emits nothing", async () => {
    const { output, meta } = await runAgent({
      agent: "techlead", purpose: "p", quiet: true,
      run: async (ctx) => {
        ctx.degraded("embeddings unavailable");
        ctx.record({ name: "piiRedactor", action: "pass" });
        return ctx.guard("hi", [upper]);
      },
    });
    expect(output).toBe("HI");
    expect(meta).toMatchObject({ status: "fallback", usedFallback: true });
    expect(meta.guardrails.map((g) => g.name)).toEqual(["piiRedactor", "upper"]);
    expect(h.events).toEqual([]);
    expect(h.rows.get(meta.entryId)).toMatchObject({ fallbackReason: "embeddings unavailable" });
  });

  it("never fails because the event bus or the ledger fails", async () => {
    h.failBus = true;
    h.failLedger = true;
    const { output, meta } = await runAgent({ agent: "guides", purpose: "p", run: async (ctx) => { ctx.emit("progress", "x"); return 5; } });
    expect(output).toBe(5);
    expect(meta.status).toBe("ok");
    expect(h.rows.size).toBe(0);
  });

  it("a timed-out primary run goes quiet: its late events never follow the fallback's done", async () => {
    const { output } = await runAgent({
      agent: "matchmaker", runId: "run_t", purpose: "p", timeoutMs: 10,
      run: async (ctx) => {
        await new Promise((r) => setTimeout(r, 40));
        ctx.emit("progress", "late");
        ctx.done("late done");
        return 1;
      },
      fallback: (_e, ctx) => { ctx.done("fallback done"); return 2; },
    });
    expect(output).toBe(2);
    await new Promise((r) => setTimeout(r, 60));
    expect(h.events.map((e) => e.message)).not.toContain("late");
    expect(h.events.at(-1)?.message).toBe("fallback done");
  });
});

describe("listRuns", () => {
  it("filters by runId and agent, newest first, with a limit", async () => {
    const put = (id: string, runId: string, agent: string, startedAt: string) => h.rows.set(id, { id, runId, agent, startedAt } as unknown);
    put("r1:matchmaker:1", "r1", "matchmaker", "2026-11-07T10:00:00Z");
    put("r1:guides:1", "r1", "guides", "2026-11-07T10:01:00Z");
    put("r2:matchmaker:1", "r2", "matchmaker", "2026-11-07T10:02:00Z");
    expect((await listRuns()).map((e) => e.id)).toEqual(["r2:matchmaker:1", "r1:guides:1", "r1:matchmaker:1"]);
    expect((await listRuns({ runId: "r1" })).map((e) => e.id)).toEqual(["r1:guides:1", "r1:matchmaker:1"]);
    expect((await listRuns({ agent: "matchmaker", limit: 1 })).map((e) => e.id)).toEqual(["r2:matchmaker:1"]);
  });
});
