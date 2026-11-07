"use client";
// Keystone Labs · Verifiable Skill Credential (/labs/credential): the student signs and shares, the employer checks.
// ?share=<id> opens the employer's view of that link straight away.
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BadgeCheck, FileKey2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { IssuePanel } from "./IssuePanel";
import { VerifyPanel } from "./VerifyPanel";

type Mode = "issue" | "verify";
const SHARE_ID = /^[a-f0-9]{24}$/;

export function CredentialSkeleton() {
  return (
    <div role="status" aria-label="Loading your credential" className="space-y-6">
      <Skeleton className="h-11 w-80 max-w-full rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-2"><Skeleton className="h-96 rounded-2xl" /><Skeleton className="h-96 rounded-2xl" /></div>
    </div>
  );
}

const MODES: { id: Mode; label: string; icon: typeof FileKey2 }[] = [
  { id: "issue", label: "Your credential", icon: FileKey2 },
  { id: "verify", label: "Check as an employer", icon: BadgeCheck },
];

export function CredentialStudio() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get("share");
  const shareId = raw && SHARE_ID.test(raw) ? raw : null;
  const [mode, setMode] = React.useState<Mode>(shareId ? "verify" : "issue");
  const [seenShare, setSeenShare] = React.useState(shareId);
  if (shareId !== seenShare) {
    setSeenShare(shareId);
    if (shareId) setMode("verify");
  }

  const openShare = (shareUrl: string) => {
    setMode("verify");
    router.push(shareUrl.startsWith("/") ? shareUrl : `${pathname}?share=${encodeURIComponent(shareUrl)}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <div role="group" aria-label="Choose a view" className="inline-flex w-full flex-col gap-1 rounded-xl border bg-card p-1 shadow-sm sm:w-auto sm:flex-row">
        {MODES.map((m) => {
          const Icon = m.icon;
          const active = mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={active}
              onClick={() => setMode(m.id)}
              className={cn(
                "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                active ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className={cn("size-4", active && "text-primary")} aria-hidden />{m.label}
            </button>
          );
        })}
      </div>
      {mode === "issue" ? <IssuePanel onOpenShare={openShare} /> : <VerifyPanel shareId={shareId} />}
    </div>
  );
}
