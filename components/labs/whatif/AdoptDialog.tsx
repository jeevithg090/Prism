"use client";
// The human checkpoint: what adopting a plan would change in your roadmap, and nothing changes until you say yes.
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { dayLabel, pct, type ProposalResponse, type WhatIfContextView } from "./model";

export function AdoptDialog({
  proposal, ctx, busy, onApprove, onDecline,
}: {
  proposal: ProposalResponse | null;
  ctx: WhatIfContextView;
  busy: "approve" | "decline" | null;
  onApprove: () => void;
  onDecline: () => void;
}) {
  const name = (id: string | null) => ctx.queue.find((q) => q.skillId === id)?.name ?? id ?? "";
  const d = proposal?.diff;
  return (
    <Dialog open={!!proposal} onOpenChange={(open) => { if (!open && !busy) onDecline(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl p-6 text-base sm:max-w-lg">
        {proposal && d && (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold">Make &ldquo;{proposal.plan.label}&rdquo; your roadmap?</DialogTitle>
              <DialogDescription className="text-base">
                The Roadmap Agent drafted roadmap v{proposal.roadmapVersion}. Nothing changes until you say yes, and you can undo it afterwards.
              </DialogDescription>
            </DialogHeader>
            <ul className="space-y-3">
              {d.firstFocus.before !== d.firstFocus.after ? (
                <li className="flex items-start gap-2"><ArrowRight className="mt-1 size-4 shrink-0 text-primary" aria-hidden />Week 1 becomes {name(d.firstFocus.after)} (it was {name(d.firstFocus.before)}).</li>
              ) : (
                <li className="flex items-start gap-2"><ArrowRight className="mt-1 size-4 shrink-0 text-primary" aria-hidden />Week 1 stays {name(d.firstFocus.after)}.</li>
              )}
              {d.weekChanges.length > 1 && (
                <li className="flex items-start gap-2"><ArrowRight className="mt-1 size-4 shrink-0 text-primary" aria-hidden />{d.weekChanges.length} of {proposal.weeks.length} weeks change focus; the others keep their tasks.</li>
              )}
              <li className="flex items-start gap-2">
                <ArrowRight className="mt-1 size-4 shrink-0 text-primary" aria-hidden />
                {d.hoursBefore === d.hoursAfter ? `Weeks stay at ${d.hoursAfter} study hours (half in exam weeks).` : `Weeks go from ${d.hoursBefore} to ${d.hoursAfter} study hours (half in exam weeks).`}
              </li>
              {proposal.plan.hoursPerWeek !== proposal.hoursBefore && (
                <li className="flex items-start gap-2"><ArrowRight className="mt-1 size-4 shrink-0 text-primary" aria-hidden />Your profile saves {proposal.plan.hoursPerWeek} hours a week (it was {proposal.hoursBefore}), so the next re-plan keeps them.</li>
              )}
            </ul>
            <div className="rounded-xl bg-muted/60 p-4">
              <p className="font-medium">The outlook you&apos;re choosing</p>
              <p className="mt-1 text-muted-foreground">
                {pct(proposal.outlook.p50)} ready by {dayLabel(proposal.outlook.targetDate)} in the middle future, and 8 of 10 futures land between {pct(proposal.outlook.p10)} and {pct(proposal.outlook.p90)}.
              </p>
            </div>
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-status-proven" aria-hidden />
              Agents propose, you decide. This is logged in the agent ledger with your approval; nothing is sent to anyone.
            </p>
            <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
              <Button variant="outline" className="h-10 rounded-xl px-4" disabled={!!busy} onClick={onDecline}>
                {busy === "decline" && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}Keep my roadmap
              </Button>
              <Button className="h-10 rounded-xl px-4" disabled={!!busy} onClick={onApprove}>
                {busy === "approve" && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}Yes, make this my roadmap
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
