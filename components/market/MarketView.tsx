"use client";
// Industry Radar (/market): what a role's UK job ads ask for now, tagged against your Bridge Map,
// and where each skill is heading (HN hiring history + projection).
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, SearchX } from "lucide-react";
import { toast } from "sonner";
import { DemoDataNote, EmptyState, ErrorState, PageHeader, SectionCard } from "@/components/keystone";
import { useActivity } from "@/components/shell/ActivityPanel";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/fetcher";
import { skillName } from "@/lib/schemas/community";
import type { RoleDemand, SkillId, SkillStatus, TrendSeries } from "@/lib/types";
import { MarketSkeleton } from "./MarketSkeleton";
import { MarketStats } from "./MarketStats";
import { RisingCovered } from "./RisingCovered";
import { RoleSwitcher } from "./RoleSwitcher";
import { SampleAds } from "./SampleAds";
import { SkillDemandChart } from "./SkillDemandChart";
import { defaultPicks, monthLabel, risingForRole, roleInSentence, ROLES, subtitleFor, type RoadmapWeeks, type StatusBySkill } from "./summaries";
import { MAX_PICKS, TrendChart } from "./TrendChart";

export type MarketViewProps = {
  initialRole: string;
  primaryRole: string;
  statusBySkill: StatusBySkill;
  fallbackStatus: SkillStatus | null;
  roadmapWeeks: RoadmapWeeks | null;
  initialDemo?: boolean;
};

const newRunId = () => `run_${Math.random().toString(36).slice(2, 10)}`;

