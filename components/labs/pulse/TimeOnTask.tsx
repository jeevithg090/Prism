"use client";
// Time on task: minutes since each student's last step forward (a criterion turning green), as counts.
import type { TimeBucket } from "@/lib/labs/pulse/model";
import { cn } from "@/lib/utils";

const TONE: Record<TimeBucket["id"], string> = {
  "not-started": "bg-border",
  lt2: "bg-chart-1",
  "2to4": "bg-chart-1",
  "4to6": "bg-status-rising",
  "6plus": "bg-status-gap",
  finished: "bg-status-proven",
};

export function timeSummary(buckets: TimeBucket[], n: number): string {
  const get = (id: TimeBucket["id"]) => buckets.find((b) => b.id === id)?.students ?? 0;
  const long = get("4to6") + get("6plus");
  const done = get("finished");
  const parts = [`${done} of ${n} have finished every criterion`];
  parts.push(long ? `${long} haven't moved forward for 4 minutes or more` : "nobody has gone 4 minutes without a step forward");
  return `${parts.join("; ")}.`;
}

export function TimeOnTask({ buckets, cohortSize }: { buckets: TimeBucket[]; cohortSize: number }) {
  const max = Math.max(1, ...buckets.map((b) => b.students));
  return (
    <figure className="space-y-3">
      <ul className="space-y-2.5">
        {buckets.map((b) => (
          <li key={b.id} className="grid grid-cols-[minmax(0,10rem)_1fr_2.5rem] items-center gap-3 text-sm">
            <span className="truncate" title={b.label}>{b.label}</span>
            <span className="h-3 overflow-hidden rounded-full bg-muted" aria-hidden>
              <span
                className={cn("block h-full rounded-full motion-safe:transition-[width] motion-safe:duration-300", TONE[b.id])}
                style={{ width: `${(b.students / max) * 100}%` }}
              />
            </span>
            <span className="text-right font-mono font-semibold tabular-nums">{b.students}</span>
          </li>
        ))}
      </ul>
      <figcaption className="text-sm text-muted-foreground" aria-live="polite">{timeSummary(buckets, cohortSize)}</figcaption>
    </figure>
  );
}
