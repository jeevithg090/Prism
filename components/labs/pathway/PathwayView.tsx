"use client";
// Shortest Path to Opportunity: ranked listings (left) and the selected listing's path (right) with its mini graph,
// step list, the paths not taken, and the one primary action, "Add to roadmap" (approved in a dialog).
import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useReducedMotion } from "motion/react";
import { toast } from "sonner";
import {
  Activity, ArrowRight, BookOpen, Briefcase, CalendarClock, CalendarDays, CheckCircle2, GraduationCap, Map as MapIcon, Route, Undo2,
  type LucideIcon,
} from "lucide-react";
import { DemoDataNote, EmptyState, ErrorState, LoadingSkeleton, SectionCard, SkillChip, StatCard } from "@/components/keystone";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useActivity } from "@/components/shell/ActivityPanel";
import { apiGet, isNotFound } from "@/components/map/hooks";
import { apiPost } from "@/lib/fetcher";
import { roleName } from "@/lib/graph/roles";
import { fmtDate, KIND_LABEL, plural } from "@/lib/labs/pathway/format";
import type { OpportunityPath, PathState, PathStep, PathwayResult } from "@/lib/labs/pathway/types";
import { cn } from "@/lib/utils";
import { AddToRoadmapDialog } from "./AddToRoadmapDialog";
import { PathGraph } from "./PathGraph";

const STATE: Record<PathState, { label: string; icon: LucideIcon; cls: string; iconCls: string }> = {
  "apply-now": { label: "Apply now", icon: CheckCircle2, cls: "bg-status-proven/10 border-status-proven/30", iconCls: "text-status-proven" },
  "within-reach": { label: "Within reach", icon: Route, cls: "bg-primary/10 border-primary/30", iconCls: "text-primary" },
  "no-deadline": { label: "No deadline listed", icon: CalendarDays, cls: "bg-muted border-border", iconCls: "text-muted-foreground" },
  "next-round": { label: "Next round", icon: CalendarClock, cls: "bg-muted border-border", iconCls: "text-muted-foreground" },
};

function StatePill({ state }: { state: PathState }) {
  const s = STATE[state];
  const Icon = s.icon;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-foreground", s.cls)}>
      <Icon className={cn("size-3.5", s.iconCls)} aria-hidden />{s.label}
    </span>
  );
}

const shortDate = (iso?: string) => fmtDate(iso).replace(/ \d{4}$/, "");

function distance(p: OpportunityPath): string {
  if (p.state === "apply-now") return "Nothing to learn";
  if (!p.skillsToLearn) return "Your degree covers it";
  return `${plural(p.skillsToLearn, "skill")}, ${plural(p.studyWeeks, "week")}`;
}

// ---------- loading ----------

export function PathwaySkeleton() {
  return (
    <div className="space-y-8" aria-busy="true">
      <span className="sr-only">Loading your paths</span>
      <div className="grid gap-6 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-3 rounded-2xl border bg-card p-6 shadow-sm">
            <Skeleton className="h-4 w-1/2" /><Skeleton className="h-9 w-20" /><Skeleton className="h-4 w-2/3" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <LoadingSkeleton variant="list" />
        <LoadingSkeleton variant="graph" />
      </div>
    </div>
  );
}

// ---------- the page ----------

