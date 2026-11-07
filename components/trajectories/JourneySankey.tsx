"use client";
// P5 · where students before you went: Year-1 focus, then the Year 2 and 3 experience, then where they are now.
// Hallmark redesign: one argued series. The outcome you follow (your goal, or the chip you pick) runs in the coral
// signal; every other path stays a quiet neutral, so the chart makes one point at a time.
import * as React from "react";
import { ResponsiveContainer, Sankey } from "recharts";
import { BarChart3, List } from "lucide-react";
import type { Trajectory } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DemoDataNote } from "@/components/keystone";
import { buildSankeyData, outcomeGroup, pathRows, summarise, toChartLinks, type ChartLink, type OutcomeGroup, type SankeyNodeDatum } from "./sankey";

/** Outcome colours from the theme tokens (kept for other callers; the chart itself argues one outcome in the signal). */
export const OUTCOME_COLOR: Record<OutcomeGroup, string> = {
  ML: "var(--primary)",
  SWE: "var(--chart-2)",
  Data: "var(--chart-3)",
  PhD: "var(--chart-4)",
  Startup: "var(--chart-5)",
  Other: "var(--muted-foreground)",
};
const OUTCOME_LABEL: Record<OutcomeGroup, string> = {
  ML: "ML", SWE: "Software", Data: "Data", PhD: "PhD", Startup: "Startup", Other: "Other",
};
const CHIPS = ["All", "ML", "SWE", "Data", "PhD", "Startup"] as const;
type Filter = (typeof CHIPS)[number];
const COLUMN_TITLES = ["Year 1 focus", "Years 2 and 3", "Where they are now"];

/** The argued series wears the signal; the rest is context in the muted ink. */
const SIGNAL = "var(--primary)";
const CONTEXT = "var(--muted-foreground)";

type NodeRenderProps = { x: number; y: number; width: number; height: number; payload: SankeyNodeDatum };
type LinkRenderProps = {
  sourceX: number; targetX: number; sourceY: number; targetY: number;
  sourceControlX: number; targetControlX: number; linkWidth: number;
  payload: ChartLink;
};

