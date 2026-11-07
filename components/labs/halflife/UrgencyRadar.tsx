"use client";
// The radar: one spoke per module in syllabus order (Year 1 at the top, clockwise). Two series, in urgency points:
// demand the module's own topics lose by the horizon (graduation at 3 years), and rising skills next door that no module teaches.
import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import type { ModuleHalfLife } from "@/lib/labs/halflife/schema";
import { REFRESH_AT } from "@/lib/labs/halflife/schema";
import { BAND_LABEL, band, byHorizon, lifeLabel } from "./format";

type Row = { code: string; title: string; decay: number; drift: number; urgency: number; life: string };

function useWide() {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

/** One-sentence reading of the radar. `by` is the horizon phrase, "by graduation" or "by Oct 2031". */
export function radarSummary(modules: ModuleHalfLife[], by = "by graduation"): string {
  const ranked = [...modules].sort((a, b) => b.urgency - a.urgency);
  const top = ranked.filter((m) => m.urgency >= REFRESH_AT);
  if (!top.length) return `None of the ${modules.length} modules needs a refresh ${by}.`;
  const [first, ...rest] = top;
  const why = first.urgencyParts.decay >= first.urgencyParts.drift ? "its own topics are losing hiring demand" : "rising skills next to it go untaught";
  return `${first.code} ${first.title} spikes furthest (urgency ${first.urgency} of 100) because ${why}.` +
    (rest.length ? ` ${rest.map((m) => `${m.code} (${m.urgency})`).join(" and ")} also need a refresh.` : "");
}

function Tick({ x, y, payload, textAnchor, rows, wide, selected }: {
  x?: number | string; y?: number | string; payload?: { value: string }; textAnchor?: string;
  rows: Row[]; wide: boolean; selected: string | null;
}) {
  const row = rows.find((r) => r.code === payload?.value);
  if (!row) return null;
  const show = wide ? row.urgency > 0 || row.code === selected : row.urgency >= REFRESH_AT || row.code === selected;
  if (!show) return null;
  return (
    <text x={Number(x ?? 0)} y={Number(y ?? 0)} textAnchor={(textAnchor as "start" | "middle" | "end") ?? "middle"} dominantBaseline="central"
      fill={row.code === selected ? "var(--foreground)" : "var(--muted-foreground)"} fontSize={13} fontWeight={row.code === selected ? 600 : 500}>
      {row.code}
    </text>
  );
}

function RadarTip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  const r = payload?.[0]?.payload;
  if (!active || !r) return null;
  return (
    <div className="max-w-64 rounded-xl border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      <p className="font-semibold">{r.code} {r.title}</p>
      <p className="tabular-nums">Urgency {r.urgency} of 100, {BAND_LABEL[band(r.urgency)].toLowerCase()}</p>
      <p className="tabular-nums text-muted-foreground">Losing demand: {r.decay} points</p>
      <p className="tabular-nums text-muted-foreground">Rising skills next door: {r.drift} points</p>
      <p className="text-muted-foreground">{r.life}</p>
    </div>
  );
}

export function UrgencyRadar({ modules, selected, horizonYears, horizonMonth }: { modules: ModuleHalfLife[]; selected: string | null; horizonYears: number; horizonMonth: string }) {
  const reduce = useReducedMotion();
  const by = byHorizon(horizonYears, horizonMonth);
  const summary = radarSummary(modules, by);
  const wide = useWide();
  const rows: Row[] = [...modules]
    .sort((a, b) => a.year - b.year || a.code.localeCompare(b.code))
    .map((m) => ({ code: m.code, title: m.title, decay: m.urgencyParts.decay, drift: m.urgencyParts.drift, urgency: m.urgency, life: lifeLabel(m) }));
  const max = Math.max(20, ...rows.map((r) => Math.max(r.decay, r.drift)));
  const domain = [0, Math.ceil(max / 10) * 10];

  return (
    <figure className="space-y-3">
      <div className="h-72 w-full md:h-[26rem]" role="img" aria-label={`Radar of refresh urgency for ${rows.length} modules. ${summary}`}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={rows} outerRadius={wide ? "72%" : "58%"} margin={wide ? { top: 8, right: 8, bottom: 8, left: 8 } : { top: 8, right: 40, bottom: 8, left: 40 }}>
            <PolarGrid stroke="var(--border)" />
            <PolarAngleAxis dataKey="code" tick={(p) => <Tick {...p} rows={rows} wide={wide} selected={selected} />} />
            <PolarRadiusAxis domain={domain} scale="sqrt" tick={false} axisLine={false} />
            <Radar name="Losing demand" dataKey="decay" stroke="var(--chart-2)" fill="var(--chart-2)" fillOpacity={0.25} strokeWidth={2} isAnimationActive={!reduce} />
            <Radar name="Rising skills next door" dataKey="drift" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.25} strokeWidth={2} isAnimationActive={!reduce} />
            <Tooltip content={<RadarTip />} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="space-y-2">
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <span className="inline-flex items-center gap-2"><span className="size-3 rounded-sm bg-chart-2" aria-hidden />Losing demand {by}</span>
          <span className="inline-flex items-center gap-2"><span className="size-3 rounded-sm bg-chart-1" aria-hidden />Rising skills next door, untaught</span>
        </div>
        <p className="text-sm text-muted-foreground">{summary} Distance from the centre uses a square-root scale, so small scores stay visible.</p>
      </figcaption>
    </figure>
  );
}
