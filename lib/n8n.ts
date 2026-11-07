import "server-only";
// LOCAL SHIM of P4's lib/n8n.ts
export type WorkflowName = "market-refresh" | "monday-briefing" | "pod-kickoff" | "pod-nudge" | "opportunity-watcher" | "newcomer-welcome";
export async function triggerWorkflow(name: WorkflowName, payload: Record<string, unknown>): Promise<boolean> {
  const base = process.env.N8N_WEBHOOK_BASE_URL; if (!base) return false;
  try { const r = await fetch(`${base}/${name}`, { method: "POST", headers: { "content-type": "application/json", "x-keystone-secret": process.env.KEYSTONE_SHARED_SECRET ?? "" }, body: JSON.stringify(payload) }); return r.ok; } catch { return false; }
}
