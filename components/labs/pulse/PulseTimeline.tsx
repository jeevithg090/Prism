"use client";
// The lab over time: share of the room that has the focus criterion, and share that has passed, with each intervention marked.
import { useReducedMotion } from "motion/react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Effect, TimelinePoint } from "@/lib/labs/pulse/model";

const fmt = (m: number) => (Number.isInteger(m) ? String(m) : m.toFixed(1));

export function timelineSummary(points: TimelinePoint[], concept: string, effects: Effect[], n: number): string {
  const last = points.at(-1);
  if (!last) return "The lab hasn't started yet.";
  const head = `At minute ${fmt(last.minute)}, ${last.focusMetPct}% of the room have ${concept} and ${last.passedPct}% have passed.`;
  const e = effects.at(-1);
  if (!e) return head;
  return `${head} Since your ${e.kind === "explain" ? "mini-explanation" : e.kind === "peer" ? "peer discussion" : "hint"} at minute ${fmt(e.minute)}, ${e.concept} went from ${e.metBefore} to ${e.metNow} of ${n} students.`;
}

export function PulseTimeline({ points, concept, effects, labMinutes, cohortSize }: {
  points: TimelinePoint[]; concept: string; effects: Effect[]; labMinutes: number; cohortSize: number;
}) {
  const reduce = useReducedMotion();
  const summary = timelineSummary(points, concept, effects, cohortSize);
  return (
    <figure className="space-y-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground" aria-label="Legend">
        <li className="inline-flex items-center gap-1.5"><span className="h-1 w-5 rounded-full bg-chart-1" aria-hidden />Have {concept}</li>
        <li className="inline-flex items-center gap-1.5"><span className="h-1 w-5 rounded-full bg-chart-2" aria-hidden />Passed the challenge</li>
        {effects.length > 0 && <li className="inline-flex items-center gap-1.5"><span className="h-4 w-0.5 bg-foreground" aria-hidden />Your intervention</li>}
      </ul>
      <div className="h-56 w-full" role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="minute" type="number" domain={[0, labMinutes]} tickCount={6} allowDecimals={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 14 }} stroke="var(--border)"
              tickFormatter={(v: number) => `${v} min`}
            />
            <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={{ fill: "var(--muted-foreground)", fontSize: 14 }} stroke="var(--border)" tickFormatter={(v: number) => `${v}%`} />
            <Tooltip
              formatter={(v, name) => [`${v}%`, name === "focusMetPct" ? `Have ${concept}` : "Passed"]}
              labelFormatter={(l) => `Minute ${fmt(Number(l))}`}
              contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--popover-foreground)" }}
            />
            {effects.map((e) => (
              <ReferenceLine key={e.interventionId} x={e.minute} stroke="var(--foreground)" strokeDasharray="4 4"
                label={{ value: "You stepped in", position: "insideTopLeft", fill: "var(--foreground)", fontSize: 14 }} />
            ))}
            <Line type="monotone" dataKey="focusMetPct" stroke="var(--chart-1)" strokeWidth={3} dot={false} isAnimationActive={!reduce} />
            <Line type="monotone" dataKey="passedPct" stroke="var(--chart-2)" strokeWidth={3} dot={false} isAnimationActive={!reduce} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-sm text-muted-foreground" aria-live="polite">{summary}</figcaption>
      <details className="rounded-xl text-sm">
        <summary className="cursor-pointer rounded-lg py-1 font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">View as table</summary>
        <div className="mt-2 max-h-56 overflow-auto rounded-xl border" role="region" tabIndex={0} aria-label="Lab timeline table">
          <table className="w-full text-left tabular-nums">
            <thead className="bg-muted"><tr><th className="px-3 py-2 font-medium">Minute</th><th className="px-3 py-2 font-medium">Have {concept}</th><th className="px-3 py-2 font-medium">Passed</th></tr></thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.minute} className="border-t"><td className="px-3 py-1.5">{fmt(p.minute)}</td><td className="px-3 py-1.5">{p.focusMetPct}%</td><td className="px-3 py-1.5">{p.passedPct}%</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
