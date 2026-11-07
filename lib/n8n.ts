import "server-only";
import { emit } from "@/lib/agents/events";

export type WorkflowName =
  | "pod-kickoff"
  | "monday-briefing"
  | "market-refresh"
  | "pod-nudge"
  | "opportunity-watcher"
  | "newcomer-welcome";

export interface TriggerResult {
  triggered: boolean;
  // Whatever the workflow's "Respond to Webhook" node returned (W3 returns { discordChannelUrl }).
  response?: Record<string, unknown>;
}

// POSTs the payload to `${N8N_WEBHOOK_BASE_URL}/${name}`. Never throws: n8n being down must not break the app.
export async function triggerWorkflowDetailed(name: WorkflowName, payload: Record<string, unknown>): Promise<TriggerResult> {
  const base = process.env.N8N_WEBHOOK_BASE_URL;
  if (!base) return { triggered: process.env.DEMO_MODE === "true" };
  try {
    const r = await fetch(`${base.replace(/\/$/, "")}/${name}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-keystone-secret": process.env.KEYSTONE_SHARED_SECRET ?? "" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return { triggered: false };
    const response = (await r.json().catch(() => undefined)) as Record<string, unknown> | undefined;
    const runId = typeof payload.runId === "string" ? payload.runId : undefined;
    if (runId) emit({ runId, agent: "n8n", status: "done", message: `triggered ${name}` });
    return { triggered: true, response };
  } catch {
    return { triggered: false };
  }
}

export async function triggerWorkflow(name: WorkflowName, payload: Record<string, unknown>): Promise<boolean> {
  return (await triggerWorkflowDetailed(name, payload)).triggered;
}

export function verifySecret(req: Request): boolean {
  const s = process.env.KEYSTONE_SHARED_SECRET;
  return !!s && req.headers.get("x-keystone-secret") === s;
}
