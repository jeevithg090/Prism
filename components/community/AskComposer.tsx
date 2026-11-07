"use client";
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@/components/keystone";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiPost } from "@/lib/fetcher";
import type { HelpRequest } from "@/lib/types";
import { KIND_OPTIONS } from "./help";
import { ASK_MESSAGE_ID } from "./HelpFeed";

const MAX = 1000;

export function AskComposer({ viewerId, newcomer }: { viewerId: string; newcomer: boolean }) {
  const qc = useQueryClient();
  const [message, setMessage] = React.useState("");
  const [kind, setKind] = React.useState<HelpRequest["kind"]>("question");
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
    if (empty || ask.isPending) return;
    ask.mutate();
  }

  return (
    <SectionCard title="Ask for help" description="Stuck on something? Other students are happy to explain.">
      <form onSubmit={onSubmit} className="space-y-4" aria-label="Ask for help">
        <div className="space-y-2">
          <Label htmlFor={ASK_MESSAGE_ID}>What do you need help with?</Label>
          <Textarea
            id={ASK_MESSAGE_ID}
            value={message}
            maxLength={MAX}
            rows={4}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. I don't get Python list comprehensions yet. Could someone walk me through one?"
            aria-describedby={newcomer ? "ask-newcomer-note" : undefined}
            className="min-h-24 rounded-xl text-base"
          />
          <p className="text-right text-xs text-muted-foreground tabular-nums" aria-live="polite">{message.length}/{MAX}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ask-kind">Kind of help</Label>
          <select
            id="ask-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as HelpRequest["kind"])}
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {newcomer && (
          <p id="ask-newcomer-note" className="rounded-xl bg-status-proven/10 px-3 py-2 text-sm text-status-proven">
            Your 🌱 badge tells helpers to explain things in more detail.
          </p>
        )}
        <Button type="submit" disabled={empty || ask.isPending} className="h-10 w-full focus-visible:ring-2 focus-visible:ring-ring">
          <Send aria-hidden />
          {ask.isPending ? "Posting…" : "Ask for help"}
        </Button>
      </form>
    </SectionCard>
  );
}