const NARROW_QUERY = "(max-width: 639px)";
function subscribeNarrow(cb: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(NARROW_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function isNarrow() {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(NARROW_QUERY).matches;
}

export function JourneySankey({ trajectories, focus = "ML" }: { trajectories: Trajectory[]; focus?: OutcomeGroup }) {
  const [filter, setFilter] = React.useState<Filter>("All");
  // null = follow the screen: narrow phones start with the list, everything else with the chart.
  const [listChoice, setListChoice] = React.useState<boolean | null>(null);
  const narrow = React.useSyncExternalStore(subscribeNarrow, isNarrow, () => false);
  const asList = listChoice ?? narrow;

  const data = React.useMemo(() => buildSankeyData(trajectories, focus), [trajectories, focus]);
  const chartData = React.useMemo(() => ({ nodes: data.nodes, links: toChartLinks(data) }), [data]);
  const rows = React.useMemo(() => pathRows(trajectories), [trajectories]);
  const counts = React.useMemo(() => {
    const c: Record<OutcomeGroup, number> = { ML: 0, SWE: 0, Data: 0, PhD: 0, Startup: 0, Other: 0 };
    for (const t of trajectories) c[outcomeGroup(t.outcomeRole)]++;
    return c;
  }, [trajectories]);
  const caption = filter === "All" ? data.summary : summarise(trajectories, filter);
  const isDemo = trajectories.some((t) => t.isDemo);
  const visibleRows = filter === "All" ? rows : rows.filter((r) => r.outcome === filter);
  // The one series the chart argues: your goal until you pick another outcome.
  const argued: OutcomeGroup = filter === "All" ? focus : filter;

  const renderLink = React.useCallback(
    (p: LinkRenderProps) => {
      const { sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, payload } = p;
      const isArgued = payload.outcome === argued;
      const opacity = filter === "All" ? (isArgued ? 0.72 : 0.3) : isArgued ? 0.75 : 0.12;
      return (
        <path
          d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
          fill="none"
          stroke={isArgued ? SIGNAL : CONTEXT}
          strokeWidth={Math.max(1.5, linkWidth - 1)}
          strokeOpacity={opacity}
          className="transition-[stroke-opacity] duration-(--dur-short) ease-out motion-reduce:transition-none"
        >
          <title>{payload.label}</title>
        </path>
      );
    },
    [filter, argued],
  );

  const renderNode = React.useCallback(
    (p: NodeRenderProps) => {
      const { x, y, width, height, payload } = p;
      const isOutcome = payload.column === 2;
      const shown = filter === "All" ? payload.count : (payload.byOutcome[filter] ?? 0);
      const active = shown > 0;
      // Only the argued outcome bar carries full weight; every other bar is context.
      const fill = isOutcome && payload.name === argued ? SIGNAL : CONTEXT;
      const label = isOutcome ? OUTCOME_LABEL[payload.name as OutcomeGroup] ?? payload.name : payload.name;
      // Labels never sit on bands: first-year labels left of their bar, middle labels in the gap above it,
      // outcome labels right of their bar, where nothing follows.
      const place = payload.column === 0 ? "left" : payload.column === 1 ? "above" : "right";
      const nameSize = place === "above" ? 14 : 16;
      return (
        <g className={cn("transition-opacity duration-(--dur-short) ease-out motion-reduce:transition-none", active ? "opacity-100" : "opacity-30")}>
          <rect x={x} y={y} width={width} height={Math.max(2, height)} rx={2} fill={fill} />
          <text
            x={place === "left" ? x - 10 : place === "above" ? x : x + width + 10}
            y={place === "above" ? y - 6 : y + height / 2}
            textAnchor={place === "left" ? "end" : "start"}
            dominantBaseline={place === "above" ? "auto" : "middle"}
            stroke="var(--card)"
            strokeWidth={place === "above" ? 3 : 5}
            strokeLinejoin="round"
            paintOrder="stroke"
            className="fill-foreground"
          >
            <tspan fontSize={nameSize} fontWeight={600}>{label}</tspan>
            <tspan dx={6} fontSize={14} className="fill-muted-foreground font-mono tabular-nums">{shown}</tspan>
          </text>
        </g>
      );
    },
    [filter, argued],
  );

  return (
    <section aria-labelledby="journeys-title" className="flex flex-col gap-6 rounded-2xl border bg-card p-6 shadow-sm">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 id="journeys-title" className="text-xl font-semibold text-foreground">Where students before you went</h2>
          {isDemo && <DemoDataNote />}
        </div>
        <p id="journeys-caption" aria-live="polite" className="mt-1 max-w-[62ch] text-lg text-pretty text-foreground">
          {caption}
        </p>
        <p id="journeys-howto" className="sr-only">
          Each band is a real path, from first-year focus to where they are now. Pick an outcome to follow its paths.
        </p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div role="group" aria-label="Filter journeys by outcome" aria-describedby="journeys-howto" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {CHIPS.map((c) => {
            const pressed = filter === c;
            const n = c === "All" ? trajectories.length : counts[c];
            return (
              <button
                key={c}
                type="button"
                aria-pressed={pressed}
                onClick={() => setFilter(c)}
                className={cn(
                  "inline-flex h-10 shrink-0 items-center justify-start gap-2 rounded-xl border px-3.5 text-sm font-medium whitespace-nowrap text-foreground outline-none",
                  "transition-[background-color,border-color,transform] duration-(--dur-short) ease-out motion-reduce:transition-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55",
                  pressed ? "border-primary font-semibold ring-1 ring-inset ring-primary" : "border-border hover:bg-accent",
                )}
              >
                {c !== "All" && c === argued && (
                  <svg aria-hidden viewBox="0 0 16 6" className="h-1.5 w-4 shrink-0">
                    <rect width="16" height="6" rx="1.5" className="fill-primary" />
                  </svg>
                )}
                {c === "All" ? "All" : OUTCOME_LABEL[c]}
                <span className="font-mono tabular-nums text-muted-foreground">{n}</span>
              </button>
            );
          })}
        </div>
        <Button
          variant="outline"
          className="shrink-0 self-start"
          aria-pressed={asList}
          onClick={() => setListChoice(!asList)}
        >
          {asList ? <BarChart3 aria-hidden /> : <List aria-hidden />}
          {asList ? "View as chart" : "View as list"}
        </Button>
      </div>

      <figure aria-describedby="journeys-caption" className="m-0 flex flex-col gap-4">
        {asList ? (
          <>
            <ol aria-label="Journeys by path" className="divide-y border-y sm:hidden">
              {visibleRows.map((r) => (
                <li key={`${r.y1}|${r.y23}|${r.outcome}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{OUTCOME_LABEL[r.outcome]}</p>
                    <p className="text-sm text-muted-foreground">{r.y1}, then {r.y23}</p>
                  </div>
                  <p className="font-mono text-lg tabular-nums text-foreground">
                    {r.count}<span className="sr-only"> {r.count === 1 ? "journey" : "journeys"}</span>
                  </p>
                </li>
              ))}
            </ol>
            <div
              role="region"
              aria-label="Journeys table, scroll sideways for more"
              tabIndex={0}
              className="relative hidden overflow-x-auto rounded-md outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:block"
            >
              <table className="w-full text-left text-base">
                <caption className="sr-only">Journeys by path{filter === "All" ? "" : `, ${OUTCOME_LABEL[filter]} only`}</caption>
                <thead className="text-sm text-muted-foreground">
                  <tr>
                    {COLUMN_TITLES.map((h) => <th key={h} scope="col" className="py-3 pr-4 font-medium whitespace-nowrap">{h}</th>)}
                    <th scope="col" className="py-3 text-right font-medium whitespace-nowrap">Journeys</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r) => (
                    <tr key={`${r.y1}|${r.y23}|${r.outcome}`} className="border-t">
                      <td className="py-3 pr-4 text-foreground">{r.y1}</td>
                      <td className="py-3 pr-4 text-foreground">{r.y23}</td>
                      <td className={cn("py-3 pr-4 text-foreground", r.outcome === argued && "font-semibold")}>{OUTCOME_LABEL[r.outcome]}</td>
                      <td className="py-3 text-right font-mono tabular-nums text-foreground">{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div aria-hidden className="min-w-0">
            <div className="mb-2 grid grid-cols-3 text-sm font-medium text-muted-foreground">
              {COLUMN_TITLES.map((h, i) => <span key={h} className={cn(i === 1 && "text-center", i === 2 && "text-right")}>{h}</span>)}
            </div>
            <ResponsiveContainer width="100%" height={360} initialDimension={{ width: 800, height: 360 }}>
              <Sankey
                data={chartData}
                accessibilityLayer={false}
                nodeWidth={12}
                nodePadding={20}
                linkCurvature={0.5}
                margin={{ top: 26, right: 112, bottom: 8, left: 124 }}
                node={renderNode as never}
                link={renderLink as never}
                onClick={(item, type) => {
                  const node = (item as unknown as { payload?: SankeyNodeDatum }).payload;
                  if (type === "node" && node?.column === 2 && (CHIPS as readonly string[]).includes(node.name)) {
                    setFilter((f) => (f === node.name ? "All" : (node.name as Filter)));
                  }
                }}
              />
            </ResponsiveContainer>
          </div>
        )}
      </figure>
    </section>
  );
}
