"use client";
// "Mark as merged": a merged pod PR becomes proof of skill (POST /api/projects/merge).
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { GitMerge, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiPost } from "@/lib/fetcher";
import type { ProjectProgress, ProofResult } from "@/lib/schemas/studio";
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
        "inline-flex h-7 items-center gap-1 rounded-full border border-status-proven/25 bg-status-proven/10 px-2.5 text-xs font-medium text-status-proven",
        className,
      )}
    >
      <GitMerge className="size-3.5" aria-hidden />
      Merged ✓
    </span>
  );
}

export function MergeProofButton({
  podId,
  issueIndex,
  issueTitle,
  merged,
  onProof,
  className,
}: {
  podId: string;
  issueIndex: number;
  /** Used for the accessible name: "Mark <issue title> as merged". */
  issueTitle?: string;
  merged?: boolean;
  onProof?: (result: ProofResult) => void;
  className?: string;
}) {
  const activity = useActivity();
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      apiPost<ProofResult>("/api/projects/merge", { podId, issueIndex }),
    onSuccess: (result) => {
      if (result.runId) activity.start(result.runId);
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
    ? `Mark ${issueTitle} as merged`
    : `Mark issue ${issueIndex + 1} as merged`;
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      aria-label={label}
      className={cn("rounded-full", className)}
    >
      {mutation.isPending ? (
        <Loader2 className="animate-spin" aria-hidden />
      ) : (
        <GitMerge aria-hidden />
      )}
      {mutation.isPending ? "Recording proof…" : "Mark as merged"}
    </Button>
  );
}

export default MergeProofButton;
