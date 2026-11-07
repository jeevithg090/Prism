"use client";
import { BookOpen, Dumbbell, Hammer, Lightbulb } from "lucide-react";
import type { RoadmapTask } from "@/lib/types";
const icons = { learn: BookOpen, practice: Dumbbell, build: Hammer, primer: Lightbulb };
export function TaskRow({ task, checked, onChange }: { task: RoadmapTask; checked: boolean; onChange: (done: boolean) => void }) {
  const Icon = icons[task.type];
  return <label className="flex items-start gap-3 rounded-xl bg-background p-3"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1 size-4"/><Icon size={18} className="mt-0.5 text-primary" aria-hidden="true"/><span className={`flex-1 text-sm ${checked ? "text-muted-foreground line-through" : ""}`}>{task.title}<small className="mt-1 block text-muted-foreground">{task.hours}h · {task.free ? "Free" : "Paid resource"}{task.resourceUrl && <> · <a className="text-primary underline" href={task.resourceUrl} target="_blank" rel="noreferrer">Open ↗</a></>}</small></span></label>;
}