export function MarketView({ initialRole, primaryRole, statusBySkill: known, fallbackStatus, roadmapWeeks, initialDemo = false }: MarketViewProps) {
  const [roleId, setRoleId] = React.useState(initialRole);
  const [demo, setDemo] = React.useState(initialDemo);
  const [picks, setPicks] = React.useState<Record<string, SkillId[]>>({});
  const [refreshing, setRefreshing] = React.useState(false);
  const qc = useQueryClient();
  const activity = useActivity();
  const role = ROLES.find((r) => r.id === roleId) ?? ROLES[0];
  const q = demo ? "?demo=1" : "";

  const market = useQuery({
    queryKey: ["market", roleId, demo],
    queryFn: () => apiGet<RoleDemand>(`/api/market/${roleId}${q}`),
  });
  const trends = useQuery({
    queryKey: ["trends", demo],
    queryFn: () => apiGet<TrendSeries[]>(`/api/trends${q}`),
  });

  const demand = market.data;
  const statusBySkill = React.useMemo<StatusBySkill>(() => {
    if (!demand || !fallbackStatus) return known;
    const out = { ...known };
    for (const s of demand.skills) out[s.skillId] ??= fallbackStatus;
    return out;
  }, [demand, known, fallbackStatus]);

  const trendList = React.useMemo(() => trends.data ?? [], [trends.data]);
  const options = React.useMemo(() => {
    if (!demand) return [] as SkillId[];
    const has = new Set(trendList.map((t) => t.skillId));
    return demand.skills.filter((s) => has.has(s.skillId)).map((s) => s.skillId);
  }, [demand, trendList]);
  const picked = picks[roleId] ?? (demand ? defaultPicks(demand, trendList, statusBySkill) : []);
  const setPicked = (next: SkillId[]) => setPicks((p) => ({ ...p, [roleId]: next }));

  const toggle = (id: SkillId) => {
    if (picked.includes(id)) return setPicked(picked.filter((x) => x !== id));
    if (!trendList.some((t) => t.skillId === id)) {
      toast.info(`No hiring history for ${skillName(id)} yet`, { description: "We only chart skills with at least 6 months of Hacker News posts." });
      return;
    }
    setPicked([...(picked.length >= MAX_PICKS ? picked.slice(1) : picked), id]);
  };

  const refresh = async () => {
    const runId = newRunId();
    setRefreshing(true);
    activity.start(runId);
    try {
      const d = await apiGet<RoleDemand>(`/api/market/${roleId}?refresh=1&runId=${runId}${demo ? "&demo=1" : ""}`);
      qc.setQueryData(["market", roleId, demo], d);
      if (d.source === "cache") toast("Showing the saved snapshot", { description: `No live job board is connected, so these are the ${d.adsAnalysed} ads saved on ${new Date(d.snapshotAt).getUTCDate()} ${monthLabel(d.snapshotAt.slice(0, 7))}.` });
      else toast.success("Updated with today's ads", { description: `${d.adsAnalysed} ${role.name} ads analysed.` });
    } catch {
      toast.error("We couldn't refresh the job data", { description: "That's on us, not you. The numbers below are unchanged." });
    } finally {
      setRefreshing(false);
    }
  };

  const header = (
    <PageHeader
      title="Industry Radar"
      subtitle={subtitleFor(role.name)}
      actions={
        <Button variant="outline" className="h-10 rounded-xl px-3 text-base" onClick={refresh} disabled={refreshing || !demand}>
          <RefreshCw className={refreshing ? "animate-spin" : undefined} aria-hidden />
          {refreshing ? "Refreshing…" : "Refresh job data"}
        </Button>
      }
    />
  );
  const switcher = <RoleSwitcher roles={ROLES} value={roleId} onChange={setRoleId} primaryRole={primaryRole} />;
  const useDemo = () => setDemo(true);

  if (market.isPending) return <MarketSkeleton header={header} switcher={switcher} />;
  if (market.isError) {
    return (
      <div className="space-y-6">
        {header}
        {switcher}
        <ErrorState title="We couldn't load job data" body="That's on us, not you. Try again, or look at the saved demo snapshot." onRetry={() => market.refetch()} onUseDemo={useDemo} />
      </div>
    );
  }
  const d = market.data;
  if (!d.skills.length) {
    return (
      <div className="space-y-6">
        {header}
        {switcher}
        <EmptyState icon={SearchX} title="No ads found for this role yet" body="Try another role, or refresh to read today's ads." action={<Button className="h-10 rounded-xl px-4 text-base" onClick={refresh}>Refresh job data</Button>} />
      </div>
    );
  }

  const roleLabel = roleInSentence(d.roleName);
  const rising = risingForRole(d, trendList, statusBySkill, roadmapWeeks);
  const anyCovered = rising.some((r) => r.week !== undefined);
  const cached = d.source === "cache";
  const months = trendList[0]?.history;

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        {header}
        {switcher}
        <MarketStats demand={d} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <SectionCard title="What employers ask for" description={`Share of ${d.adsAnalysed} ${roleLabel} ads that mention each skill, tagged against your Bridge Map.`} actions={cached ? <span className="shrink-0 whitespace-nowrap"><DemoDataNote /></span> : undefined}>
          <SkillDemandChart demand={d} statusBySkill={statusBySkill} picked={picked} onPick={toggle} />
        </SectionCard>
        <SectionCard title="Where skills are heading" description="Share of Hacker News “Who is hiring?” posts that mention each skill, with a 12-month projection.">
          {trends.isPending ? (
            <div className="h-80 animate-pulse rounded-xl bg-muted" aria-busy="true"><span className="sr-only">Loading trends…</span></div>
          ) : trends.isError ? (
            <ErrorState title="We couldn't load the trends" body="The job ads above are still accurate. Try again, or use the demo history." onRetry={() => trends.refetch()} onUseDemo={useDemo} />
          ) : (
            <TrendChart trends={trendList} options={options} picked={picked} onToggle={toggle} />
          )}
        </SectionCard>
      </div>

      {trends.isSuccess && (
        <SectionCard
          title={anyCovered ? "Rising skills your roadmap already covers" : "Rising skills to plan next"}
          description={anyCovered ? "Fast-growing skills employers ask for, and the week your plan gets you there." : "Fast-growing skills employers ask for that aren't in a plan yet."}
        >
          <RisingCovered items={rising} roleLabel={roleLabel} hasRoadmap={roadmapWeeks !== null} />
        </SectionCard>
      )}

      <SectionCard title="Behind the numbers" description={`Example ${roleLabel} ads and the employers posting the most.`} actions={cached ? <span className="shrink-0 whitespace-nowrap"><DemoDataNote /></span> : undefined}>
        <SampleAds demand={d} />
      </SectionCard>

      <footer className="flex flex-wrap items-center gap-2 border-t pt-4 text-sm text-muted-foreground">
        <span>
          Job ads: {cached ? `Adzuna, saved snapshot from ${new Date(d.snapshotAt).getUTCDate()} ${monthLabel(d.snapshotAt.slice(0, 7))}` : `${d.source === "reed" ? "Reed" : "Adzuna"}, read live`}.
          {" "}Trends: Hacker News “Who is hiring?” posts{months?.length ? `, ${monthLabel(months[0].month)} – ${monthLabel(months[months.length - 1].month)}` : ""}, fitted with a straight-line trend on the log-odds of each skill&apos;s share.
        </span>
        {cached && <DemoDataNote />}
      </footer>
    </div>
  );
}
