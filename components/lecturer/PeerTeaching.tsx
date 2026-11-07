"use client";
// "Learning by teaching in your cohort": skills students can teach each other, and gaps nobody can teach yet.
import { BookOpen, CheckCircle2, Target } from "lucide-react";
import { skillName } from "@/lib/schemas/community";
import type { PodInsights } from "@/lib/schemas/studio";

const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

export function PeerTeaching({ data }: { data: PodInsights }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-lg font-semibold">Skills your students can already teach each other</h3>
        {data.peerTeachable.length ? (
          <ul className="flex flex-wrap gap-3" aria-label="Skills students can teach each other">
            {data.peerTeachable.map((s) => (
              <li key={s.skillId} data-testid="peer-chip" className="flex flex-col gap-1 rounded-xl border bg-card px-4 py-3 shadow-sm">
                <span className="text-base font-semibold">{skillName(s.skillId)}</span>
                <span className="flex flex-wrap items-center gap-x-1.5 text-sm tabular-nums text-muted-foreground">
                  <CheckCircle2 className="size-3.5 text-status-proven" aria-hidden />
                  <span>{s.teachers} can teach</span>
                  <span aria-hidden>·</span>
                  <Target className="size-3.5 text-status-gap" aria-hidden />
                  <span>{s.learners} want to learn</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">No skill swaps yet: nobody&apos;s proven skill matches another student&apos;s gap.</p>
        )}
      </div>

      <div>
        <h3 className="text-lg font-semibold">Gaps nobody in the cohort can teach yet</h3>
        <p className="mb-3 text-sm text-muted-foreground">This is where your teaching matters most.</p>
        {data.unteachableGaps.length ? (
          <ul className="flex flex-wrap gap-2" aria-label="Gaps nobody in the cohort can teach yet">
            {data.unteachableGaps.map((g) => (
              <li key={g.skillId} className="inline-flex items-center gap-1.5 rounded-full border border-status-gap/25 bg-status-gap/10 px-3 py-1 text-sm">
                <Target className="size-3.5 text-status-gap" aria-hidden />
                <span className="font-medium">{skillName(g.skillId)}</span>
                <span className="tabular-nums text-muted-foreground">· {n(g.studentsWithGap, "student")}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">Every gap in this cohort has at least one peer who can teach it.</p>
        )}
      </div>

      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <BookOpen className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          Why it works: students who expect to teach a topic learn it better (Nestojko, Bui, Kornell &amp; Bjork, 2014,{" "}
          <cite>Memory &amp; Cognition</cite>). {n(data.podsCount, "pod")} in this cohort already {data.podsCount === 1 ? "pairs" : "pair"} students this way.
        </span>
      </p>
    </div>
  );
}
