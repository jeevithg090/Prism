// P5 · Client-safe metadata for the canonical Keystone tools (AGENT-PRINCIPLES.md), used by the Coach UI to show
// which specialist agent ran a step and what kind of effect it has. The server registry stays the source of truth.
import type { AgentName } from "@/lib/types";
import type { ToolEffect } from "@/lib/agents/tools/types";

export const TOOL_META: Record<string, { agent: AgentName; effect: ToolEffect }> = {
  get_student_snapshot: { agent: "orchestrator", effect: "read" },
  get_bridge_map: { agent: "skillmap", effect: "read" },
  get_week_plan: { agent: "roadmap", effect: "read" },
  explain_recommendation: { agent: "roadmap", effect: "read" },
  find_pod: { agent: "matchmaker", effect: "write" },
  get_my_pod: { agent: "matchmaker", effect: "read" },
  start_pod_project: { agent: "architect", effect: "external" },
  review_my_pr: { agent: "techlead", effect: "external" },
  record_merged_pr: { agent: "evidence", effect: "write" },
  find_students_like_me: { agent: "trajectories", effect: "read" },
  get_momentum: { agent: "evidence", effect: "read" },
  ask_for_help: { agent: "orchestrator", effect: "write" },
  find_guides: { agent: "guides", effect: "read" },
};

export function toolMeta(name?: string): { agent: AgentName; effect: ToolEffect } {
  return (name && TOOL_META[name]) || { agent: "orchestrator", effect: "read" };
}

export const EFFECT_LABEL: Record<ToolEffect, { label: string; explain: string }> = {
  read: { label: "Read", explain: "Only reads your data" },
  write: { label: "Write", explain: "Changes your Keystone data" },
  external: { label: "External", explain: "Reaches outside Keystone (e.g. GitHub)" },
};
