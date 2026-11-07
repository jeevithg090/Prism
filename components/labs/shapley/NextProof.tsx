"use client";
// Readiness Explained · the best next proof: the roadmap proof (or challenge) with the most readiness per hour,
// computed from the same game. The student picks; only their click saves it as a Coach goal.
import * as React from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, FlaskConical, Hand } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import type { Explanation, NextAction } from "@/lib/labs/shapley/model";
import { cn } from "@/lib/utils";
import { fmt1, hoursLabel, signed } from "./format";

export interface NextProofProps {
  x: Explanation;
  onCommit: (action: NextAction) => void;
  pending: boolean;
  savedNote: string | null;
  disabledReason?: string;
}

export function NextProof({ x, onCommit, pending, savedNote, disabledReason }: NextProofProps) {
  const paying = x.next.actions.filter((a) => a.gainPoints > 0);
  const [selectedId, setSelectedId] = React.useState<string | null>(x.next.best?.id ?? null);
  const selected = paying.find((a) => a.id === selectedId) ?? x.next.best;
  const isBest = selected?.id === x.next.best?.id;
  const firstStep = selected ? x.next.actions.find((a) => a.kind === "challenge" && a.skillId === selected.skillId) : undefined;

  if (!selected) {
    return (
      <p className="text-muted-foreground">
        Every skill on your roadmap is already proven, so no single proof raises your readiness right now. Review a teammate&apos;s pull request to keep a skill fresh.
      </p>
    );
  }
  const perWeek = x.next.hoursPerWeek && selected.hours > 0 ? selected.hours / x.next.hoursPerWeek : null;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xl font-semibold tracking-tight text-balance">{selected.skillName}</h3>
        <p className="mt-1">{selected.title}</p>
      </div>
      <div>
        <p className="font-mono text-4xl font-semibold tracking-tight tabular-nums">{signed(selected.gainPoints)}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          readiness points for {hoursLabel(selected.hours)} of roadmap work, so <span className="font-mono tabular-nums text-foreground">{fmt1(selected.pointsPerHour)}</span> points an hour
          {isBest ? ", the most of any step on your plan" : ""}
          {perWeek ? `. At your ${x.next.hoursPerWeek} hours a week that's ${perWeek <= 1 ? "one week" : `about ${Math.ceil(perWeek)} weeks`}.` : "."}
        </p>
      </div>
      <p className="text-sm">{selected.why}</p>

      {firstStep && (
        <div className="flex gap-3 rounded-xl bg-muted/60 p-4 text-sm">
          <FlaskConical className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <div className="space-y-2">
            <p>
              Warm up with the {Math.round(firstStep.hours * 60)}-minute {firstStep.skillName} micro-challenge. It climbs rung 1 (Tried it) and adds 0 points by itself,
              since readiness counts level 2 proof.
            </p>
            <Link href={firstStep.href} className="inline-flex items-center gap-1 rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Try the challenge <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        </div>
      )}

      {savedNote ? (
        <div role="status" className="flex gap-3 rounded-xl border border-status-proven/25 bg-status-proven/10 p-4 text-sm text-foreground">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-status-proven" aria-hidden />
          <div className="space-y-2">
            <p>Saved as a goal your Coach plans around: &ldquo;{savedNote}&rdquo;. You can delete it from the Coach at any time.</p>
            <Link href="/coach" className="inline-flex items-center gap-1 rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Open the Coach <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Button
            className="h-12 w-full rounded-xl px-6 text-base"
            disabled={pending || !!disabledReason}
            onClick={() => onCommit(selected)}
          >
            {pending ? "Saving your choice" : "Make this my next proof"}
          </Button>
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <Hand className="mt-0.5 size-4 shrink-0" aria-hidden />
            {disabledReason ?? "You decide. Keystone saves it as a goal for your Coach, and nothing is sent to anyone."}
          </p>
        </div>
      )}

      {paying.length > 1 && (
        <div>
          <h3 className="font-semibold">Other proofs, by points an hour</h3>
          <ul className="mt-2 divide-y" aria-label="Other next proofs">
            {paying.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  aria-pressed={a.id === selected.id}
                  onClick={() => setSelectedId(a.id)}
                  className={cn(
                    "-mx-2 grid w-[calc(100%+1rem)] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-2.5 text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring",
                    a.id === selected.id && "bg-primary/5",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{a.skillName}{a.week ? <span className="font-normal text-muted-foreground">, roadmap week {a.week}</span> : null}</span>
                    <span className="block text-sm text-muted-foreground">{signed(a.gainPoints)} points for {hoursLabel(a.hours)}</span>
                  </span>
                  <span className="text-right font-mono text-sm tabular-nums">{fmt1(a.pointsPerHour)}<span className="text-muted-foreground"> an hour</span></span>
                </button>
              </li>
            ))}
          </ul>
          <Link href="/roadmap" className={cn(buttonVariants({ variant: "ghost" }), "mt-2 h-10 rounded-xl px-4")}>
            See the full roadmap <ArrowRight aria-hidden />
          </Link>
        </div>
      )}
    </div>
  );
}
