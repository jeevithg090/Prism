"use client";
// "Learning by teaching in your cohort": skills students can teach each other, and gaps nobody can teach yet.
import { BookOpen, CheckCircle2, Target } from "lucide-react";
import { StatusBadge } from "@/components/keystone";
import { skillName } from "@/lib/schemas/community";
import type { PodInsights } from "@/lib/schemas/studio";

const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

export function PeerTeaching({ data }: { data: PodInsights }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0">
          <h3 className="mb-3 text-lg font-semibold text-foreground">Skills your students can already teach each other</h3>
          {data.peerTeachable.length ? (
            <table className="w-full table-fixed border-collapse" aria-label="Skills students can teach each other">
              <colgroup>
                <col />
                <col className="w-20 sm:w-32" />
                <col className="w-20 sm:w-36" />
              </colgroup>
              <thead>
                <tr className="text-sm text-muted-foreground">
                  <th scope="col" className="pb-3 text-left font-medium">Skill</th>
                  <th scope="col" className="pb-3 text-right font-medium">
                    <span className="inline-flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-1.5 sm:whitespace-nowrap">
                      <CheckCircle2 className="size-4 shrink-0 text-status-proven" aria-hidden />
                      Can teach
                    </span>
                  </th>
                  <th scope="col" className="pb-3 text-right font-medium">
                    <span className="inline-flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-1.5 sm:whitespace-nowrap">
                      <Target className="size-4 shrink-0 text-status-gap" aria-hidden />
                      Want to learn
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.peerTeachable.map((s) => (
                  <tr key={s.skillId} data-testid="peer-chip" className="border-t">
                    <th scope="row" className="py-2.5 pr-3 text-left text-base font-semibold break-words text-foreground">{skillName(s.skillId)}</th>
                    <td className="py-2.5 text-right font-mono text-lg text-foreground tabular-nums">
                      {s.teachers}<span className="sr-only"> can teach</span>
                    </td>
                    <td className="py-2.5 text-right font-mono text-lg text-foreground tabular-nums">
                      {s.learners}<span className="sr-only"> want to learn</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-muted-foreground">No skill swaps yet: nobody&apos;s proven skill matches another student&apos;s gap.</p>
          )}
        </div>

        <div className="min-w-0 self-start rounded-xl bg-muted p-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-lg font-semibold text-foreground">Gaps nobody in the cohort can teach yet</h3>
            <span className="mt-0.5 shrink-0"><StatusBadge status="gap" /></span>
          </div>
          <p className="mb-3 text-sm text-muted-foreground">This is where your teaching matters most.</p>
          {data.unteachableGaps.length ? (
            <table className="w-full table-fixed border-collapse" aria-label="Gaps nobody in the cohort can teach yet">
              <colgroup>
                <col />
                <col className="w-24" />
              </colgroup>
              <thead>
                <tr className="text-sm text-muted-foreground">
                  <th scope="col" className="pb-2 text-left font-medium">Skill</th>
                  <th scope="col" className="pb-2 text-right font-medium">Students</th>
                </tr>
              </thead>
              <tbody>
                {data.unteachableGaps.map((g) => (
                  <tr key={g.skillId} className="border-t border-rule-2">
                    <th scope="row" className="truncate py-2.5 pr-3 text-left text-base font-medium text-foreground">{skillName(g.skillId)}</th>
                    <td className="py-2.5 text-right font-mono text-base text-foreground tabular-nums">
                      {g.studentsWithGap}<span className="sr-only">{g.studentsWithGap === 1 ? " student" : " students"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-muted-foreground">Every gap in this cohort has at least one peer who can teach it.</p>
          )}
        </div>
      </div>

      <p className="flex items-start gap-2 border-t pt-4 text-sm text-muted-foreground">
        <BookOpen className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span className="max-w-[80ch]">
          Why it works: students who expect to teach a topic learn it better (Nestojko, Bui, Kornell &amp; Bjork, 2014,{" "}
          <cite>Memory &amp; Cognition</cite>). {n(data.podsCount, "pod")} in this cohort already {data.podsCount === 1 ? "pairs" : "pair"} students this way.
        </span>
      </p>
    </div>
  );
}
