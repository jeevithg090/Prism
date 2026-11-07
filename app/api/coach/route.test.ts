import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoachResZ } from "@/lib/schemas/coach";

const h = vi.hoisted(() => ({ api: null as null | ReturnType<typeof import("@/lib/agents/coach/testTools").memoryStore>, fail: false }));
vi.mock("@/lib/store", async () => {
  const { memoryStore } = await import("@/lib/agents/coach/testTools");
  h.api = memoryStore();
  return { getStore: () => h.api!.store };
});
vi.mock("@/lib/llm", () => ({ llmJSON: vi.fn(async () => { throw new Error("no_key"); }), embed: vi.fn(), cosine: vi.fn(), LLMError: class extends Error {} }));
vi.mock("@/lib/agents/events", () => ({ emit: vi.fn(), newRunId: () => "run_route", subscribe: vi.fn() }));
vi.mock("@/lib/agents/coach/context", async (orig) => {
  const { CONTEXT } = await import("@/lib/agents/coach/testTools");
  return { ...(await orig<typeof import("@/lib/agents/coach/context")>()), buildStudentContext: async () => structuredClone(CONTEXT) };
});
vi.mock("@/lib/agents/tools/registry", async () => {
  const { canonicalFakes } = await import("@/lib/agents/coach/testTools");
  const TOOLS = Object.values(canonicalFakes());
  return { TOOLS, getTool: (n: string) => TOOLS.find((t) => t.name === n) };
});
vi.mock("@/lib/agents/coach/loop", async (orig) => {
  const real = await orig<typeof import("@/lib/agents/coach/loop")>();
  return { ...real, runCoach: (...a: Parameters<typeof real.runCoach>) => (h.fail ? Promise.reject(new Error("boom")) : real.runCoach(...a)) };
});

import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/coach", {
    method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body),
  }));

beforeEach(() => {
  h.fail = false;
  h.api!.rows.clear();
  process.env.DEMO_MODE = "true";
});
afterEach(() => { delete process.env.DEMO_MODE; });

describe("POST /api/coach", () => {
  it("returns 200 with a CoachRes (DEMO_MODE: rules planner)", async () => {
    const res = await post({ userId: "aisha", message: "What should I do this week?" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(CoachResZ.safeParse(json.data).success).toBe(true);
    expect(json.data).toMatchObject({ runId: "run_route", planner: "rules" });
    expect(json.data.steps.map((s: { kind: string }) => s.kind)).toContain("tool_call");
  });

  it("uses a client-chosen runId when it is well-formed", async () => {
    const json = await (await post({ userId: "aisha", message: "Find me a pod", runId: "run_abc12345" })).json();
    expect(json.data.runId).toBe("run_abc12345");
    const bad = await (await post({ userId: "aisha", message: "Find me a pod", runId: "../etc" })).json();
    expect(bad.data.runId).toBe("run_route");
  });

  it("round-trips an approval: pending → approve", async () => {
    const first = (await (await post({ userId: "aisha", message: "Start our project" })).json()).data;
    expect(first.pendingApproval.tool).toBe("start_pod_project");
    const second = await post({ userId: "aisha", message: "Start our project", approval: { ...first.pendingApproval, decision: "approve" } });
    expect(second.status).toBe(200);
    const data = (await second.json()).data;
    expect(data.pendingApproval).toBeUndefined();
    expect(data.answer).toContain("Created VisionAid with 7 issues.");
  });

  it("returns 400 bad_request for invalid input", async () => {
    for (const b of [{}, { userId: "aisha" }, { userId: "", message: "hi" }, { userId: "aisha", message: "   " }, { userId: "aisha", message: "hi", approval: { tool: "x", decision: "maybe" } }, "not json"]) {
      const res = await post(b);
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("bad_request");
    }
  });

  it("returns 500 internal when the agent throws", async () => {
    h.fail = true;
    const res = await post({ userId: "aisha", message: "hi" });
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("internal");
  });
});
