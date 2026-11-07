"use client";
// Branching futures: each plan's middle future as a line, the band that holds 8 of 10 futures shaded behind it,
// and your degree on its own as a dashed line. A table view carries the same numbers.
import * as React from "react";
import { useReducedMotion } from "motion/react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { chartRows, chartSummary, dayLabel, monthTick, PLAN_COLOR, type ChartRow, type SimulationResult } from "./model";

function Tip({ active, payload, sim }: { active?: boolean; payload?: { payload: ChartRow }[]; sim: SimulationResult }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const [a, b] = sim.plans;
  return (
    <div className="rounded-xl border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      <p className="font-semibold">Week ending {dayLabel(row.date)}</p>
      {a && row.a !== undefined && (
        <p className="flex items-center gap-2 tabular-nums"><span className="size-2.5 rounded-full" style={{ background: PLAN_COLOR.a }} aria-hidden />{a.label}: {row.a}% ({row.aBand?.[0]} to {row.aBand?.[1]}%)</p>
      )}
      {b && row.b !== undefined && (
        <p className="flex items-center gap-2 tabular-nums"><span className="size-2.5 rounded-full" style={{ background: PLAN_COLOR.b }} aria-hidden />{b.label}: {row.b}% ({row.bBand?.[0]} to {row.bBand?.[1]}%)</p>
      )}
      <p className="flex items-center gap-2 tabular-nums text-muted-foreground"><span className="h-0.5 w-2.5 bg-muted-foreground" aria-hidden />Degree only: {row.base}%</p>
    </div>
  );
}

export function FuturesChart({ sim, targetLabel }: { sim: SimulationResult; targetLabel: string }) {
  const reduce = useReducedMotion();
  const [asTable, setAsTable] = React.useState(false);
  const summaryId = React.useId();
  const rows = React.useMemo(() => chartRows(sim), [sim]);
  const lo = Math.max(0, Math.floor((Math.min(...rows.map((r) => Math.min(r.base, r.aBand?.[0] ?? 100, r.bBand?.[0] ?? 100))) - 5) / 10) * 10);
  const ticks = rows.filter((_, i) => i % 8 === 0).map((r) => r.date);
  const yTicks = Array.from({ length: (100 - lo) / 10 + 1 }, (_, i) => lo + i * 10);
  const [a, b] = sim.plans;

  return (
    <figure aria-describedby={summaryId} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label="Chart key">
          {sim.plans.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <span className="h-1 w-5 rounded-full" style={{ background: PLAN_COLOR[p.id] }} aria-hidden />
              <span className="font-medium">{p.label}</span>
            </li>
          ))}
          <li className="flex items-center gap-2 text-muted-foreground">
            <span className="w-5 border-t-2 border-dashed border-muted-foreground" aria-hidden />Your degree on its own
          </li>
        </ul>
        <Button variant="outline" className="h-10 rounded-xl px-4" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>
          {asTable ? "Show the chart" : "View as list"}
        </Button>
      </div>

      {asTable ? (
        <div role="region" tabIndex={0} aria-label="Readiness by week" className="max-h-96 overflow-auto rounded-xl border outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <table className="w-full text-left text-sm tabular-nums">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b">
                <th scope="col" className="px-3 py-2 font-medium">Week ending</th>
                {a && <th scope="col" className="px-3 py-2 font-medium">{a.label}</th>}
                {b && <th scope="col" className="px-3 py-2 font-medium">{b.label}</th>}
                <th scope="col" className="px-3 py-2 font-medium">Degree only</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.filter((_, i) => i % 2 === 0 || i === rows.length - 1).map((r) => (
                <tr key={r.date}>
                  <th scope="row" className="px-3 py-2 font-normal">{dayLabel(r.date)}</th>
                  {a && <td className="px-3 py-2">{r.a}% <span className="text-muted-foreground">({r.aBand?.[0]} to {r.aBand?.[1]}%)</span></td>}
                  {b && <td className="px-3 py-2">{r.b}% <span className="text-muted-foreground">({r.bBand?.[0]} to {r.bBand?.[1]}%)</span></td>}
                  <td className="px-3 py-2">{r.base}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-[280px] w-full min-w-0 md:h-[380px]" role="img" aria-label={`Readiness from today to ${targetLabel} for ${sim.plans.map((p) => p.label).join(" and ")}, with bands for 8 of 10 futures`} data-testid="whatif-chart">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" ticks={ticks} tickFormatter={monthTick} tick={{ fill: "var(--muted-foreground)", fontSize: 13 }} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
              <YAxis domain={[lo, 100]} ticks={yTicks} interval={0} tickFormatter={(v: number) => `${v}%`} tick={{ fill: "var(--muted-foreground)", fontSize: 13 }} tickLine={false} axisLine={false} width={48} />
              <Tooltip content={<Tip sim={sim} />} />
              {a && <Area dataKey="aBand" type="monotone" stroke="none" fill={PLAN_COLOR.a} fillOpacity={0.16} isAnimationActive={!reduce} />}
              {b && <Area dataKey="bBand" type="monotone" stroke="none" fill={PLAN_COLOR.b} fillOpacity={0.16} isAnimationActive={!reduce} />}
              <Line dataKey="base" type="monotone" stroke="var(--muted-foreground)" strokeDasharray="5 5" strokeWidth={2} dot={false} isAnimationActive={!reduce} />
              {a && <Line dataKey="a" type="monotone" stroke={PLAN_COLOR.a} strokeWidth={3} dot={false} isAnimationActive={!reduce} />}
              {b && <Line dataKey="b" type="monotone" stroke={PLAN_COLOR.b} strokeWidth={3} dot={false} isAnimationActive={!reduce} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      <figcaption id={summaryId} className="text-muted-foreground">{chartSummary(sim, targetLabel)}</figcaption>
    </figure>
  );
}
