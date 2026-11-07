import "server-only";
import { z } from "zod";
import { triggerWorkflowDetailed, verifySecret, type WorkflowName } from "@/lib/n8n";
import { TriggerReqZ, WorkflowNameZ } from "@/lib/schemas/voice";
import { badRequest, fail, internal, ok, unauthorized } from "@/lib/voice/http";


// POST /api/n8n/trigger/[workflow] { payload } -> { triggered, response? }.
// Callers with x-keystone-secret (server-to-server) may start any workflow. The browser may only start the workflows
// listed in BROWSER_WORKFLOWS, from a same-origin request carrying the ks_uid cookie, with a payload that fits the
// workflow's schema. lib/n8n.ts adds the shared secret server-side; only allowlisted response fields come back.

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const Text = (max: number) => z.string().trim().min(1).max(max);

// P5's "Start project" -> W3 (contract: { podId, podName, repoUrl, members, title, pitch }).
const PodKickoffPayloadZ = z
  .object({
    podId: z.string().regex(SAFE_ID),
    podName: Text(80).optional(),
    repoUrl: z.string().max(300).url().startsWith("https://").optional(),
    members: z.array(Text(60)).max(8).optional(),
    title: Text(120).optional(),
    pitch: Text(1000).optional(),
    runId: z.string().regex(SAFE_ID).optional(),
  })
  .strict();

const BROWSER_WORKFLOWS: Partial<Record<WorkflowName, z.ZodType<Record<string, unknown>>>> = {
  "pod-kickoff": PodKickoffPayloadZ,
};

// A non-empty body must wrap its data in `payload`; unknown top-level keys are a 400, not silently dropped.
const BodyZ = TriggerReqZ.strict();

function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

// Browsers send Origin (and Sec-Fetch-Site) on every fetch POST, so a POST needs positive evidence it is same-origin.
function isSameOriginPost(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  const origin = req.headers.get("origin");
  if (!origin) return site === "same-origin";
  let host: string;
  try {
    host = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  // Behind a proxy req.url may carry the internal host, so the forwarded/Host headers count too.
  const hosts = [new URL(req.url).host, req.headers.get("x-forwarded-host"), req.headers.get("host")];
  return hosts.some((h) => !!h && h.split(",")[0].trim().toLowerCase() === host);
}

function isBrowserUser(req: Request): boolean {
  const uid = readCookie(req, "ks_uid");
  return !!uid && SAFE_ID.test(uid) && isSameOriginPost(req);
}

// Only the fields the UI uses reach the browser, and nothing at all from a workflow that echoes the shared secret
// (e.g. one that responds with the incoming Webhook item, headers included).
function publicResponse(response: Record<string, unknown> | undefined): Record<string, string> | undefined {
  if (!response || typeof response !== "object" || Array.isArray(response)) return undefined;
  const secret = process.env.KEYSTONE_SHARED_SECRET;
  const leaks = (s: string) => !!secret && s.includes(secret);
  try {
    if (leaks(JSON.stringify(response))) return undefined;
  } catch {
    return undefined;
  }
  const out: Record<string, string> = {};
  const { discordChannelUrl, message } = response;
  if (typeof discordChannelUrl === "string" && /^https:\/\//.test(discordChannelUrl) && discordChannelUrl.length <= 500 && !leaks(discordChannelUrl)) {
    out.discordChannelUrl = discordChannelUrl;
  }
  if (typeof message === "string" && message.length <= 500 && !leaks(message)) out.message = message;
  return Object.keys(out).length ? out : undefined;
}

export async function POST(req: Request, ctx: { params: Promise<{ workflow: string }> }) {
  try {
    const { workflow } = await ctx.params;
    const name = WorkflowNameZ.safeParse(workflow);
    if (!name.success) return badRequest("Unknown workflow");

    const trusted = verifySecret(req);
    if (!trusted && !isBrowserUser(req)) return unauthorized();
    const browserSchema = BROWSER_WORKFLOWS[name.data];
    if (!trusted && !browserSchema) return fail("forbidden", "This workflow can only be started by Keystone's server", 403);

    // An empty body is fine (payload defaults to {}); a body that isn't JSON is not.
    const raw = await req.text();
    let body: unknown = {};
    if (raw.trim()) {
      try {
        body = JSON.parse(raw);
      } catch {
        return badRequest("Body must be JSON");
      }
    }
    const parsed = BodyZ.safeParse(body ?? {});
    if (!parsed.success) return badRequest("Expected { payload: object }");

    let payload = parsed.data.payload;
    if (!trusted && browserSchema) {
      const checked = browserSchema.safeParse(payload);
      if (!checked.success) {
        const fields = [
          ...new Set(checked.error.issues.flatMap((i) => ("keys" in i ? i.keys : [i.path.join(".") || "payload"]))),
        ].join(", ");
        return badRequest(`Invalid payload for ${name.data}: ${fields}`);
      }
      payload = checked.data;
    }

    const { triggered, response } = await triggerWorkflowDetailed(name.data, payload);
    return ok({ triggered, response: publicResponse(response) });
  } catch {
    return internal();
  }
}
