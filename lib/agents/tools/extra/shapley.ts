// Keystone Labs · explain_readiness: exact Shapley shares of the student's readiness (Readiness Explained).
import "server-only";
import { z } from "zod";
import { explainForUser, NoMapError } from "@/lib/labs/shapley/agent";
import type { Explanation } from "@/lib/labs/shapley/model";
import { ToolError } from "../errors";
import type { AnyTool, KeystoneTool } from "../types";

const fmt = (x: number) => (Math.round(x * 10) / 10).toFixed(1);
const signed = (x: number) => `${x >= 0 ? "+" : "−"}${fmt(Math.abs(x))}`;

interface ReadinessExplanation {
  readinessPct: number;
  role: string;
  top: { label: string; points: number; aloneWorth: number }[];
  skill: { name: string; points: number; maxPoints: number; shares: { label: string; points: number }[] } | null;
  weekDeltaPoints: number;
  weekMovers: { label: string; points: number }[];
  best: { title: string; skill: string; gainPoints: number; hours: number; pointsPerHour: number; why: string } | null;
  insight: string | null;
  page: string;
}

const input = z.object({
  skillId: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(40).optional()
    .describe("Kebab-case skill id like \"python\" to see who gets credit for that one skill. Omit for the whole score."),
});

const explainReadiness: KeystoneTool<typeof input, ReadinessExplanation> = {
  name: "explain_readiness",
  title: "Explain your readiness score",
  description:
    "Use when the student asks why their readiness is what it is, what moved it this week, or what single proof would raise it most per hour. Returns exact Shapley shares per source (evidence, modules), this week's change with what caused it, and the best next proof with points per hour. For one skill's plan reasoning use explain_recommendation.",
  input,
  effect: "read",
  requiresApproval: false,
  agent: "skillmap",
  async run(args, ctx) {
    let x: Explanation;
    try {
      ({ explanation: x } = await explainForUser(ctx.userId, { runId: ctx.runId, persist: false }));
    } catch (err) {
      if (err instanceof NoMapError) throw new ToolError(`${err.message} Then call explain_readiness again.`, "not_found");
      throw err;
    }
    const s = args.skillId ? x.skills.find((k) => k.skillId === args.skillId) : undefined;
    if (args.skillId && !s) throw new ToolError(`"${args.skillId}" isn't one of the ${x.roleName} skills on the Bridge Map. Call get_bridge_map to see them.`, "not_found");
    const best = x.next.best;
    return {
      readinessPct: Math.round(x.readiness.now * 100),
      role: x.roleName,
      top: x.contributors.slice(0, 4).map((c) => ({ label: c.label, points: c.points, aloneWorth: c.leaveOneOut })),
      skill: s ? { name: s.name, points: s.points, maxPoints: s.maxPoints, shares: s.shares.filter((h) => h.points > 0).map((h) => ({ label: h.label, points: h.points })) } : null,
      weekDeltaPoints: x.week.deltaPoints,
      weekMovers: x.week.movers.slice(0, 3).map((m) => ({ label: m.label, points: m.points })),
      best: best ? { title: best.title, skill: best.skillName, gainPoints: best.gainPoints, hours: best.hours, pointsPerHour: best.pointsPerHour, why: best.why } : null,
      insight: x.insights[0] ?? null,
      page: "/labs/shapley",
    };
  },
  summarize(o) {
    const head = o.top.length
      ? `Readiness ${o.readinessPct}% (${o.role}), top sources: ${o.top.map((t) => `${t.label} ${signed(t.points)}`).join(", ")}.`
      : `Readiness ${o.readinessPct}% (${o.role}), no sources yet.`;
    const skill = o.skill ? ` ${o.skill.name}: ${fmt(o.skill.points)} of ${fmt(o.skill.maxPoints)} points (${o.skill.shares.map((h) => `${h.label} ${fmt(h.points)}`).join(", ") || "no sources yet"}).` : "";
    const week = ` This week ${signed(o.weekDeltaPoints)} points${o.weekMovers.length ? ` (${o.weekMovers.map((m) => `${m.label} ${signed(m.points)}`).join(", ")})` : ""}.`;
    const best = o.best ? ` Best next proof: ${o.best.skill}, ${signed(o.best.gainPoints)} for ${fmt(o.best.hours)} h.` : " Every roadmap skill is already proven.";
    return clip(`${head}${skill}${week}${best}`);
  },
};

/** Keeps the observation inside the registry's 400-character budget, cutting on a word boundary. */
function clip(text: string, max = 400): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max * 0.6))}…`;
}

export const tool = explainReadiness as unknown as AnyTool;
