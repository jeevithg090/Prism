"use client";
// App shell top bar: persona switcher on the left; readiness pill, Agents button and theme toggle on the right.
// It is the only sticky top:0 element (the sidebar is fixed), on the --z-sticky-nav layer.
import * as React from "react";
import Link from "next/link";
import type { BridgeMap } from "@/lib/types";
import { roleName, useBridgeMap } from "@/components/dashboard/data";
import { ModeToggle } from "@/components/mode/ModeToggle";
import { AgentsButton } from "./ActivityPanel";
import { KeystoneMark } from "./Sidebar";
import { PersonaSwitcher } from "./PersonaSwitcher";
import { ThemeToggle } from "./ThemeToggle";

/** The Agents button lives with the Activity panel it opens; re-exported here for the top bar. */
export { AgentsButton };

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
      className="inline-flex h-10 items-center gap-2 rounded-xl bg-card px-3 text-sm font-medium text-foreground shadow-stock outline-none transition-[box-shadow,transform] duration-(--dur-short) hover:-translate-y-px hover:shadow-stock-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <MiniRing value={map.readinessNow} />
      <span className="sr-only text-muted-foreground lg:not-sr-only">{role} ·</span>{" "}
      <span className="font-mono font-semibold tabular-nums">{pct}%</span>{" "}
      <span className="sr-only">ready. Open your Bridge Map</span>
    </Link>
  );
}

function MiniRing({ value }: { value: number }) {
  return (
    <svg viewBox="0 0 20 20" className="size-5 -rotate-90" aria-hidden focusable="false">
      <circle cx="10" cy="10" r="8" fill="none" strokeWidth="3" className="stroke-paper-3" />
      <circle cx="10" cy="10" r="8" fill="none" strokeWidth="3" strokeLinecap="round" pathLength={100} strokeDasharray="100 100" strokeDashoffset={100 - Math.round(value * 100)} className="stroke-primary" />
    </svg>
  );
}

/** True while a run streams: there are events and the orchestrator hasn't finished or failed. */
export function isRunLive(events: { agent: string; status: string }[]): boolean {
  return events.length > 0 && !events.some((e) => e.agent === "orchestrator" && (e.status === "done" || e.status === "error"));
}

export function TopBar({ readiness }: { readiness?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-(--z-sticky-nav) border-b bg-background">
      <div className="mx-auto flex h-(--topbar-height) w-full max-w-7xl items-center gap-2 px-4 md:px-8">
        <Link href="/dashboard" aria-label="Keystone dashboard" className="rounded-lg outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:hidden">
          <KeystoneMark />
        </Link>
        <PersonaSwitcher className="max-w-[11rem] sm:max-w-none" />
        <div className="ml-auto flex items-center gap-2">
          {readiness}
          <ModeToggle />
          <AgentsButton />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
