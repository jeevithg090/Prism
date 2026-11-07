"use client";
// "Mark as merged": a merged pod PR becomes proof of skill (POST /api/projects/merge).
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { GitMerge, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiPost } from "@/lib/fetcher";
import type { ProjectProgress, ProofResult } from "@/lib/schemas/studio";
import type { BridgeMap } from "@/lib/types";
import { useActivity } from "@/components/shell/ActivityPanel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  projectProgressKey,
  withMerged,
} from "@/components/pods/useProjectProgress";

export function MergedPill({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md border border-status-proven/35 bg-status-proven/10 px-2.5 text-xs font-medium whitespace-nowrap text-foreground",
        className,
      )}
    >
      <GitMerge className="size-3.5 text-status-proven" aria-hidden />
      Merged
    </span>
  );
}

export function MergeProofButton({
  podId,
  issueIndex,
  issueTitle,
  merged,
  onProof,
  variant = "outline",
  size = "sm",
  className,
}: {
  podId: string;
  issueIndex: number;
  /** Used for the accessible name: "Mark as merged: <issue title>" (contains the visible text). */
  issueTitle?: string;
  merged?: boolean;
  onProof?: (result: ProofResult) => void;
  /** outline for the viewer's own issues, ghost for the rest of the pod's. */
  variant?: "outline" | "ghost";
  /** default on the viewer's own issue (the page's payoff click), sm elsewhere. */
  size?: "sm" | "default";
  className?: string;
}) {
  const activity = useActivity();
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      apiPost<ProofResult>("/api/projects/merge", { podId, issueIndex }),
    onSuccess: (result) => {
      // Stream the run in the background: the top bar's Agents pill pulses, and the celebration stays
      // unobstructed. The presenter opens the sheet from the celebration ("See what the agents did").
      if (result.runId) activity.start(result.runId, { open: false });
      // Move the top-bar readiness pill with the celebration: the viewer's primary-role map is the one
      // whose readiness equals readinessBefore.
      qc.setQueriesData<BridgeMap | null>({ queryKey: ["graph", result.userId] }, (old) =>
        old && Math.abs(old.readinessNow - result.readinessBefore) < 0.005
          ? { ...old, readinessNow: Math.max(old.readinessNow, result.readinessAfter) }
          : old,
      );
      qc.setQueryData<ProjectProgress>(projectProgressKey(podId), (old) =>
        withMerged(old, {
          podId,
          issueIndex,
          userId: result.userId,
          skillId: result.skillId,
          mergedAt: new Date().toISOString(),
        }),
      );
      void qc.invalidateQueries({ queryKey: projectProgressKey(podId) });
      // With onProof the parent shows the full ProofCelebration, so the toast would only cover it.
      if (onProof) onProof(result);
      else
        toast.success(`${result.skillName} is now proven`, {
          description: result.message,
        });
    },
    onError: (err) => {
      toast.error("We couldn't record that merge", {
        description:
          err instanceof Error && err.message
            ? err.message
            : "Please try again in a moment.",
      });
    },
  });

  if (merged || mutation.isSuccess) return <MergedPill className={className} />;

  const label = issueTitle
    ? `Mark as merged: ${issueTitle}`
    : `Mark as merged: issue ${issueIndex + 1}`;
  return (
    <Button
      variant={variant}
      size={size}
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      aria-busy={mutation.isPending || undefined}
      aria-label={label}
      className={className}
    >
      {mutation.isPending ? (
        <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
      ) : (
        <GitMerge aria-hidden />
      )}
      {mutation.isPending ? "Recording proof…" : "Mark as merged"}
    </Button>
  );
}

export default MergeProofButton;
