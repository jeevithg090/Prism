// Keystone Labs tool: Skill Half-life Radar for the Coach and MCP (read-only; decisions stay with the module lead).
import "server-only";
import { z } from "zod";
import { buildHalfLifeReport, HalfLifeError } from "@/lib/labs/halflife/agent";
import { MODULE_CODE, SAFE_PROGRAMME_ID, type HalfLifeReport } from "@/lib/labs/halflife/schema";
import { ToolError } from "../errors";
import type { AnyTool, KeystoneTool } from "../types";

const InputZ = z.object({
  programmeId: z.string().regex(SAFE_PROGRAMME_ID).default("uom-bsc-cs").describe("Programme id, e.g. \"uom-bsc-cs\"."),
  moduleCode: z.string().regex(MODULE_CODE).optional().describe("One module code, e.g. \"COMP1xxx2\", to explain it. Omit for the ranked list."),
  limit: z.number().int().min(1).max(8).default(3).describe("How many modules to return, most urgent first (1-8)."),
});

type Row = {
  code: string; title: string; urgency: number; status: string; halfLifeYears: number | null;
  topDrift: { skill: string; growthPct: number; demandPct: number } | null;
  note: string | null; decision: string | null;
};
type Out = { programme: string; horizonMonth: string; needsRefresh: number; modules: Row[] };

const MAX = 400;
const clip = (t: string) => { const s = t.replace(/\s+/g, " ").trim(); return s.length <= MAX ? s : `${s.slice(0, MAX - 1).replace(/\s+\S*$/, "")}…`; };

const life = (r: Row) => (r.halfLifeYears !== null ? `half-life ${r.halfLifeYears.toFixed(1)} yrs` : r.status === "no-signal" ? "foundations, no trend tracked" : `demand ${r.status}`);

const halfLifeTool: KeystoneTool<typeof InputZ, Out> = {
  name: "get_module_half_life",
  title: "Read module half-lives",
  description:
    "Use when a lecturer asks which modules are going stale or why one needs a refresh. Returns modules ranked by refresh urgency " +
    "with each one's skill half-life in years (from the logit hiring trend), rising skills next door it doesn't teach, and a drafted " +
    "refresh note tied to a learning outcome. Read-only; not for a student's own plan (use get_bridge_map).",
  input: InputZ,
  effect: "read",
  requiresApproval: false,
  agent: "trends",
  async run(input, ctx) {
    let report: HalfLifeReport;
    try {
      ({ report } = await buildHalfLifeReport({ programmeId: input.programmeId, horizonYears: 3 }, { runId: ctx.runId }));
    } catch (e) {
      if (e instanceof HalfLifeError) throw new ToolError(e.message, e.code === "not_found" ? "not_found" : "invalid_input");
      throw new ToolError("The Half-life Radar couldn't run just now. Try again in a moment.", "failed");
    }
    let mods = report.modules;
    if (input.moduleCode) {
      mods = mods.filter((m) => m.code.toLowerCase() === input.moduleCode!.toLowerCase());
      if (!mods.length) throw new ToolError(`No module ${input.moduleCode} in ${report.programmeName}. Call again without moduleCode to see the codes.`, "not_found");
    }
    return {
      programme: report.programmeName,
      horizonMonth: report.horizonMonth,
      needsRefresh: report.stats.needsRefresh,
      modules: mods.slice(0, input.limit).map((m) => {
        const d = m.drift.find((x) => x.points > 0);
        return {
          code: m.code, title: m.title, urgency: m.urgency, status: m.status, halfLifeYears: m.halfLifeYears,
          topDrift: d ? { skill: d.name, growthPct: Math.round(d.growthPerYear * 100), demandPct: d.cohortDemandPct } : null,
          note: m.refreshNote?.text ?? null,
          decision: m.decision?.decision ?? null,
        };
      }),
    };
  },
  summarize(out) {
    if (!out.modules.length) return `${out.programme}: no modules to show.`;
    const parts = out.modules.map((m) =>
      `${m.code} ${m.title}: urgency ${m.urgency}, ${life(m)}${m.topDrift ? `, misses ${m.topDrift.skill} (+${m.topDrift.growthPct}%/yr)` : ""}${m.decision ? `, ${m.decision}` : ""}`);
    return clip(`${out.needsRefresh} modules need a refresh before ${out.horizonMonth}. ${parts.join(". ")}.`);
  },
};

export const tool: AnyTool = halfLifeTool as unknown as AnyTool;
