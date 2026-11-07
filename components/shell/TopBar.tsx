"use client";

import { Sparkles } from "lucide-react";
import { useActivity } from "@/components/shell/ActivityPanel";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { PersonaSwitcher } from "@/components/shell/PersonaSwitcher";
import { Button } from "@/components/ui/button";

export function TopBar() {
  const activity = useActivity();
  const active = Boolean(activity.runId) && !activity.events.some((event) => event.agent === "orchestrator" && ["done", "error"].includes(event.status));
  return <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur md:px-8">
    <PersonaSwitcher/>
    <div className="flex items-center gap-2"><span className="hidden rounded-full border border-border bg-card px-3 py-2 text-xs sm:inline">ML engineer · <strong>38%</strong></span><ThemeToggle/><Button onClick={() => activity.setOpen(true)} className={active ? "animate-pulse ring-2 ring-primary/40" : ""}><Sparkles size={17}/><span className="hidden sm:inline">Agents</span></Button></div>
  </header>;
}
