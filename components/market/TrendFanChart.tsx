"use client";

import { useReducedMotion } from "motion/react";
import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
  type TooltipContentProps,
} from "recharts";
import type { SkillId, TrendSeries } from "@/lib/types";
import { growthText } from "./format";

type Row = Record<string, string | number | [number, number]>;

const pct = (v: number) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;

function toRows(series: TrendSeries[]): Row[] {
  const rows = new Map<string, Row>();
  const row = (month: string) => rows.get(month) ?? rows.set(month, { month }).get(month)!;
  for (const s of series) {
    s.history.forEach((p) => { row(p.month)[s.skillId] = p.share; });
    const last = s.history.at(-1);
    if (last) {
      row(last.month)[`${s.skillId}_proj`] = last.share;
      row(last.month)[`${s.skillId}_band`] = [last.share, last.share];
    }
    s.projection.forEach((p) => {
      row(p.month)[`${s.skillId}_proj`] = p.share;
      row(p.month)[`${s.skillId}_band`] = [p.low, p.high];
    });
  }
  return [...rows.values()].sort((a, b) => String(a.month).localeCompare(String(b.month)));
}

function ChartTooltip({ active, payload, label, names }: TooltipContentProps & { names: Record<SkillId, string> }) {
  if (!active || !payload?.length) return null;
  const lines = payload.filter((p) => !String(p.dataKey).endsWith("_band"));
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 text-sm shadow-sm">
      <p className="font-medium">{String(label)}</p>
      {lines.map((p) => {
        const key = String(p.dataKey);
        const id = key.replace(/_proj$/, "");
        return (
          <p key={key} className="flex items-center gap-1.5 text-muted-foreground">
            <span aria-hidden className="size-2 rounded-full" style={{ background: p.color }} />
            {names[id] ?? id}: {pct(Number(p.value))} of postings{key.endsWith("_proj") ? " (projected)" : ""}
          </p>
        );
      })}
    </div>
  );
}

export function TrendFanChart({ trends, slots, names }: {
  trends: TrendSeries[];
  slots: (SkillId | null)[];
  names: Record<SkillId, string>;
}) {
  const reduced = useReducedMotion();
  const picked = slots.flatMap((id, slot) => {
    const series = trends.find((t) => t.skillId === id);
    return series ? [{ series, color: `var(--series-${slot + 1})` }] : [];
  });
  const rows = toRows(picked.map((p) => p.series));
  const today = picked[0]?.series.history.at(-1)?.month;
  // Scale to the lines, not the bands: a skill growing from a tiny base has a huge band that would flatten everything.
  const peak = Math.max(0.05, ...picked.flatMap(({ series: s }) => [...s.history, ...s.projection].map((p) => p.share)));
  const summary = picked
    .map(({ series: s }) => `${names[s.skillId] ?? s.skillId} ${s.label} ${growthText(s.growthPerYear)}`)
    .join("; ");

  return (
    <div>
      <p className="sr-only">{summary}</p>
      <div className="h-[260px] sm:h-[340px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="month" minTickGap={48} tick={{ fontSize: 13, fill: "var(--muted-foreground)" }} stroke="var(--border)" />
            <YAxis width={48} domain={[0, Math.ceil(peak * 11) / 10]} allowDataOverflow tickFormatter={(v: number) => `${Math.round(v * 100)}%`} tick={{ fontSize: 13, fill: "var(--muted-foreground)" }} stroke="var(--border)" />
            <Tooltip content={(props) => <ChartTooltip {...props} names={names} />} cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }} />
            {today && (
              <ReferenceLine x={today} stroke="var(--muted-foreground)" label={{ value: "Today", position: "top", fontSize: 13, fill: "var(--muted-foreground)" }} />
            )}
            {picked.map(({ series: { skillId: id }, color }) => (
              <Area key={`${id}-band`} dataKey={`${id}_band`} stroke="none" fill={color} fillOpacity={0.15} isAnimationActive={false} activeDot={false} connectNulls={false} />
            ))}
            {picked.map(({ series: { skillId: id }, color }) => (
              <Line key={id} dataKey={id} stroke={color} strokeWidth={2} dot={false} isAnimationActive={!reduced} />
            ))}
            {picked.map(({ series: { skillId: id }, color }) => (
              <Line key={`${id}-proj`} dataKey={`${id}_proj`} stroke={color} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-muted-foreground">View as table</summary>
        <table className="mt-2 w-full text-left">
          <thead><tr><th scope="col">Skill</th><th scope="col">Latest</th><th scope="col">Trend</th></tr></thead>
          <tbody className="tabular-nums">
            {picked.map(({ series: s }) => (
              <tr key={s.skillId}>
                <td>{names[s.skillId] ?? s.skillId}</td>
                <td>{pct(s.history.at(-1)?.share ?? 0)} of postings</td>
                <td>{s.label}, {growthText(s.growthPerYear)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <p className="mt-2 text-sm text-muted-foreground">A projection from past job postings, not a guarantee.</p>
    </div>
  );
}
