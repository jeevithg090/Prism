"use client";
// The judge's ruling: decision, the seats' balance (opening vs after rebuttals), the kept dissent, and the
// "You decide" checkpoint. Accepting follows the ruling; overruling keeps what the student proposed.
import * as React from "react";
import Link from "next/link";
import { ArrowLeftRight, CheckCircle2, Loader2, ScrollText, UserCheck, Wrench } from "lucide-react";
import { AgentAvatar } from "@/components/keystone";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  dissentLabel, SEAT_LABEL, SEAT_WEIGHT, SEATS, signed, VERDICT_LABEL,
  type CouncilDecision, type CouncilSession, type Seat,
} from "@/lib/labs/council/types";
import { StancePill } from "./AdvocateCard";
import { STANCE_META, stanceFor } from "./meta";

const seatShort = (s: Seat) => SEAT_LABEL[s].replace(" advocate", "");

/** A bar from the centre of a −1..+1 track. */
function Bar({ value, className }: { value: number; className: string }) {
  const v = Math.max(-1, Math.min(1, value));
  const width = `${Math.abs(v) * 50}%`;
  return <span className={cn("absolute inset-y-0 rounded-full", className)} style={v >= 0 ? { left: "50%", width } : { right: "50%", width }} />;
}

export function BalanceChart({ session }: { session: CouncilSession }) {
  const [asList, setAsList] = React.useState(false);
  const v = session.verdict;
  const caption = `${SEATS.map((s) => `${seatShort(s)} ${signed(v.finalScores[s])}`).join(", ")} give a weighted net of ${signed(v.net)}. The judge says yes at +0.15 or more, unless the degree already covers the skill.`;
  return (
    <figure className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">How the seats weighed in</h3>
        <Button variant="ghost" className="h-10 rounded-xl px-3 text-sm" aria-pressed={asList} onClick={() => setAsList((x) => !x)}>
          {asList ? "View as chart" : "View as list"}
        </Button>
      </div>
      {asList ? (
        <div role="region" tabIndex={0} aria-label="Council scores as a table" className="mt-3 overflow-x-auto rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr><th className="py-2 pr-3 font-medium">Seat</th><th className="py-2 pr-3 font-medium">Weight</th><th className="py-2 pr-3 font-medium">Opening</th><th className="py-2 pr-3 font-medium">After rebuttals</th><th className="py-2 font-medium">Stance</th></tr>
            </thead>
            <tbody className="divide-y">
              {SEATS.map((s) => (
                <tr key={s}>
                  <td className="py-2 pr-3">{seatShort(s)}</td>
                  <td className="py-2 pr-3 font-mono tabular-nums">{Math.round(SEAT_WEIGHT[s] * 100)}%</td>
                  <td className="py-2 pr-3 font-mono tabular-nums">{signed(v.initialScores[s])}</td>
                  <td className="py-2 pr-3 font-mono tabular-nums">{signed(v.finalScores[s])}</td>
                  <td className="py-2">{STANCE_META[stanceFor(v.finalScores[s])].label}</td>
                </tr>
              ))}
              <tr className="font-medium"><td className="py-2 pr-3">Net</td><td className="py-2 pr-3 font-mono tabular-nums">100%</td><td className="py-2 pr-3" /><td className="py-2 pr-3 font-mono tabular-nums">{signed(v.net)}</td><td className="py-2">{VERDICT_LABEL[v.decision]}</td></tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-3 space-y-3" aria-hidden>
          <div className="flex justify-between pl-28 text-xs text-muted-foreground"><span>−1 against</span><span>0</span><span>+1 for</span></div>
          {SEATS.map((s) => {
            const m = STANCE_META[stanceFor(v.finalScores[s])];
            return (
              <div key={s} className="flex items-center gap-3">
                <span className="w-25 shrink-0 text-sm">{seatShort(s)} <span className="text-muted-foreground tabular-nums">{Math.round(SEAT_WEIGHT[s] * 100)}%</span></span>
                <span className="relative h-3 flex-1 rounded-full bg-muted">
                  <span className="absolute inset-y-[-4px] left-1/2 w-px bg-border" />
                  <Bar value={v.initialScores[s]} className={cn(m.bar, "opacity-30")} />
                  <Bar value={v.finalScores[s]} className={cn(m.bar, "inset-y-0.5")} />
                </span>
                <span className="w-12 shrink-0 text-right font-mono text-sm tabular-nums">{signed(v.finalScores[s])}</span>
              </div>
            );
          })}
          <div className="flex items-center gap-3 border-t pt-3">
            <span className="w-25 shrink-0 text-sm font-semibold">Net</span>
            <span className="relative h-3 flex-1 rounded-full bg-muted">
              <span className="absolute inset-y-[-4px] left-1/2 w-px bg-border" />
              <span className="absolute inset-y-[-4px] w-px bg-foreground/50" style={{ left: "57.5%" }} />
              <Bar value={v.net} className="bg-primary" />
            </span>
            <span className="w-12 shrink-0 text-right font-mono text-sm font-semibold tabular-nums">{signed(v.net)}</span>
          </div>
          <p className="pl-28 text-xs text-muted-foreground">Faded bars: opening statements. Solid: after one round of rebuttals. The thin line marks +0.15.</p>
        </div>
      )}
      <figcaption className="mt-3 text-sm text-muted-foreground" aria-live="polite">{caption}</figcaption>
    </figure>
  );
}

