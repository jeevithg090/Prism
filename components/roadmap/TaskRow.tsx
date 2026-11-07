"use client";
// One task: a real checkbox with its label, type icon, hours, a Free tag and the resource link.
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
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <input
          id={id}
          type="checkbox"
          checked={!!task.done}
          disabled={disabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="mt-0.5 size-5 shrink-0 cursor-pointer rounded accent-primary outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-95 disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:active:scale-100"
        />
        <label htmlFor={id} className={cn("min-w-0 flex-1 cursor-pointer text-base text-pretty", task.done && "text-muted-foreground line-through decoration-1")}>
          <span className="mr-2 inline-flex items-center gap-1 align-[-2px] text-sm font-medium text-muted-foreground">
            <Icon className="size-4" aria-hidden />{t.label}
          </span>
          {task.title}
        </label>
      </div>
      <div className="flex items-center gap-3 pl-8 text-sm sm:grid sm:shrink-0 sm:grid-cols-[2rem_3rem_4.5rem] sm:pl-0">
        <span className="text-muted-foreground tabular-nums sm:text-right">{task.hours}h</span>
        {task.free ? <span className="inline-flex h-6 w-fit items-center rounded-md border border-input bg-card px-2 text-xs font-medium text-foreground">Free</span> : <span aria-hidden className="hidden sm:block" />}
        {task.resourceUrl && (
          <a
            href={task.resourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-1 rounded-lg px-2 font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px"
          >
            Open <ExternalLink className="size-3.5" aria-hidden />
            <span className="sr-only">{task.title} (opens in a new tab)</span>
          </a>
        )}
      </div>
    </li>
  );
}
