"use client";
// App shell top bar (contract §9.4): persona switcher · readiness pill · Agents button · theme toggle.
import * as React from "react";
import Link from "next/link";
import { Workflow } from "lucide-react";
import type { BridgeMap } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useActivity } from "@/components/shell/ActivityPanel";
import { roleName, useBridgeMap } from "@/components/dashboard/data";
import { KeystoneMark } from "./Sidebar";
import { PersonaSwitcher } from "./PersonaSwitcher";
import { ThemeToggle } from "./ThemeToggle";

/** "ML engineer · 38%" for the viewer's primary role. Hidden when there is no map yet. */
export function ReadinessPill({ userId, roleId, initial }: { userId: string; roleId: string; initial: BridgeMap | null }) {
  const q = useBridgeMap(userId, roleId, initial);
  const map = q.data;
  if (!map) return null;
  const pct = Math.round(map.readinessNow * 100);
  const role = roleName(map.roleId || roleId);
  return (
    <Link
      href="/map"
      className="inline-flex h-10 items-center gap-2 rounded-full border bg-card px-3 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
    >
      <MiniRing value={map.readinessNow} />
      <span className="sr-only lg:not-sr-only">{role} ·</span>{" "}
      <span className="font-mono font-semibold tabular-nums">{pct}%</span>{" "}
      <span className="sr-only">ready. Open your Bridge Map</span>
    </Link>
  );
}

function MiniRing({ value }: { value: number }) {
  return (
    <svg viewBox="0 0 20 20" className="size-5 -rotate-90" aria-hidden focusable="false">
      <circle cx="10" cy="10" r="8" fill="none" strokeWidth="3" className="stroke-muted" />
      <circle cx="10" cy="10" r="8" fill="none" strokeWidth="3" strokeLinecap="round" pathLength={100} strokeDasharray="100 100" strokeDashoffset={100 - Math.round(value * 100)} className="stroke-primary" />
    </svg>
  );
}

/** True while a run streams: there are events and the orchestrator hasn't finished or failed. */
export function isRunLive(events: { agent: string; status: string }[]): boolean {
  return events.length > 0 && !events.some((e) => e.agent === "orchestrator" && (e.status === "done" || e.status === "error"));
}

export function AgentsButton() {
  const { events, open, setOpen } = useActivity();
  const live = isRunLive(events);
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-haspopup="dialog"
      aria-expanded={open}
      data-live={live || undefined}
      className={cn(
        "relative inline-flex h-10 items-center gap-2 rounded-xl border bg-card px-3 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
        live && "border-primary/40 text-primary",
      )}
    >
      <span className="relative flex">
        <Workflow className="size-5" aria-hidden />
        {live && (
          <span aria-hidden className="absolute -top-0.5 -right-0.5 flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
          </span>
        )}
      </span>
      <span className="sr-only sm:not-sr-only">Agents</span>
      {live && <span className="sr-only">, running now</span>}
    </button>
  );
}

export function TopBar({ readiness }: { readiness?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-2 px-4 md:px-8">
        <Link href="/dashboard" aria-label="Keystone dashboard" className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden">
          <KeystoneMark />
        </Link>
        <PersonaSwitcher className="max-w-[11rem] sm:max-w-none" />
        <div className="ml-auto flex items-center gap-2">
          {readiness}
          <AgentsButton />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
