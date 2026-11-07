"use client";
import { BarChart3, BrainCircuit, Code2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { ChoiceGroup, StepHeading } from "./fields";
import { hoursLabel, ROLES, TIMELINES, type RoleId } from "./draft";
import type { StepProps } from "./StepYou";

const ROLE_ICON: Record<RoleId, React.ReactNode> = {
  "ml-engineer": <BrainCircuit className="size-5" />,
  "software-engineer": <Code2 className="size-5" />,
  "data-analyst": <BarChart3 className="size-5" />,
};

export function StepGoal({ draft, set, errors }: StepProps) {
  return (
    <div className="space-y-7">
      <StepHeading title="Where you're heading" body="The Market Agent reads real UK job ads for this role, so your plan matches what employers ask for." />
      <ChoiceGroup
        legend="Target role"
        name="ob-role"
        value={draft.roleId}
        onChange={(roleId) => set({ roleId })}
        error={errors.roleId}
        options={ROLES.map((r) => ({ value: r.id, label: r.name, description: r.blurb, icon: ROLE_ICON[r.id] }))}
      />
      <ChoiceGroup
        legend="When do you want to be ready?"
        name="ob-timeline"
        className="sm:grid-cols-3"
        value={draft.timeline}
        onChange={(timeline) => set({ timeline })}
        error={errors.timeline}
        options={TIMELINES.map((t) => ({ value: t.id, label: t.name, description: t.when }))}
      />
      <div className="space-y-3 rounded-xl bg-muted p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <Label htmlFor="ob-hours">Time you can give it</Label>
          <output htmlFor="ob-hours" className="flex items-baseline gap-2 text-sm text-muted-foreground"><span className="font-mono text-3xl font-semibold tabular-nums text-foreground">{draft.hoursPerWeek}</span> hours a week</output>
        </div>
        <input id="ob-hours" type="range" min={2} max={20} step={1} value={draft.hoursPerWeek} aria-valuetext={hoursLabel(draft.hoursPerWeek)}
          onChange={(e) => set({ hoursPerWeek: Number(e.target.value) })}
          className="h-10 w-full cursor-pointer rounded-lg accent-primary outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
        <p className="text-sm text-muted-foreground">The Roadmap Agent plans every week to fit this, and halves it in exam weeks.</p>
      </div>
    </div>
  );
}
