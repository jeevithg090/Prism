"use client";
// P5 · The Skill Passport (/profile/[id]): a shareable, opt-in page of verified skills. Private by default.
import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, UserX } from "lucide-react";
import { toast } from "sonner";
import type { BadgeId, Profile, Programme } from "@/lib/types";
import { BadgePill, DemoDataNote, EmptyState, ErrorState, PageHeader, ReadinessRing } from "@/components/keystone";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BuildLog } from "@/components/momentum/BuildLog";
import { MomentumWidget } from "@/components/momentum/MomentumWidget";
import { VerifiedStamp } from "@/components/ladder/ProofLadder";
import { cn } from "@/lib/utils";
import type { Passport } from "@/components/ladder/model";
import { ApiError, getJSON, sendJSON } from "@/components/challenge/api";
import { apiGet } from "@/components/map/hooks";
import { DEMO_PASSPORT } from "./demo";
import { ShareControls } from "./ShareControls";
import { VerifiedSkills } from "./VerifiedSkills";

const BADGES = new Set<string>(["new-to-uni", "international", "first-gen", "career-changer", "helper", "shipped", "interview-ready"]);
const SUBTITLE = "Skills proven by evidence, each linked to its proof: a micro-challenge, a merged pod PR, a review of a peer's work.";

export function PassportSkeleton() {
  return (
    <div role="status" aria-label="Loading the Skill Passport" className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3"><Skeleton className="h-10 w-64" /><Skeleton className="h-5 w-full max-w-xl" /></div>
        <Skeleton className="h-11 w-36 rounded-xl" />
      </div>
      <div className="grid gap-6 rounded-2xl border bg-card p-6 shadow-sm md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <Skeleton className="size-16 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2"><Skeleton className="h-8 w-56 max-w-full" /><Skeleton className="h-6 w-72 max-w-full" /></div>
          </div>
          <div className="grid gap-4 border-t pt-5 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
        </div>
        <Skeleton className="h-40 w-full rounded-xl md:w-72" />
      </div>
      <div className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
        <Skeleton className="h-7 w-48" />
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
      </div>
    </div>
  );
}

function initials(name: string) {
  return name.split(/\s+/).map((w) => w.charAt(0)).slice(0, 2).join("").toUpperCase();
}

