"use client";
import { useState } from "react";
import { BadgeCheck } from "lucide-react";
import type { BridgeNode, RoadmapWeek } from "@/lib/types";
import { ReceiptDrawer, SkillChip } from "@/components/keystone";
import { TaskRow } from "@/components/roadmap/TaskRow";
export function WeekCard({ week, skill, done, onTaskChange, current }: { week: RoadmapWeek; skill: BridgeNode; done: Record<string, boolean>; onTaskChange: (taskId: string, value: boolean) => void; current: boolean }) {
  const [receiptOpen, setReceiptOpen] = useState(false);
  const date = new Date(`${week.startDate}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return <article id={`skill-${week.focusSkillId}`} className={`rounded-2xl border border-border bg-card p-5 shadow-sm ${current ? "ring-2 ring-primary" : ""}`}>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">Week {week.week} · {date} {current && <span className="ml-2 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">This week</span>}</p>{week.isExamWeek && <p className="mt-1 text-sm text-muted-foreground">Lighter week: exams</p>}</div><span className="text-sm text-muted-foreground">{week.tasks.reduce((sum, task) => sum + task.hours, 0)}h</span></div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><SkillChip skillId={skill.skillId} name={skill.name} status={skill.status} level={skill.level}/><button onClick={() => setReceiptOpen(true)} className="min-h-10 rounded-xl px-3 text-sm font-medium text-primary hover:bg-primary/5">Why?</button></div>
    <div className="mt-4 space-y-3">{week.tasks.map((task) => <TaskRow key={task.id} task={task} checked={done[task.id] ?? Boolean(task.done)} onChange={(value) => onTaskChange(task.id, value)}/>)}</div>
    <p className="mt-4 flex items-start gap-2 text-sm"><BadgeCheck size={18} className="shrink-0 text-status-proven"/><span><strong>Proof:</strong> {week.proof}</span></p>{week.degreeLink && <p className="mt-2 text-xs text-muted-foreground">{week.degreeLink}</p>}
    <ReceiptDrawer open={receiptOpen} onOpenChange={setReceiptOpen} title={`Week ${week.week} · ${skill.name}`} receipt={week.receipt}/>
  </article>;
}
