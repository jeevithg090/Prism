"use client";
import * as React from "react";
import { Check, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Small accessible controls shared by the onboarding steps: native radios/checkboxes under styled
// labels (arrow keys and Space work for free) and aria-pressed toggle chips.
// Selected = a coral edge, a coral check and a heavier label (colour, icon and weight, never a fill), so a
// chosen option never reads as merely focused: coral marks what is yours.

/** One hover signal, one press, an instant focus ring: the cotton choice surface every step shares. */
export const choiceSurface =
  "cursor-pointer rounded-xl border bg-card text-foreground outline-none transition-[background-color,border-color,transform] duration-(--dur-short) hover:bg-muted active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-55";
export const choiceOn = "border-primary ring-1 ring-inset ring-primary hover:bg-card";

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <p id={id} className="text-sm text-status-gap">{message}</p>;
}

export function StepHeading({ title, body }: { title: string; body: string }) {
  return (
    <div className="space-y-1.5">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <p className="max-w-[60ch] text-pretty text-muted-foreground">{body}</p>
    </div>
  );
}

type Choice<T extends string | number> = { value: T; label: string; description?: string; icon?: React.ReactNode };

export function ChoiceGroup<T extends string | number>({ legend, name, options, value, onChange, error, hint, className, compact }: {
  legend: string; name: string; options: Choice<T>[]; value: T | ""; onChange: (v: T) => void;
  error?: string; hint?: string; className?: string; compact?: boolean;
}) {
  const errId = `${name}-error`;
  const hintId = `${name}-hint`;
  return (
    <fieldset className="space-y-2.5" aria-describedby={cn(hint && hintId, error && errId) || undefined}>
      <legend className="mb-2.5 text-sm font-medium text-foreground">{legend}</legend>
      {hint && <p id={hintId} className="text-sm text-muted-foreground">{hint}</p>}
      <div className={cn("grid gap-3", className)}>
        {options.map((o) => {
          const on = value === o.value;
          return (
            <label
              key={String(o.value)}
              className={cn(
                choiceSurface,
                "relative flex has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring",
                on && choiceOn,
                error && !on && "border-status-gap/60",
                compact ? "min-h-11 items-center justify-center gap-1.5 px-3 py-2 text-center" : "items-start gap-3 p-4 pr-11",
              )}
            >
              <input type="radio" className="sr-only" name={name} value={String(o.value)} checked={on} onChange={() => onChange(o.value)} />
              {on && compact && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
              {o.icon && <span className={cn("mt-0.5 shrink-0", on ? "text-foreground" : "text-muted-foreground")} aria-hidden>{o.icon}</span>}
              <span className="min-w-0 space-y-1">
                <span className={cn("block", compact ? (on ? "font-semibold" : "font-medium") : "text-base font-semibold")}>{o.label}</span>
                {o.description && <span className="block text-sm text-pretty text-muted-foreground">{o.description}</span>}
              </span>
              {on && !compact && <CheckCircle2 className="absolute top-4 right-4 size-5 text-primary" aria-hidden />}
            </label>
          );
        })}
      </div>
      <FieldError id={errId} message={error} />
    </fieldset>
  );
}

export function ToggleChip({ pressed, onToggle, children }: { pressed: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={cn(choiceSurface, "inline-flex h-10 items-center gap-1.5 px-4 text-sm font-medium", pressed && choiceOn)}
    >
      {pressed && <Check className="size-4 text-primary" aria-hidden />}
      {children}
    </button>
  );
}

export function CheckboxRow({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-1 text-sm text-foreground transition-[background-color] duration-(--dur-short) hover:bg-muted">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-5 shrink-0 cursor-pointer rounded accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
      {label}
    </label>
  );
}

export function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}
