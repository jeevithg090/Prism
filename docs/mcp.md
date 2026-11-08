# Keystone over MCP

Keystone exposes its 13 agent tools over the [Model Context Protocol](https://modelcontextprotocol.io) so any MCP client (Claude Desktop, ChatGPT, GitHub Copilot, Cursor, MCP Inspector) can ask Keystone things like "what should I do this week?".

- **Endpoint:** `POST /api/mcp` (Streamable HTTP transport, protocol `2025-06-18`, plain JSON responses, no SSE stream; `GET` returns 405).
- **Server:** `keystone` `0.1.0`, capability `tools` only.
- **Source:** HTTP layer `app/api/mcp/route.ts`, JSON-RPC core `lib/agents/tools/mcp.ts`, tools `lib/agents/tools/registry.ts` (the same registry the Coach uses). The manifest with JSON Schemas is also at `GET /api/tools`.

## Connect

Start the app (`DEMO_MODE=true npm run dev` gives instant demo data for Aisha).

### Claude Desktop (or any stdio-only client) through `mcp-remote`

Add this to `claude_desktop_config.json` (Settings → Developer → Edit config):

```json
{
  "mcpServers": {
    "keystone": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:3000/api/mcp", "--header", "x-keystone-user:aisha"]
    }
  }
}
```

Quick check from a terminal: `npx mcp-remote http://localhost:3000/api/mcp`.

With a shared secret (outside demo mode), add `"--header", "Authorization:Bearer ${KEYSTONE_SECRET}"` and set `"env": { "KEYSTONE_SECRET": "<value of KEYSTONE_SHARED_SECRET>" }`.

### Clients that speak Streamable HTTP directly (Cursor, VS Code / Copilot, MCP Inspector)

Use the URL `http://localhost:3000/api/mcp` and, optionally, the headers `x-keystone-user: <userId>` and `Authorization: Bearer <secret>`. For ChatGPT connectors the server must be reachable on a public HTTPS URL (deploy, or use a tunnel).

## Who the tools act for

Every tool takes an optional `userId` argument. Without it the server uses the `x-keystone-user` header, and in `DEMO_MODE` falls back to `aisha`. Outside demo mode a user is required (`-32602` otherwise).

## Auth and safety

- If `KEYSTONE_SHARED_SECRET` is set and `DEMO_MODE` is not `true`, every request needs `Authorization: Bearer <secret>` (401 otherwise).
- Browser requests with an `Origin` other than localhost, this host or `NEXT_PUBLIC_APP_URL` get 403 (the spec's DNS-rebinding guard).
- **Human in the loop:** tools marked "needs approval" are listed but never executed over MCP. Calling one returns `isError: true` with *"This action needs your approval inside Keystone (human-in-the-loop). Open /coach to approve it."* The student approves it in the Coach, which then runs the exact same call.
- Nothing is ever sent outside Keystone on the student's behalf: guide messages are drafts the student sends themselves, and help requests stay in the Community feed.

## Tools

| Tool | Effect | Over MCP | What it returns |
|---|---|---|---|
| `get_student_snapshot` | read | runs | Readiness, top 3 gaps with % of ads, current week, pod status, latest proof |
| `get_bridge_map` | read | runs | Readiness now/projected, top gaps (demand, trend, degree coverage), proven skills |
| `get_week_plan` | read | runs | This week's focus skill, tasks with hours, proof, receipt |
| `explain_recommendation` | read | runs | The receipt for one skill (demand, trend, module coverage, reason) |
| `get_my_pod` | read | runs | The newest pod, its project and merged-issue progress |
| `find_students_like_me` | read | runs | Similar senior journeys and who is open to a 15-minute chat |
| `get_momentum` | read | runs | 6 weeks of momentum vs the student's own baseline, plus badges |
| `find_guides` | read | runs | Up to 4 practitioners with draft messages (uses 1 of 3 drafts a day) |
| `find_pod` | write | runs | Runs the Matchmaker and saves a new pod |
| `start_pod_project` | external | **needs approval in the app** | Designs the project and creates the GitHub repo + issues |
| `review_my_pr` | external | **needs approval in the app** | Socratic review of the newest open PR (posted as a comment when live) |
| `record_merged_pr` | write | **needs approval in the app** | Merged PR → evidence, Bridge Map update, momentum |
| `ask_for_help` | write | **needs approval in the app** | Posts a help request in Community (inside Keystone only) |

`tools/list` also sends MCP annotations: `readOnlyHint` (effect `read`), `openWorldHint` (effect `external`), `idempotentHint`, and `destructiveHint: false` for all.

## Try it with curl

```bash
# 1. Handshake
curl -s http://localhost:3000/api/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'

# 2. List the tools
curl -s http://localhost:3000/api/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# 3. Call one
curl -s http://localhost:3000/api/mcp -H 'content-type: application/json' -H 'x-keystone-user: aisha' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_bridge_map","arguments":{}}}'
```

The response carries a compact summary for the model plus the full JSON:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [{ "type": "text", "text": "Readiness 38% → 84% (ML engineer). Top gaps: Docker (41% of ads, rising, no module), PyTorch (38%), SQL (35%). …" }],
    "structuredContent": { "roleId": "ml-engineer", "readinessNow": 0.38, "readinessProjected": 0.84, "topGaps": [ … ] },
    "isError": false
  }
}
```

## Errors

| Case | Response |
|---|---|
| Body isn't JSON | HTTP 400, JSON-RPC `-32700` |
| Not a JSON-RPC 2.0 request, or an empty batch | `-32600` |
| Unknown method (e.g. `resources/list`) | `-32601` |
| Unknown tool, missing/invalid arguments, missing or invalid `userId` | `-32602` |
| The tool ran but couldn't help (no profile, no pod, daily limit, …) | `result.isError: true` with a recoverable message, e.g. "No pod yet: call find_pod first." |

Notifications (`notifications/initialized`, …) get HTTP 202 with no body. Batches (JSON arrays) are accepted for older clients.
