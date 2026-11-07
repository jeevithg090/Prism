// Industry Radar loading state: shaped like the page (3 stat cards, 8 bars, a chart).
import * as React from "react";
import { PageHeader } from "@/components/keystone";
import { Skeleton } from "@/components/ui/skeleton";

export function MarketSkeleton({ header, switcher }: { header?: React.ReactNode; switcher?: React.ReactNode }) {
  return (
    <div className="space-y-8" aria-busy="true">
      <span className="sr-only">Loading job ads and trends…</span>
      <div className="space-y-6">
        {header ?? <PageHeader title="Industry Radar" subtitle="What ML engineer roles ask for right now, and where it's heading" />}
        {switcher ?? <div className="flex gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-11 w-36 rounded-full" />)}</div>}
        <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-3 rounded-2xl border bg-card p-6 shadow-sm">
          <Skeleton className="h-7 w-56 rounded-lg" />
          {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-9 w-full rounded-xl" />)}
        </div>
        <div className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
          <Skeleton className="h-7 w-64 rounded-lg" />
          <div className="flex gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-24 rounded-full" />)}</div>
          <Skeleton className="h-[260px] w-full rounded-xl md:h-80" />
        </div>
      </div>
    </div>
  );
}
