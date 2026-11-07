"use client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ChoiceGroup, FieldError, StepHeading } from "./fields";
import { UOM_CS_URL, type OnboardDraft, type StepErrors } from "./draft";

export type StepProps = { draft: OnboardDraft; set: (patch: Partial<OnboardDraft>) => void; errors: StepErrors; touch: (field: keyof OnboardDraft) => void };

const inputCls = "h-10 rounded-xl px-3 text-base md:text-base";

export function StepYou({ draft, set, errors, touch }: StepProps) {
  return (
    <div className="space-y-6">
      <StepHeading title="About you" body="Your programme page tells the Syllabus Agent what your degree already teaches." />
      <div className="space-y-2">
        <Label htmlFor="ob-name">Your name</Label>
        <Input id="ob-name" className={inputCls} autoComplete="name" value={draft.name} onChange={(e) => set({ name: e.target.value })} onBlur={() => touch("name")}
          aria-invalid={!!errors.name} aria-describedby={errors.name ? "ob-name-error" : undefined} />
        <FieldError id="ob-name-error" message={errors.name} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ob-uni">University</Label>
        <Input id="ob-uni" className={inputCls} autoComplete="organization" value={draft.university} onChange={(e) => set({ university: e.target.value })} onBlur={() => touch("university")}
          aria-invalid={!!errors.university} aria-describedby={errors.university ? "ob-uni-error" : undefined} />
        <FieldError id="ob-uni-error" message={errors.university} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ob-url">Programme page URL</Label>
        <Input id="ob-url" className={cn(inputCls, "text-sm md:text-base")} type="url" inputMode="url" value={draft.programmeUrl} onChange={(e) => set({ programmeUrl: e.target.value })} onBlur={() => touch("programmeUrl")}
          aria-invalid={!!errors.programmeUrl} aria-describedby={cn("ob-url-help", errors.programmeUrl && "ob-url-error")} />
        <p id="ob-url-help" className="text-sm text-muted-foreground">
          The course page that lists your modules.{" "}
          {draft.programmeUrl !== UOM_CS_URL && (
            <button type="button" className="font-medium text-primary underline-offset-4 hover:underline focus-visible:rounded focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" onClick={() => set({ programmeUrl: UOM_CS_URL, university: "University of Manchester" })}>
              Use the UoM BSc Computer Science page
            </button>
          )}
        </p>
        <FieldError id="ob-url-error" message={errors.programmeUrl} />
      </div>
      <ChoiceGroup
        legend="Year of study"
        name="ob-year"
        compact
        className="grid-cols-2 sm:grid-cols-4"
        value={draft.year}
        onChange={(year) => set({ year })}
        options={[1, 2, 3, 4].map((y) => ({ value: y as OnboardDraft["year"], label: `Year ${y}` }))}
      />
    </div>
  );
}
