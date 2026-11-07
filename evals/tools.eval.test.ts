// Eval · Tool quality (AGENT-PRINCIPLES 4, 9, 13, 16): names, descriptions, effects, approval flags,
// compact observations in DEMO_MODE for the seeded student (aisha), and MCP parity.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/store", async () => (await import("@/tests/seededStore")).seededStoreModule());
vi.mock("@/lib/llm", () => ({
  llmJSON: vi.fn(async () => { throw new Error("no_key"); }),
  llmText: vi.fn(async () => { throw new Error("no_key"); }),
  embed: vi.fn(async () => { throw new Error("no_key"); }),
  cosine: vi.fn(() => 0),
  LLMError: class extends Error {},
}));
vi.mock("@/lib/graph/build", async (orig) => ({ ...(await orig<typeof import("@/lib/graph/build")>()), loadGraph: vi.fn(async () => null) }));
vi.mock("@/lib/n8n", () => ({ triggerWorkflow: vi.fn(async () => false) }));
vi.mock("octokit", () => ({ Octokit: class { request = vi.fn(async () => { throw new Error("no network in evals"); }); } }));

import { TOOLS, ToolError, MAX_SUMMARY_CHARS } from "@/lib/agents/tools/registry";
import { EXTRA_TOOLS } from "@/lib/agents/tools/extensions";
import { POST as mcpPOST } from "@/app/api/mcp/route";
import { testStore } from "@/tests/seededStore";

/** AGENT-PRINCIPLES.md "Canonical Keystone tools": names, effects and approval flags are fixed. */
const CANONICAL: [name: string, effect: string, approval: boolean, agent: string][] = [
  ["get_student_snapshot", "read", false, "orchestrator"],
  ["get_bridge_map", "read", false, "skillmap"],
  ["get_week_plan", "read", false, "roadmap"],
  ["explain_recommendation", "read", false, "roadmap"],
  ["find_pod", "write", false, "matchmaker"],
  ["get_my_pod", "read", false, "matchmaker"],
  ["start_pod_project", "external", true, "architect"],
  ["review_my_pr", "external", true, "techlead"],
  ["record_merged_pr", "write", true, "evidence"],
  ["find_students_like_me", "read", false, "trajectories"],
  ["get_momentum", "read", false, "evidence"],
  ["ask_for_help", "write", true, "orchestrator"],
  ["find_guides", "read", false, "guides"],
];
/** Canonical verbs, plus the ones Labs extension tools add (lib/agents/tools/extra). */
const VERBS = new Set(["get", "find", "explain", "start", "review", "record", "ask", "convene"]);
/** Arguments for the tools that need some in the end-to-end run (everything else runs with {}). */
const ARGS: Record<string, unknown> = {
  record_merged_pr: { issueIndex: 0 },
  ask_for_help: { kind: "question", message: "How do I keep my Docker image small?" },
};

const ctx = (approved = false) => ({ userId: "aisha", runId: "run_eval", approved });
const rows: Record<string, unknown>[] = [];

beforeAll(() => {
  process.env.DEMO_MODE = "true";
  testStore().reset();
});
afterAll(() => {
  delete process.env.DEMO_MODE;
  console.table(rows);
});

describe("eval: tool registry quality", () => {
  it("has exactly the 13 canonical tools with fixed effects, approval flags and agents, then the Labs extensions", () => {
    expect(TOOLS.slice(0, CANONICAL.length).map((t) => [t.name, t.effect, t.requiresApproval, t.agent])).toEqual(CANONICAL);
    expect(TOOLS.slice(CANONICAL.length).map((t) => t.name)).toEqual(EXTRA_TOOLS.map((t) => t.name));
  });

  it("every name is a unique snake_case verb_noun", () => {
    const names = TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) {
      expect(n, n).toMatch(/^[a-z]+(_[a-z]+)+$/);
      expect(VERBS.has(n.split("_")[0]), `${n} starts with a verb`).toBe(true);
    }
  });

  it("every description is 60-400 chars and says what it returns; every title is short", () => {
    for (const t of TOOLS) {
      expect(t.description.length, t.name).toBeGreaterThanOrEqual(60);
      expect(t.description.length, t.name).toBeLessThanOrEqual(400);
      expect(t.description, `${t.name} says what it returns`).toMatch(/\breturns?\b/i);
      expect(t.title.length, t.name).toBeLessThanOrEqual(40);
    }
  });

  it("effect external ⇒ requiresApproval (and approval tools refuse to run unapproved)", async () => {
    for (const t of TOOLS.filter((x) => x.effect === "external")) expect(t.requiresApproval, t.name).toBe(true);
    for (const t of TOOLS.filter((x) => x.requiresApproval)) {
      const err = await t.run(t.input.parse(ARGS[t.name] ?? {}), ctx(false)).catch((e) => e);
      expect(err, t.name).toBeInstanceOf(ToolError);
      expect((err as ToolError).code, t.name).toBe("needs_approval");
    }
  });

  it("every read tool runs in DEMO_MODE for aisha with a non-empty summary ≤ 400 chars", async () => {
    for (const t of TOOLS.filter((x) => x.effect === "read")) {
      const started = Date.now();
      const out = await t.run(t.input.parse(ARGS[t.name] ?? {}), ctx());
      const summary = t.summarize(out);
      rows.push({ tool: t.name, effect: t.effect, approval: t.requiresApproval, ms: Date.now() - started, chars: summary.length, summary });
      expect(summary.trim().length, t.name).toBeGreaterThan(0);
      expect(summary.length, t.name).toBeLessThanOrEqual(MAX_SUMMARY_CHARS);
    }
  });

  it("the write and external tools run end-to-end in DEMO_MODE once approved", async () => {
    for (const t of TOOLS.filter((x) => x.effect !== "read")) {
      const started = Date.now();
      const out = await t.run(t.input.parse(ARGS[t.name] ?? {}), ctx(true));
      const summary = t.summarize(out);
      rows.push({ tool: t.name, effect: t.effect, approval: t.requiresApproval, ms: Date.now() - started, chars: summary.length, summary });
      expect(summary.trim().length, t.name).toBeGreaterThan(0);
      expect(summary.length, t.name).toBeLessThanOrEqual(MAX_SUMMARY_CHARS);
    }
  });

  it("MCP tools/list exposes every registry tool", async () => {
    const res = await mcpPOST(new Request("http://localhost/api/mcp", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }));
    const body = await res.json();
    expect(body.result.tools).toHaveLength(TOOLS.length);
    expect(body.result.tools.map((t: { name: string }) => t.name)).toEqual(TOOLS.map((t) => t.name));
  });
});
