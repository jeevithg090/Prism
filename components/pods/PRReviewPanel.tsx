"use client";
// "AI Tech Lead": Socratic PR review on demand (POST /api/projects/review). Hints and questions, never the answer.
import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  GitPullRequest,
  Lightbulb,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { apiPost } from "@/lib/fetcher";
import type { PRReview } from "@/lib/schemas/studio";
import { AgentAvatar } from "@/components/keystone";
import { useActivity } from "@/components/shell/ActivityPanel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Render `inline code` inside a hint without pulling in a markdown parser. */
function HintText({ text }: { text: string }) {
  const parts = text.replace(/^\s*[-*]\s+/, "").split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
          <code
            key={i}
            className="rounded-md bg-muted px-1 py-0.5 font-mono text-sm"
          >
            {part.slice(1, -1)}
          </code>
        ) : (
          <React.Fragment key={i}>{part.replace(/\*\*/g, "")}</React.Fragment>
        ),
      )}
    </>
  );
}

export function PRReviewPanel({
  podId,
  onReviewed,
  className,
}: {
  podId: string;
  onReviewed?: (review: PRReview) => void;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const activity = useActivity();
  const mutation = useMutation({
    mutationFn: () => apiPost<PRReview>("/api/projects/review", { podId }),
    onSuccess: (review) => {
      // Stream in the background so the hints stay readable; the top bar's Agents pill pulses.
      if (review.runId) activity.start(review.runId, { open: false });
      toast.success(
        review.posted
          ? "The Tech Lead left hints on your pull request"
          : "Here are the Tech Lead's hints",
        {
          description: `${review.hints.length} ${review.hints.length === 1 ? "question" : "questions"} to think through.`,
        },
      );
      onReviewed?.(review);
    },
    onError: (err) => {
      toast.error("The Tech Lead couldn't read your PR", {
        description: err instanceof Error ? err.message : undefined,
      });
    },
  });
  const review = mutation.data;
  const pending = mutation.isPending;

  return (
    <section
      aria-labelledby={`techlead-${podId}`}
      aria-busy={pending || undefined}
      className={cn("rounded-2xl border bg-card p-6 shadow-sm", className)}
    >
      <div className="flex flex-wrap items-start gap-4">
        <AgentAvatar agent="techlead" size={40} />
        <div className="min-w-0 flex-1 space-y-1">
          <h2 id={`techlead-${podId}`} className="text-xl font-semibold text-foreground">
            AI Tech Lead
          </h2>
          <p className="text-sm text-pretty text-muted-foreground">
            Socratic review: hints and questions, never the answer.
          </p>
        </div>
        <Button
          size="lg"
          variant={review ? "outline" : "default"}
          onClick={() => mutation.mutate()}
          disabled={pending}
          aria-busy={pending || undefined}
          className="w-full sm:w-auto"
        >
          {pending ? (
            <>
              <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
              Reading the diff…
            </>
          ) : review ? (
            <>
              <RotateCcw aria-hidden />
              Review again
            </>
          ) : (
            <>
              <GitPullRequest aria-hidden />
              Review my PR now
            </>
          )}
        </Button>
      </div>

      <div aria-live="polite" className="mt-5">
        {pending && (
          <div role="status" className="divide-y border-t" aria-label="Reading your pull request">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 py-3.5">
                <Skeleton className="h-4 w-4 shrink-0" />
                <Skeleton className={cn("h-4", i === 1 ? "w-2/3" : "w-5/6")} />
              </div>
            ))}
          </div>
        )}

        {!pending && mutation.isError && (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-xl bg-muted p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-status-gap" aria-hidden />
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">
                  The Tech Lead couldn&apos;t read your pull request.
                </p>
                <p className="text-sm text-muted-foreground">
                  {mutation.error instanceof Error && mutation.error.message
                    ? mutation.error.message
                    : "Please try again in a moment."}
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={() => mutation.mutate()} className="shrink-0">
              <RotateCcw aria-hidden />
              Retry
            </Button>
          </div>
        )}

        {!pending && !mutation.isError && review && (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-xl bg-muted p-4 sm:flex-row sm:items-center sm:justify-between">
              <a
                href={review.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-w-0 items-center gap-2 rounded-sm font-medium text-foreground underline decoration-primary decoration-1 underline-offset-4 outline-none transition-[color] duration-(--dur-short) hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <GitPullRequest className="size-4 shrink-0 text-status-proven" aria-hidden />
                <span className="truncate">{review.prTitle}</span>
                <span className="sr-only">(opens on GitHub in a new tab)</span>
              </a>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex h-6 items-center gap-1.5 rounded-md border border-rule-2 px-2 text-xs font-medium text-foreground">
                  <Lightbulb className="size-3.5 text-muted-foreground" aria-hidden />
                  Hints, not answers
                </span>
                {review.posted ? (
                  <span className="inline-flex h-6 items-center gap-1.5 rounded-md border border-status-proven/35 bg-status-proven/10 px-2 text-xs font-medium text-foreground">
                    <CheckCircle2 className="size-3.5 text-status-proven" aria-hidden />
                    Posted on GitHub
                  </span>
                ) : (
                  <span className="inline-flex h-6 items-center gap-1.5 rounded-md border border-dashed border-rule-2 px-2 text-xs font-medium text-muted-foreground">
                    <Eye className="size-3.5" aria-hidden />
                    Preview: demo mode
                  </span>
                )}
              </div>
            </div>

            {review.hints.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hints this time: your pull request already answers the
                questions the Tech Lead would ask.
              </p>
            ) : (
              <motion.ol
                initial={reduce ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="divide-y border-t"
                aria-label="Hints from the Tech Lead"
              >
                {review.hints.map((hint, i) => (
                  <li key={`${i}-${hint}`} className="flex items-baseline gap-3 py-3 last:pb-0">
                    <span className="w-5 shrink-0 font-mono text-sm text-muted-foreground tabular-nums" aria-hidden>
                      {i + 1}
                    </span>
                    <p className="min-w-0 text-base leading-relaxed text-foreground">
                      <HintText text={hint} />
                    </p>
                  </li>
                ))}
              </motion.ol>
            )}
          </div>
        )}

        {!pending && !mutation.isError && !review && (
          <p className="max-w-[62ch] text-pretty text-muted-foreground">
            Open a pull request on your pod repo, then ask for a review. The
            Tech Lead reads the diff and replies with guiding questions, so you
            still write the fix yourself.
          </p>
        )}
      </div>
    </section>
  );
}

export default PRReviewPanel;
