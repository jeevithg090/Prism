import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ startPodProject: vi.fn(), createHelpRequest: vi.fn(), recordMergedPR: vi.fn() }));

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
vi.mock("octokit", () => ({ Octokit: class { request = vi.fn(async () => { throw new Error("no network"); }); } }));
// Spies: approval-gated tools must never reach these over MCP.
vi.mock("@/lib/community/projects", () => ({ startPodProject: h.startPodProject }));
vi.mock("@/lib/community/help", () => ({ createHelpRequest: h.createHelpRequest }));
vi.mock("@/lib/agents/proof", async (orig) => ({ ...(await orig<typeof import("@/lib/agents/proof")>()), recordMergedPR: h.recordMergedPR }));

import { DELETE, GET, POST } from "./route";
import { APPROVAL_TEXT, MCP_PROTOCOL_VERSION } from "@/lib/agents/tools/mcp";
import { TOOLS } from "@/lib/agents/tools/registry";
import { testStore } from "@/tests/seededStore";

const rpc = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new Request("http://localhost:3000/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));
const call = (name: string, args: Record<string, unknown> = {}, headers?: Record<string, string>) =>
  rpc({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name, arguments: args } }, headers);

beforeEach(() => {
  vi.clearAllMocks();
  testStore().reset();
  process.env.DEMO_MODE = "true";
});
afterEach(() => {
  delete process.env.DEMO_MODE;
  delete process.env.KEYSTONE_SHARED_SECRET;
});

describe("POST /api/mcp · lifecycle", () => {
  it("initialize returns the protocol version, tools capability, server info and instructions", async () => {
    const res = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body).toMatchObject({
      jsonrpc: "2.0", id: 1,
      result: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "keystone", version: "0.1.0" },
      },
    });
    expect(body.result.instructions).toMatch(/Start with get_student_snapshot/);
  });

  it("initialize answers 2025-06-18 for an unknown version", async () => {
    const body = await (await rpc({ jsonrpc: "2.0", id: "a", method: "initialize", params: { protocolVersion: "1999-01-01" } })).json();
    expect(body.result.protocolVersion).toBe("2025-06-18");
    expect(body.id).toBe("a");
  });

  it("notifications/initialized → 202 with no body", async () => {
    const res = await rpc({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });

  it("ping → empty result", async () => {
    expect(await (await rpc({ jsonrpc: "2.0", id: 2, method: "ping" })).json()).toEqual({ jsonrpc: "2.0", id: 2, result: {} });
  });
});

describe("POST /api/mcp · tools/list", () => {
  it("lists every tool with title, schema (incl. optional userId) and annotations", async () => {
    const { result } = await (await rpc({ jsonrpc: "2.0", id: 3, method: "tools/list" })).json();
    expect(result.tools).toHaveLength(TOOLS.length);
    for (const t of result.tools) {
      expect(t.inputSchema.type).toBe("object");
      expect(t.inputSchema.properties.userId).toMatchObject({ type: "string" });
      expect(t.inputSchema.required ?? []).not.toContain("userId");
      expect(t.annotations.destructiveHint).toBe(false);
      expect(t.title).toBeTruthy();
    }
    const byName = Object.fromEntries(result.tools.map((t: { name: string }) => [t.name, t]));
    expect(byName.get_bridge_map.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false, idempotentHint: true });
    expect(byName.start_pod_project.annotations).toMatchObject({ readOnlyHint: false, openWorldHint: true, idempotentHint: true });
    expect(byName.find_pod.annotations).toMatchObject({ readOnlyHint: false, openWorldHint: false, idempotentHint: false });
    expect(byName.ask_for_help.inputSchema.required).toEqual(["message"]);
  });
});

