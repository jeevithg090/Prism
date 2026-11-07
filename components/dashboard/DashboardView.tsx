"use client";
// Dashboard: "what should I do next?" This week's step first, then readiness, then the people and momentum around it.
import Link from "next/link";
import { Network } from "lucide-react";
import { toast } from "sonner";
import { BadgePill, DemoDataNote, EmptyState, ErrorState, PageHeader } from "@/components/keystone";
import { Skeleton } from "@/components/ui/skeleton";
import { PodSummaryCard } from "@/components/pods/PodSummaryCard";
import { MomentumWidget } from "@/components/momentum/MomentumWidget";
import { useActivity } from "@/components/shell/ActivityPanel";
import type { BridgeMap, Profile } from "@/lib/types";
import { roleName, topGaps, useBridgeMap } from "./data";
import { ReadinessCard } from "./ReadinessCard";
import { AskKeystoneCard, MarketPulse, SlotBoundary } from "./SideCards";
import { ThisWeekCard, ThisWeekSkeleton, primaryLink } from "./ThisWeekCard";

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

export function DashboardSkeleton() {
  return (
    <div aria-busy="true" className="space-y-6">
      <span className="sr-only">Loading your dashboard</span>
      <div className="mb-6 space-y-3 md:mb-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-6 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2"><ThisWeekSkeleton /></div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-56 rounded-2xl" />)}
      </div>
    </div>
  );
}

function WatchAgentsLink() {
  const { events, setOpen } = useActivity();
  if (events.length === 0) return null;
  return (
    <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
      Watch the agents build it →
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
      title={`Hi ${name} 👋`}
      subtitle={map ? `You're ${Math.round(map.readinessNow * 100)}% of the way to ${role} roles. Here's this week.` : "Here's this week."}
      actions={profile?.isDemo ? <DemoDataNote /> : undefined}
    />
  );

  let top: React.ReactNode;
  if (graph.isPending) {
    top = (
      <div className="space-y-3">
        <WatchAgentsLink />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2"><ThisWeekSkeleton /></div>
          <Skeleton className="h-96 rounded-2xl" aria-hidden />
        </div>
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
    top = (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <ThisWeekCard userId={userId} map={map} />
        </div>
        <ReadinessCard map={map} targetDate={profile?.dna?.targetDate} />
      </div>
    );
  }

  return (
    <div>
      {header}
      {newcomer && (
        <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
          <BadgePill badge="new-to-uni" />
          <span>Welcome to UoM. Your pod and the helpers in Community are here whenever you&apos;re stuck.</span>
          <Link href="/community" className="font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
            Ask for help
          </Link>
        </div>
      )}
      <div className="space-y-6">
        {top}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <div className="min-w-0 [&>*]:h-full">
            <SlotBoundary title="Your pod" href="/pods">
              <PodSummaryCard userId={userId} />
            </SlotBoundary>
          </div>
          {/* MomentumWidget's "Breakdown" trigger uses the 12.8px sm button; lift it to the 13px+ floor here. */}
          <div className="min-w-0 [&>*]:h-full [&_button]:text-sm">
            <SlotBoundary title="Momentum" href={`/profile/${encodeURIComponent(userId)}`}>
              <MomentumWidget userId={userId} />
            </SlotBoundary>
          </div>
          <div className="flex flex-col gap-6 md:col-span-2 lg:col-span-1">
            <MarketPulse roleId={map?.roleId ?? roleId} focus={focus ? { skillId: focus.skillId, name: focus.name } : undefined} />
            <AskKeystoneCard focusName={focus?.name} />
          </div>
        </div>
      </div>
    </div>
  );
}
