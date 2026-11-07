"use client";
// [Copy link] and the opt-in public toggle (private by default; only the owner sees the toggle).
import * as React from "react";
import { Globe, Link2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function passportUrl(userId: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/profile/${encodeURIComponent(userId)}`;
}

export function ShareControls({ userId, isOwner, isPublic, onToggle, saving }: {
  userId: string; isOwner: boolean; isPublic: boolean; onToggle: (next: boolean) => void; saving: boolean;
}) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(passportUrl(userId));
      toast.success("Link copied", {
        description: isPublic || !isOwner
          ? "Anyone with the link can see this passport."
          : "Your passport is private, so only you can open the link. Turn on Public passport to share it.",
      });
    } catch {
      toast.error("Couldn't copy the link", { description: "Copy it from your browser's address bar instead." });
    }
  }

  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center print:hidden">
      {isOwner && (
        <div className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2">
          <button
            type="button"
            role="switch"
            aria-checked={isPublic}
            aria-labelledby="public-passport-label"
            aria-describedby="public-passport-hint"
            disabled={saving}
            onClick={() => onToggle(!isPublic)}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60",
              isPublic ? "bg-primary" : "bg-input",
            )}
          >
            <span aria-hidden className={cn("inline-block size-5 rounded-full bg-background shadow-sm transition-transform", isPublic ? "translate-x-5" : "translate-x-0")} />
          </button>
          <div className="min-w-0">
            <p id="public-passport-label" className="flex items-center gap-1.5 text-sm font-medium">
              {isPublic ? <Globe className="size-4 text-primary" aria-hidden /> : <Lock className="size-4 text-muted-foreground" aria-hidden />}
              Public passport
            </p>
            <p id="public-passport-hint" className="text-xs text-muted-foreground">
              {isPublic ? "On: anyone with the link can see it" : "Off: only you can see it"}
            </p>
          </div>
        </div>
      )}
      <Button size="lg" onClick={copy} className="h-11 px-5 text-base">
        <Link2 aria-hidden /> Copy link
      </Button>
    </div>
  );
}
