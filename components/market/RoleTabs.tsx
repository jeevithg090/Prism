import type { Role } from "@/lib/types";

export function RoleTabs({ roles, value, onChange }: { roles: Role[]; value: string; onChange: (id: string) => void }) {
  return (
    <div role="group" aria-label="Choose a role" className="flex gap-2 overflow-x-auto pb-1">
      {roles.map((role) => {
        const active = role.id === value;
        return (
          <button
            key={role.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(role.id)}
            className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-medium ${
              active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
            }`}
          >
            {role.name}
          </button>
        );
      })}
    </div>
  );
}