function agreementText(session: CouncilSession): string {
  const v = session.verdict;
  const count = (st: string) => SEATS.filter((s) => stanceFor(v.finalScores[s]) === st).length;
  const [yes, no, unsure] = [count("support"), count("oppose"), count("caution")];
  const seats = (n: number, one: string, many: string) => (n === 1 ? `1 seat ${one}` : `${n} seats ${many}`);
  const parts = [yes && seats(yes, "supports", "support"), unsure && seats(unsure, "cautions", "caution"), no && seats(no, "opposes", "oppose")].filter(Boolean);
  return `After rebuttals: ${parts.join(", ")} ${session.motion.label}`;
}

export function DecisionResult({ decision }: { decision: CouncilDecision }) {
  return (
    <div role="status">
      <p className="flex items-center gap-2 font-semibold">
        <CheckCircle2 className="size-5 text-status-proven" aria-hidden />
        {decision.choice === "accept" ? "You accepted the ruling" : "You overruled the council"}
      </p>
      <p className="mt-1 text-base">{decision.summary}</p>
      {decision.reason && <p className="mt-1 text-sm text-muted-foreground">Your reason: {decision.reason}</p>}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        {decision.applied && (
          <Link href="/roadmap" className={cn(buttonVariants({ variant: "outline" }), "h-10 rounded-xl px-4")}>Open your roadmap</Link>
        )}
        <Link href="/governance" className={cn(buttonVariants({ variant: "outline" }), "h-10 rounded-xl px-4")}>
          <ScrollText aria-hidden />See it in the run ledger
        </Link>
      </div>
    </div>
  );
}

