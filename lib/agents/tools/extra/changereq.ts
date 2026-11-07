// Keystone Labs tool: Plan Change Requests. The Coach (or an MCP client) can ask the Roadmap Agent whether this
// week's market refresh should change the student's plan. It only PROPOSES: the roadmap changes when the student
// approves the request on /labs/changereq, so the tool needs no approval itself.
import "server-only";
import { z } from "zod";
import { ToolError } from "@/lib/agents/tools/errors";
import type { AnyTool, KeystoneTool } from "@/lib/agents/tools/types";
import { ChangeReqError, openChangeRequest } from "@/lib/labs/changereq/service";

type Out = {
  opened: boolean;
  number?: number;
  title?: string;
  risk?: "low" | "medium" | "high";
  changes: { week: number; outgoing: string; incoming: string; why: string }[];
  url: string;
  message: string;
};

const findPlanChanges: KeystoneTool<z.ZodObject<Record<string, never>>, Out> = {
  name: "find_plan_changes",
  title: "Check if the market changes your plan",
  description:
    "Use when the student asks whether their roadmap is still right or what changed in the job market this week. Runs the weekly refresh (trend refit + ad re-weighting) and opens a change request against their roadmap if a week should move. Returns the proposed week swaps with receipts and risk. It never edits the roadmap: the student approves on /labs/changereq.",
  input: z.object({}),
  effect: "write",
  requiresApproval: false,
  agent: "roadmap",
  async run(_input, ctx) {
    try {
      const r = await openChangeRequest(ctx.userId, { runId: ctx.runId });
      const cr = r.changeRequest;
      return {
        opened: !!cr,
        ...(cr ? { number: cr.number, title: cr.title, risk: cr.risk } : {}),
        changes: (cr?.hunks ?? []).map((h) => ({ week: h.week, outgoing: h.outgoing.after.name, incoming: h.incoming.after.name, why: h.receipt })),
        url: "/labs/changereq",
        message: r.message,
      };
    } catch (e) {
      if (e instanceof ChangeReqError) throw new ToolError(e.message, e.status === 404 ? "not_found" : "failed");
      throw new ToolError("The weekly refresh failed. The roadmap is unchanged; try again in a moment.", "failed");
    }
  },
  summarize(o) {
    if (!o.opened) return `${o.message} No change request needed.`;
    const swaps = o.changes.map((c) => `week ${c.week} ${c.outgoing} → ${c.incoming}`).join("; ");
    return `Change request #${o.number} (${o.risk} risk): ${swaps}. Nothing changes until the student approves it at ${o.url}.`;
  },
};

export const tool = findPlanChanges as unknown as AnyTool;
