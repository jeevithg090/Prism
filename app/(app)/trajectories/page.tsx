"use client";
// P5 · /trajectories: near-peer mentoring. Where seniors went, who walked a path like yours, and a kind way to ask.
// Hallmark redesign: the journey Sankey leads as the screen's signature; the students like you follow as one card row.
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight, Milestone, Users } from "lucide-react";
import type { Trajectory } from "@/lib/types";
import { apiGet } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DemoDataNote, EmptyState, ErrorState, LoadingSkeleton, PageHeader } from "@/components/keystone";
import { useViewerId } from "@/components/community/useViewerId";
import { JourneySankey } from "@/components/trajectories/JourneySankey";
import { TrajectoryCard } from "@/components/trajectories/TrajectoryCard";
import { AskChatDialog } from "@/components/trajectories/AskChatDialog";

type Similar = { trajectory: Trajectory; similarity: number };

export default function TrajectoriesPage() {
  const viewerId = useViewerId();
  const [demo, setDemo] = React.useState(false);
  const [asking, setAsking] = React.useState<Trajectory | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const q = demo ? "demo=1" : "";

  const all = useQuery({
    queryKey: ["trajectories", demo],
    queryFn: () => apiGet<Trajectory[]>(`/api/trajectories${q ? `?${q}` : ""}`),
  });
  const similar = useQuery({
    queryKey: ["trajectories-similar", viewerId, demo],
    queryFn: () => apiGet<Similar[]>(`/api/trajectories/similar?userId=${encodeURIComponent(viewerId)}&limit=6${q ? `&${q}` : ""}`),
  });

  const ask = React.useCallback((t: Trajectory) => { setAsking(t); setDialogOpen(true); }, []);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Trajectories"
        subtitle="Near-peer mentoring: see how students before you got where you want to go."
      />

      {all.isPending ? (
        <div aria-busy="true">
          <span className="sr-only">Loading journeys…</span>
          <LoadingSkeleton variant="chart" />
        </div>
      ) : all.isError ? (
        <ErrorState
          title="We couldn't load the journeys"
          body={`${all.error.message || "The connection dropped."} You can try again, or look at demo journeys instead.`}
          onRetry={() => all.refetch()}
          onUseDemo={() => setDemo(true)}
        />
      ) : all.data.length === 0 ? (
        <EmptyState
          icon={Milestone}
          title="No journeys yet"
          body="Seniors can share theirs from their passport. Until then, you can explore demo journeys."
          action={<Button size="lg" onClick={() => setDemo(true)}>Show demo journeys</Button>}
        />
      ) : (
        <JourneySankey trajectories={all.data} />
      )}

      <section aria-labelledby="like-you-title" className="space-y-6">
        <StudentsLikeYouHeader isDemo={!!similar.data?.some((s) => s.trajectory.isDemo)} />
        {similar.isPending ? (
          <div className="relative flex gap-6 overflow-hidden" aria-busy="true">
            <span className="sr-only">Finding students like you…</span>
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[440px] w-[85%] max-w-[360px] shrink-0 rounded-2xl sm:w-[340px] lg:w-auto lg:max-w-none lg:flex-1" />)}
          </div>
        ) : similar.isError ? (
          <ErrorState
            title="We couldn't find students like you right now"
            body={similar.error.message || "Something went wrong on our side."}
            onRetry={() => similar.refetch()}
            onUseDemo={() => setDemo(true)}
          />
        ) : similar.data.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No journeys like yours yet"
            body="No journeys yet: seniors can share theirs from their passport. We'll show the closest ones to your path here."
          />
        ) : (
          <CardRow items={similar.data} onAsk={ask} />
        )}
      </section>

      <AskChatDialog
        trajectory={asking}
        viewerId={viewerId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}

function StudentsLikeYouHeader({ isDemo }: { isDemo: boolean }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="like-you-title" className="text-xl font-semibold text-foreground">Students like you</h2>
        {isDemo && <DemoDataNote />}
      </div>
      <p className="mt-1 max-w-[62ch] text-pretty text-muted-foreground">
        Seniors whose journeys match your interests and goal. Many are happy to share 15 minutes and what they wish they&apos;d known.
      </p>
    </div>
  );
}

function CardRow({ items, onAsk }: { items: Similar[]; onAsk: (t: Trajectory) => void }) {
  const reduce = useReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * 356, behavior: reduce ? "auto" : "smooth" });
  return (
    <div className="space-y-3">
      <div
        ref={ref}
        role="region"
        aria-label="Students like you, scroll sideways for more"
        tabIndex={0}
        className="relative flex snap-x snap-mandatory gap-4 overflow-x-auto rounded-2xl pb-3 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:grid lg:grid-cols-[repeat(3,minmax(0,1fr))] lg:items-start lg:gap-6 lg:overflow-visible lg:pb-0"
      >
        {items.map(({ trajectory, similarity }) => (
          <div
            key={trajectory.id}
            className="w-[85%] max-w-[360px] shrink-0 snap-start sm:w-[340px] lg:w-auto lg:max-w-none"
          >
            <TrajectoryCard trajectory={trajectory} similarity={similarity} onAsk={onAsk} showDemoNote={false} />
          </div>
        ))}
      </div>
      {items.length > 1 && (
        <div className="flex justify-end gap-2 lg:hidden">
          <Button variant="outline" size="icon-lg" aria-label="Scroll to previous students" onClick={() => scroll(-1)}>
            <ChevronLeft aria-hidden />
          </Button>
          <Button variant="outline" size="icon-lg" aria-label="Scroll to more students" onClick={() => scroll(1)}>
            <ChevronRight aria-hidden />
          </Button>
        </div>
      )}
    </div>
  );
}
