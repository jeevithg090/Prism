"use client";
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { BadgePill } from "@/components/keystone";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiPost } from "@/lib/fetcher";
import type { HelpRequest } from "@/lib/types";
import { KIND_OPTIONS } from "./help";
import { ASK_MESSAGE_ID } from "./HelpFeed";
import { CARD, Region } from "./Region";

const MAX = 1000;

export function AskComposer({ viewerId, newcomer }: { viewerId: string; newcomer: boolean }) {
  const qc = useQueryClient();
  const [message, setMessage] = React.useState("");
  const [kind, setKind] = React.useState<HelpRequest["kind"]>("question");
  const [needsText, setNeedsText] = React.useState(false);
  const empty = message.trim().length === 0;

  const ask = useMutation({
    mutationFn: () => apiPost<HelpRequest>("/api/help", { fromUserId: viewerId, kind, message: message.trim() }),
    onSuccess: () => {
      toast.success("Posted. A helper will pick it up soon.");
      setMessage("");
      void qc.invalidateQueries({ queryKey: ["help"] });
    },
    onError: (e: Error) => toast.error(e.message || "We couldn't post that. Please try again."),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (ask.isPending) return;
    if (empty) {
      // The button stays live; an empty ask points you back to the box instead of greying out.
      setNeedsText(true);
      document.getElementById(ASK_MESSAGE_ID)?.focus();
      return;
    }
    ask.mutate();
  }

  return (
    <Region id="ask-title" title="Ask for help" description="Stuck on something? Other students are happy to explain.">
      <form noValidate onSubmit={onSubmit} className={`space-y-5 p-6 ${CARD}`} aria-label="Ask for help">
        <div className="space-y-2">
          <Label htmlFor={ASK_MESSAGE_ID}>What do you need help with?</Label>
          <Textarea
            id={ASK_MESSAGE_ID}
            value={message}
            maxLength={MAX}
            rows={4}
            onChange={(e) => {
              setMessage(e.target.value);
              if (needsText && e.target.value.trim()) setNeedsText(false);
            }}
            placeholder="e.g. I don’t get Python list comprehensions yet. Could someone walk me through one?"
            aria-invalid={needsText || undefined}
            aria-describedby={[needsText ? "ask-empty-note" : "", newcomer ? "ask-newcomer-note" : ""].filter(Boolean).join(" ") || undefined}
            className="min-h-28 md:text-base"
          />
          <div className="flex items-start justify-between gap-3">
            <p id="ask-empty-note" className="text-sm text-muted-foreground" aria-live="polite">{needsText ? "Write a sentence first." : ""}</p>
            <p className="ml-auto font-mono text-xs text-muted-foreground tabular-nums" aria-live="polite">{message.length}/{MAX}</p>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ask-kind">Kind of help</Label>
          <select
            id="ask-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as HelpRequest["kind"])}
            className="h-10 w-full cursor-pointer rounded-lg border border-input bg-card px-3 text-base text-foreground transition-[background-color,color] duration-(--dur-short) outline-2 -outline-offset-2 outline-transparent hover:bg-paper-2 focus-visible:outline-ring active:bg-paper-3 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {newcomer && (
          <p id="ask-newcomer-note" className="text-sm leading-6 text-pretty text-muted-foreground">
            Your <BadgePill badge="new-to-uni" /> badge tells helpers to explain things in more detail.
          </p>
        )}
        <Button type="submit" size="lg" disabled={ask.isPending} aria-busy={ask.isPending || undefined} className="w-full">
          {ask.isPending ? <Loader2 className="motion-safe:animate-spin" aria-hidden /> : <Send aria-hidden />}
          {ask.isPending ? "Posting…" : "Ask for help"}
        </Button>
      </form>
    </Region>
  );
}
