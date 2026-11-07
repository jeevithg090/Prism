import { X } from "lucide-react";
import type { SkillId } from "@/lib/types";

/** Doubles as the chart legend: each chip carries its series colour. */
export function SkillPicker({ slots, names, onRemove }: {
  slots: (SkillId | null)[];
  names: Record<SkillId, string>;
  onRemove: (id: SkillId) => void;
}) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Skills on the chart">
      {slots.map((id, slot) => id && (
        <li key={id} className="inline-flex items-center gap-1.5 rounded-full border border-border py-0.5 pl-2.5 pr-1 text-sm">
          <span aria-hidden className="size-2.5 rounded-full" style={{ background: `var(--series-${slot + 1})` }} />
          {names[id] ?? id}
          <button type="button" aria-label={`Remove ${names[id] ?? id} from the chart`} onClick={() => onRemove(id)} className="rounded-full p-1">
            <X aria-hidden size={14} />
          </button>
        </li>
      ))}
    </ul>
  );
}
