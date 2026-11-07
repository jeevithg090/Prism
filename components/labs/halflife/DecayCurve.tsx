"use client";
// One module's demand index over time: recorded hiring-post history, then the Trend Forecaster's logit trend
// extended forward. Today = 100; the dashed line at 50 is the half-life threshold.
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ModuleHalfLife } from "@/lib/labs/halflife/schema";
import { horizonLineLabel, monthLabel } from "./format";

const toT = (month: string) => { const [y, m] = month.split("-").map(Number); return y + (m - 1) / 12; };

type Row = { t: number; month: string; history?: number; forecast?: number };

export function curveRows(curve: ModuleHalfLife["curve"]): Row[] {
  const rows = new Map<string, Row>();
  for (const p of curve) {
    const r = rows.get(p.month) ?? { t: toT(p.month), month: p.month };
    if (p.kind === "history") r.history = p.index; else r.forecast = p.index;
    rows.set(p.month, r);
  }
  return [...rows.values()].sort((a, b) => a.t - b.t);
}

function CurveTip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  const r = payload?.[0]?.payload;
  if (!active || !r) return null;
  return (
    <div className="rounded-xl border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      <p className="font-semibold">{monthLabel(r.month)}</p>
      {r.history !== undefined && <p className="tabular-nums">Recorded: {r.history} (today = 100)</p>}
      {r.forecast !== undefined && <p className="tabular-nums">Trend: {r.forecast} (today = 100)</p>}
    </div>
  );
}

/**
 * Where the two vertical labels sit. "Today" always goes left of its line (over the recorded history) and the
 * horizon label right of its line, so they never meet between the lines on a phone. When the horizon is near
 * the right edge of the curve, its label flips to the left of its line, which is then far from "Today".
 */
export function horizonLabelSide(horizonT: number, lastT: number): "insideTopLeft" | "insideTopRight" {
  return lastT - horizonT >= 1.5 ? "insideTopLeft" : "insideTopRight";
}

export function DecayCurve({ module: m, lastDataMonth, horizonMonth, horizonYears }: { module: ModuleHalfLife; lastDataMonth: string; horizonMonth: string; horizonYears: number }) {
  const rows = curveRows(m.curve);
  const maxY = Math.max(120, ...rows.map((r) => Math.max(r.history ?? 0, r.forecast ?? 0)));
  const top = Math.ceil(maxY / 50) * 50;
  const yTicks = Array.from({ length: top / 50 + 1 }, (_, i) => i * 50);
  const first = Math.ceil(rows[0]?.t ?? 2024);
  const last = Math.floor(rows[rows.length - 1]?.t ?? 2032);
  const ticks = Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => first + i);
  const atHorizon = m.retainedAtHorizon !== null ? Math.round(m.retainedAtHorizon * 100) : null;

  return (
    <figure className="space-y-2">
      <div className="h-64 w-full" role="img"
        aria-label={`Demand index for ${m.code} from ${monthLabel(rows[0]?.month ?? lastDataMonth)}: ${atHorizon !== null ? `${atHorizon} at ${monthLabel(horizonMonth)} where today is 100` : "no forecast"}.`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 16, right: 16, bottom: 4, left: -8 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} ticks={ticks} tickFormatter={(t: number) => String(t)}
              tick={{ fill: "var(--muted-foreground)", fontSize: 13 }} stroke="var(--border)" />
            <YAxis domain={[0, top]} ticks={yTicks} tick={{ fill: "var(--muted-foreground)", fontSize: 13 }} stroke="var(--border)" width={44} />
            <ReferenceLine y={50} stroke="var(--status-gap)" strokeDasharray="6 4" label={{ value: "Half of today", position: "insideBottomRight", fill: "var(--foreground)", fontSize: 13 }} />
            <ReferenceLine x={toT(lastDataMonth)} stroke="var(--muted-foreground)" label={{ value: "Today", position: "insideTopRight", fill: "var(--muted-foreground)", fontSize: 13 }} />
            <ReferenceLine x={toT(horizonMonth)} stroke="var(--status-degree)" strokeDasharray="2 3"
              label={{ value: horizonLineLabel(horizonYears), position: horizonLabelSide(toT(horizonMonth), rows[rows.length - 1]?.t ?? toT(horizonMonth)), fill: "var(--foreground)", fontSize: 13 }} />
            <Line dataKey="history" name="Recorded" stroke="var(--chart-1)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
            <Line dataKey="forecast" name="Trend" stroke="var(--chart-2)" strokeWidth={2.5} strokeDasharray="6 4" dot={false} connectNulls isAnimationActive={false} />
            <Tooltip content={<CurveTip />} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2"><span className="h-0.5 w-5 bg-chart-1" aria-hidden />Recorded hiring posts</span>
        <span className="inline-flex items-center gap-2"><span className="h-0.5 w-5 border-t-2 border-dashed border-chart-2" aria-hidden />Logit trend, extended</span>
      </figcaption>
    </figure>
  );
}
