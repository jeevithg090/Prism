// P5 · pure builder for the Trajectories journey Sankey (no React, no DOM: easy to test).
import type { Trajectory } from "@/lib/types";

export const OUTCOME_GROUPS = ["ML", "SWE", "Data", "PhD", "Startup", "Other"] as const;
export type OutcomeGroup = (typeof OUTCOME_GROUPS)[number];

export const Y1_LABELS = ["Society", "Hackathon", "Side project", "Modules"] as const;
export const Y23_LABELS = ["Placement", "Internship", "Open source", "Research", "Coursework"] as const;

/** Phrases used in the summary sentence. */
const GROUP_PHRASE: Record<OutcomeGroup, string> = {
  ML: "ML roles", SWE: "software roles", Data: "data roles", PhD: "a PhD", Startup: "founding a startup", Other: "other paths",
};

export type SankeyNodeDatum = {
  name: string;
  column: 0 | 1 | 2;
  /** Journeys passing through this node, by where they ended up. */
  byOutcome: Partial<Record<OutcomeGroup, number>>;
  count: number;
};
export type SankeyLinkDatum = {
  source: number;
  target: number;
  value: number;
  byOutcome: Partial<Record<OutcomeGroup, number>>;
};
export type SankeyBuild = { nodes: SankeyNodeDatum[]; links: SankeyLinkDatum[]; summary: string };
export type JourneyPath = { y1: string; y23: string; outcome: OutcomeGroup };

export function outcomeGroup(outcomeRole: string): OutcomeGroup {
  const o = outcomeRole.toLowerCase();
  if (/\bphd\b/.test(o)) return "PhD";
  if (/\bfounded\b|\bfounder\b|co-?found|started (a|my own) (company|startup)/.test(o)) return "Startup";
  if (/\bml\b|machine learning|\bai\b|computer vision|\bnlp\b/.test(o)) return "ML";
  if (/\bdata\b|analytics|analyst/.test(o)) return "Data";
  if (/software|engineer|developer|\bsre\b|devops|reliability/.test(o)) return "SWE";
  return "Other";
}

const Y1_KIND: Partial<Record<Trajectory["steps"][number]["kind"], (typeof Y1_LABELS)[number]>> = {
  society: "Society", hackathon: "Hackathon", project: "Side project",
};
const Y23_KIND: Partial<Record<Trajectory["steps"][number]["kind"], (typeof Y23_LABELS)[number]>> = {
  placement: "Placement", internship: "Internship", project: "Open source", "module-choice": "Research",
};

const Y23_PRIORITY: Trajectory["steps"][number]["kind"][] = ["placement", "internship", "project", "module-choice"];

export function journeyPath(t: Trajectory): JourneyPath {
  const y1Step = t.steps.find((s) => s.year === 1 && Y1_KIND[s.kind]);
  // The defining Year 2–3 experience: a placement beats an internship beats open source beats research,
  // so the Placement band agrees with the "included a placement" summary.
  const y23Steps = t.steps.filter((s) => (s.year === 2 || s.year === 3) && Y23_KIND[s.kind]);
  const y23Step = Y23_PRIORITY.map((k) => y23Steps.find((s) => s.kind === k)).find(Boolean);
  return {
    y1: y1Step ? Y1_KIND[y1Step.kind]! : "Modules",
    y23: y23Step ? Y23_KIND[y23Step.kind]! : "Coursework",
    outcome: outcomeGroup(t.outcomeRole),
  };
}

/** "Of 40 journeys, 14 led to ML roles; 9 of those included a placement." */
export function summarise(trajectories: Trajectory[], group: OutcomeGroup = "ML"): string {
  const n = trajectories.length;
  if (!n) return "No journeys have been shared yet.";
  const inGroup = trajectories.filter((t) => outcomeGroup(t.outcomeRole) === group);
  const plural = n === 1 ? "journey" : "journeys";
  if (!inGroup.length) return `Of ${n} ${plural}, none led to ${GROUP_PHRASE[group]} yet.`;
  const placements = inGroup.filter((t) => t.steps.some((s) => s.kind === "placement")).length;
  return `Of ${n} ${plural}, ${inGroup.length} led to ${GROUP_PHRASE[group]}; ${placements} of those included a placement.`;
}

