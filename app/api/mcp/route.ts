// P5 · /api/mcp: Keystone as an MCP server (Streamable HTTP, JSON responses, no SSE stream), so Claude Desktop,
// ChatGPT, Copilot or Cursor can use Keystone's tools. Protocol core: lib/agents/tools/mcp.ts. Docs: docs/mcp.md.
import { timingSafeEqual } from "node:crypto";
import { handleMessage, rpcError, RPC, type JsonRpcResponse } from "@/lib/agents/tools/mcp";

const isDemo = () => process.env.DEMO_MODE === "true";
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** KEYSTONE_SHARED_SECRET (outside DEMO_MODE) → `Authorization: Bearer <secret>` is required. */
function authorised(req: Request): boolean {
  const secret = process.env.KEYSTONE_SHARED_SECRET;
  if (!secret || isDemo()) return true;
  const m = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return !!m && safeEqual(m[1].trim(), secret);
}

/** DNS-rebinding guard from the MCP spec: browsers may only call from localhost, this host or the app URL. */
function originAllowed(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // server-side clients (mcp-remote, ChatGPT connectors) send no Origin
  let o: URL;
  try {
    o = new URL(origin);
  } catch {
    return false;
  }
  if (["localhost", "127.0.0.1", "[::1]"].includes(o.hostname)) return true;
  const allowed = [new URL(req.url).host, req.headers.get("host") ?? ""];
  try {
    if (process.env.NEXT_PUBLIC_APP_URL) allowed.push(new URL(process.env.NEXT_PUBLIC_APP_URL).host);
  } catch { /* ignore a malformed app URL */ }
  return allowed.includes(o.host);
}

export async function POST(req: Request) {
  if (!originAllowed(req)) return json(rpcError(null, RPC.INVALID_REQUEST, "Origin not allowed."), 403);
  if (!authorised(req)) {
    return json(rpcError(null, -32001, "Unauthorized: send Authorization: Bearer <KEYSTONE_SHARED_SECRET>."), 401, { "www-authenticate": "Bearer realm=\"keystone\"" });
  }

  let body: unknown;
  try {
    body = JSON.parse(await req.text());
  } catch {
    return json(rpcError(null, RPC.PARSE_ERROR, "Parse error: the body must be JSON-RPC 2.0 JSON."), 400);
  }

  const header = req.headers.get("x-keystone-user")?.trim();
  const ctx = { defaultUserId: header || (isDemo() ? "aisha" : undefined) };

  if (Array.isArray(body)) {
    if (!body.length) return json(rpcError(null, RPC.INVALID_REQUEST, "Invalid Request: empty batch."), 400);
    const out = (await Promise.all(body.map((m) => handleMessage(m, ctx)))).filter((r): r is JsonRpcResponse => r !== null);
    return out.length ? json(out) : new Response(null, { status: 202 });
  }
  const res = await handleMessage(body, ctx);
  return res ? json(res) : new Response(null, { status: 202 });
}

/** No server-initiated SSE stream: clients use POST only. */
export function GET() {
  return new Response("Method Not Allowed: Keystone's MCP endpoint takes JSON-RPC over POST.", { status: 405, headers: { allow: "POST" } });
}

export function DELETE() {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}
