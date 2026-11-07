"use client";
// One task: a real checkbox with its label, type icon, hours, a Free pill and the resource link.
import { BookOpen, Dumbbell, ExternalLink, Hammer, Lightbulb, type LucideIcon } from "lucide-react";
import type { RoadmapTask } from "@/lib/types";
import { cn } from "@/lib/utils";

const TYPE: Record<RoadmapTask["type"], { icon: LucideIcon; label: string }> = {
  learn: { icon: BookOpen, label: "Learn" },
  practice: { icon: Dumbbell, label: "Practise" },
  build: { icon: Hammer, label: "Build" },
  primer: { icon: Lightbulb, label: "Primer" },
};

export function TaskRow({ task, onToggle, disabled }: { task: RoadmapTask; onToggle: (done: boolean) => void; disabled?: boolean }) {
  const t = TYPE[task.type];
  const Icon = t.icon;
  const id = `task-${task.id}`;
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-3">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <input
          id={id}
          type="checkbox"
          checked={!!task.done}
          disabled={disabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="mt-0.5 size-5 shrink-0 cursor-pointer rounded accent-[var(--primary)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <label htmlFor={id} className={cn("min-w-0 flex-1 cursor-pointer text-base", task.done && "text-muted-foreground line-through decoration-1")}>
          <span className="mr-2 inline-flex items-center gap-1 align-[-2px] text-sm font-medium text-muted-foreground">
            <Icon className="size-4" aria-hidden />{t.label}
          </span>
          {task.title}
        </label>
      </div>
      <div className="flex items-center gap-2 pl-8 text-sm sm:pl-0">
        <span className="font-mono tabular-nums text-muted-foreground">{task.hours}h</span>
        {task.free && <span className="rounded-full border border-status-proven/25 bg-status-proven/10 px-2 py-0.5 text-xs font-medium text-foreground">Free</span>}
        {task.resourceUrl && (
          <a
            href={task.resourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2 font-medium text-primary outline-none hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring"
          >
            Open <ExternalLink className="size-3.5" aria-hidden />
            <span className="sr-only">{task.title} (opens in a new tab)</span>
          </a>
        )}
      </div>
    </li>
  );
}
