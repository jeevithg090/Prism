"use client";
// The human checkpoint: a preview of exactly what moves in the roadmap, then "Approve and add". Nothing is written
// until the student presses it (the API refuses to write without `approved: true`).
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { apiPost } from "@/lib/fetcher";
import { fmtDate } from "@/lib/labs/pathway/format";
import type { OpportunityPath, RoadmapChange, RoadmapPreview } from "@/lib/labs/pathway/types";

type AddResponse =
  | { status: "needs_approval"; preview: RoadmapPreview }
  | { status: "added"; preview: RoadmapPreview; version: number; rememberedGoal: boolean; runId: string }
  | { status: "already-added"; version: number }
  | { status: "nothing-to-add"; message: string };

const URL_ADD = "/api/labs/pathway/roadmap";

function changeLine(c: RoadmapChange): string {
  if (c.kind === "added") return `${c.name} is added in week ${c.toWeek} (${c.hours} h)`;
  if (c.fromWeek === c.toWeek) return `${c.name} stays in week ${c.toWeek}`;
  return `${c.name} moves from week ${c.fromWeek} to week ${c.toWeek}`;
}

export function AddToRoadmapDialog({ open, onOpenChange, path, demo, onAdded }: {
  open: boolean; onOpenChange: (o: boolean) => void; path: OpportunityPath; demo: boolean; onAdded: (runId: string) => void;
}) {
  const qc = useQueryClient();
  const [remember, setRemember] = React.useState(false);
  const id = path.opportunity.id;
  const preview = useQuery({
    queryKey: ["labs-pathway-preview", id, demo],
    queryFn: () => apiPost<AddResponse>(URL_ADD, { opportunityId: id, approved: false, demo }),
    enabled: open,
    staleTime: 0,
    retry: 0,
  });
  const approve = useMutation({
    mutationFn: () => apiPost<AddResponse>(URL_ADD, { opportunityId: id, approved: true, rememberGoal: remember, demo }),
    onSuccess: (r) => {
      if (r.status === "added") {
        toast.success(`Roadmap v${r.version} is ready`, {
          description: `${r.preview.changes.length} ${r.preview.changes.length === 1 ? "skill" : "skills"} pulled forward for ${path.opportunity.employer}.${r.rememberedGoal ? " The Coach will remember this goal." : ""}`,
        });
        onAdded(r.runId);
      } else if (r.status === "already-added") toast.info(`Already in your roadmap (v${r.version})`);
      void qc.invalidateQueries({ queryKey: ["labs-pathway"] });
      void qc.invalidateQueries({ queryKey: ["roadmap"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error("Your roadmap is unchanged", { description: e instanceof Error ? e.message : "Try again in a moment." }),
  });

  const data = preview.data;
  const ready = data?.status === "needs_approval";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl p-6 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Add this path to your roadmap?</DialogTitle>
          <DialogDescription className="text-base">
            For {path.opportunity.title} at {path.opportunity.employer}. Nothing changes until you approve.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-base" aria-live="polite">
          {preview.isPending && (
            <div className="space-y-2" aria-busy="true">
              <span className="sr-only">Loading the preview</span>
              <Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-24 w-full rounded-xl" />
            </div>
          )}
          {preview.isError && (
            <div role="alert" className="space-y-3 rounded-xl bg-muted/60 p-4">
              <p>{preview.error instanceof Error ? preview.error.message : "We couldn't build the preview."}</p>
              <Button variant="outline" className="h-10 rounded-xl px-4" onClick={() => preview.refetch()}>Retry</Button>
            </div>
          )}
          {data?.status === "nothing-to-add" && <p className="rounded-xl bg-muted/60 p-4">{data.message}</p>}
          {data?.status === "already-added" && <p className="rounded-xl bg-muted/60 p-4">This path is already in your roadmap (v{data.version}).</p>}
          {ready && (
            <>
              <ul className="space-y-1.5">
                {data.preview.changes.map((c) => (
                  <li key={c.skillId} className="flex items-start gap-2">
                    <ArrowRight className="mt-1 size-4 shrink-0 text-primary" aria-hidden />
                    <span>{changeLine(c)}</span>
                  </li>
                ))}
              </ul>
              <div className="rounded-xl bg-muted/60 p-4">
                <p className="text-sm font-medium">Your first weeks after the change</p>
                <ol className="mt-2 divide-y text-sm">
                  {data.preview.weeks.slice(0, 6).map((w) => (
                    <li key={w.week} className="flex items-center justify-between gap-3 py-1.5">
                      <span><span className="font-mono tabular-nums">Week {w.week}</span>, {fmtDate(w.startDate).replace(/ \d{4}$/, "")}</span>
                      <span className={w.changed ? "font-medium text-foreground" : "text-muted-foreground"}>{w.name}{w.changed ? " (new order)" : ""}</span>
                    </li>
                  ))}
                </ol>
              </div>
              {data.preview.degreeNotes.length + data.preview.laterNotes.length > 0 && (
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {[...data.preview.degreeNotes, ...data.preview.laterNotes].map((n) => <li key={n}>{n}</li>)}
                </ul>
              )}
              <label className="flex items-start gap-3 rounded-xl p-1 text-sm">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="mt-0.5 size-5 shrink-0 rounded accent-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <span>Also tell the Keystone Coach about this goal. You can delete the note in Coach at any time.</span>
              </label>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <UserCheck className="size-4 shrink-0 text-primary" aria-hidden />
                You decide. Roadmap v{data.preview.currentVersion} becomes v{data.preview.nextVersion}, and you can undo it here.
              </p>
            </>
          )}
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <DialogClose render={<Button variant="outline" className="h-10 rounded-xl px-4" />}>Cancel</DialogClose>
          <Button className="h-10 rounded-xl px-5" disabled={!ready || approve.isPending} onClick={() => approve.mutate()}>
            {approve.isPending ? "Adding…" : "Approve and add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