describe("POST /api/mcp · tools/call", () => {
  it("runs a read tool for aisha by default in DEMO_MODE: summary text + structuredContent", async () => {
    const body = await (await call("get_bridge_map")).json();
    expect(body.id).toBe(7);
    expect(body.result.isError).toBe(false);
    expect(body.result.content).toEqual([{ type: "text", text: expect.stringMatching(/^Readiness 38% → 84%.*Docker \(41% of ads/) }]);
    expect(body.result.content[0].text.length).toBeLessThanOrEqual(400);
    expect(body.result.structuredContent).toMatchObject({ roleId: "ml-engineer", readinessNow: 0.38 });
    expect(body.result.structuredContent.topGaps[0]).toMatchObject({ skillId: "docker", demandPct: 41 });
  });

  it("uses the x-keystone-user header, and a userId argument overrides it", async () => {
    const viaHeader = await (await call("get_student_snapshot", {}, { "x-keystone-user": "nobody" })).json();
    expect(viaHeader.result.isError).toBe(true);
    expect(viaHeader.result.content[0].text).toMatch(/No Keystone profile for "nobody"/);
    const viaArg = await (await call("get_student_snapshot", { userId: "aisha" }, { "x-keystone-user": "nobody" })).json();
    expect(viaArg.result.isError).toBe(false);
    expect(viaArg.result.structuredContent.userId).toBe("aisha");
  });

  it("never executes approval-gated tools over MCP (human in the loop)", async () => {
    for (const [name, args] of [
      ["start_pod_project", {}],
      ["review_my_pr", {}],
      ["record_merged_pr", { issueIndex: 0 }],
      ["ask_for_help", { message: "Help with Docker please" }],
    ] as const) {
      const body = await (await call(name, args)).json();
      expect(body.result, name).toEqual({ content: [{ type: "text", text: APPROVAL_TEXT }], isError: true });
    }
    expect(h.startPodProject).not.toHaveBeenCalled();
    expect(h.createHelpRequest).not.toHaveBeenCalled();
    expect(h.recordMergedPR).not.toHaveBeenCalled();
  });

  it("runs a write tool that needs no approval (find_pod) and saves the pod", async () => {
    const body = await (await call("find_pod")).json();
    expect(body.result.isError).toBe(false);
    expect(body.result.content[0].text).toMatch(/^Formed Pod /);
    const id = body.result.structuredContent.pod.id as string;
    expect(await testStore().get("pods", id)).toMatchObject({ id });
  });

  it("invalid params → -32602 (bad args, unknown tool, missing name, bad userId)", async () => {
    for (const res of [
      await call("get_bridge_map", { limit: 99 }),
      await call("no_such_tool"),
      await rpc({ jsonrpc: "2.0", id: 9, method: "tools/call", params: {} }),
      await call("get_bridge_map", { userId: "../etc/passwd" }),
      await call("ask_for_help", { message: "" }),
    ]) {
      const body = await res.json();
      expect(body.error.code).toBe(-32602);
      expect(body.error.message).toBeTruthy();
    }
  });

  it("requires a user outside DEMO_MODE when no header or argument is given", async () => {
    process.env.DEMO_MODE = "false";
    const body = await (await call("get_bridge_map")).json();
    expect(body.error).toMatchObject({ code: -32602, message: expect.stringMatching(/userId is required/) });
  });
});

describe("POST /api/mcp · JSON-RPC errors and batching", () => {
  it("unknown method → -32601", async () => {
    const body = await (await rpc({ jsonrpc: "2.0", id: 4, method: "resources/list" })).json();
    expect(body).toMatchObject({ jsonrpc: "2.0", id: 4, error: { code: -32601 } });
  });

  it("bad JSON → -32700", async () => {
    const res = await rpc("{not json");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe(-32700);
  });

  it("a non JSON-RPC object → -32600", async () => {
    expect((await (await rpc({ id: 5, method: 42 })).json()).error.code).toBe(-32600);
    expect((await (await rpc([])).json()).error.code).toBe(-32600);
  });

  it("handles a batch: answers requests, skips notifications", async () => {
    const res = await rpc([
      { jsonrpc: "2.0", id: 1, method: "ping" },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "nope" },
    ]);
    const body = await res.json();
    expect(body).toEqual([
      { jsonrpc: "2.0", id: 1, result: {} },
      { jsonrpc: "2.0", id: 2, error: { code: -32601, message: "Method not found: nope" } },
    ]);
    const onlyNotifications = await rpc([{ jsonrpc: "2.0", method: "notifications/initialized" }]);
    expect(onlyNotifications.status).toBe(202);
  });
});

describe("/api/mcp · HTTP", () => {
  it("requires the shared secret as a Bearer token outside DEMO_MODE", async () => {
    process.env.DEMO_MODE = "false";
    process.env.KEYSTONE_SHARED_SECRET = "s3cret";
    const ping = { jsonrpc: "2.0", id: 1, method: "ping" };
    const denied = await rpc(ping);
    expect(denied.status).toBe(401);
    expect(denied.headers.get("www-authenticate")).toMatch(/Bearer/);
    expect((await rpc(ping, { authorization: "Bearer wrong" })).status).toBe(401);
    expect((await rpc(ping, { authorization: "Bearer s3cret" })).status).toBe(200);
  });

  it("skips auth in DEMO_MODE even when a secret is set", async () => {
    process.env.KEYSTONE_SHARED_SECRET = "s3cret";
    expect((await rpc({ jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(200);
  });

  it("rejects browser calls from other origins (DNS-rebinding guard) but allows localhost", async () => {
    const ping = { jsonrpc: "2.0", id: 1, method: "ping" };
    expect((await rpc(ping, { origin: "https://evil.example" })).status).toBe(403);
    expect((await rpc(ping, { origin: "http://localhost:6274" })).status).toBe(200);
  });

  it("GET and DELETE → 405 (no SSE stream)", async () => {
    const res = GET();
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
    expect(DELETE().status).toBe(405);
  });
});
