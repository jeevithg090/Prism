// P5 · Minimal MCP server core (JSON-RPC 2.0 over Streamable HTTP, no SDK). /api/mcp handles the HTTP layer.
// Methods: initialize · notifications/* · ping · tools/list · tools/call. Tools that need a human checkpoint
// (requiresApproval) are never executed over MCP: the student approves them inside Keystone.
import "server-only";
import { z } from "zod";
import { newRunId } from "@/lib/agents/events";
import { toolJsonSchema, type JsonSchema } from "./jsonSchema";
import { formatIssues, getTool, IDEMPOTENT_TOOLS, runTool, TOOLS, ToolError } from "./registry";
import type { AnyTool } from "./types";

export const MCP_PROTOCOL_VERSION = "2025-06-18";
const SUPPORTED_VERSIONS = [MCP_PROTOCOL_VERSION, "2025-03-26", "2024-11-05"];
export const SERVER_INFO = { name: "keystone", version: "0.1.0" } as const;
export const MCP_INSTRUCTIONS =
  "Keystone helps university students learn what matters next: a degree-aware plan, study pods, and proof of skill. Start with get_student_snapshot.";
export const APPROVAL_TEXT = "This action needs your approval inside Keystone (human-in-the-loop). Open /coach to approve it.";

export const RPC = { PARSE_ERROR: -32700, INVALID_REQUEST: -32600, METHOD_NOT_FOUND: -32601, INVALID_PARAMS: -32602, INTERNAL_ERROR: -32603 } as const;

export type JsonRpcId = string | number | null;
export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: unknown }
  | { jsonrpc: "2.0"; id: JsonRpcId; error: { code: number; message: string; data?: unknown } };

export const rpcError = (id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse => ({
  jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) },
});
const rpcResult = (id: JsonRpcId, result: unknown): JsonRpcResponse => ({ jsonrpc: "2.0", id, result });

export interface McpContext {
  /** From the x-keystone-user header, else "aisha" in DEMO_MODE. A `userId` argument overrides it. */
  defaultUserId?: string;
}

const USER_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

export interface McpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  annotations: { title: string; readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean };
}

function withUserId(schema: JsonSchema): JsonSchema {
  return {
    ...schema,
    properties: {
      ...(schema.properties ?? {}),
      userId: { type: "string", description: "Keystone user id to act for. Defaults to the x-keystone-user header (\"aisha\" in demo mode)." },
    },
  };
}

export function mcpTool(t: AnyTool): McpTool {
  return {
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: withUserId(toolJsonSchema(t)),
    annotations: {
      title: t.title,
      readOnlyHint: t.effect === "read",
      destructiveHint: false,
      idempotentHint: IDEMPOTENT_TOOLS.has(t.name),
      openWorldHint: t.effect === "external",
    },
  };
}

export const mcpTools = (): McpTool[] => TOOLS.map(mcpTool);

const InitializeParamsZ = z.looseObject({ protocolVersion: z.string().optional() });
const CallParamsZ = z.object({ name: z.string().min(1), arguments: z.record(z.string(), z.unknown()).optional() });

type CallResult = { content: { type: "text"; text: string }[]; structuredContent?: Record<string, unknown>; isError: boolean };
const textResult = (text: string, isError: boolean, structuredContent?: Record<string, unknown>): CallResult => ({
  content: [{ type: "text", text }], ...(structuredContent ? { structuredContent } : {}), isError,
});

async function callTool(id: JsonRpcId, params: unknown, ctx: McpContext): Promise<JsonRpcResponse> {
  const p = CallParamsZ.safeParse(params ?? {});
  if (!p.success) return rpcError(id, RPC.INVALID_PARAMS, `Invalid tools/call params: ${formatIssues(p.error)}`);
  const tool = getTool(p.data.name);
  if (!tool) return rpcError(id, RPC.INVALID_PARAMS, `Unknown tool: ${p.data.name}. Call tools/list for the ${TOOLS.length} Keystone tools.`);

  const { userId: argUser, ...args } = p.data.arguments ?? {};
  const userId = typeof argUser === "string" && argUser ? argUser : ctx.defaultUserId;
  if (argUser !== undefined && typeof argUser !== "string") return rpcError(id, RPC.INVALID_PARAMS, "userId must be a string.");
  if (!userId) return rpcError(id, RPC.INVALID_PARAMS, "userId is required: pass it as an argument or send the x-keystone-user header.");
  if (!USER_ID.test(userId)) return rpcError(id, RPC.INVALID_PARAMS, `Invalid userId "${userId}".`);

  const parsed = tool.input.safeParse(args);
  if (!parsed.success) return rpcError(id, RPC.INVALID_PARAMS, `Invalid arguments for ${tool.name}: ${formatIssues(parsed.error)}`);

  // Human in the loop: consequential tools only run after the student approves them in the app.
  if (tool.requiresApproval) return rpcResult(id, textResult(APPROVAL_TEXT, true));

  try {
    const { output, observation } = await runTool(tool.name, parsed.data, { userId, runId: newRunId(), approved: false });
    const structured = output && typeof output === "object" && !Array.isArray(output) ? (output as Record<string, unknown>) : { result: output };
    return rpcResult(id, textResult(observation, false, JSON.parse(JSON.stringify(structured)) as Record<string, unknown>));
  } catch (e) {
    const message = e instanceof ToolError ? e.message : `${tool.title} failed unexpectedly. Try again in a moment.`;
    return rpcResult(id, textResult(message, true));
  }
}

const isId = (x: unknown): x is string | number => typeof x === "string" || (typeof x === "number" && Number.isFinite(x));

/** Handles one JSON-RPC message. Returns null for notifications and client responses (HTTP 202, no body). */
export async function handleMessage(msg: unknown, ctx: McpContext): Promise<JsonRpcResponse | null> {
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) return rpcError(null, RPC.INVALID_REQUEST, "Invalid Request: expected a JSON-RPC 2.0 object.");
  const m = msg as Record<string, unknown>;
  const hasId = "id" in m && m.id !== undefined;
  // A response from the client (e.g. to a server request): accepted, nothing to answer.
  if (!("method" in m) && ("result" in m || "error" in m)) return null;
  if (m.jsonrpc !== "2.0" || typeof m.method !== "string") {
    return rpcError(hasId && isId(m.id) ? m.id : null, RPC.INVALID_REQUEST, "Invalid Request: needs jsonrpc \"2.0\" and a string method.");
  }
  if (!hasId) return null; // notification (notifications/initialized, notifications/cancelled, …)
  if (!isId(m.id)) return rpcError(null, RPC.INVALID_REQUEST, "Invalid Request: id must be a string or a number.");
  const id = m.id;

  try {
    switch (m.method) {
      case "initialize": {
        const p = InitializeParamsZ.safeParse(m.params ?? {});
        if (!p.success) return rpcError(id, RPC.INVALID_PARAMS, `Invalid initialize params: ${formatIssues(p.error)}`);
        const requested = p.data.protocolVersion;
        return rpcResult(id, {
          protocolVersion: requested && SUPPORTED_VERSIONS.includes(requested) ? requested : MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: MCP_INSTRUCTIONS,
        });
      }
      case "ping":
        return rpcResult(id, {});
      case "tools/list":
        return rpcResult(id, { tools: mcpTools() });
      case "tools/call":
        return await callTool(id, m.params, ctx);
      default:
        return rpcError(id, RPC.METHOD_NOT_FOUND, `Method not found: ${m.method}`);
    }
  } catch {
    return rpcError(id, RPC.INTERNAL_ERROR, "Internal error.");
  }
}
