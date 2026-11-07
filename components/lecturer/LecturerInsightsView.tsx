"use client";
// Lecturer Insights (Teaching pillar): anonymous cohort view for module leads.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FlaskConical, ShieldCheck, SearchCheck, Users } from "lucide-react";
import { DemoDataNote, EmptyState, ErrorState, LoadingSkeleton, SectionCard } from "@/components/keystone";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/fetcher";
import type { LecturerCohort, LecturerInsights } from "@/lib/schemas/lecturer";
import type { PodInsights } from "@/lib/schemas/studio";
import { DEMO_COHORT, DEMO_INSIGHTS, DEMO_POD_INSIGHTS } from "./demoData";
import { GapsChart } from "./GapsChart";
import { LabIdeas } from "./LabIdeas";
import { LecturerStats } from "./LecturerStats";
import { PeerTeaching } from "./PeerTeaching";

const q = (programmeId: string) => `?programmeId=${encodeURIComponent(programmeId)}`;

export function LecturerInsightsView({ programmeId }: { programmeId: string }) {
  const [demo, setDemo] = useState(false);
  const useDemo = () => setDemo(true);

  const cohortQ = useQuery({
    queryKey: ["lecturer-cohort", programmeId],
    queryFn: () => apiGet<LecturerCohort>(`/api/lecturer/cohort${q(programmeId)}`),
    enabled: !demo,
  });
  const insightsQ = useQuery({
    queryKey: ["lecturer-insights", programmeId],
    queryFn: () => apiGet<LecturerInsights>(`/api/lecturer/insights${q(programmeId)}`),
    enabled: !demo,
  });
  const peerQ = useQuery({
    queryKey: ["pod-insights", programmeId],
    queryFn: () => apiGet<PodInsights>(`/api/pods/insights${q(programmeId)}`),
    enabled: !demo,
  });

  const cohort = demo ? DEMO_COHORT : cohortQ.data;
  const insights = demo ? DEMO_INSIGHTS : insightsQ.data;
  const peer = demo ? DEMO_POD_INSIGHTS : peerQ.data;
  const roleName = cohort?.demandRole?.roleName ?? "target-role";

  // ---- headline stats (gate for the whole page: below 10 students nothing else is shown) ----
  let stats: React.ReactNode;
  if (cohort) stats = <LecturerStats cohort={cohort} insights={insights} />;
  else if (cohortQ.isError) stats = <ErrorState title="We couldn't load your cohort" body="The cohort numbers didn't arrive. Try again, or show the demo cohort." onRetry={() => cohortQ.refetch()} onUseDemo={useDemo} />;
  else stats = (
    <div role="status" className="grid gap-6 md:grid-cols-3" aria-busy="true" aria-label="Loading cohort numbers">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-4 w-40 max-w-full" />
          <Skeleton className="h-12 w-28" />
          <Skeleton className="h-4 w-56 max-w-full" />
        </div>
      ))}
    </div>
  );

  if (cohort?.suppressed) {
    return (
      <div className="space-y-8">
        <EmptyState
          icon={ShieldCheck}
          title="Not enough students to show insights yet"
          body={`${cohort.cohortSize} student${cohort.cohortSize === 1 ? " is" : "s are"} on Keystone for this programme. We only show groups of 10 or more, so no student can ever be identified.`}
        />
        <Footer />
      </div>
    );
  }

  // ---- gaps chart ----
  let gaps: React.ReactNode;
  if (insights) {
    gaps = insights.gaps.length
      ? <GapsChart gaps={insights.gaps} roleName={roleName} />
      : <EmptyState icon={SearchCheck} title="Your syllabus covers every in-demand skill we track" body="When job ads start asking for something no module teaches, it will show up here." />;
  } else if (insightsQ.isError) {
    gaps = <ErrorState title="We couldn't compare your syllabus with job ads" body="Try again, or show the demo programme." onRetry={() => insightsQ.refetch()} onUseDemo={useDemo} />;
  } else gaps = <LoadingSkeleton variant="chart" />;

  // ---- lab ideas ----
  let labs: React.ReactNode;
  if (insights) {
    labs = insights.labIdeas.length && insights.gaps.length
      ? <LabIdeas ideas={insights.labIdeas} />
      : <EmptyState icon={FlaskConical} title="No lab ideas needed right now" body="Lab ideas appear when an in-demand skill isn't covered by any module." />;
  } else if (insightsQ.isError) {
    labs = <ErrorState title="We couldn't write lab ideas" onRetry={() => insightsQ.refetch()} onUseDemo={useDemo} />;
  } else labs = (
    <div role="status" className="divide-y" aria-busy="true" aria-label="Loading lab ideas">
      {[0, 1, 2].map((i) => (
        <div key={i} className="grid gap-x-6 gap-y-3 py-5 first:pt-0 last:pb-0 md:grid-cols-[9rem_minmax(0,1fr)_auto]">
          <Skeleton className="h-4 w-24" />
          <div className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" /></div>
          <Skeleton className="h-9 w-44 rounded-xl" />
        </div>
      ))}
    </div>
  );

  // ---- peer teaching ----
  let teaching: React.ReactNode;
  if (peer) {
    teaching = peer.suppressed
      ? <EmptyState icon={ShieldCheck} title="Hidden to protect students" body="Peer-teaching numbers appear once 10 or more students on this programme use Keystone." />
      : peer.peerTeachable.length || peer.unteachableGaps.length
        ? <PeerTeaching data={peer} />
        : <EmptyState icon={Users} title="No skills data yet" body="Once students connect their work, you'll see which skills they can teach each other." />;
  } else if (peerQ.isError) {
    teaching = <ErrorState title="We couldn't load peer-teaching numbers" onRetry={() => peerQ.refetch()} onUseDemo={useDemo} />;
  } else teaching = <LoadingSkeleton variant="list" />;

  // A loaded region sits in its card; a loading, empty or error state stands in for the card itself, so no card holds another.
  const gapsReady = Boolean(insights?.gaps.length);
  const labsReady = Boolean(insights && insights.labIdeas.length && insights.gaps.length);
  const teachingReady = Boolean(peer && !peer.suppressed && (peer.peerTeachable.length || peer.unteachableGaps.length));

  return (
    <div className="space-y-8 pb-24">
      <div className="space-y-4">
        <DemoDataNote />
        {stats}
      </div>

      {gapsReady ? (
        <SectionCard
          title="Industry skills your programme doesn't teach yet"
          description={`Share of ${roleName} job ads asking for each skill, for skills no module in your syllabus covers.`}
        >
          {gaps}
        </SectionCard>
      ) : gaps}

      <section aria-labelledby="labs-heading" className={labsReady ? "rounded-2xl border bg-card p-6 shadow-sm" : "space-y-4"}>
        <div className={labsReady ? "mb-5" : undefined}>
          {/* Hallmark · reworded "Suggested practical labs" to "Labs that would close these gaps" · review: generic heading, tie it to the ledger */}
          <h2 id="labs-heading" className="text-xl font-semibold text-foreground">Labs that would close these gaps</h2>
          <p className="mt-1 text-sm text-muted-foreground">Small additions to modules you already run, each linked to what the module teaches.</p>
        </div>
        {labs}
      </section>

      {teachingReady ? (
        <SectionCard
          title="Learning by teaching in your cohort"
          description="Keystone pods pair students so each one learns a skill from a peer and teaches another back."
        >
          {teaching}
        </SectionCard>
      ) : teaching}

      <Footer />
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t pt-4 text-sm text-muted-foreground">
      Demand from Adzuna job ads; coverage from your published syllabus; student data aggregated and anonymised.
    </footer>
  );
}
