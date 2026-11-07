"use client";
import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// Small accessible controls shared by the onboarding steps: native radios/checkboxes under styled
// labels (arrow keys and Space work for free) and aria-pressed toggle chips.

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <p id={id} className="text-sm text-status-gap">{message}</p>;
}

export function StepHeading({ title, body }: { title: string; body: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-xl font-semibold text-balance">{title}</h2>
      <p className="max-w-2xl text-muted-foreground">{body}</p>
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
    <fieldset className="space-y-2" aria-describedby={cn(hint && hintId, error && errId) || undefined}>
      <legend className="text-sm font-medium text-foreground">{legend}</legend>
      {hint && <p id={hintId} className="text-sm text-muted-foreground">{hint}</p>}
      <div className={cn("grid gap-3", className)}>
        {options.map((o) => (
          <label
            key={String(o.value)}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-xl border bg-card transition-colors hover:bg-muted/60",
              "has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-2 has-focus-visible:ring-ring",
              compact ? "min-h-11 items-center justify-center px-3 py-2 text-center" : "p-4",
            )}
          >
            <input type="radio" className="sr-only" name={name} value={String(o.value)} checked={value === o.value} onChange={() => onChange(o.value)} />
            {o.icon && <span className="mt-0.5 shrink-0 text-primary" aria-hidden>{o.icon}</span>}
            <span className="min-w-0 space-y-0.5">
              <span className="block font-medium text-foreground">{o.label}</span>
              {o.description && <span className="block text-sm text-muted-foreground">{o.description}</span>}
            </span>
          </label>
        ))}
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
      className={cn(
        "inline-flex h-10 items-center gap-1.5 rounded-full border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/60",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring",
        pressed && "border-primary bg-primary/10",
      )}
    >
      {pressed && <Check className="size-4 text-primary" aria-hidden />}
      {children}
    </button>
  );
}

export function CheckboxRow({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-xl px-1 text-sm text-foreground">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-5 shrink-0 rounded accent-primary focus-visible:ring-2 focus-visible:ring-ring" />
      {label}
    </label>
  );
}

export function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}
