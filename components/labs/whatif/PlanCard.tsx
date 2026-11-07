"use client";
// One plan's controls (hours, first skill, part-time job, placement) and its outcome, in a single card.
import * as React from "react";
import { Briefcase, Clock, Flag, GraduationCap, Hourglass, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { dayLabel, outOfTen, pct, PLAN_COLOR, type PlanResult, type PlanSpec, type WhatIfContextView } from "./model";

const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card";

function Switch({ id, checked, onChange, label, hint }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <div className="flex min-h-10 items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="font-medium">{label}</label>
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">{hint}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={`${id}-hint`}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors motion-reduce:transition-none",
          checked ? "border-primary bg-primary" : "border-border bg-muted",
          focusRing,
        )}
      >
        <span className={cn("inline-block size-5 rounded-full bg-background shadow-sm transition-transform motion-reduce:transition-none", checked ? "translate-x-6" : "translate-x-1")} aria-hidden />
      </button>
    </div>
  );
}

function Range({ id, label, value, min, max, unit, onChange }: { id: string; label: string; value: number; min: number; max: number; unit: string; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="font-medium">{label}</label>
        <output htmlFor={id} className="font-mono text-lg font-semibold tabular-nums">{value} {unit}</output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-valuetext={`${value} ${unit}`}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn("h-10 w-full cursor-pointer rounded-full accent-primary", focusRing)}
      />
    </div>
  );
}

export function PlanCard({
  spec, result, ctx, onChange, stale,
}: {
  spec: PlanSpec;
  result?: PlanResult;
  ctx: WhatIfContextView;
  onChange: (next: PlanSpec) => void;
  stale: boolean;
}) {
  const id = `plan-${spec.id}`;
  const [label, setLabel] = React.useState(spec.label);
  const [seen, setSeen] = React.useState(spec.label);
  if (seen !== spec.label) {
    setSeen(spec.label);
    setLabel(spec.label);
  }
  const set = (patch: Partial<PlanSpec>) => onChange({ ...spec, ...patch });
  const total = result?.milestones.length ?? ctx.queue.length;
  const firstItem = ctx.queue.find((q) => q.skillId === spec.firstSkillId);
  const firstName = firstItem?.name ?? "";
  const missing = (firstItem?.prereqs ?? []).filter((p) => !p.covered).map((p) => p.name.toLowerCase());
  const placementHint = "10 weeks from 21 June. Self-study pauses; you learn on the job and prove communication and teamwork.";

  return (
    <section aria-labelledby={`${id}-title`} className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="size-3.5 shrink-0 rounded-full" style={{ background: PLAN_COLOR[spec.id] }} aria-hidden />
        <h2 id={`${id}-title`} className="sr-only">Plan {spec.id.toUpperCase()}: {spec.label}</h2>
        <label htmlFor={`${id}-name`} className="sr-only">Plan {spec.id.toUpperCase()} name</label>
        <input
          id={`${id}-name`}
          value={label}
          maxLength={40}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => {
            const clean = label.replace(/[<>{}]/g, "").replace(/\s+/g, " ").trim();
            if (clean && clean !== spec.label) set({ label: clean });
            else setLabel(spec.label);
          }}
          className={cn("h-10 min-w-0 flex-1 rounded-xl border border-transparent bg-transparent px-2 text-xl font-semibold tracking-tight hover:border-border", focusRing)}
        />
      </div>

      <div className="mt-5 space-y-5">
        <Range id={`${id}-hours`} label="Study hours a week" value={spec.hoursPerWeek} min={1} max={20} unit="h" onChange={(v) => set({ hoursPerWeek: v })} />

        <div className="space-y-1">
          <label htmlFor={`${id}-first`} className="font-medium">Learn first</label>
          <select
            id={`${id}-first`}
            value={spec.firstSkillId ?? ""}
            onChange={(e) => {
              const first = e.target.value || null;
              const name = ctx.queue.find((q) => q.skillId === first)?.name;
              const auto = ctx.queue.some((q) => `${q.name} first` === spec.label) || spec.label === "Your roadmap";
              set({ firstSkillId: first, ...(auto && name ? { label: `${name} first` } : {}) });
            }}
            className={cn("h-10 w-full rounded-xl border bg-background px-3", focusRing)}
          >
            {ctx.queue.map((q) => (
              <option key={q.skillId} value={q.skillId}>
                {q.name}, {q.demandPct}% of ads
              </option>
            ))}
          </select>
          {missing.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {firstName} builds on {missing.join(" and ")}, which you haven&apos;t covered yet, so it takes about 1.7 times as long.
            </p>
          )}
        </div>

        <Switch
          id={`${id}-job`}
          checked={spec.jobHoursLost > 0}
          onChange={(v) => set({ jobHoursLost: v ? 4 : 0 })}
          label="Part-time job"
          hint="It costs you study hours every week, except during a placement."
        />
        {spec.jobHoursLost > 0 && (
          <Range id={`${id}-jobh`} label="Study hours the job costs you" value={spec.jobHoursLost} min={1} max={Math.max(1, Math.min(20, spec.hoursPerWeek))} unit="h" onChange={(v) => set({ jobHoursLost: v })} />
        )}

        <Switch id={`${id}-placement`} checked={spec.placement} onChange={(v) => set({ placement: v })} label="Summer placement" hint={placementHint} />
      </div>

      <dl className={cn("mt-6 divide-y border-t transition-opacity motion-reduce:transition-none", stale && "opacity-60")} aria-busy={stale || undefined}>
        <Row icon={Target} term={`Ready by ${ctx.targetLabel}`}>
          {result ? (
            <>
              <span className="font-mono text-2xl font-semibold tabular-nums">{pct(result.final.p50)}</span>
              <span className="text-sm text-muted-foreground"> 8 of 10 futures between {pct(result.final.p10)} and {pct(result.final.p90)}</span>
            </>
          ) : "Simulating"}
        </Row>
        <Row icon={Flag} term="First proof">
          {result?.milestones[0] ? (result.firstProofDate ? `${result.milestones[0].name} by ${dayLabel(result.firstProofDate)}` : `${result.milestones[0].name} not before ${ctx.targetLabel}`) : "Nothing left to prove"}
        </Row>
        <Row icon={GraduationCap} term={`All ${total} roadmap proofs`}>
          {result ? (result.allDoneDate ? `by ${dayLabel(result.allDoneDate)}, in ${outOfTen(result.allDoneShare)} futures` : `${result.milestones.filter((m) => m.date).length} of ${total} land by ${ctx.targetLabel}`) : ""}
        </Row>
        <Row icon={Hourglass} term="Hours you actually need">
          {result ? (result.hoursNeeded === null ? "More than 40 a week with these settings" : `${result.hoursNeeded} a week finishes them in 8 of 10 futures`) : ""}
        </Row>
        {spec.jobHoursLost > 0 && (
          <Row icon={Briefcase} term="After the job">{Math.max(0, spec.hoursPerWeek - spec.jobHoursLost)} study hours a week are left</Row>
        )}
        {result && <Row icon={Clock} term="Hours you plan to spend">{result.plannedHours} by {ctx.targetLabel}</Row>}
      </dl>
    </section>
  );
}

function Row({ icon: Icon, term, children }: { icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>; term: string; children: React.ReactNode }) {
  return (
    <div className="py-3">
      <dt className="flex items-center gap-3 text-sm text-muted-foreground">
        <Icon className="size-4 shrink-0" aria-hidden />
        {term}
      </dt>
      <dd className="mt-0.5 pl-7">{children}</dd>
    </div>
  );
}
