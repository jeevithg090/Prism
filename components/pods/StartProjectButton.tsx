"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useActivity } from "@/components/shell/ActivityPanel";
import { apiPost } from "@/lib/fetcher";
import type { Pod, ProjectBrief } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DEMO_POD_ID } from "./members";

type CreatedBrief = ProjectBrief & { runId?: string };

/** POST /api/projects/create, then open the project view with a "Repo is live" toast. */
export function useStartProject(pod: Pod) {
  const router = useRouter();
  const qc = useQueryClient();
  const activity = useActivity();
  return useMutation({
    mutationFn: () => apiPost<CreatedBrief>("/api/projects/create", { podId: pod.id }),
    onSuccess: (brief) => {
      if (brief.runId) activity.start(brief.runId);
      qc.setQueryData<Pod>(["pod", pod.id], (old) => ({ ...(old ?? pod), project: brief }));
      void qc.invalidateQueries({ queryKey: ["pods"] });
      router.push(`/pods/${pod.id}`);
      const repoUrl = brief.repoUrl;
      toast.success("Repo is live", {
        description: brief.title,
        action: repoUrl
          ? { label: "Open repo", onClick: () => window.open(repoUrl, "_blank", "noopener,noreferrer") }
          : undefined,
      });
    },
    onError: (err: Error) => {
      toast.error("We couldn't design your project just now", {
        description: err.message || "Please try again in a moment.",
        action: { label: "Use demo data", onClick: () => router.push(`/pods/${DEMO_POD_ID}`) },
      });
    },
  });
}

export function StartProjectButton({ pod, className, label = "Start our project" }: { pod: Pod; className?: string; label?: string }) {
  const start = useStartProject(pod);
  const busy = start.isPending || start.isSuccess;
  return (
    <Button
      size="lg"
      onClick={() => start.mutate()}
      disabled={busy}
      aria-busy={busy || undefined}
      className={cn(className)}
    >
      {busy ? (
        <>
          <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
          Designing your project…
        </>
      ) : (
        label
      )}
    </Button>
  );
}
