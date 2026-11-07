"use client";
// Readiness today vs projected (the ghost arc), what the map says, and the top three gaps.
import Link from "next/link";
import { ArrowRight, CheckCircle2, GraduationCap, Target, TrendingUp } from "lucide-react";
import { ReadinessRing } from "@/components/keystone";
import type { BridgeMap } from "@/lib/types";
import { cn } from "@/lib/utils";
import { monthYear, roleName, statusCounts, topGaps } from "./data";

export function ReadinessCard({ map, targetDate }: { map: BridgeMap; targetDate?: string }) {
  const now = Math.round(map.readinessNow * 100);
  const projected = Math.round(map.readinessProjected * 100);
  const by = monthYear(targetDate);
  const role = roleName(map.roleId);
  const counts = statusCounts(map);
  const gaps = topGaps(map, 3);
  const tiles = [
    { label: "Proven", value: counts.proven, icon: CheckCircle2, tone: "text-status-proven" },
    { label: "Degree", value: counts.degree, icon: GraduationCap, tone: "text-status-degree" },
    { label: "Gaps", value: counts.gaps, icon: Target, tone: "text-status-gap" },
  ];

  return (
    <section aria-labelledby="readiness-title" className="flex h-full flex-col rounded-2xl border bg-card p-6 shadow-sm">
      <h2 id="readiness-title" className="text-xl font-semibold tracking-tight">Readiness for {role} roles</h2>
      <div className="mt-4 flex items-center gap-5">
        <ReadinessRing value={map.readinessNow} projected={map.readinessProjected} label={by ? `→ ${projected}% by ${by}` : `→ ${projected}%`} />
        <div className="min-w-0">
          <p className="text-base font-semibold">{now}% ready today</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The faint arc is where your roadmap takes you: {projected}%{by ? ` by ${by}` : ""}.
          </p>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-2">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl bg-muted/60 px-3 py-2.5">
            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
              <t.icon className={cn("size-3.5 shrink-0", t.tone)} aria-hidden />
              <span className="truncate">{t.label}</span>
            </dt>
            <dd className="font-mono text-2xl font-semibold tabular-nums">{t.value}</dd>
          </div>
        ))}
      </dl>

      {gaps.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold">Top gaps by demand</h3>
          <ul className="mt-1 divide-y">
            {gaps.map((g) => (
              <li key={g.skillId}>
                <Link
                  href={`/map?skill=${encodeURIComponent(g.skillId)}`}
                  className="-mx-2 flex min-h-11 items-center gap-2 rounded-lg px-2 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Target className="size-4 shrink-0 text-status-gap" aria-hidden />
                  <span className="font-medium">{g.name}</span>
                  {g.trend === "rising" && (
                    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                      <TrendingUp className="size-3.5 text-status-rising" aria-hidden />rising
                    </span>
                  )}
                  <span className="ml-auto text-sm text-muted-foreground">
                    <span className="font-mono font-semibold text-foreground tabular-nums">{Math.round(g.demand * 100)}%</span> of ads
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link href="/map" className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
        Open your Bridge Map<ArrowRight className="size-4" aria-hidden />
      </Link>
    </section>
  );
}
