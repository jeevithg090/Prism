// GET /api/agents/registry → AgentRegistryEntry[]: every Keystone agent, its tools, guardrails,
// human checkpoint and fallback (static).
import { AGENT_REGISTRY } from "@/lib/agents/registry";
import { internal, ok } from "@/lib/schemas/community";

export async function GET() {
  try {
    return ok(AGENT_REGISTRY);
  } catch {
    return internal();
  }
}
