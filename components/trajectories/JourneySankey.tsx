"use client";
// P5 · where students before you went: Year-1 focus → Year 2–3 experience → where they are now.
import * as React from "react";
import { ResponsiveContainer, Sankey } from "recharts";
import { BarChart3, List } from "lucide-react";
import type { Trajectory } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DemoDataNote } from "@/components/keystone";
import { buildSankeyData, outcomeGroup, pathRows, summarise, toChartLinks, type ChartLink, type OutcomeGroup, type SankeyNodeDatum } from "./sankey";

/** Outcome colours come from the theme tokens, so P3's palette (light and dark) flows through. */
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
const COLUMN_TITLES = ["Year 1 focus", "Years 2–3", "Where they are now"];

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

  const renderLink = React.useCallback(
    (p: LinkRenderProps) => {
      const { sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, payload } = p;
      const active = filter === "All" || payload.outcome === filter;
      return (
        <path
          d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
          fill="none"
          stroke={OUTCOME_COLOR[payload.outcome]}
          strokeWidth={Math.max(1.5, linkWidth - 1)}
          strokeOpacity={filter === "All" ? 0.38 : active ? 0.7 : 0.06}
          style={{ transition: "stroke-opacity 200ms ease-out" }}
        >
          <title>{payload.label}</title>
        </path>
      );
    },
    [filter],
  );

  const renderNode = React.useCallback(
    (p: NodeRenderProps) => {
      const { x, y, width, height, payload } = p;
      const isOutcome = payload.column === 2;
      const shown = filter === "All" ? payload.count : (payload.byOutcome[filter] ?? 0);
      const active = shown > 0;
      const fill = isOutcome ? OUTCOME_COLOR[payload.name as OutcomeGroup] ?? "var(--foreground)" : "var(--foreground)";
      const label = isOutcome ? OUTCOME_LABEL[payload.name as OutcomeGroup] ?? payload.name : payload.name;
      return (
        <g style={{ opacity: active ? 1 : 0.3, transition: "opacity 200ms ease-out" }}>
          <rect x={x} y={y} width={width} height={Math.max(2, height)} rx={3} fill={fill} />
          <text
            x={x + width + 8}
            y={y + height / 2}
            dominantBaseline="middle"
            stroke="var(--card)"
            strokeWidth={5}
            strokeLinejoin="round"
            paintOrder="stroke"
            className="fill-foreground"
          >
            <tspan fontSize={15} fontWeight={600}>{label}</tspan>
            <tspan dx={6} fontSize={14} className="fill-muted-foreground tabular-nums">{shown}</tspan>
          </text>
        </g>
      );
    },
    [filter],
  );

  return (
    <section aria-labelledby="journeys-title" className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="journeys-title" className="text-xl font-semibold md:text-2xl">Where students before you went</h2>
            {isDemo && <DemoDataNote />}
          </div>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            Each band is a real path, from first-year focus to where they are now. Pick an outcome to follow its paths.
          </p>
        </div>
        <Button
          variant="outline"
          size="lg"
          className="h-10 shrink-0 rounded-xl"
          aria-pressed={asList}
          onClick={() => setListChoice(!asList)}
        >
          {asList ? <BarChart3 aria-hidden /> : <List aria-hidden />}
          {asList ? "View as chart" : "View as list"}
        </Button>
      </div>

      <div role="group" aria-label="Filter journeys by outcome" className="mb-5 flex flex-wrap gap-2">
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
                "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-[15px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                pressed ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-muted",
              )}
            >
              {c !== "All" && <span aria-hidden className={cn("size-2.5 rounded-full", pressed && "ring-2 ring-background")} style={{ background: OUTCOME_COLOR[c] }} />}
              {c === "All" ? "All" : OUTCOME_LABEL[c]}
              <span className={cn("tabular-nums", pressed ? "text-background/70" : "text-muted-foreground")}>{n}</span>
            </button>
          );
        })}
      </div>

      <figure className="m-0">
        {asList ? (
          <div className="relative overflow-x-auto rounded-xl border">
            <table className="w-full text-left text-[15px]">
              <caption className="sr-only">Journeys by path{filter === "All" ? "" : `, ${OUTCOME_LABEL[filter]} only`}</caption>
              <thead className="bg-muted/60 text-sm text-muted-foreground">
                <tr>
                  {COLUMN_TITLES.map((h) => <th key={h} scope="col" className="px-4 py-2.5 font-medium">{h}</th>)}
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Journeys</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => (
                  <tr key={`${r.y1}|${r.y23}|${r.outcome}`} className="border-t">
                    <td className="px-4 py-2.5">{r.y1}</td>
                    <td className="px-4 py-2.5">{r.y23}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-2">
                        <span aria-hidden className="size-2.5 rounded-full" style={{ background: OUTCOME_COLOR[r.outcome] }} />
                        {OUTCOME_LABEL[r.outcome]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div aria-hidden>
            <div className="mb-2 flex justify-between pr-1 text-[13px] font-medium tracking-wide text-muted-foreground uppercase">
              {COLUMN_TITLES.map((h, i) => <span key={h} className={cn(i === 1 && "text-center", i === 2 && "text-right")}>{h}</span>)}
            </div>
            <ResponsiveContainer width="100%" height={420} initialDimension={{ width: 800, height: 420 }}>
              <Sankey
                data={chartData}
                accessibilityLayer={false}
                nodeWidth={14}
                nodePadding={22}
                linkCurvature={0.5}
                margin={{ top: 10, right: 104, bottom: 10, left: 2 }}
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
        <figcaption aria-live="polite" className="mt-4 text-base font-medium md:text-lg">
          {caption}
        </figcaption>
      </figure>
    </section>
  );
}