/**
 * Three columns: Year-1 focus → Year 2–3 experience → outcome group.
 * Only nodes that at least one journey passes through are included. Link values are journey counts.
 */
export function buildSankeyData(trajectories: Trajectory[], focus: OutcomeGroup = "ML"): SankeyBuild {
  const paths = trajectories.map(journeyPath);
  const columns: [readonly string[], 0 | 1 | 2, (p: JourneyPath) => string][] = [
    [Y1_LABELS, 0, (p) => p.y1],
    [Y23_LABELS, 1, (p) => p.y23],
    [OUTCOME_GROUPS, 2, (p) => p.outcome],
  ];

  const nodes: SankeyNodeDatum[] = [];
  const index = new Map<string, number>();
  for (const [labels, column, pick] of columns) {
    for (const name of labels) {
      const through = paths.filter((p) => pick(p) === name);
      if (!through.length) continue;
      index.set(name, nodes.length);
      nodes.push({ name, column, count: through.length, byOutcome: tally(through) });
    }
  }

  const linkMap = new Map<string, SankeyLinkDatum>();
  const add = (from: string, to: string, outcome: OutcomeGroup) => {
    const source = index.get(from)!;
    const target = index.get(to)!;
    const key = `${source}>${target}`;
    const link = linkMap.get(key) ?? { source, target, value: 0, byOutcome: {} };
    link.value += 1;
    link.byOutcome[outcome] = (link.byOutcome[outcome] ?? 0) + 1;
    linkMap.set(key, link);
  };
  for (const p of paths) {
    add(p.y1, p.y23, p.outcome);
    add(p.y23, p.outcome, p.outcome);
  }
  const links = [...linkMap.values()].sort((a, b) => a.source - b.source || a.target - b.target);
  return { nodes, links, summary: summarise(trajectories, focus) };
}

function tally(paths: JourneyPath[]): Partial<Record<OutcomeGroup, number>> {
  const out: Partial<Record<OutcomeGroup, number>> = {};
  for (const p of paths) out[p.outcome] = (out[p.outcome] ?? 0) + 1;
  return out;
}

export type ChartLink = { source: number; target: number; value: number; count: number; outcome: OutcomeGroup; label: string };

/**
 * Recharts needs one band per colour, so split every Year-1 → Year-2/3 link by outcome (in a fixed order so
 * same-outcome bands sit together). A tiny epsilon keeps Recharts' `source-target-value` React keys unique.
 */
export function toChartLinks(data: SankeyBuild): ChartLink[] {
  const out: ChartLink[] = [];
  for (const l of data.links) {
    const from = data.nodes[l.source]?.name ?? "";
    const to = data.nodes[l.target]?.name ?? "";
    for (const g of OUTCOME_GROUPS) {
      const count = l.byOutcome[g];
      if (!count) continue;
      const label = data.nodes[l.target]?.column === 2
        ? `${from} → ${to}: ${count} ${count === 1 ? "journey" : "journeys"}`
        : `${from} → ${to}, then ${g}: ${count} ${count === 1 ? "journey" : "journeys"}`;
      out.push({ source: l.source, target: l.target, value: count + out.length * 1e-6, count, outcome: g, label });
    }
  }
  return out;
}

/** Distinct paths with counts, most common first (the "View as list" table). */
export function pathRows(trajectories: Trajectory[]): (JourneyPath & { count: number })[] {
  const m = new Map<string, JourneyPath & { count: number }>();
  for (const p of trajectories.map(journeyPath)) {
    const k = `${p.y1}|${p.y23}|${p.outcome}`;
    const row = m.get(k) ?? { ...p, count: 0 };
    row.count += 1;
    m.set(k, row);
  }
  return [...m.values()].sort((a, b) => b.count - a.count || OUTCOME_GROUPS.indexOf(a.outcome) - OUTCOME_GROUPS.indexOf(b.outcome));
}
