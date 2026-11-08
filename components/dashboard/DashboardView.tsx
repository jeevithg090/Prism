"use client";
// Dashboard: "what should I do next?" This week's step leads, full width; readiness and your pod sit under it, then momentum, market pulse and the coach.
import Link from "next/link";
import { Network } from "lucide-react";
import { toast } from "sonner";
import { BadgePill, DemoDataNote, EmptyState, ErrorState, PageHeader } from "@/components/keystone";
import { Skeleton } from "@/components/ui/skeleton";
import { PodSummaryCard } from "@/components/pods/PodSummaryCard";
import { MomentumWidget } from "@/components/momentum/MomentumWidget";
import { useActivity } from "@/components/shell/ActivityPanel";
import type { BridgeMap, Profile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { roleName, topGaps, useBridgeMap } from "./data";
import { ReadinessCard } from "./ReadinessCard";
import { AskKeystoneCard, MarketPulse, SlotBoundary } from "./SideCards";
import { ThisWeekCard, ThisWeekSkeleton, primaryLink } from "./ThisWeekCard";
import { InterviewPrepCard } from "@/components/interview-prep/InterviewPrepCard";

const textLink = "font-medium text-primary underline decoration-1 underline-offset-4 outline-none hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function firstName(profile: Profile | null, userId: string) {
  const n = profile?.name?.trim().split(/\s+/)[0];
  return n || userId.charAt(0).toUpperCase() + userId.slice(1);
}

function useDemoFallback() {
  return () => {
    toast("Showing Aisha's demo dashboard");
    // A full load, so the proxy signs in as Aisha before anything renders.
    window.location.assign(new URL("/dashboard?demo=1", window.location.origin).toString());
  };
}

/** Readiness and pod, then momentum, market pulse and the coach, in the same grid the full screen uses. */
function LowerSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3" aria-hidden>
      <Skeleton className="h-96 rounded-2xl md:col-span-2" />
      <Skeleton className="h-96 rounded-2xl md:col-span-2 lg:col-span-1" />
      <Skeleton className="h-64 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl md:col-span-2 lg:col-span-1" />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div aria-busy="true" className="space-y-6">
      <span className="sr-only">Loading your dashboard</span>
      <div className="mb-8 space-y-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-6 w-80 max-w-full" />
      </div>
      <ThisWeekSkeleton />
      <LowerSkeleton />
    </div>
  );
}

function WatchAgentsLink() {
  const { events, setOpen } = useActivity();
  if (events.length === 0) return null;
  return (
    <button type="button" onClick={() => setOpen(true)} className={cn(textLink, "cursor-pointer text-sm whitespace-nowrap active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55")}>
      Watch the agents build it
    </button>
  );
}

export function DashboardView({
  userId, roleId, profile, initialMap,
}: {
  userId: string; roleId: string; profile: Profile | null; initialMap?: BridgeMap | null;
}) {
  const graph = useBridgeMap(userId, roleId, initialMap);
  const useDemo = useDemoFallback();
  const name = firstName(profile, userId);
  const map = graph.data;
  const role = roleName(map?.roleId ?? roleId);
  const focus = map ? topGaps(map, 1)[0] : undefined;
  const newcomer = profile?.badges?.includes("new-to-uni");

  const header = (
    <PageHeader
      title={`Hi ${name}`}
      subtitle={map ? `You're ${Math.round(map.readinessNow * 100)}% of the way to ${role} roles. Here's this week.` : "Here's this week."}
      actions={profile?.isDemo ? <DemoDataNote /> : undefined}
    />
  );

  let top: React.ReactNode;
  if (graph.isPending) {
    top = (
      <div className="space-y-3">
        <WatchAgentsLink />
        <ThisWeekSkeleton />
      </div>
    );
  } else if (graph.isError) {
    top = (
      <ErrorState
        title="We couldn't load your Bridge Map"
        body="That's on us, not you. Try again, or look at Aisha's demo dashboard."
        onRetry={() => void graph.refetch()}
        onUseDemo={useDemo}
      />
    );
  } else if (!map) {
    top = (
      <EmptyState
        icon={Network}
        title="Your Bridge Map isn't built yet"
        body="Tell us about your degree and the role you want. Our agents read your syllabus and real job ads, then plan your first week."
        action={<Link href="/onboard" className={primaryLink}>Start onboarding</Link>}
      />
    );
  } else {
    top = <ThisWeekCard userId={userId} map={map} />;
  }

  // Readiness needs the map: a skeleton while it loads, nothing when there is no map to read.
  const readiness = map ? (
    <ReadinessCard map={map} targetDate={profile?.dna?.targetDate} />
  ) : graph.isPending ? (
    <Skeleton className="h-96 rounded-2xl" aria-hidden />
  ) : null;

  // The welcome note sits beside your pod: both are the people you can lean on, and it keeps readiness in the first viewport.
  const welcome = newcomer ? (
    <div className="flex flex-col items-start gap-2 rounded-xl bg-muted p-4 text-sm text-foreground">
      <BadgePill badge="new-to-uni" />
      <p className="text-pretty">Welcome to UoM. Your pod and the helpers in Community are here whenever you&apos;re stuck.</p>
      <Link href="/community" className={textLink}>
        Ask for help
      </Link>
    </div>
  ) : null;

  return (
    <div>
      {header}
      <div className="space-y-6">
        {top}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {readiness && <div className="min-w-0 md:col-span-2">{readiness}</div>}
          <div
            className={cn(
              "grid min-w-0 grid-cols-1 gap-6 md:col-span-2 md:auto-cols-fr md:grid-flow-col",
              readiness ? "lg:col-span-1 lg:flex lg:flex-col" : "lg:col-span-3",
            )}
          >
            <div className="min-w-0 lg:flex-1 [&>*]:h-full">
              <SlotBoundary title="Your pod" href="/pods">
                <PodSummaryCard userId={userId} />
              </SlotBoundary>
            </div>
            {welcome}
          </div>
          {/* Momentum, market pulse and the coach share one row at equal width; flex lets the row close up when market pulse is hidden. */}
          <div className="grid min-w-0 grid-cols-1 gap-6 md:col-span-2 md:grid-cols-2 lg:col-span-3 lg:flex lg:[&>*]:min-w-0 lg:[&>*]:flex-1 lg:[&>*]:basis-0">
            {/* MomentumWidget's "Breakdown" trigger uses the 12.8px sm button; lift it to the 13px+ floor here. */}
            <div className="min-w-0 [&>*]:h-full [&_button]:text-sm">
              <SlotBoundary title="Momentum" href={`/profile/${encodeURIComponent(userId)}`}>
                <MomentumWidget userId={userId} />
              </SlotBoundary>
            </div>
            <MarketPulse roleId={map?.roleId ?? roleId} focus={focus ? { skillId: focus.skillId, name: focus.name } : undefined} />
            {/* Third in the row at tablet width (market pulse shown): take the full width rather than leave a hole. */}
            <div className="min-w-0 md:odd:last:col-span-2">
              <AskKeystoneCard focusName={focus?.name} />
            </div>
            {map && (
              <div className="min-w-0 [&>*]:h-full">
                <InterviewPrepCard userId={userId} roleId={roleId} map={map} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
