import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/store", async () => (await import("@/tests/seededStore")).seededStoreModule());
vi.mock("@/lib/llm", () => ({
  llmJSON: vi.fn(async () => { throw new Error("no_key"); }),
  llmText: vi.fn(async () => { throw new Error("no_key"); }),
  embed: vi.fn(async () => { throw new Error("no_key"); }),
  cosine: vi.fn(() => 0),
  LLMError: class extends Error {},
}));
vi.mock("@/lib/graph/build", () => ({ loadGraph: vi.fn(async () => null) }));
vi.mock("@/lib/n8n", () => ({ triggerWorkflow: vi.fn(async () => false) }));

import { clip, getTool, runTool, TOOLS, ToolError } from "./registry";
import { testStore } from "@/tests/seededStore";

const ctx = (userId = "aisha", approved = false) => ({ userId, runId: "run_t", approved });
const codeOf = async (p: Promise<unknown>) => ((await p.catch((e) => e)) as ToolError).code;

beforeEach(() => {
  testStore().reset();
  process.env.DEMO_MODE = "true";
});
afterEach(() => { delete process.env.DEMO_MODE; });

describe("tool registry", () => {
  it("getTool finds every tool by name and nothing else", () => {
    for (const t of TOOLS) expect(getTool(t.name)).toBe(t);
    expect(getTool("drop_tables")).toBeUndefined();
  });

  it("runTool validates input, enforces approval and reports unknown tools as ToolErrors", async () => {
    expect(await codeOf(runTool("nope", {}, ctx()))).toBe("unknown_tool");
    expect(await codeOf(runTool("explain_recommendation", { skillId: "Not Kebab" }, ctx()))).toBe("invalid_input");
    expect(await codeOf(runTool("ask_for_help", { message: "hi" }, ctx()))).toBe("needs_approval");
    const ok = await runTool("ask_for_help", { message: "How do I start with Docker?" }, ctx("aisha", true));
    expect(ok.output).toMatchObject({ fromUserId: "aisha", kind: "question", status: "open" });
    expect(ok.observation).toMatch(/inside Keystone/);
  });

  it("errors are recoverable: no pod → call find_pod first; unknown user → onboarding hint", async () => {
    process.env.DEMO_MODE = "false"; // the demo pod is only a fallback in DEMO_MODE
    const err = await runTool("start_pod_project", {}, ctx("aisha", true)).catch((e) => e);
    expect(err).toBeInstanceOf(ToolError);
    expect(err.message).toBe("No pod yet: call find_pod first.");
    const mine = await runTool("get_my_pod", {}, ctx());
    expect(mine.output).toMatchObject({ pod: null });
    expect(mine.observation).toMatch(/call find_pod/i);
    const nobody = await runTool("get_bridge_map", {}, ctx("nobody")).catch((e) => e);
    expect(nobody.code).toBe("not_found");
    expect(nobody.message).toMatch(/onboarding/);
  });

  it("refuses to act on a pod the user isn't in", async () => {
    expect(await codeOf(runTool("review_my_pr", { podId: "pod_demo01" }, ctx("hannah", true)))).toBe("forbidden");
  });

  it("explain_recommendation defaults to this week's focus and explains a degree-covered skill", async () => {
    const focus = await runTool("explain_recommendation", {}, ctx());
    expect(focus.output).toMatchObject({ skillId: "docker", priorityRank: 1, receipt: { demandPct: 41, coveredByDegree: "no" } });
    const ml = await runTool("explain_recommendation", { skillId: "machine-learning" }, ctx());
    expect(ml.output).toMatchObject({ priorityRank: null, receipt: { coveredByDegree: "upcoming", moduleCode: "COMP2xxx2" } });
    expect(await codeOf(runTool("explain_recommendation", { skillId: "cobol" }, ctx()))).toBe("not_found");
  });

  it("record_merged_pr flips the skill to proven and the snapshot shows the new proof", async () => {
    const proof = await runTool("record_merged_pr", { issueIndex: 0 }, ctx("aisha", true));
    expect(proof.observation).toMatch(/Docker is now proven/);
    const snap = await runTool("get_student_snapshot", {}, ctx());
    expect(snap.observation).toMatch(/Latest proof: Docker/);
    expect(snap.observation).toMatch(/Top gaps: PyTorch/); // Docker left the gap list
    expect(await codeOf(runTool("record_merged_pr", { issueIndex: 40 }, ctx("aisha", true)))).toBe("not_found");
  });

  it("find_guides stops at the daily limit with a helpful alternative", async () => {
    for (let i = 0; i < 3; i++) await runTool("find_guides", {}, ctx());
    const err = await runTool("find_guides", {}, ctx()).catch((e) => e);
    expect(err.code).toBe("limit");
    expect(err.message).toMatch(/find_students_like_me/);
  });

  it("clip keeps observations within 400 chars", () => {
    const long = "word ".repeat(200);
    expect(clip(long).length).toBeLessThanOrEqual(400);
    expect(clip(long).endsWith("…")).toBe(true);
    expect(clip("short")).toBe("short");
  });
});
