import "server-only";
// P4 · n8n client. Workflows are webhooks at `${N8N_WEBHOOK_BASE_URL}/<workflow>` (see n8n/W1…W6.json).
// Every call carries the shared secret in `x-keystone-secret`; inbound n8n / ElevenLabs calls are checked with verifySecret.
import { timingSafeEqual } from "node:crypto";
import { emit } from "@/lib/agents/events";
import { WORKFLOWS } from "@/lib/voice/schemas";

export type WorkflowName = (typeof WORKFLOWS)[number];
export const TRIGGER_TIMEOUT_MS = 5000;

export function isWorkflowName(name: string): name is WorkflowName {
  return (WORKFLOWS as readonly string[]).includes(name);
}

/** True when n8n is configured (a webhook base URL is set). */
export function n8nConfigured(): boolean {
  return !!process.env.N8N_WEBHOOK_BASE_URL?.trim();
}

/**
 * POSTs the payload to the workflow's webhook. Returns true on a 2xx, false when n8n isn't configured,
 * the request fails or it takes longer than 5 seconds. Never throws. If the payload has a `runId`,
 * the outcome shows up in the Activity panel as an n8n agent event.
 */
export async function triggerWorkflow(name: WorkflowName, payload: Record<string, unknown>): Promise<boolean> {
  const runId = typeof payload.runId === "string" ? payload.runId : undefined;
  const base = process.env.N8N_WEBHOOK_BASE_URL?.trim().replace(/\/+$/, "");
  if (!base) {
    if (runId) emit({ runId, agent: "n8n", status: "progress", message: `n8n isn't connected here, so ${name} was skipped` });
    return false;
  }
  let ok = false;
  try {
    const r = await fetch(`${base}/${name}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-keystone-secret": process.env.KEYSTONE_SHARED_SECRET ?? "" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TRIGGER_TIMEOUT_MS),
    });
    ok = r.ok;
  } catch {
    ok = false;
  }
  if (runId) {
    emit(ok
      ? { runId, agent: "n8n", status: "done", message: `triggered ${name}` }
      : { runId, agent: "n8n", status: "progress", message: `${name} didn't answer within 5 s; the app carries on without it` });
  }
  return ok;
}

/** True only when KEYSTONE_SHARED_SECRET is set and the request's `x-keystone-secret` header matches it. */
export function verifySecret(req: Request): boolean {
  const secret = process.env.KEYSTONE_SHARED_SECRET;
  const given = req.headers.get("x-keystone-secret");
  if (!secret || !given) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}
