"use client";
// Industry Radar: pick the role to read. A segmented control in a well; the coral underline marks where you are.
// Wraps onto a second line on phones.
import { Flag } from "lucide-react";
import type { Role } from "@/lib/types";
import { cn } from "@/lib/utils";

export function RoleSwitcher({ roles, value, onChange, primaryRole }: { roles: Role[]; value: string; onChange: (roleId: string) => void; primaryRole?: string }) {
  return (
    <div role="group" aria-label="Choose a role" className="-mx-1 overflow-x-auto px-1 pb-1">
      <div className="flex w-full flex-wrap gap-1 rounded-xl bg-muted p-1 sm:inline-flex sm:w-max sm:flex-nowrap">
        {roles.map((r) => {
          const on = r.id === value;
          return (
            <button
              key={r.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(r.id)}
              className={cn(
                "relative inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-lg px-4 text-base font-medium outline-none transition-[background-color,color,transform] duration-(--dur-short) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px",
                on
                  ? "bg-card text-foreground shadow-sm after:absolute after:inset-x-4 after:bottom-1 after:h-0.5 after:rounded-full after:bg-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {r.name}
              {r.id === primaryRole && <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground"><Flag className="size-3.5" aria-hidden />Your goal</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
