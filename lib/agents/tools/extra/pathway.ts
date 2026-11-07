// Keystone Labs tool: the shortest learning path from the student's Bridge Map to a placement or internship.
// Read-only. Changing the roadmap stays a human decision on /labs/pathway ("Add to roadmap" → approve).
import "server-only";
import { z } from "zod";
import { ToolError } from "@/lib/agents/tools/errors";
import type { AnyTool, KeystoneTool } from "@/lib/agents/tools/types";
import { findPathways, PathwayError } from "@/lib/labs/pathway/agent";
import { fmtDate, plural } from "@/lib/labs/pathway/format";
import type { OpportunityPath, PathState } from "@/lib/labs/pathway/types";

export const PathToOpportunityInputZ = z.object({
  opportunity: z.string().trim().max(80).optional()
    .describe("Optional words from a listing's title or employer, e.g. \"Quayline\" or \"data analyst\". Leave out to get the closest listings."),
  limit: z.number().int().min(1).max(5).default(3).describe("How many listings to return, 1-5 (default 3)."),
});

export interface PathToOpportunityOutput {
  asOf: string;
  total: number;
  applyNow: number;
  listings: {
    id: string; title: string; employer: string; state: PathState; closesAt?: string;
    skillsToLearn: number; studyWeeks: number; studyHours: number; readyBy: string; fitNow: number; fitReady: number;
    learn: string[]; degreeCovers: string[]; demo: boolean;
  }[];
  keystone?: string;
  howToAdd: string;
}

const compact = (p: OpportunityPath): PathToOpportunityOutput["listings"][number] => ({
  id: p.opportunity.id, title: p.opportunity.title, employer: p.opportunity.employer, state: p.state,
  ...(p.opportunity.closesAt ? { closesAt: p.opportunity.closesAt } : {}),
  skillsToLearn: p.skillsToLearn, studyWeeks: p.studyWeeks, studyHours: p.studyHours, readyBy: p.readyBy,
  fitNow: p.fitNow, fitReady: p.fitReady,
  learn: p.steps.filter((s) => s.mode === "learn").map((s) => s.name),
  degreeCovers: p.steps.filter((s) => s.mode === "degree").map((s) => s.name),
  demo: p.opportunity.source === "demo",
});

const matches = (p: OpportunityPath, q: string) => {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = `${p.opportunity.title} ${p.opportunity.employer} ${p.opportunity.kind} ${p.opportunity.roleId}`.toLowerCase();
  return words.every((w) => hay.includes(w));
};

const pathToOpportunity: KeystoneTool<typeof PathToOpportunityInputZ, PathToOpportunityOutput> = {
  name: "find_path_to_opportunity",
  title: "Find the shortest path to a placement",
  description:
    "Use when the student asks how far they are from a placement or internship, or what to learn to qualify. Returns the closest listings with the fewest skills and weeks to qualify, the ordered skills to learn, what their degree covers by the deadline, and fit. Read-only: adding a path to the roadmap is the student's own approved action on /labs/pathway.",
  input: PathToOpportunityInputZ,
  effect: "read",
  requiresApproval: false,
  agent: "roadmap",
  async run(input, ctx) {
    let result;
    try {
      result = await findPathways(ctx.userId, { runId: ctx.runId, live: false });
    } catch (e) {
      if (e instanceof PathwayError) throw new ToolError(`${e.message} (find_path_to_opportunity)`, e.code === "not_found" ? "not_found" : "failed");
      throw new ToolError("Couldn't work out the paths right now. Try again, or open /labs/pathway.", "failed");
    }
    const pool = input.opportunity ? result.paths.filter((p) => matches(p, input.opportunity!)) : result.paths;
    if (input.opportunity && !pool.length) {
      throw new ToolError(`No open listing matches "${input.opportunity}". Call again without "opportunity" to see the closest ones.`, "not_found");
    }
    return {
      asOf: result.asOf.slice(0, 10), total: result.paths.length,
      applyNow: result.paths.filter((p) => p.state === "apply-now").length,
      listings: pool.slice(0, input.limit).map(compact),
      ...(result.keystone ? { keystone: `${result.keystone.name} is on the path to ${result.keystone.count} of ${result.keystone.of} listings` } : {}),
      howToAdd: "The student adds a path to their roadmap themselves on /labs/pathway (Add to roadmap, then approve).",
    };
  },
  summarize(o) {
    const lines = o.listings.map((l) => {
      if (l.state === "apply-now") return `${l.title} at ${l.employer}: can apply now`;
      const when = l.state === "next-round" ? `misses the ${fmtDate(l.closesAt)} deadline` : `ready ${fmtDate(l.readyBy)}`;
      return `${l.title} at ${l.employer}: learn ${l.learn.join(" → ") || "nothing"} (${plural(l.skillsToLearn, "skill")}, ${plural(l.studyWeeks, "week")}; ${when})`;
    });
    // Keep the head and the approval note; add listings (then the keystone skill) while they fit in 400 chars.
    const suffix = " Adding one to the roadmap is the student's approved action on /labs/pathway.";
    let text = `${o.total} open listings, ${o.applyNow} to apply now.`;
    for (const part of [...lines.map((l) => ` ${l}.`), ...(o.keystone ? [` ${o.keystone}.`] : [])]) {
      if (text.length + part.length + suffix.length <= 400) text += part;
    }
    return text + suffix;
  },
};

export const tool = pathToOpportunity as unknown as AnyTool;
