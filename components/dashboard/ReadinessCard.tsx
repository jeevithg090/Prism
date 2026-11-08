"use client";
// Readiness today vs projected (the ghost arc), what the map says, and the top three gaps.
import Link from "next/link";
import { CheckCircle2, GraduationCap, Target } from "lucide-react";
import { ReadinessRing, StatusBadge } from "@/components/keystone";
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
    { label: "In your degree", value: counts.degree, icon: GraduationCap, tone: "text-status-degree" },
    { label: "Gaps", value: counts.gaps, icon: Target, tone: "text-status-gap" },
  ];

  return (
    <section aria-labelledby="readiness-title" className="flex h-full flex-col rounded-2xl border bg-card p-6 shadow-sm">
      <h2 id="readiness-title" className="text-xl font-semibold text-balance text-foreground">Readiness for {role} roles</h2>
      <div className="mt-5 grid flex-1 grid-cols-1 gap-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-8">
        <div className="flex items-center gap-5 sm:flex-col sm:items-start">
          <ReadinessRing value={map.readinessNow} projected={map.readinessProjected} label={by ? `${projected}% by ${by}` : `${projected}%`} />
          <div className="min-w-0 sm:max-w-[13rem]">
            <p className="text-lg font-semibold text-foreground">{now}% ready today</p>
            <p className="mt-1 text-sm text-pretty text-muted-foreground">
              The faint arc is where your roadmap takes you: {projected}%{by ? ` by ${by}` : ""}.
            </p>
          </div>
        </div>

        <div className="flex min-w-0 flex-col">
          <dl className="grid grid-cols-3 divide-x border-b pb-4">
            {tiles.map((t) => (
              <div key={t.label} className="flex flex-col-reverse justify-end gap-1 px-4 first:pl-0 last:pr-0">
                <dt className="flex items-start gap-1.5 text-sm font-medium text-muted-foreground">
                  <t.icon className={cn("mt-0.5 size-4 shrink-0", t.tone)} aria-hidden />
                  <span>{t.label}</span>
                </dt>
                <dd className="font-mono text-3xl leading-none font-semibold text-foreground tabular-nums">{t.value}</dd>
              </div>
            ))}
          </dl>

          {gaps.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-foreground">Top gaps by demand</h3>
              <ul className="mt-1 divide-y">
                {gaps.map((g) => (
                  <li key={g.skillId}>
                    <Link
                      href={`/map?skill=${encodeURIComponent(g.skillId)}`}
                      className="-mx-2 flex min-h-11 items-center gap-2 rounded-lg px-2 transition-[background-color] duration-(--dur-short) outline-none hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                    >
                      <Target className="size-4 shrink-0 text-status-gap" aria-hidden />
                      <span className="font-medium text-foreground">{g.name}</span>
                      {g.trend === "rising" && <StatusBadge status="rising" size="sm" />}
                      <span className="ml-auto shrink-0 text-sm text-muted-foreground">
                        <span className="font-mono font-semibold text-foreground tabular-nums">{Math.round(g.demand * 100)}%</span> of ads
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Link
            href="/map"
            className="mt-auto self-start pt-4 text-sm font-medium text-primary underline decoration-1 underline-offset-4 outline-none hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Open your Bridge Map
          </Link>
        </div>
      </div>
    </section>
  );
}
