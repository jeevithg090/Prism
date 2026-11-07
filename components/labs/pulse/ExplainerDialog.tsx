"use client";
// Presenter view: the explainer in projector-sized type while the lecturer talks.
import { Ban, MessageCircleQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import type { Explainer } from "@/lib/labs/pulse/model";

export function ExplainerDialog({ explainer, open, onDone }: { explainer: Explainer | null; open: boolean; onDone: () => void }) {
  return (
    <Dialog open={open && !!explainer} onOpenChange={(o) => { if (!o) onDone(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto p-6 sm:max-w-3xl sm:p-8">
        {explainer && (
          <>
            <DialogTitle className="text-2xl font-semibold tracking-tight md:text-4xl">{explainer.title}</DialogTitle>
            <DialogDescription className="text-base text-muted-foreground">
              About {explainer.minutes} {explainer.minutes === 1 ? "minute" : "minutes"}. Say it in your own words.
            </DialogDescription>
            <ol className="list-decimal space-y-4 pl-6 text-lg leading-relaxed md:text-2xl">
              {explainer.points.map((p) => <li key={p}>{p}</li>)}
            </ol>
            <p className="flex gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4 text-lg md:text-xl">
              <MessageCircleQuestion className="mt-1 size-5 shrink-0 text-primary" aria-hidden />
              <span><span className="font-semibold">Ask the room:</span> {explainer.askTheRoom}</span>
            </p>
            <p className="flex gap-2 text-base text-muted-foreground">
              <Ban className="mt-1 size-4 shrink-0" aria-hidden />{explainer.avoid}
            </p>
            <DialogFooter>
              <Button className="h-11 rounded-xl px-5" onClick={onDone}>Done, back to the board</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
