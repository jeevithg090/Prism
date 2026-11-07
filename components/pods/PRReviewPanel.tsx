"use client";
// "AI Tech Lead": Socratic PR review on demand (POST /api/projects/review). Hints and questions, never the answer.
import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import {
  CheckCircle2,
  ExternalLink,
  Eye,
  GitPullRequest,
  Lightbulb,
  Loader2,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { apiPost } from "@/lib/fetcher";
import type { PRReview } from "@/lib/schemas/studio";
import { AgentAvatar } from "@/components/keystone";
import { useActivity } from "@/components/shell/ActivityPanel";
import { Button } from "@/components/ui/button";
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
            className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
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
      if (review.runId) activity.start(review.runId);
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
      className={cn(
        "rounded-2xl border bg-card p-5 shadow-sm sm:p-6",
        className,
      )}
    >
      <div className="flex flex-wrap items-start gap-4">
        <AgentAvatar agent="techlead" size={44} />
        <div className="min-w-0 flex-1 space-y-1">
          <h3
            id={`techlead-${podId}`}
            className="text-lg font-semibold tracking-tight"
          >
            AI Tech Lead
          </h3>
          <p className="text-sm text-muted-foreground text-pretty">
            Socratic review: hints and questions, never the answer.
          </p>
        </div>
        <Button
          size="lg"
          variant={review ? "outline" : "default"}
          onClick={() => mutation.mutate()}
          disabled={pending}
          className="h-10 w-full px-4 sm:w-auto"
        >
          {pending ? (
            <>
              <Loader2 className="animate-spin" aria-hidden />
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
          <div className="space-y-2" aria-label="Reading your pull request">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3"
              >
                <span className="size-7 shrink-0 animate-pulse rounded-lg bg-muted" />
                <span
                  className={cn(
                    "h-3 animate-pulse rounded bg-muted",
                    i === 1 ? "w-2/3" : "w-5/6",
                  )}
                />
              </div>
            ))}
          </div>
        )}

        {!pending && mutation.isError && (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-xl border border-status-gap/30 bg-status-gap/5 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="space-y-0.5">
              <p className="text-sm font-medium">
                The Tech Lead couldn&apos;t read your pull request.
              </p>
              <p className="text-sm text-muted-foreground">
                {mutation.error instanceof Error && mutation.error.message
                  ? mutation.error.message
                  : "Please try again in a moment."}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => mutation.mutate()}
              className="shrink-0"
            >
              <RotateCcw aria-hidden />
              Retry
            </Button>
          </div>
        )}

        {!pending && !mutation.isError && review && (
          <div className="space-y-4">
            <div className="flex flex-col gap-2 rounded-xl border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
              <a
                href={review.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-w-0 items-center gap-2 rounded-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                <GitPullRequest
                  className="size-4 shrink-0 text-status-proven"
                  aria-hidden
                />
                <span className="truncate">{review.prTitle}</span>
                <ExternalLink
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <span className="sr-only">(opens on GitHub in a new tab)</span>
              </a>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full border border-status-rising/25 bg-status-rising/10 px-2.5 py-0.5 text-xs font-medium text-status-rising">
                  <Sparkles className="size-3.5" aria-hidden />
                  Hints, not answers
                </span>
                {review.posted ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-status-proven/25 bg-status-proven/10 px-2.5 py-0.5 text-xs font-medium text-status-proven">
                    <CheckCircle2 className="size-3.5" aria-hidden />
                    Posted on GitHub ✓
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
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
              <ol className="space-y-2" aria-label="Hints from the Tech Lead">
                {review.hints.map((hint, i) => (
                  <motion.li
                    key={`${i}-${hint}`}
                    initial={reduce ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: i * 0.08 }}
                    className="flex items-start gap-3 rounded-xl border bg-background p-3"
                  >
                    <span
                      className="flex shrink-0 items-center gap-1.5"
                      aria-hidden
                    >
                      <span className="flex size-7 items-center justify-center rounded-lg bg-status-rising/10 text-status-rising">
                        <Lightbulb className="size-4" />
                      </span>
                      <span className="w-4 text-sm font-semibold tabular-nums text-muted-foreground">
                        {i + 1}.
                      </span>
                    </span>
                    <p className="min-w-0 pt-0.5 text-sm leading-relaxed sm:text-[15px]">
                      <HintText text={hint} />
                    </p>
                  </motion.li>
                ))}
              </ol>
            )}
          </div>
        )}

        {!pending && !mutation.isError && !review && (
          <p className="text-sm text-muted-foreground text-pretty">
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
