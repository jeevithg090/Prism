"use client";
import { Label } from "@/components/ui/label";
import { CheckboxRow, ChoiceGroup, FieldError, StepHeading, ToggleChip, toggle } from "./fields";
import { ACCESSIBILITY, CONSTRAINTS, FORMATS, theorySentence } from "./draft";
import type { StepProps } from "./StepYou";

export function StepLearn({ draft, set, errors }: StepProps) {
  return (
    <div className="space-y-7">
      <StepHeading title="Your Learning DNA" body="Every agent uses this to pick resources and tasks that suit you." />
      <div className="space-y-3 rounded-xl bg-muted p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <Label htmlFor="ob-theory">Theory or practice?</Label>
          <p id="ob-theory-sentence" className="text-base font-medium text-foreground">{theorySentence(draft.theoryPractice)}</p>
        </div>
        <input id="ob-theory" type="range" min={0} max={100} step={10} value={draft.theoryPractice} aria-valuetext={theorySentence(draft.theoryPractice)}
          aria-describedby="ob-theory-sentence" onChange={(e) => set({ theoryPractice: Number(e.target.value) })}
          className="h-10 w-full cursor-pointer rounded-lg accent-primary outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
        <div className="flex justify-between text-sm text-muted-foreground" aria-hidden><span>All theory</span><span>All practice</span></div>
      </div>

      <fieldset className="space-y-2.5" aria-describedby={errors.formats ? "ob-formats-error" : undefined}>
        <legend className="mb-2.5 text-sm font-medium text-foreground">How you like to learn</legend>
        <div className="flex flex-wrap gap-2">
          {FORMATS.map((f) => (
            <ToggleChip key={f.id} pressed={draft.formats.includes(f.id)} onToggle={() => set({ formats: toggle(draft.formats, f.id) })}>{f.name}</ToggleChip>
          ))}
        </div>
        <FieldError id="ob-formats-error" message={errors.formats} />
      </fieldset>

      <ChoiceGroup
        legend="Budget"
        name="ob-budget"
        compact
        className="grid-cols-2"
        value={draft.budget}
        onChange={(budget) => set({ budget })}
        options={[{ value: "free" as const, label: "Free resources only" }, { value: "paid-ok" as const, label: "Paid is OK" }]}
      />

      <fieldset className="space-y-2">
        <legend className="mb-2.5 text-sm font-medium text-foreground">Anything we should plan around?</legend>
        <div className="flex flex-wrap gap-2">
          {CONSTRAINTS.map((c) => (
            <ToggleChip key={c} pressed={draft.constraints.includes(c.toLowerCase())} onToggle={() => set({ constraints: toggle(draft.constraints, c.toLowerCase()) })}>{c}</ToggleChip>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-1">
        <legend className="mb-2.5 text-sm font-medium text-foreground">Accessibility</legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {ACCESSIBILITY.map((a) => (
            <CheckboxRow key={a.id} id={`ob-a11y-${a.id}`} label={a.name} checked={draft.accessibility.includes(a.id)} onChange={() => set({ accessibility: toggle(draft.accessibility, a.id) })} />
          ))}
        </div>
      </fieldset>
    </div>
  );
}
