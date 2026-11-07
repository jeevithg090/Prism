// P4 · POST /api/n8n/trigger/[workflow] {payload} → {triggered}. Fires one n8n workflow (W1…W6) by name.
// `triggered: false` with `configured: false` means n8n isn't connected in this environment (nothing was sent).
import { isWorkflowName, n8nConfigured, triggerWorkflow } from "@/lib/n8n";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";
import { TriggerReqZ, WORKFLOWS } from "@/lib/voice/schemas";

export async function POST(req: Request, ctx: { params: Promise<{ workflow: string }> }) {
  const { workflow } = await ctx.params;
  if (!isWorkflowName(workflow)) return fail(404, "not_found", `Unknown workflow "${workflow}". Use one of: ${WORKFLOWS.join(", ")}.`);
  let body: unknown = {};
  try {
    const text = await req.text();
    body = text.trim() ? JSON.parse(text) : {};
  } catch {
    return badRequest("Body must be JSON like {\"payload\":{}}");
  }
  const parsed = TriggerReqZ.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);
  try {
    const triggered = await triggerWorkflow(workflow, parsed.data.payload);
    return ok({ triggered, workflow, configured: n8nConfigured() });
  } catch {
    return internal();
  }
}