/** The passport page itself: who, what they study, the verified stamp, and readiness for the role they want. */
function PassportHeader({ p }: { p: Passport }) {
  const badges = p.badges.filter((b) => BADGES.has(b));
  return (
    <section aria-labelledby="passport-name" className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex min-w-0 items-start gap-4">
            <Avatar className="size-16 shrink-0">
              {p.avatarUrl && <AvatarImage src={p.avatarUrl} alt={`${p.name}'s avatar`} />}
              <AvatarFallback className="bg-muted text-xl font-semibold text-foreground" aria-hidden>{initials(p.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 space-y-2">
              <h2 id="passport-name" className="text-2xl font-semibold text-balance break-words text-foreground md:text-3xl">{p.name}</h2>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <VerifiedStamp />
                {badges.length > 0 && (
                  <ul aria-label="Badges" className="flex flex-wrap gap-2">
                    {badges.map((b) => <li key={b}><BadgePill badge={b as BadgeId} /></li>)}
                  </ul>
                )}
              </div>
            </div>
          </div>
          <dl className="grid gap-x-6 gap-y-4 border-t pt-5 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <div className="min-w-0">
              <dt className="text-sm text-muted-foreground">Programme</dt>
              <dd className="mt-1 font-medium text-pretty text-foreground">{p.programme}</dd>
            </div>
            {p.year ? (
              <div>
                <dt className="text-sm text-muted-foreground">Year</dt>
                <dd className="mt-1 font-medium text-foreground tabular-nums">{p.year}</dd>
              </div>
            ) : null}
            {p.roleName && (
              <div>
                <dt className="text-sm text-muted-foreground">Target role</dt>
                <dd className="mt-1 font-medium text-foreground">{p.roleName}</dd>
              </div>
            )}
          </dl>
        </div>
        {typeof p.readinessNow === "number" && (
          <div className="flex items-center gap-4 rounded-xl bg-muted p-4">
            <ReadinessRing value={p.readinessNow} projected={p.readinessProjected} label={`${p.roleName ?? "Target role"} readiness`} className="md:size-32" />
            {typeof p.readinessProjected === "number" && (
              <p className="max-w-[16ch] text-sm text-pretty text-muted-foreground">
                <span className="font-mono font-medium text-foreground tabular-nums">{Math.round(p.readinessProjected * 100)}%</span> projected with the roadmap
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export function PassportView({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [demo, setDemo] = React.useState<Passport | null>(null);
  const url = `/api/proof-ladder/${encodeURIComponent(userId)}/passport`;
  const q = useQuery({ queryKey: ["passport", userId], queryFn: () => getJSON<Passport>(url), retry: false });
  const p = demo ?? q.data;
  // Degree proof names a module by its code; the programme turns "COMP1xxx1" into the module's title.
  const hasDegreeProof = !!p?.skills.some((s) => s.rungs.some((r) => r.evidence?.source === "degree"));
  const profile = useQuery({
    queryKey: ["profile", userId],
    queryFn: () => apiGet<Profile>(`/api/profile/${encodeURIComponent(userId)}`),
    enabled: hasDegreeProof,
    retry: 0,
  });
  const programmeId = profile.data?.programmeId;
  const programme = useQuery({
    queryKey: ["programme", programmeId],
    queryFn: () => apiGet<Programme>(`/api/programmes/${encodeURIComponent(programmeId ?? "")}`),
    enabled: !!programmeId,
    retry: 0,
    staleTime: Infinity,
  });
  const moduleTitles = React.useMemo(
    () => Object.fromEntries((programme.data?.modules ?? []).map((m) => [m.code, m.title])),
    [programme.data],
  );

  const visibility = useMutation({
    mutationFn: (next: boolean) => sendJSON<{ isPublic: boolean }>(url, { public: next }, "PUT"),
    onSuccess: (r) => {
      qc.setQueryData<Passport>(["passport", userId], (old) => (old ? { ...old, isPublic: r.isPublic } : old));
      toast.success(r.isPublic ? "Your passport is public" : "Your passport is private again", {
        description: r.isPublic ? "Anyone with the link can see your verified skills." : "Only you can see it now.",
      });
    },
    onError: (e) => toast.error("We couldn't change who sees your passport", { description: e instanceof Error ? e.message : "Try again in a moment." }),
  });

  if (!demo && q.isPending) return <PassportSkeleton />;
  if (!p) {
    const err = q.error instanceof ApiError ? q.error : null;
    if (err?.code === "private") {
      return (
        <>
          <PageHeader title="Skill Passport" subtitle={SUBTITLE} />
          <EmptyState icon={Lock} title="This passport is private" body={`${err.message} Passports are private until their owner opts in.`}
            action={<Link href="/dashboard" className={cn(buttonVariants({ size: "lg" }), "active:translate-y-px")}>Back to your dashboard</Link>} />
        </>
      );
    }
    if (err?.code === "not_found") {
      return (
        <>
          <PageHeader title="Skill Passport" subtitle={SUBTITLE} />
          <EmptyState icon={UserX} title="We couldn't find this passport" body="Check the link, or ask for a new one."
            action={<Link href="/dashboard" className={cn(buttonVariants({ size: "lg" }), "active:translate-y-px")}>Back to your dashboard</Link>} />
        </>
      );
    }
    return (
      <>
        <PageHeader title="Skill Passport" subtitle={SUBTITLE} />
        <ErrorState
          title="We couldn't load this passport"
          body="That's on us, not you. The evidence is safe."
          onRetry={() => void q.refetch()}
          onUseDemo={() => { setDemo(DEMO_PASSPORT); toast("Showing the demo passport"); }}
        />
      </>
    );
  }

  const isPublic = visibility.isPending && typeof visibility.variables === "boolean" ? visibility.variables : p.isPublic;
  return (
    <div className="space-y-8 pb-24">
      <PageHeader
        title="Skill Passport"
        subtitle={SUBTITLE}
        actions={
          <ShareControls
            userId={p.userId}
            isOwner={p.isOwner && !demo}
            isPublic={isPublic}
            saving={visibility.isPending}
            onToggle={(next) => visibility.mutate(next)}
          />
        }
      />
      {(p.isDemo || demo) && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <DemoDataNote /> Seeded demo student. The evidence links point at the demo pod repo and the Bridge Map.
        </p>
      )}
      <PassportHeader p={p} />
      <VerifiedSkills skills={p.skills} isOwner={p.isOwner} moduleTitles={moduleTitles} />
      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        <div className="min-w-0 lg:col-span-2"><BuildLog userId={p.userId} /></div>
        <div className="min-w-0 lg:sticky lg:top-[calc(var(--topbar-height)+1.5rem)]"><MomentumWidget userId={p.userId} /></div>
      </div>
    </div>
  );
}
