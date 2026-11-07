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
    <div className="space-y-6">
      <StepHeading title="Where you're heading" body="The Market Agent reads real UK job ads for this role, so your plan matches what employers ask for." />
      <ChoiceGroup
        legend="Target role"
        name="ob-role"
        className="md:grid-cols-3"
        value={draft.roleId}
        onChange={(roleId) => set({ roleId })}
        error={errors.roleId}
        options={ROLES.map((r) => ({ value: r.id, label: r.name, description: r.blurb, icon: ROLE_ICON[r.id] }))}
      />
      <ChoiceGroup
        legend="When do you want to be ready?"
        name="ob-timeline"
        className="md:grid-cols-3"
        value={draft.timeline}
        onChange={(timeline) => set({ timeline })}
        error={errors.timeline}
        options={TIMELINES.map((t) => ({ value: t.id, label: t.name, description: t.when }))}
      />
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-4">
          <Label htmlFor="ob-hours">Time you can give it</Label>
          <output htmlFor="ob-hours" className="text-sm text-foreground"><span className="font-mono font-semibold tabular-nums">{draft.hoursPerWeek}</span> hours a week</output>
        </div>
        <input id="ob-hours" type="range" min={2} max={20} step={1} value={draft.hoursPerWeek} aria-valuetext={hoursLabel(draft.hoursPerWeek)}
          onChange={(e) => set({ hoursPerWeek: Number(e.target.value) })}
          className="h-10 w-full cursor-pointer accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl" />
        <p className="text-sm text-muted-foreground">The Roadmap Agent plans every week to fit this, and halves it in exam weeks.</p>
      </div>
    </div>
  );
}
