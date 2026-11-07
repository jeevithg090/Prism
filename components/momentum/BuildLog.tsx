"use client";
// P5 slot component (P3's dashboard + passport): a timeline of verified steps, with optional CV bullets.
import * as React from "react";
import { format, formatDistanceToNow } from "date-fns";
import { Code2, Copy, ExternalLink, GitPullRequest, HeartHandshake, Mic, Route, Sparkles, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import type { MomentumEvent } from "@/lib/schemas/community";
import { DEFAULT_EVENT_LABEL } from "@/lib/momentum";
import { DemoDataNote, EmptyState, ErrorState, LoadingSkeleton } from "@/components/keystone";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiData } from "./useApiData";
import { DEMO_EVENTS } from "./demo";
import { templateBullets, type CvBulletsResult } from "./cv";
import { turnIntoCvBullets } from "./actions";

const KIND: Record<MomentumEvent["kind"], { icon: LucideIcon; label: string }> = {
  "pr-merged": { icon: GitPullRequest, label: "Merged pull request" },
  "roadmap-milestone": { icon: Route, label: "Roadmap milestone" },
  "helped-newcomer": { icon: HeartHandshake, label: "Helped a newcomer" },
  "mock-interview": { icon: Mic, label: "Mock interview" },
  "problem-solved": { icon: Code2, label: "Problem solved" },
};

function safeDate(ts: string): Date | null {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function BuildLog({ userId }: { userId: string }) {
  const { status, data, retry } = useApiData<MomentumEvent[]>(`/api/momentum/${encodeURIComponent(userId)}?view=events`);
  const [demo, setDemo] = React.useState<MomentumEvent[] | null>(null);
  const events = demo ?? data;
  const titleId = React.useId();

  const [open, setOpen] = React.useState(false);
  const [cv, setCv] = React.useState<CvBulletsResult | null>(null);

  if (!demo && status === "loading") {
    return <div role="status" aria-label="Loading your Build Log"><LoadingSkeleton variant="list" /></div>;
  }
  if (!demo && status === "error") {
    return (
      <ErrorState
        title="We couldn’t load your Build Log"
        body="Your steps are safe. Try again in a moment."
        onRetry={retry}
        onUseDemo={() => { setDemo(DEMO_EVENTS); toast("Showing demo Build Log data"); }}
      />
    );
  }
  if (!events?.length) {
    return (
      <EmptyState
        icon={Route}
        title="Your Build Log is ready for its first entry"
        body="Merged pod PRs, finished roadmap weeks and help you give to newcomers appear here automatically."
      />
    );
  }

  async function generate(list: MomentumEvent[]) {
    setCv(null);
    setOpen(true);
    try {
      setCv(demo ? { bullets: templateBullets(list), source: "template" } : await turnIntoCvBullets(userId));
    } catch {
      setCv({ bullets: templateBullets(list), source: "template" });
    }
  }

  async function copy() {
    if (!cv?.bullets.length) return;
    try {
      await navigator.clipboard.writeText(cv.bullets.map((b) => `• ${b}`).join("\n"));
      toast.success("Copied");
    } catch {
      toast.error("Couldn’t copy. Select the text and copy it instead.");
    }
  }

  return (
    <section aria-labelledby={titleId} className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id={titleId} className="flex items-center gap-2 text-xl font-semibold">
            Build Log {demo && <DemoDataNote />}
          </h2>
          <p className="text-sm text-muted-foreground">Verified steps, newest first.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => generate(events)}>
          <Sparkles aria-hidden />
          Turn into CV bullets
        </Button>
      </div>

      <ol aria-label="Verified steps">
        {events.map((e) => <BuildLogRow key={e.id ?? `${e.kind}-${e.ts}`} event={e} />)}
      </ol>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>CV bullets from your Build Log</DialogTitle>
            <DialogDescription>Three STAR-style bullets written from your verified steps. Edit them so they sound like you.</DialogDescription>
          </DialogHeader>
          <div aria-live="polite" aria-busy={!cv}>
            {!cv ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            ) : cv.bullets.length ? (
              <ul className="list-disc space-y-2 ps-5">
                {cv.bullets.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            ) : (
              <p className="text-muted-foreground">There’s nothing to write about yet. Your next verified step will change that.</p>
            )}
            {cv?.source === "template" && cv.bullets.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">Written from a template because AI writing isn’t available right now.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
            <Button onClick={copy} disabled={!cv?.bullets.length}>
              <Copy aria-hidden />
              Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function BuildLogRow({ event }: { event: MomentumEvent }) {
  const meta = KIND[event.kind] ?? { icon: Route, label: event.kind };
  const Icon = meta.icon;
  const label = event.label?.trim() || DEFAULT_EVENT_LABEL[event.kind] || meta.label;
  const date = safeDate(event.ts);
  const isGitHub = !!event.url && /^https:\/\/github\.com\//.test(event.url);
  const linkText = isGitHub ? "View on GitHub" : "Open link";

  return (
    <li className="group relative flex gap-3 pb-5 last:pb-0">
      <span aria-hidden className="absolute start-[13.5px] top-8 bottom-0 w-px bg-border group-last:hidden" />
      <span aria-hidden className="relative flex size-7 shrink-0 items-center justify-center rounded-full border bg-primary/10 text-primary">
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="text-sm font-medium break-words">
          <span className="sr-only">{meta.label}: </span>
          {label}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {date && (
            <time dateTime={event.ts} title={format(date, "d MMM yyyy, HH:mm")}>
              {formatDistanceToNow(date, { addSuffix: true })}
            </time>
          )}
          {event.url && (
            <a
              href={event.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${linkText}: ${label} (opens in a new tab)`}
              className="inline-flex items-center gap-1 rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {linkText}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
        </p>
      </div>
    </li>
  );
}