export function PathwayView({ demo }: { demo: boolean }) {
  const [useDemo, setUseDemo] = React.useState(demo);
  const q = useQuery({
    queryKey: ["labs-pathway", useDemo],
    queryFn: () => apiGet<PathwayResult>(`/api/labs/pathway${useDemo ? "?demo=1" : ""}`),
    retry: 0,
  });
  if (q.isPending) return <PathwaySkeleton />;
  if (q.isError) {
    if (isNotFound(q.error)) {
      return (
        <EmptyState
          icon={MapIcon}
          title="Your Bridge Map comes first"
          body={q.error instanceof Error ? q.error.message : "Add your degree and Keystone builds your map."}
          action={<Link href="/onboard" className={cn(buttonVariants(), "h-10 rounded-xl px-4")}>Add your degree</Link>}
        />
      );
    }
    return (
      <ErrorState
        title="We couldn't work out your paths"
        body="That's on us, not you. Your roadmap is unchanged."
        onRetry={() => void q.refetch()}
        onUseDemo={() => setUseDemo(true)}
      />
    );
  }
  if (!q.data.paths.length) {
    return (
      <EmptyState
        icon={Briefcase}
        title="No open listings right now"
        body={q.data.closed ? `${plural(q.data.closed, "listing has", "listings have")} already closed. New rounds usually open in September.` : "Check back when new placement rounds open."}
        action={<Link href="/market" className={cn(buttonVariants({ variant: "outline" }), "h-10 rounded-xl px-4")}>See what the job market asks for</Link>}
      />
    );
  }
  return <Loaded data={q.data} demo={useDemo} />;
}