export function VerdictCard({ session, onDecide, deciding }: { session: CouncilSession; onDecide: (choice: "accept" | "overrule", reason?: string) => void; deciding: "accept" | "overrule" | null }) {
  const v = session.verdict;
  const [reason, setReason] = React.useState("");
  const dissentArg = v.dissent ? session.arguments.find((a) => a.seat === v.dissent!.seat) : undefined;
  return (
    <section aria-labelledby="council-ruling" className="rounded-2xl border border-primary/30 bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <AgentAvatar agent="orchestrator" size={40} />
        <div className="min-w-0 flex-1">
          <p className="text-base font-medium">The judge&apos;s ruling</p>
          <p className="text-sm text-muted-foreground">{agreementText(session)}</p>
        </div>
      </div>

      <h2 id="council-ruling" className="mt-4 text-2xl font-semibold tracking-tight text-balance md:text-3xl">{v.title}</h2>
      <p className="mt-2 max-w-3xl text-base text-muted-foreground">{v.summary}</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {v.changes.length > 0 && (
            <div>
              <h3 className="text-base font-semibold">What the judge changes</h3>
              <ul className="mt-2 space-y-2">
                {v.changes.map((c) => (
                  <li key={c.text} className="flex gap-2.5 text-base"><Wrench className="mt-1 size-4 shrink-0 text-primary" aria-hidden />{c.text}</li>
                ))}
              </ul>
            </div>
          )}
          {v.decision === "move" && v.moveTo && (
            <p className="flex gap-2.5 text-base">
              <ArrowLeftRight className="mt-1 size-4 shrink-0 text-primary" aria-hidden />
              {v.moveTo.week === session.motion.plannedWeek
                ? `Week ${v.moveTo.week}, where your plan already has it, scores ${signed(v.moveTo.gain ?? 0)} better.`
                : `Week ${v.moveTo.week} scores ${signed(v.moveTo.gain ?? 0)} better${v.moveTo.swapWithSkillName ? `, swapping with ${v.moveTo.swapWithSkillName}` : ""}.`}
            </p>
          )}
          {v.dissent && (
            <div className="rounded-xl bg-muted/60 p-4">
              <h3 className="text-base font-semibold">{dissentLabel(v.decision, v.dissent.stance)}</h3>
              <p className="text-sm text-muted-foreground">The strongest objection stays visible, whatever you decide.</p>
              <div className="mt-2 flex items-start gap-3">
                <AgentAvatar agent={(dissentArg?.agent ?? "orchestrator") as Parameters<typeof AgentAvatar>[0]["agent"]} size={32} />
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">{SEAT_LABEL[v.dissent.seat]}</p>
                  <p className="text-base font-medium">{v.dissent.headline}</p>
                  <p className="mt-1 text-sm">{v.dissent.receipt.label}</p>
                  <p className="text-xs text-muted-foreground">{v.dissent.receipt.source}</p>
                </div>
                <StancePill score={v.finalScores[v.dissent.seat]} className="ml-auto hidden sm:inline-flex" />
              </div>
            </div>
          )}
        </div>
        <BalanceChart session={session} />
      </div>

      <div className="mt-6 rounded-xl bg-muted/60 p-4">
        {session.decision ? (
          <DecisionResult decision={session.decision} />
        ) : (
          <>
            <p className="flex items-center gap-2 text-base font-semibold"><UserCheck className="size-5 text-primary" aria-hidden />You decide</p>
            <p className="mt-1 text-sm text-muted-foreground">The council only advises. Both choices go in the run ledger with the ruling and the dissent.</p>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="font-medium">If you accept</dt><dd className="text-muted-foreground">{session.consequences.accept}</dd></div>
              <div><dt className="font-medium">If you overrule</dt><dd className="text-muted-foreground">{session.consequences.overrule}</dd></div>
            </dl>
            <div className="mt-4">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="council-reason">Your reason (optional)</Label>
                <span className="text-xs text-muted-foreground tabular-nums">{reason.length}/240</span>
              </div>
              <input
                id="council-reason"
                value={reason}
                maxLength={240}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. I already booked a Docker workshop for that week"
                className="mt-2 h-10 w-full rounded-xl border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" className="h-11 rounded-xl px-5 text-base" disabled={!!deciding} onClick={() => onDecide("overrule", reason)}>
                {deciding === "overrule" && <Loader2 className="animate-spin" aria-hidden />}Overrule the council
              </Button>
              <Button className="h-11 rounded-xl px-5 text-base" disabled={!!deciding} onClick={() => onDecide("accept", reason)}>
                {deciding === "accept" && <Loader2 className="animate-spin" aria-hidden />}Accept the ruling
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
