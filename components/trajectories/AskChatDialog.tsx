"use client";
// P5 · "Ask for 15 minutes": draft (LLM or template) → editable → POST /api/help (kind chat-15). Stays inside Keystone.
import * as React from "react";
import { toast } from "sonner";
import { Loader2, Lock, Send } from "lucide-react";
import type { HelpRequest, Trajectory } from "@/lib/types";
import { apiPost } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { draftChatRequest } from "./actions";

export function AskChatDialog({
  trajectory, viewerId, open, onOpenChange,
}: {
  trajectory: Trajectory | null;
  viewerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // The draft is keyed by who you're asking, so re-opening keeps your edits and a new senior gets a fresh draft.
  const key = trajectory ? `${viewerId}:${trajectory.id}` : "";
  const [draft, setDraft] = React.useState<{ key: string; message: string } | null>(null);
  const [sending, setSending] = React.useState(false);
  const first = trajectory ? trajectory.name.split(/\s+/)[0] : "";
  const hasDraft = draft?.key === key;
  const drafting = open && !!trajectory && !hasDraft;
  const message = hasDraft ? draft.message : "";
  const setMessage = (m: string) => setDraft({ key, message: m });
  const textareaId = React.useId();
  const hintId = React.useId();

  React.useEffect(() => {
    if (!open || !trajectory || hasDraft) return;
    let cancelled = false;
    draftChatRequest({ viewerId, trajectory })
      .then((r) => { if (!cancelled) setDraft({ key, message: r.draft }); })
      .catch(() => {
        if (!cancelled) setDraft({ key, message: `Hi ${first}, could I ask you a few questions about your journey in a 15-minute chat? Totally fine if you're busy. Thank you!` });
      });
    return () => { cancelled = true; };
  }, [open, trajectory, viewerId, key, hasDraft, first]);

  async function send() {
    if (!trajectory || !message.trim()) return;
    setSending(true);
    try {
      await apiPost<HelpRequest>("/api/help", { fromUserId: viewerId, toUserId: trajectory.userId, kind: "chat-15", message: message.trim() });
      toast.success("Request sent: they'll see it in Community.");
      setDraft(null);
      onOpenChange(false);
    } catch {
      toast.error("Couldn't send your request. Your message is still here, so you can try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => onOpenChange(o)}>
      <DialogContent className="gap-5 p-6 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Ask {first} for 15 minutes</DialogTitle>
          <DialogDescription className="text-[15px]">
            We drafted a short note for you. Make it yours: a specific question gets a kinder, faster reply.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor={textareaId} className="text-[15px]">Your message to {first}</Label>
          {drafting ? (
            <div aria-busy="true" aria-live="polite" className="space-y-2">
              <span className="sr-only">Drafting your message…</span>
              <Skeleton className="h-4 w-full rounded" />
              <Skeleton className="h-4 w-11/12 rounded" />
              <Skeleton className="h-4 w-2/3 rounded" />
            </div>
          ) : (
            <Textarea
              id={textareaId}
              aria-describedby={hintId}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              maxLength={1000}
              className="min-h-36 rounded-xl text-base leading-relaxed md:text-base"
            />
          )}
          <p id={hintId} className="flex items-start gap-2 text-sm text-muted-foreground">
            <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Keystone never sends anything outside the app. {first} will see your request in their Community feed and can reply there.
          </p>
        </div>

        <DialogFooter className="-mx-6 -mb-6 rounded-b-2xl px-6">
          <Button variant="outline" size="lg" className="h-10 rounded-xl" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="lg" className="h-10 rounded-xl px-4" onClick={send} disabled={drafting || sending || !message.trim()}>
            {sending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
            Send request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