function Loaded({ data, demo }: { data: PathwayResult; demo: boolean }) {
  const paths = data.paths;
  // Start on the closest listing in your own target role (then the closest overall).
  const firstOpen = paths.find((p) => p.state === "within-reach" && p.opportunity.roleId === data.roleId) ?? paths.find((p) => p.state === "within-reach") ?? paths[0];
  const [selected, setSelected] = React.useState<string>(data.applied?.opportunityId ?? firstOpen.opportunity.id);
  const path = paths.find((p) => p.opportunity.id === selected) ?? firstOpen;
  const detailRef = React.useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const activity = useActivity();

  const applyNow = paths.filter((p) => p.state === "apply-now").length;
  const within = paths.filter((p) => p.state === "within-reach").length;
  const later = paths.filter((p) => p.state === "next-round").length;
  const closest = paths.find((p) => p.state === "within-reach");

  const choose = (id: string) => {
    setSelected(id);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }));
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid gap-6 md:grid-cols-3">
        <StatCard label="You can apply to now" value={applyNow} hint={`of ${plural(paths.length, "open listing")}`} icon={CheckCircle2} />
        <StatCard label="Within reach before they close" value={within} hint={later ? `${later} more would need next year's round` : `of ${plural(paths.length, "open listing")}`} icon={Route} />
        <StatCard
          label="Study to the closest one"
          value={closest ? `${closest.studyHours} h` : "0 h"}
          hint={closest ? `${closest.opportunity.title} at ${closest.opportunity.employer}, at your ${data.hoursPerWeek} h a week` : "Nothing within reach needs study"}
          icon={BookOpen}
        />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <SectionCard
          title="Open listings"
          description={`Ranked by the shortest path from your Bridge Map, as of ${fmtDate(data.asOf)}.`}
          actions={data.source === "demo" ? <DemoDataNote /> : undefined}
        >
          {data.keystone && (
            <p className="mb-4 rounded-xl bg-muted/60 p-4 text-sm">
              <span className="font-medium">{data.keystone.name}</span> is on the path to {data.keystone.count} of these {data.keystone.of} listings, so learning it pays off more than once.
            </p>
          )}
          <ul className="-mx-2 divide-y" aria-label="Listings ranked by distance">
            {paths.map((p) => {
              const active = p.opportunity.id === path.opportunity.id;
              return (
                <li key={p.opportunity.id} className="py-1">
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => choose(p.opportunity.id)}
                    className={cn(
                      "w-full rounded-xl px-3 py-3 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                      active && "bg-muted",
                    )}
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block font-medium text-pretty">{p.opportunity.title}</span>
                        <span className="block text-sm text-muted-foreground">{p.opportunity.employer}, {p.opportunity.location}</span>
                      </span>
                      <StatePill state={p.state} />
                    </span>
                    <span className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
                      <span className="font-medium tabular-nums">{p.state === "next-round" ? `Ready ${plural(Math.abs(p.slackDays ?? 0), "day")} late` : distance(p)}</span>
                      {p.opportunity.closesAt && <span className="text-muted-foreground">Closes {fmtDate(p.opportunity.closesAt)}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {data.closed > 0 && <p className="mt-3 text-sm text-muted-foreground">{plural(data.closed, "listing")} already closed and {data.closed === 1 ? "is" : "are"} left out.</p>}
        </SectionCard>

        <div ref={detailRef} className="scroll-mt-6 lg:sticky lg:top-6">
          <PathDetail key={path.opportunity.id} path={path} data={data} demo={demo} onWatch={data.runId ? () => activity.start(data.runId!) : undefined} />
        </div>
      </div>
    </div>
  );
}

// ---------- the selected listing ----------

function stepDetail(s: PathStep, roleId: string): string {
  const demand = s.demandPct !== undefined ? ` ${s.demandPct}% of ${roleName(roleId)} ads ask for it.` : "";
  if (s.mode === "degree") {
    const mod = s.moduleTitle ? `${s.moduleTitle} (${s.moduleCode})` : s.moduleCode ?? "Your module";
    return `${mod} teaches it by ${fmtDate(s.readyBy)}, before the deadline, so there's no course to pay for.${demand}`;
  }
  const hours = s.hoursSource === "roadmap"
    ? `${s.hours} h, already planned in your roadmap week ${s.roadmapWeek}.`
    : `About ${s.hours} h (a Keystone estimate; it isn't in your roadmap yet).`;
  return `${hours}${s.started ? " You've already tried it, so it's shorter." : ""}${demand}`;
}

function PathDetail({ path, data, demo, onWatch }: { path: OpportunityPath; data: PathwayResult; demo: boolean; onWatch?: () => void }) {
  const qc = useQueryClient();
  const activity = useActivity();
  const [open, setOpen] = React.useState(false);
  const o = path.opportunity;
  const have = path.steps.filter((s) => s.mode === "have");
  const timeline = path.steps.filter((s) => s.mode !== "have");
  const learn = timeline.filter((s) => s.mode === "learn");
  const applied = data.applied?.opportunityId === o.id ? data.applied : undefined;

  const undo = useMutation({
    mutationFn: () => apiPost<{ status: "undone"; version: number; runId: string }>("/api/labs/pathway/undo", { demo }),
    onSuccess: (r) => {
      toast.success("Your roadmap is back as it was", { description: `Saved as v${r.version}.` });
      void qc.invalidateQueries({ queryKey: ["labs-pathway"] });
      void qc.invalidateQueries({ queryKey: ["roadmap"] });
    },
    onError: (e) => toast.error("Nothing was undone", { description: e instanceof Error ? e.message : "Try again in a moment." }),
  });

  const readyText = path.state === "apply-now" ? "Today" : shortDate(path.readyBy);
  const readyHint = path.state === "apply-now"
    ? "you already have every skill it asks for"
    : path.slackDays === undefined
      ? `${new Date(path.readyBy).getUTCFullYear()}, no deadline listed`
      : path.slackDays >= 0
        ? `${new Date(path.readyBy).getUTCFullYear()}, ${plural(Math.floor(path.slackDays / 7), "week")} before it closes`
        : `${plural(Math.abs(path.slackDays), "day")} after it closes on ${shortDate(o.closesAt)}`;

  return (
    <SectionCard
      title={o.title}
      description={`${o.employer}, ${o.location}. ${KIND_LABEL[o.kind] ?? o.kind}${o.closesAt ? `, closes ${fmtDate(o.closesAt)}` : ""}.`}
      actions={<StatePill state={path.state} />}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{o.blurb}</span>
          {o.source === "demo" ? <DemoDataNote /> : o.url && (
            <a href={o.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
              View the listing ↗<span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
        </div>

        <p className="text-lg font-medium text-pretty" aria-live="polite">{path.headline}</p>

        <dl className="grid gap-4 rounded-xl bg-muted/60 p-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-muted-foreground">Fit today</dt>
            <dd className="font-mono text-3xl font-semibold tabular-nums">{path.fitNow}%</dd>
            <dd className="text-sm text-muted-foreground">{path.fitReady}% once the path is done</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Study time</dt>
            <dd className="font-mono text-3xl font-semibold tabular-nums">{path.studyHours} h</dd>
            <dd className="text-sm text-muted-foreground">{path.studyHours ? `${plural(path.studyWeeks, "week")} at your ${data.hoursPerWeek} h a week` : "nothing to self-study"}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Ready to apply</dt>
            <dd className="font-mono text-3xl font-semibold tabular-nums">{readyText}</dd>
            <dd className="text-sm text-muted-foreground">{readyHint}</dd>
          </div>
        </dl>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {applied ? (
            <>
              <p className="text-sm"><span className="font-medium">In your roadmap as v{applied.version}.</span> <span className="text-muted-foreground">The first weeks now follow this path.</span></p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button variant="outline" className="h-10 rounded-xl px-4" disabled={undo.isPending} onClick={() => undo.mutate()}>
                  <Undo2 aria-hidden />{undo.isPending ? "Undoing…" : "Undo"}
                </Button>
                <Link href="/roadmap" className={cn(buttonVariants({ variant: "outline" }), "h-10 rounded-xl px-4")}>Open your roadmap</Link>
              </div>
            </>
          ) : learn.length > 0 ? (
            <>
              <p className="text-sm text-muted-foreground">Agents propose, you decide: you&apos;ll see every change before anything moves.</p>
              <Button className="h-12 rounded-xl px-6 text-base" onClick={() => setOpen(true)}>Add to roadmap</Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{path.state === "apply-now" ? "Nothing to add: you can apply today." : "Your degree covers it in time: nothing to add."}</p>
          )}
        </div>

        <PathGraph path={path} />

        <div className="space-y-3">
          <h3 className="text-base font-semibold">Your path, step by step</h3>
          {have.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">You already have</span>
              {have.map((s) => <SkillChip key={s.skillId} skillId={s.skillId} name={s.name} status={s.status} />)}
            </div>
          )}
          {timeline.length > 0 ? (
            <ol className="divide-y">
              {timeline.map((s, k) => (
                <li key={s.skillId} className="flex gap-3 py-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-sm tabular-nums" aria-hidden>{k + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className="flex items-center gap-2 font-medium">
                        {s.mode === "degree"
                          ? <GraduationCap className="size-4 text-status-degree" aria-hidden />
                          : <BookOpen className="size-4 text-primary" aria-hidden />}
                        {s.name}
                        <span className="text-sm font-normal text-muted-foreground">{s.mode === "degree" ? "your degree" : "you learn it"}</span>
                      </span>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {s.mode === "learn" ? `${shortDate(s.startsOn)} to ${shortDate(s.readyBy)}` : `by ${fmtDate(s.readyBy)}`}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{stepDetail(s, o.roleId)}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">There&apos;s nothing between you and this listing.</p>
          )}
        </div>

        <div className="space-y-2">
          <h3 className="text-base font-semibold">Why this path</h3>
          <ul className="space-y-1.5 text-sm">
            {path.alternatives.map((a) => (
              <li key={a.instead} className="flex items-start gap-2">
                <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span><span className="font-medium">{a.chosenName}</span> over {a.insteadName}: {a.reason}</span>
              </li>
            ))}
            <li className="text-muted-foreground">
              Keystone compared {plural(path.combosSearched, "skill combination")} and kept the one with the fewest study hours that still makes the deadline, counting each shared prerequisite once.
            </li>
          </ul>
        </div>

        {onWatch && (
          <Button variant="ghost" className="h-10 rounded-xl px-3 text-sm" onClick={onWatch}>
            <Activity aria-hidden />See how the agents worked it out
          </Button>
        )}
      </div>
      <AddToRoadmapDialog open={open} onOpenChange={setOpen} path={path} demo={demo} onAdded={(runId) => activity.start(runId)} />
    </SectionCard>
  );
}
