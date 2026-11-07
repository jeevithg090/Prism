"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { ErrorState } from "@/components/keystone";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/fetcher";
import type { Pod } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AvatarStack } from "./MemberAvatar";
import { DEMO_POD_ID, memberIds, useMemberProfiles } from "./members";

const card = "rounded-2xl border bg-card p-6 shadow-sm";
const linkBtn = cn(buttonVariants({ size: "lg" }), "h-11 w-full rounded-xl px-5 text-base sm:w-fit");

function PodSummary({ pod, userId }: { pod: Pod; userId: string }) {
  const ids = memberIds(pod);
  const people = useMemberProfiles(ids);
  const myIssue = pod.project?.issues.find((i) => i.assigneeUserId === userId);
  return (
    <section aria-labelledby="pod-summary-title" className={card}>
      <p className="text-sm font-medium text-muted-foreground">Your pod</p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-4">
        <h2 id="pod-summary-title" className="text-2xl font-semibold tracking-tight">
          {pod.name}
        </h2>
        <AvatarStack members={ids.map((id) => people[id])} size="md" />
      </div>
      <p className="mt-4 text-base">
        {myIssue ? (
          <>
            <span className="text-muted-foreground">Your issue: </span>
            <span className="font-medium">{myIssue.title}</span>
          </>
        ) : pod.project ? (
          <span className="text-muted-foreground">Pick an issue in {pod.project.title}.</span>
        ) : (
          <span className="text-muted-foreground">Start your project together to get your first issue.</span>
        )}
      </p>
      <Link href={`/pods/${pod.id}`} className={cn(linkBtn, "mt-5")}>
        Open pod
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </section>
  );
}

/** Dashboard slot (P3): the viewer's newest pod, or an invitation to find one. */
export function PodSummaryCard({ userId }: { userId: string }) {
  const router = useRouter();
  const q = useQuery({
    queryKey: ["pods", userId],
    queryFn: () => apiGet<Pod[]>(`/api/pods?userId=${encodeURIComponent(userId)}`),
  });

  if (q.isPending) {
    return (
      <div role="status" className={cn(card, "space-y-4")} aria-busy="true" aria-label="Loading your pod">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-11 w-32 rounded-xl" />
      </div>
    );
  }
  if (q.isError) {
    return (
      <ErrorState
        title="We couldn't load your pod"
        body="Try again, or look at the demo pod."
        onRetry={() => void q.refetch()}
        onUseDemo={() => router.push(`/pods/${DEMO_POD_ID}`)}
      />
    );
  }
  const pod = q.data[0];
  if (!pod) {
    return (
      <section aria-labelledby="pod-summary-empty" className={card}>
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Users className="size-5" aria-hidden />
          </span>
          <div>
            <h2 id="pod-summary-empty" className="text-xl font-semibold">
              You&apos;re not in a pod yet
            </h2>
            <p className="mt-1 text-muted-foreground">
              Learn faster with 2–3 students who are strong where you&apos;re stuck.
            </p>
          </div>
        </div>
        <Link href="/pods" className={cn(linkBtn, "mt-5")}>
          Find my pod
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </section>
    );
  }
  return <PodSummary pod={pod} userId={userId} />;
}
