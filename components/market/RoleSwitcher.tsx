"use client";
// Industry Radar: pick the role to read (pill toggles, scrolls sideways on phones).
import type { Role } from "@/lib/types";
import { cn } from "@/lib/utils";

export function RoleSwitcher({ roles, value, onChange, primaryRole }: { roles: Role[]; value: string; onChange: (roleId: string) => void; primaryRole?: string }) {
  return (
    <div role="group" aria-label="Choose a role" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {roles.map((r) => {
        const on = r.id === value;
        return (
          <button
            key={r.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(r.id)}
            className={cn(
              "inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-base font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              on ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
            )}
          >
            {r.name}
            {r.id === primaryRole && <span className={cn("rounded-full px-2 py-0.5 text-xs", on ? "bg-primary-foreground text-primary" : "bg-primary/10 text-foreground")}>Your goal</span>}
          </button>
        );
      })}
    </div>
  );
}
