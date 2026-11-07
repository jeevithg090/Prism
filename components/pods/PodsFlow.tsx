"use client";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ErrorState } from "@/components/keystone";
import { Skeleton } from "@/components/ui/skeleton";
import { useViewerId } from "@/components/community/useViewerId";
import { useActivity } from "@/components/shell/ActivityPanel";
import { apiGet, apiPost } from "@/lib/fetcher";
import type { Pod } from "@/lib/types";
import { FindPodHero } from "./FindPodHero";
import { MatchingAnimation } from "./MatchingAnimation";
import { DEMO_POD_ID, useMemberProfiles } from "./members";
import { PodCard } from "./PodCard";

type MatchedPod = Pod & { runId?: string };

export function PodCardSkeleton() {
  return (
    <div role="status" className="rounded-2xl border bg-card shadow-sm" aria-busy="true" aria-label="Loading your pod">
      <div className="flex flex-col gap-6 border-b p-6 md:flex-row md:justify-between md:p-8">
        <div className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-11 w-56" />
          <div className="flex -space-x-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="size-12 rounded-full ring-2 ring-card" />
            ))}
          </div>
        </div>
        <Skeleton className="h-20 w-full md:w-80" />
      </div>
      <div className="space-y-4 p-6 md:p-8">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function Step({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

/**
 * /pods: no pod → FindPodHero; Find my pod → MatchingAnimation → PodCard → Start our project.
 * `startFresh` (from `?demo=1`) begins at the hero even if the demo user already has a pod.
 */
export function PodsFlow({ startFresh = false }: { startFresh?: boolean }) {
  const router = useRouter();
  const qc = useQueryClient();
  const viewerId = useViewerId();
  const activity = useActivity();
  const [matching, setMatching] = React.useState(false);
  const [animDone, setAnimDone] = React.useState(false);
  const me = useMemberProfiles([viewerId])[viewerId];

  const pods = useQuery({
    queryKey: ["pods", viewerId],
    queryFn: () => apiGet<Pod[]>(`/api/pods?userId=${encodeURIComponent(viewerId)}`),
    enabled: !startFresh,
  });

  const match = useMutation({
    mutationFn: () => apiPost<MatchedPod>("/api/pods/match", { userId: viewerId }),
    onSuccess: (pod) => {
      if (pod.runId) activity.start(pod.runId);
      qc.setQueryData<Pod>(["pod", pod.id], pod);
      void qc.invalidateQueries({ queryKey: ["pods", viewerId] });
    },
    onError: (err: Error) => {
      toast.error("We couldn't find your pod just now", { description: err.message || "Please try again." });
    },
  });

  const findPod = React.useCallback(() => {
    setAnimDone(false);
    setMatching(true);
    match.reset();
    match.mutate();
  }, [match]);

  // Reveal the pod card once the animation has settled, with a toast at the same moment.
  const reveal = () => {
    setAnimDone(true);
    const pod = match.data;
    if (!pod) return;
    const others = pod.members.length - 1;
    toast.success(`You're in ${pod.name}`, {
      description: `${others} ${others === 1 ? "student fills" : "students fill"} your gaps, and you fill theirs.`,
    });
  };

  const openDemo = () => router.push(`/pods/${DEMO_POD_ID}`);

  let view: { key: string; node: React.ReactNode };
  if (matching) {
    if (match.isError) {
      view = {
        key: "match-error",
        node: (
          <ErrorState
            title="We couldn't find your pod"
            body="The matchmaker didn't answer. Try again, or explore the demo pod."
            onRetry={findPod}
            onUseDemo={openDemo}
          />
        ),
      };
    } else if (match.data && animDone) {
      view = {
        key: `pod-${match.data.id}`,
        node: <PodCard pod={match.data} viewerId={viewerId} onFindDifferent={findPod} cta="start" />,
      };
    } else {
      const picks = match.data?.members.map((m) => m.userId).filter((id) => id !== viewerId);
      view = {
        key: "matching",
        node: <MatchingAnimation user={me} picks={picks} onDone={reveal} />,
      };
    }
  } else if (startFresh) {
    view = { key: "hero", node: <FindPodHero onFind={findPod} /> };
  } else if (pods.isPending) {
    view = { key: "loading", node: <PodCardSkeleton /> };
  } else if (pods.isError) {
    view = {
      key: "error",
      node: (
        <ErrorState
          title="We couldn't load your pods"
          body="Something went wrong on our side. Try again, or explore the demo pod."
          onRetry={() => void pods.refetch()}
          onUseDemo={openDemo}
        />
      ),
    };
  } else if (!pods.data.length) {
    view = { key: "hero", node: <FindPodHero onFind={findPod} /> };
  } else {
    const pod = pods.data[0];
    view = { key: `pod-${pod.id}`, node: <PodCard pod={pod} viewerId={viewerId} onFindDifferent={findPod} /> };
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <Step key={view.key}>
        {view.node}
      </Step>
    </AnimatePresence>
  );
}
