"use client";
// P5 · The Skill Passport (/profile/[id]): a shareable, opt-in page of verified skills. Private by default.
import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, UserX } from "lucide-react";
import { toast } from "sonner";
import type { BadgeId } from "@/lib/types";
import { BadgePill, DemoDataNote, EmptyState, ErrorState, PageHeader, ReadinessRing } from "@/components/keystone";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BuildLog } from "@/components/momentum/BuildLog";
import { MomentumWidget } from "@/components/momentum/MomentumWidget";
import { VerifiedStamp } from "@/components/ladder/ProofLadder";
import type { Passport } from "@/components/ladder/model";
import { ApiError, getJSON, sendJSON } from "@/components/challenge/api";
import { DEMO_PASSPORT } from "./demo";
import { ShareControls } from "./ShareControls";
import { VerifiedSkills } from "./VerifiedSkills";

const BADGES = new Set<string>(["new-to-uni", "international", "first-gen", "career-changer", "helper", "shipped", "interview-ready"]);
const SUBTITLE = "Skills proven by evidence, each linked to its proof: a micro-challenge, a merged pod PR, a review of a peer's work.";

export function PassportSkeleton() {
  return (
    <div role="status" aria-label="Loading the Skill Passport" className="space-y-8">
      <div className="space-y-2"><Skeleton className="h-10 w-64" /><Skeleton className="h-5 w-full max-w-xl" /></div>
      <div className="flex flex-col gap-6 rounded-2xl border bg-card p-6 shadow-sm md:flex-row md:p-8">
        <Skeleton className="size-16 rounded-full" />
        <div className="flex-1 space-y-3"><Skeleton className="h-7 w-56" /><Skeleton className="h-5 w-80 max-w-full" /><Skeleton className="h-6 w-48" /></div>
        <Skeleton className="h-16 w-40" />
      </div>
      <div className="space-y-3 rounded-2xl border bg-card p-6 shadow-sm">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
    </div>
  );
}

function initials(name: string) {
  return name.split(/\s+/).map((w) => w.charAt(0)).slice(0, 2).join("").toUpperCase();
}

function PassportHeader({ p }: { p: Passport }) {
  return (
    <section aria-labelledby="passport-name" className="rounded-2xl border bg-card p-6 shadow-sm md:p-8">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar className="size-16 shrink-0">
            {p.avatarUrl && <AvatarImage src={p.avatarUrl} alt={`${p.name}'s avatar`} />}
            <AvatarFallback className="bg-primary/10 text-xl font-semibold text-primary" aria-hidden>{initials(p.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-2">
            <h2 id="passport-name" className="text-2xl font-semibold tracking-tight md:text-3xl">{p.name}</h2>
            <p className="text-muted-foreground">{p.programme}{p.year ? ` · Year ${p.year}` : ""}</p>
            {p.badges.length > 0 && (
              <ul aria-label="Badges" className="flex flex-wrap gap-1.5">
                {p.badges.filter((b) => BADGES.has(b)).map((b) => <li key={b}><BadgePill badge={b as BadgeId} /></li>)}
              </ul>
            )}
            <VerifiedStamp />
          </div>
        </div>
        {typeof p.readinessNow === "number" && (
          <div className="shrink-0 rounded-xl bg-muted/60 p-4 md:min-w-56">
            <ReadinessRing value={p.readinessNow} projected={p.readinessProjected} label={`${p.roleName ?? "Target role"} readiness`} />
            {typeof p.readinessProjected === "number" && (
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="tabular-nums">{Math.round(p.readinessProjected * 100)}%</span> projected with the roadmap
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
            action={<Link href="/dashboard" className={buttonVariants()}>Back to your dashboard</Link>} />
        </>
      );
    }
    if (err?.code === "not_found") {
      return (
        <>
          <PageHeader title="Skill Passport" subtitle={SUBTITLE} />
          <EmptyState icon={UserX} title="We couldn't find this passport" body="Check the link, or ask for a new one."
            action={<Link href="/dashboard" className={buttonVariants()}>Back to your dashboard</Link>} />
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
    <div className="space-y-8">
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
      <VerifiedSkills skills={p.skills} isOwner={p.isOwner} />
      {/* The momentum slots use size="sm" buttons (12.8px); lift them to the 13px floor on this page. */}
      <div className="grid gap-6 lg:grid-cols-3 lg:items-start [&_[data-slot=button]]:text-sm [&_[data-slot=popover-trigger]]:text-sm">
        <div className="min-w-0 lg:col-span-2"><BuildLog userId={p.userId} /></div>
        <div className="min-w-0"><MomentumWidget userId={p.userId} /></div>
      </div>
    </div>
  );
}
