"use client";
// Keystone Labs · Viva Check: re-vivas waiting for you as a pod reviewer. You ask in person; only you can clear it.
import * as React from "react";
import Link from "next/link";
import { ShieldAlert, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { VivaSessionSummary } from "@/lib/labs/viva/model";

const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export function ReviewerQueue({ items, busyId, onDecide }: {
  items: VivaSessionSummary[]; busyId: string | null; onDecide: (id: string, decision: "cleared" | "keep") => void;
}) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="viva-queue-title" className="rounded-2xl border bg-card p-6 shadow-sm">
      <h2 id="viva-queue-title" className="flex items-center gap-2 text-xl font-semibold tracking-tight">
        <UserCheck className="size-5 text-primary" aria-hidden />Re-vivas waiting for you
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        You reviewed these PRs. Ask the student to talk you through the marked lines for five minutes, then decide. The AI never fails anyone.
      </p>
      <ul className="mt-4 divide-y">
        {items.map((s) => (
          <li key={s.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="font-medium">{s.studentName}: PR #{s.prNumber} {s.prTitle}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {s.score !== undefined && s.maxScore !== undefined ? `${s.score} of ${s.maxScore} points on attempt ${s.attempts}. ` : ""}
                {s.weakTopics.length ? `Ask about ${list(s.weakTopics.map((t) => t.toLowerCase()))}.` : ""}
              </p>
              {s.integrity.length > 0 && (
                <p className="mt-1 flex items-start gap-1.5 text-sm">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0 text-status-gap" aria-hidden />{s.integrity[s.integrity.length - 1]}
                </p>
              )}
              <Link href={`/labs/viva?session=${encodeURIComponent(s.id)}`} className="mt-1 inline-block rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Read their answers
              </Link>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="ghost" className="h-10 rounded-xl px-4" disabled={busyId === s.id} onClick={() => onDecide(s.id, "keep")}>Keep open</Button>
              <Button type="button" variant="outline" className="h-10 rounded-xl px-4" disabled={busyId === s.id} onClick={() => onDecide(s.id, "cleared")}>
                They explained it in person
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
