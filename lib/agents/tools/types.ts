// P5 · Keystone tool layer: one typed registry of tools that the Coach agent (ReAct loop),
// the MCP endpoint and the UI all share. Principles (Anthropic "Writing effective tools for agents",
// OpenAI "A practical guide to building agents", 12-factor agents):
//  - tools are designed for agents: clear verb_noun names, descriptions say WHEN to use them and WHAT comes back
//  - every tool declares its side effect and whether a human must approve it first (human-in-the-loop)
//  - tools return compact, high-signal observations (context engineering), not raw dumps
import type { z } from "zod";
import type { AgentName } from "@/lib/types";

/** read = safe lookup · write = changes Keystone data · external = touches GitHub / Discord / the outside world */
export type ToolEffect = "read" | "write" | "external";

export interface ToolContext {
  userId: string;
  runId: string;
  /** true only when a human explicitly approved this exact call (see CoachResponse.pendingApproval). */
  approved?: boolean;
}

export interface KeystoneTool<I extends z.ZodTypeAny = z.ZodTypeAny, O = unknown> {
  /** snake_case verb_noun, namespaced by area when useful, e.g. "get_bridge_map", "pods_start_project". */
  name: string;
  /** Short human label for the UI, e.g. "Read your Bridge Map". */
  title: string;
  /** Agent-facing description: when to use it, when NOT to, what it returns, limits. 1–4 sentences. */
  description: string;
  /** zod input schema; also exported as JSON Schema for function calling and MCP. */
  input: I;
  effect: ToolEffect;
  /** Human checkpoint before running (always true for "external"; true for consequential "write"s). */
  requiresApproval: boolean;
  /** The specialist agent that does the work (for the Activity panel + governance registry). */
  agent: AgentName;
  run(input: z.infer<I>, ctx: ToolContext): Promise<O>;
  /** Compact observation (≤ ~400 chars) fed back to the model and shown in the UI. */
  summarize(output: O): string;
}

export type AnyTool = KeystoneTool<z.ZodTypeAny, unknown>;

export interface ToolCallRecord {
  tool: string;
  args: unknown;
  status: "ok" | "error" | "needs_approval" | "denied";
  observation: string;
  durationMs: number;
}
