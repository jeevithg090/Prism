"use client";
// Industry Radar: where skills are heading. Solid history, dashed 12-month projection and a shaded 95% band (low to high).
// Series colours come from the locked --chart-* tokens; the first pick wears the coral, the chart's one argued series.
import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { Info, Plus } from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { skillName } from "@/lib/schemas/community";
import type { SkillId, TrendSeries } from "@/lib/types";
import { cn } from "@/lib/utils";
import { StatusTag } from "./StatusTag";
import { growthParts, monthLabel, pctPosts, trendSummary } from "./summaries";

export const MAX_PICKS = 4;
export const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
];

type Row = { month: string } & Record<
  string,
  number | [number, number] | string | undefined
>;

/** One row per month: h_i (history %), p_i (projection %), b_i ([low, high] %). The projection starts at the last real point. */
export function buildRows(series: TrendSeries[]): Row[] {
  const rows = new Map<string, Row>();
  const row = (m: string) =>
    rows.get(m) ?? (rows.set(m, { month: m }), rows.get(m)!);
  series.forEach((s, i) => {
    for (const p of s.history) row(p.month)[`h_${i}`] = p.share * 100;
    const last = s.history.at(-1);
    if (last) {
      row(last.month)[`p_${i}`] = last.share * 100;
      row(last.month)[`b_${i}`] = [last.share * 100, last.share * 100];
    }
    for (const p of s.projection) {
      row(p.month)[`p_${i}`] = p.share * 100;
      row(p.month)[`b_${i}`] = [p.low * 100, p.high * 100];
    }
  });
  return [...rows.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/** Y-axis top in percent: the highest share or band edge, rounded up (whole % under 10%, else to the next 5%). */
export function yMaxFor(series: TrendSeries[]): number {
  const maxPct = Math.max(
    1,
    ...series.flatMap((s) => [
      ...s.history.map((p) => p.share * 100),
      ...s.projection.map((p) => p.high * 100),
    ]),
  );
  return maxPct <= 10 ? Math.ceil(maxPct) : Math.ceil(maxPct / 5) * 5;
}

/** Evenly spaced whole-percent ticks from 0 to yMax. */
export function yTicksFor(yMax: number): number[] {
  const step = yMax <= 5 ? 1 : yMax <= 10 ? 2 : yMax <= 30 ? 5 : 10;
  return Array.from(
    { length: Math.floor(yMax / step) + 1 },
    (_, i) => i * step,
  );
}

function ChartTooltip({
  active,
  label,
  series,
}: {
  active?: boolean;
  label?: string | number;
  series: TrendSeries[];
}) {
  if (!active || typeof label !== "string") return null;
  return (
    <div className="rounded-xl border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      <p className="font-semibold">{monthLabel(label)}</p>
      {series.map((s, i) => {
        const h = s.history.find((p) => p.month === label);
        const p = s.projection.find((x) => x.month === label);
        if (!h && !p) return null;
        return (
          <p key={s.skillId} className="flex items-center gap-2 tabular-nums">
            <span
              className="h-0.5 w-3 shrink-0 rounded-xs"
              style={{ background: COLORS[i] }}
              aria-hidden
            />
            {skillName(s.skillId)}:{" "}
            <span className="font-mono">
              {h
                ? `${pctPosts(h.share)} of postings`
                : `${pctPosts(p!.share)} projected (${pctPosts(p!.low)} to ${pctPosts(p!.high)})`}
            </span>
          </p>
        );
      })}
    </div>
  );
}

export function TrendChart({
  trends,
  options,
  picked,
  onToggle,
}: {
  trends: TrendSeries[];
  /** Skills offered in the picker (in order). */
  options: SkillId[];
  picked: SkillId[];
  onToggle: (skillId: SkillId) => void;
}) {
  const reduce = useReducedMotion();
  const summaryId = React.useId();
  const [asTable, setAsTable] = React.useState(false);
  const byId = new Map(trends.map((t) => [t.skillId, t]));
  const series = picked
    .map((id) => byId.get(id))
    .filter((s): s is TrendSeries => !!s);
  const rows = buildRows(series);
  const now = series[0]?.history.at(-1)?.month;
  const ticks = rows.filter((_, i) => i % 6 === 0).map((r) => r.month);
  const yMax = yMaxFor(series);

  return (
    <div className="space-y-5">
      <div
        role="group"
        aria-label={`Skills on the chart, up to ${MAX_PICKS}`}
        className="flex flex-wrap gap-2"
      >
        {options.map((id) => {
          const on = picked.includes(id);
          const i = picked.indexOf(id);
          const full = !on && picked.length >= MAX_PICKS;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              disabled={full}
              title={full ? `Up to ${MAX_PICKS} skills at once` : undefined}
              onClick={() => onToggle(id)}
              className={cn(
                "inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-medium outline-none transition-[background-color,color,transform] duration-(--dur-short) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55 disabled:active:translate-y-0",
                on
                  ? "border-rule-2 bg-muted text-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {on ? (
                <span
                  className="h-0.5 w-4 shrink-0 rounded-xs"
                  style={{ background: COLORS[i] }}
                  aria-hidden
                />
              ) : (
                <Plus className="size-3.5 shrink-0" aria-hidden />
              )}
              {skillName(id)}
            </button>
          );
        })}
      </div>

      {series.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t pt-4">
          <ul
            className="flex flex-wrap gap-x-6 gap-y-2"
            aria-label="Trend for each skill on the chart"
          >
            {series.map((s, i) => (
              <li key={s.skillId} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base">
                <span
                  className="h-[3px] w-6 shrink-0 rounded-xs"
                  style={{ background: COLORS[i] }}
                  aria-hidden
                />
                <span className="font-semibold text-foreground">
                  {skillName(s.skillId)}
                </span>
                <StatusTag status={s.label} />
                <span className="text-sm text-muted-foreground">
                  <span className="font-mono font-semibold text-foreground tabular-nums">
                    {growthParts(s.growthPerYear)[0]}
                  </span>{" "}
                  {growthParts(s.growthPerYear)[1]}
                </span>
              </li>
            ))}
          </ul>
          <Button
            variant="outline"
            className="shrink-0"
            onClick={() => setAsTable((v) => !v)}
            aria-pressed={asTable}
          >
            {asTable ? "View as chart" : "View as table"}
          </Button>
        </div>
      )}

      <figure aria-describedby={summaryId} className="space-y-4">
        {series.length === 0 ? (
          <div className="flex h-[260px] items-center justify-center rounded-xl bg-muted p-6 text-center text-pretty text-muted-foreground md:h-96 lg:h-80">
            Pick a skill above to see where hiring for it is heading.
          </div>
        ) : asTable ? (
          <TrendTable series={series} />
        ) : (
          <motion.div
            className="h-[280px] w-full min-w-0 md:h-[26rem] lg:h-80"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            data-testid="trend-chart"
            role="img"
            aria-label={`Line chart of the share of Hacker News job posts mentioning ${series.map((s) => skillName(s.skillId)).join(", ")}, with a 12-month projection`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={rows}
                margin={{ top: 16, right: 12, bottom: 0, left: 0 }}
              >
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="month"
                  ticks={ticks}
                  tickFormatter={(m: string) => monthLabel(m, true)}
                  tick={{ fontSize: 14, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--border)" }}
                />
                <YAxis
                  width={44}
                  domain={[0, yMax]}
                  ticks={yTicksFor(yMax)}
                  interval={0}
                  tickFormatter={(v: number) => `${v}%`}
                  tick={{ fontSize: 14, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<ChartTooltip series={series} />} />
                {now && (
                  <ReferenceLine
                    x={now}
                    stroke="var(--muted-foreground)"
                    strokeDasharray="2 4"
                    label={{
                      value: "Now",
                      position: "insideTopRight",
                      fontSize: 14,
                      fill: "var(--foreground)",
                    }}
                  />
                )}
                {series.map((s, i) => (
                  <Area
                    key={`b_${s.skillId}`}
                    dataKey={`b_${i}`}
                    stroke="none"
                    fill={COLORS[i]}
                    fillOpacity={0.2}
                    isAnimationActive={!reduce}
                    connectNulls
                    activeDot={false}
                    name={`${skillName(s.skillId)} range`}
                  />
                ))}
                {series.map((s, i) => (
                  <Line
                    key={`h_${s.skillId}`}
                    dataKey={`h_${i}`}
                    stroke={COLORS[i]}
                    strokeWidth={3}
                    dot={false}
                    isAnimationActive={!reduce}
                    name={skillName(s.skillId)}
                  />
                ))}
                {series.map((s, i) => (
                  <Line
                    key={`p_${s.skillId}`}
                    dataKey={`p_${i}`}
                    stroke={COLORS[i]}
                    strokeWidth={2.5}
                    strokeDasharray="6 4"
                    dot={false}
                    isAnimationActive={!reduce}
                    name={`${skillName(s.skillId)} projection`}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </motion.div>
        )}
        <figcaption
          id={summaryId}
          className="max-w-[76ch] space-y-2 border-t pt-4"
          aria-live="polite"
        >
          <p
            className="text-base text-pretty text-foreground"
            data-testid="trend-summary"
          >
            {trendSummary(series)}
          </p>
          <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Info className="size-4 shrink-0 text-muted-foreground" aria-hidden />A projection from
            past job postings, not a guarantee.
          </p>
        </figcaption>
      </figure>
    </div>
  );
}

function TrendTable({ series }: { series: TrendSeries[] }) {
  return (
    <div
      role="region"
      aria-label="Trend table"
      tabIndex={0}
      className="overflow-x-auto rounded-xl outline-none focus-visible:outline-2 focus-visible:outline-ring"
    >
      <table className="w-full min-w-[34rem] text-left text-base">
        <caption className="sr-only">
          Share of Hacker News job posts mentioning each skill, now and
          projected in 12 months
        </caption>
        <thead className="text-sm text-muted-foreground">
          <tr className="border-b">
            <th scope="col" className="py-2 pr-3 font-medium">
              Skill
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Now
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              In 12 months (range)
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Growth
            </th>
            <th scope="col" className="py-2 font-medium">
              Trend
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {series.map((s) => {
            const now = s.history.at(-1);
            const end = s.projection.at(-1);
            return (
              <tr key={s.skillId}>
                <th scope="row" className="py-2 pr-3 font-medium">
                  {skillName(s.skillId)}
                </th>
                <td className="py-2 pr-3 font-mono tabular-nums">
                  {now ? pctPosts(now.share) : "None"}
                </td>
                <td className="py-2 pr-3 font-mono tabular-nums">
                  {end
                    ? `${pctPosts(end.share)} (${pctPosts(end.low)} to ${pctPosts(end.high)})`
                    : "None"}
                </td>
                <td className="py-2 pr-3">
                  <span className="font-mono tabular-nums">{growthParts(s.growthPerYear)[0]}</span>{" "}
                  {growthParts(s.growthPerYear)[1]}
                </td>
                <td className="py-2">
                  <StatusTag status={s.label} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
