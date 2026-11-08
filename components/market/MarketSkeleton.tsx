// Industry Radar loading state: shaped like the page (the demand list beside 3 figures, then the trend chart).
import * as React from "react";
import { PageHeader } from "@/components/keystone";
import { Skeleton } from "@/components/ui/skeleton";

export function MarketSkeleton({ header, switcher }: { header?: React.ReactNode; switcher?: React.ReactNode }) {
  return (
    <div className="space-y-8" aria-busy="true">
      <span className="sr-only">Loading job ads and trends…</span>
      <div className="space-y-6">
        {header ?? <PageHeader title="Industry Radar" subtitle="What ML engineer roles ask for right now, and where it's heading" />}
        {switcher ?? <Skeleton className="h-12 w-[26rem] max-w-full rounded-xl" />}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <Skeleton className="h-7 w-56 rounded-lg" />
          <Skeleton className="mt-2 h-4 w-80 max-w-full" />
          <div className="mt-6 divide-y">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="space-y-2 py-3">
                <div className="flex justify-between gap-4"><Skeleton className="h-5 w-32" /><Skeleton className="h-5 w-24" /></div>
                <Skeleton className="h-2.5 rounded-xs" style={{ width: `${92 - i * 8}%` }} />
              </div>
            ))}
          </div>
        </div>
        <div className="grid content-start gap-4 sm:grid-cols-3 lg:grid-cols-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-2xl border bg-card p-6 shadow-sm">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-4 h-10 w-24 rounded-lg" />
              <Skeleton className="mt-4 h-4 w-full" />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-5 rounded-2xl border bg-card p-6 shadow-sm">
        <Skeleton className="h-7 w-64 rounded-lg" />
        <div className="flex flex-wrap gap-2">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-9 w-24 rounded-lg" />)}</div>
        <Skeleton className="h-[280px] w-full rounded-xl md:h-[26rem]" />
      </div>
    </div>
  );
}
