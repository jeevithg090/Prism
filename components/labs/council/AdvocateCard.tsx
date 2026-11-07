"use client";
// One seat on the Agent Council: its stance, opening argument, receipts, proposed change and one rebuttal.
import { CornerDownRight, FileText, Sparkles, Wrench } from "lucide-react";
import { AgentAvatar } from "@/components/keystone";
import { cn } from "@/lib/utils";
import { SEAT_ARGUES_FROM, SEAT_LABEL, signed, type CouncilArgument, type Rebuttal } from "@/lib/labs/council/types";
import { seatAgentLabel, STANCE_META, stanceFor } from "./meta";

export function StancePill({ score, className }: { score: number; className?: string }) {
  const m = STANCE_META[stanceFor(score)];
  const Icon = m.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground", m.tint, className)}>
      <Icon className={cn("size-4 shrink-0", m.icon_)} aria-hidden />
      {m.label}
    </span>
  );
}

export function AdvocateCard({ arg, finalScore, rebuttal }: { arg: CouncilArgument; finalScore: number; rebuttal?: Rebuttal }) {
  const moved = Math.round((finalScore - arg.score) * 100) / 100;
  const titleId = `seat-${arg.seat}`;
  return (
    <article aria-labelledby={titleId} className="flex h-full flex-col rounded-2xl border bg-card p-6 shadow-sm">
      <header className="flex items-start gap-3">
        <AgentAvatar agent={arg.agent as Parameters<typeof AgentAvatar>[0]["agent"]} size={40} />
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="text-xl font-semibold tracking-tight">{SEAT_LABEL[arg.seat]}</h3>
          <p className="text-sm text-muted-foreground">Run by the {seatAgentLabel(arg.seat)}, arguing from {SEAT_ARGUES_FROM[arg.seat]}</p>
        </div>
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <StancePill score={finalScore} />
        <p className="text-sm text-muted-foreground">
          <span className="font-mono text-base font-semibold text-foreground tabular-nums">{signed(finalScore)}</span>
          {" "}on a scale of −1 against to +1 for
          {moved !== 0 && <span>{`, ${signed(arg.score)} before rebuttals`}</span>}
        </p>
      </div>

      <p className="mt-4 text-lg leading-snug font-semibold text-balance">{arg.headline}</p>
      <p className="mt-2 text-base text-muted-foreground">{arg.body}</p>
      {arg.polished && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <Sparkles className="size-4" aria-hidden />Reworded by the language model; every number checked against the receipts
        </p>
      )}

      <h4 className="mt-5 text-sm font-medium text-muted-foreground">Receipts</h4>
      <ul className="mt-2 space-y-3">
        {arg.receipts.map((r) => (
          <li key={`${r.ref}-${r.label}`} className="flex gap-2.5">
            <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm text-foreground">{r.label}</p>
              <p className="text-xs text-muted-foreground" title={r.ref}>{r.source}</p>
            </div>
          </li>
        ))}
      </ul>

      {arg.adjustment && (
        <div className="mt-5 flex gap-2.5 rounded-xl bg-muted/60 p-4">
          <Wrench className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <p className="text-sm"><span className="font-medium">Proposes: </span>{arg.adjustment.text}.</p>
        </div>
      )}

      <div className="mt-auto pt-5">
        <div className="border-t pt-4">
          {rebuttal ? (
            <div className="flex gap-2.5">
              <CornerDownRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-medium">Rebuts the {SEAT_LABEL[rebuttal.target].toLowerCase()}</p>
                <p className="mt-1 text-sm text-muted-foreground">{rebuttal.text}</p>
                <p className="mt-1 text-sm text-foreground">
                  {rebuttal.lands ? `Landed: moved them ${rebuttal.shift.toFixed(2)} toward this side.` : "Didn't land: the data doesn't back it strongly enough."}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No rebuttal: this seat is within 0.3 of the others.</p>
          )}
        </div>
      </div>
    </article>
  );
}
