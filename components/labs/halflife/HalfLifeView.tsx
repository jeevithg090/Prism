"use client";
// Skill Half-life Radar: how fast each module's skills lose hiring demand, and what to refresh first.
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Hourglass, ListChecks, Radar as RadarIcon, ShieldCheck, TrendingUp } from "lucide-react";
import { ErrorState, EmptyState, SectionCard, StatCard } from "@/components/keystone";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/fetcher";
import { REFRESH_AT, type HalfLifeReport } from "@/lib/labs/halflife/schema";
import { cn } from "@/lib/utils";
import { andList, monthLabel, roleName, signedPct, yrs } from "./format";
import { ModuleDetail } from "./ModuleDetail";
import { ModuleRanking } from "./ModuleRanking";
import { UrgencyRadar } from "./UrgencyRadar";

const HORIZONS = [2, 3, 5] as const;

function Loading() {
  return (
    <div role="status" aria-busy="true" aria-label="Reading the syllabus and hiring trends" className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}</div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Skeleton className="h-[28rem] rounded-2xl" />
        <Skeleton className="h-[28rem] rounded-2xl" />
      </div>
    </div>
  );
}

function Stats({ r }: { r: HalfLifeReport }) {
  const fastest = r.modules.filter((m) => m.halfLifeYears !== null).sort((a, b) => a.halfLifeYears! - b.halfLifeYears!)[0];
  const falling = fastest?.taught.filter((t) => t.tracked && (t.growthPerYear ?? 0) < 0).sort((a, b) => (a.growthPerYear ?? 0) - (b.growthPerYear ?? 0))[0];
  const drift = r.modules.flatMap((m) => m.drift.filter((d) => d.points > 0).map((d) => ({ d, code: m.code })))
    .sort((a, b) => b.d.growthPerYear - a.d.growthPerYear);
  const top = drift[0];
  const nextTo = top ? [...new Set(drift.filter((x) => x.d.skillId === top.d.skillId).map((x) => x.code))] : [];
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <StatCard label="Fastest half-life" icon={Hourglass}
        value={fastest ? yrs(fastest.halfLifeYears!) : "None"}
        hint={fastest ? `${fastest.code} ${fastest.title}${falling ? `: ${falling.name} is falling ${signedPct(falling.growthPerYear ?? 0).replace("−", "")} a year in hiring posts` : ""}` : "No module's topics are losing hiring demand."} />
      <StatCard label="Modules to refresh" icon={ListChecks}
        value={`${r.stats.needsRefresh} of ${r.stats.modules}`}
        hint={`Urgency ${REFRESH_AT} or more before ${monthLabel(r.horizonMonth)}, when this year's first-years graduate.`} />
      <StatCard label="Fastest-rising skill next door" icon={TrendingUp}
        value={top ? `${signedPct(top.d.growthPerYear)}` : "None"}
        hint={top ? `${top.d.name} a year, next to ${andList(nextTo)}. No module teaches it.` : "Every rising skill next to a module is already taught."} />
    </div>
  );
}

export function HalfLifeView({ programmeId }: { programmeId: string }) {
  const [horizon, setHorizon] = useState<number>(3);
  const [forceDemo, setForceDemo] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["labs-halflife", programmeId, horizon, forceDemo],
    queryFn: () => apiGet<HalfLifeReport>(`/api/labs/halflife?programmeId=${encodeURIComponent(programmeId)}&horizonYears=${horizon}${forceDemo ? "&demo=1" : ""}`),
    placeholderData: (prev) => prev,
  });

  const r = q.data;
  const selectedCode = picked && r?.modules.some((m) => m.code === picked) ? picked : r?.modules[0]?.code ?? null;
  const selected = r?.modules.find((m) => m.code === selectedCode) ?? null;

  const horizonPicker = (
    <div role="group" aria-label="Forecast horizon" className="inline-flex rounded-xl border bg-card p-1">
      {HORIZONS.map((h) => (
        <button key={h} type="button" aria-pressed={horizon === h} onClick={() => setHorizon(h)}
          className={cn("h-10 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            horizon === h ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:text-foreground")}>
          {h} years
        </button>
      ))}
    </div>
  );

  if (q.isError && !r) {
    return <ErrorState title="We couldn't build the radar" body="The syllabus or the hiring trends didn't load. Try again, or use the recorded demo data." onRetry={() => q.refetch()} onUseDemo={() => setForceDemo(true)} />;
  }
  if (!r) return <Loading />;
  if (!r.modules.length) {
    return <EmptyState icon={RadarIcon} title="This programme has no modules yet" body="Read the syllabus on the onboarding page, then come back to see how fast each module goes stale." action={<Link href="/onboard" className="font-medium text-primary underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Read a syllabus</Link>} />;
  }

  return (
    <div className="space-y-6" aria-busy={q.isFetching}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-status-proven" aria-hidden />
          {r.cohort.suppressed
            ? `Anonymous. Fewer than 10 students, so demand is an equal mix of target roles.`
            : `Anonymous. Demand is weighted by what ${r.cohort.size} students aim for: ${andList(r.cohort.roleMix.map((x) => `${x.pct}% ${roleName(x.roleId)}`))}.`}
        </p>
        {horizonPicker}
      </div>

      <Stats r={r} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <SectionCard title="Refresh radar" description={`Each spoke is a module, Year 1 at the top. Points out to ${monthLabel(r.horizonMonth)}.`}>
          <UrgencyRadar modules={r.modules} selected={selectedCode} />
        </SectionCard>
        <SectionCard title="Modules by refresh urgency" description="Pick one to see its receipts and the drafted note.">
          <div role="region" tabIndex={0} aria-label="Ranked modules" className="max-h-[30rem] overflow-y-auto rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ModuleRanking modules={r.modules} selected={selectedCode} onSelect={setPicked} />
          </div>
        </SectionCard>
      </div>

      {selected && <ModuleDetail key={`${selected.code}-${horizon}`} module={selected} programmeId={r.programmeId} lastDataMonth={r.lastDataMonth} horizonMonth={r.horizonMonth} />}

      <details className="rounded-2xl border bg-card p-6 shadow-sm">
        <summary className="cursor-pointer rounded font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">How the agent worked this out</summary>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          {r.trace.map((t, i) => <li key={i}>{t}</li>)}
        </ol>
        <p className="mt-3 text-sm text-muted-foreground">
          Half-life uses the Trend Forecaster&apos;s fit: a straight line through the log-odds of each skill&apos;s share of hiring posts over the last 24 months,
          combined across the module&apos;s skills by level. Every run is logged on the <Link href="/governance" className="font-medium text-primary underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">governance page</Link>.
        </p>
      </details>
    </div>
  );
}
