"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import dynamic from "next/dynamic";
import { EmptyState, ErrorState, LoadingSkeleton, SectionCard, StatCard } from "@/components/keystone";
import type { RoleDemand, SkillId, SkillStatus, TrendSeries } from "@/lib/types";
import { growthText } from "./format";
import { RoleOutlookCard } from "./RoleOutlookCard";
import { SampleAds } from "./SampleAds";
import { SkillDemandList } from "./SkillDemandList";
import { SkillPicker } from "./SkillPicker";
import "./market.css";

const TrendFanChart = dynamic(() => import("./TrendFanChart").then((m) => m.TrendFanChart), {
  ssr: false,
  loading: () => <LoadingSkeleton variant="chart" />,
});

const pounds = (n: number) => `£${Math.round(n / 1000)}k`;

function Movers({ title, icon: Icon, items, names }: {
  title: string; icon: typeof TrendingUp; items: TrendSeries[]; names: Record<SkillId, string>;
}) {
  return (
    <SectionCard title={title}>
      {items.length === 0 ? <p className="text-muted-foreground">Nothing here for this role.</p> : (
        <ul className="flex flex-col gap-1">
          {items.map((t) => (
            <li key={t.skillId} className="flex items-center justify-between gap-2">
              <span className="truncate">{names[t.skillId] ?? t.skillId}</span>
              <span className="inline-flex items-center gap-1 font-mono text-sm tabular-nums">
                <Icon aria-hidden size={14} />{growthText(t.growthPerYear)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export function MarketView({
  market, trends, slots, maxPicked, names, statusBySkill, isLoading, isError, refetch, onPick, onRemove,
}: {
  market?: RoleDemand;
  trends: TrendSeries[];
  slots: (SkillId | null)[];
  maxPicked: number;
  names: Record<SkillId, string>;
  statusBySkill: Record<SkillId, SkillStatus>;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  onPick: (id: SkillId) => void;
  onRemove: (id: SkillId) => void;
}) {
  if (isError) {
    return (
      <ErrorState
        title="We couldn't load job data."
        onRetry={refetch}
        onUseDemo={() => { window.location.search = "?demo=1"; }}
      />
    );
  }
  if (isLoading || !market) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <div className="grid gap-6 md:grid-cols-3">
          {[0, 1, 2].map((i) => <LoadingSkeleton key={i} />)}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <LoadingSkeleton variant="list" />
          <LoadingSkeleton variant="chart" />
        </div>
      </div>
    );
  }
  if (market.skills.length === 0) {
    return <EmptyState title="No ads found for this role yet." body="Try another role or refresh." />;
  }

  const roleSkills = new Set(market.skills.map((s) => s.skillId));
  const movers = trends.filter((t) => roleSkills.has(t.skillId)).sort((a, b) => b.growthPerYear - a.growthPerYear);
  const rising = movers.filter((t) => t.label === "rising").slice(0, 5);
  const cooling = movers.filter((t) => t.growthPerYear < 0).reverse().slice(0, 5);
  const top = market.topCompanies[0];

  return (
    <div className="market-series flex flex-col gap-6">
      <div className="grid gap-6 md:grid-cols-3">
        <StatCard label="Job ads analysed" value={String(market.adsAnalysed)} hint={`${market.roleName} roles, ${market.location}`} />
        <StatCard
          label="Median salary"
          value={market.salary ? pounds(market.salary.median) : "Not enough data"}
          hint={market.salary ? `${pounds(market.salary.p25)} to ${pounds(market.salary.p75)}, middle half of ads` : undefined}
        />
        <StatCard label="Top hirer" value={top?.name ?? "Unknown"} hint={top ? `${top.count} ads` : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Top skills employers ask for" description="Select a skill to add it to the chart.">
          <SkillDemandList skills={market.skills} names={names} statusBySkill={statusBySkill} onPick={onPick} />
        </SectionCard>
        <SectionCard title="Where skills are heading" description={`Up to ${maxPicked} skills. Share of Hacker News hiring posts.`}>
          <div className="mb-3"><SkillPicker slots={slots} names={names} onRemove={onRemove} /></div>
          <TrendFanChart trends={trends} slots={slots} names={names} />
        </SectionCard>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Movers title="Rising fast" icon={TrendingUp} items={rising} names={names} />
        <Movers title="Cooling down" icon={TrendingDown} items={cooling} names={names} />
        <RoleOutlookCard skills={market.skills} trends={trends} names={names} />
      </div>

      <SampleAds ads={market.sampleAds} />
      <p className="text-sm text-muted-foreground">
        Data: {market.source === "cache" ? "demo job-ad data" : "live job ads"} and Hacker News &quot;Who is hiring?&quot; threads.
      </p>
    </div>
  );
}
