"use client";
// The mini path graph: what you have → what you'll learn (in order) → the opportunity, with the rejected option of an
// "A or B" requirement drawn dashed. Colours come from the status tokens; the step list is its text alternative.
import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { fmtDate, joinAnd } from "@/lib/labs/pathway/format";
import type { OpportunityPath } from "@/lib/labs/pathway/types";
import { cn } from "@/lib/utils";
import { layoutPath, type GraphNode } from "./layout";

const clipText = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const shortDate = (iso?: string) => fmtDate(iso).replace(/ \d{4}$/, "");

function subLabel(n: GraphNode): string {
  const s = n.step;
  if (n.kind === "ghost") return `+${n.extraHours ?? 0} h, not chosen`;
  if (!s) return "";
  if (s.mode === "have") return "You have it";
  if (s.mode === "degree") return `Degree, ${fmtDate(s.readyBy).replace(/^\d+ /, "")}`;
  return `${s.hours} h, by ${shortDate(s.readyBy)}`;
}

const BOX: Record<GraphNode["kind"], string> = {
  have: "fill-card stroke-status-proven",
  degree: "fill-card stroke-status-degree",
  learn: "fill-card stroke-primary",
  ghost: "fill-muted stroke-border",
  goal: "fill-card stroke-primary",
};
const DOT: Record<GraphNode["kind"], string> = {
  have: "fill-status-proven",
  degree: "fill-status-degree",
  learn: "fill-primary",
  ghost: "fill-muted-foreground",
  goal: "fill-primary",
};

export function PathGraph({ path }: { path: OpportunityPath }) {
  const reduce = useReducedMotion();
  const layout = React.useMemo(() => layoutPath(path), [path]);
  const id = React.useId();
  const learn = path.steps.filter((s) => s.mode === "learn");
  const degree = path.steps.filter((s) => s.mode === "degree");
  const summary = learn.length
    ? `Your path: ${learn.map((s) => `${s.name} (${s.hours} h)`).join(", then ")}${degree.length ? `, after your degree covers ${joinAnd(degree.map((s) => s.name))}` : ""}.`
    : degree.length ? `Your degree covers ${joinAnd(degree.map((s) => s.name))} in time; there is nothing else to learn.` : "You already have every skill this listing asks for.";
  const o = path.opportunity;

  return (
    <figure className="space-y-3">
      <div role="region" tabIndex={0} aria-label="Path graph (scrolls sideways on small screens)" className="overflow-x-auto rounded-xl bg-muted/60 p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <motion.svg
          key={o.id}
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          role="img"
          aria-labelledby={`${id}-t ${id}-d`}
          className="mx-auto block max-w-none"
        >
          <title id={`${id}-t`}>{`Shortest path to ${o.title} at ${o.employer}`}</title>
          <desc id={`${id}-d`}>{summary}</desc>
          <defs>
            <marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground" />
            </marker>
            <marker id={`${id}-arrow-p`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="fill-primary" />
            </marker>
          </defs>
          {layout.edges.map((e) => (
            <path
              key={`${e.from}-${e.to}-${e.kind}`}
              d={e.d}
              fill="none"
              strokeWidth={e.kind === "requires" ? 2 : 1.5}
              strokeDasharray={e.kind === "alternative" ? "5 5" : undefined}
              markerEnd={e.kind === "alternative" ? undefined : `url(#${id}-${e.kind === "requires" ? "arrow-p" : "arrow"})`}
              className={e.kind === "requires" ? "stroke-primary" : e.kind === "alternative" ? "stroke-border" : "stroke-muted-foreground"}
            />
          ))}
          {layout.nodes.map((n) => (
            <g key={n.id} transform={`translate(${n.x} ${n.y})`}>
              <title>{n.kind === "goal" ? `${o.title} at ${o.employer}` : `${n.step?.name ?? n.id}: ${subLabel(n)}`}</title>
              <rect
                width={n.w}
                height={n.h}
                rx={12}
                strokeWidth={n.kind === "learn" || n.kind === "goal" ? 2 : 1.5}
                strokeDasharray={n.kind === "degree" || n.kind === "ghost" ? "5 4" : undefined}
                className={BOX[n.kind]}
              />
              {n.kind === "goal" ? (
                <>
                  <text x={n.w / 2} y={26} textAnchor="middle" className="fill-foreground text-[14px] font-semibold">{clipText(o.title, 36)}</text>
                  <text x={n.w / 2} y={47} textAnchor="middle" className="fill-muted-foreground text-[13px]">
                    {clipText(`${o.employer}${layout.alsoHave.length ? `, plus ${layout.alsoHave.length} you have` : ""}`, 40)}
                  </text>
                </>
              ) : (
                <>
                  <circle cx={16} cy={20} r={4.5} className={DOT[n.kind]} />
                  <text x={28} y={25} className={cn("text-[14px] font-medium", n.kind === "ghost" ? "fill-muted-foreground" : "fill-foreground")}>
                    {clipText(n.step?.name ?? path.alternatives.find((a) => a.instead === n.id)?.insteadName ?? n.id, 15)}
                  </text>
                  <text x={16} y={45} className="fill-muted-foreground text-[13px]">{clipText(subLabel(n), 18)}</text>
                </>
              )}
            </g>
          ))}
        </motion.svg>
      </div>
      <figcaption aria-live="polite" className="text-sm text-muted-foreground">{summary}</figcaption>
    </figure>
  );
}
