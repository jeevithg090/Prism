"use client";
// One module: its decay curve, the receipts behind its urgency, and the drafted refresh note the module lead decides on.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRightLeft, CheckCircle2, FlaskConical, Hourglass, ScanSearch, ShieldAlert, TrendingUp, XCircle } from "lucide-react";
import { StatusBadge } from "@/components/keystone";
import { YouDecideChip } from "@/components/governance/pills";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiPost } from "@/lib/fetcher";
import type { Decision, ModuleHalfLife } from "@/lib/labs/halflife/schema";
import { DecayCurve } from "./DecayCurve";
import { andList, BAND_LABEL, band, monthLabel, share, signedPct, yrs } from "./format";

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof Hourglass; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-muted/60 p-4">
      <h3 className="mb-3 flex items-center gap-2 font-semibold"><Icon className="size-4 text-muted-foreground" aria-hidden />{title}</h3>
      {children}
    </div>
  );
}

function headline(m: ModuleHalfLife, horizonMonth: string): string {
  if (m.status === "decaying" && m.halfLifeYears !== null) {
    const kept = m.retainedAtHorizon !== null ? Math.round(m.retainedAtHorizon * 100) : null;
    return `Hiring demand for what this module teaches halves in ${yrs(m.halfLifeYears)}${kept !== null ? `; by ${monthLabel(horizonMonth)} it keeps ${kept}% of today's` : ""}.`;
  }
  if (m.status === "growing") return `Demand for what this module teaches is still growing${m.retainedAtHorizon !== null ? ` (${Math.round(m.retainedAtHorizon * 100)} at ${monthLabel(horizonMonth)}, today = 100)` : ""}.`;
  if (m.status === "durable") return "Demand for its topics dips slowly and does not halve within 20 years.";
  return "It teaches foundations the hiring forecast doesn't track, so they are treated as holding their value.";
}

function Receipts({ m, horizonMonth }: { m: ModuleHalfLife; horizonMonth: string }) {
  const tracked = m.taught.filter((t) => t.tracked);
  const untracked = m.taught.filter((t) => !t.tracked);
  // A rebalance note names where demand is moving; show that skill's own numbers so the note has a receipt.
  const succ = m.refreshNote?.kind === "rebalance" ? m.refreshNote.successor : undefined;
  const fromName = succ ? m.taught.find((t) => t.skillId === m.refreshNote?.skillIds[0])?.name : undefined;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="What it teaches" icon={Hourglass}>
        {tracked.length ? (
          <ul className="space-y-3">
            {tracked.map((t) => (
              <li key={t.skillId} className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{t.name}</span>
                  {t.label && <StatusBadge status={t.label} size="sm" />}
                  <span className="font-mono text-sm tabular-nums">{signedPct(t.growthPerYear ?? 0)} a year</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  In {share(t.shareNow ?? 0)} of hiring posts today, {share(t.shareAtHorizon ?? 0)} by {monthLabel(horizonMonth)}
                  {t.halfLifeYears ? `; on its own it halves in ${yrs(t.halfLifeYears)}` : ""}.
                  {t.source === "topics" ? " Found in the module's topics." : ""}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">None of its skills has a hiring trend yet.</p>
        )}
        {untracked.length > 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            No trend tracked for {andList(untracked.map((t) => t.name))}: counted as holding value ({Math.round((1 - m.trackedShare) * 100)}% of the module&apos;s weight).
          </p>
        )}
      </Panel>
      <Panel title="Rising next door" icon={TrendingUp}>
        {succ && (
          <div className="mb-3 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{succ.name}</span>
              <StatusBadge status="rising" size="sm" />
              <span className="font-mono text-sm tabular-nums">{signedPct(succ.growthPerYear)} a year</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {fromName ? `Often replaces ${fromName}. ` : ""}In {share(succ.shareNow)} of hiring posts today; the refresh note suggests one lab in it, so it isn&apos;t counted as drift.
            </p>
          </div>
        )}
        {m.drift.length ? (
          <ul className="space-y-3">
            {m.drift.map((d) => (
              <li key={d.skillId} className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{d.name}</span>
                  <StatusBadge status="rising" size="sm" />
                  <span className="font-mono text-sm tabular-nums">{signedPct(d.growthPerYear)} a year</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {d.via.why}. {d.cohortDemandPct}% of the job ads this cohort targets ask for it.{" "}
                  {d.coveredBy.length ? `Already taught in ${andList(d.coveredBy)}, so it isn't counted.` : `No module teaches it: ${d.points} urgency points.`}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{succ ? "No other rising skill sits next to this module untaught." : "No rising skill sits next to this module untaught."}</p>
        )}
      </Panel>
    </div>
  );
}

function NoteEditor({ m, programmeId, horizonYears, demo }: { m: ModuleHalfLife; programmeId: string; horizonYears: number; demo: boolean }) {
  const [text, setText] = useState(m.decision?.note ?? m.refreshNote?.text ?? "");
  const qc = useQueryClient();
  const decide = useMutation({
    mutationFn: (decision: "adopted" | "dismissed") => apiPost<Decision>("/api/labs/halflife/decide", {
      programmeId, moduleCode: m.code, decision, note: text.trim() || undefined, horizonYears, ...(demo ? { demo: true } : {}),
    }),
    onSuccess: (d) => {
      toast.success(d.decision === "adopted" ? `Saved the ${m.code} refresh note for the next module review` : `Dismissed the ${m.code} note`);
      void qc.invalidateQueries({ queryKey: ["labs-halflife"] });
    },
    onError: (e: Error) => toast.error(e.message || "We couldn't save that decision. Try again."),
  });
  if (!m.refreshNote) return null;
  const id = `note-${m.code}`;
  const lo = m.refreshNote.learningOutcome;
  return (
    <Panel title="Refresh note" icon={FlaskConical}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <YouDecideChip title="The module lead decides. Nothing changes in the syllabus by itself." />
        <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ArrowRightLeft className="size-3.5" aria-hidden />
          {m.refreshNote.kind === "rebalance" ? "Rebalances a cooling skill" : "Adds a rising skill"}
        </span>
      </div>
      {lo && (
        <p className="mb-3 text-sm">
          Linked to learning outcome {m.refreshNote.learningOutcomeIndex + 1}: <q className="text-muted-foreground">{lo}</q>
        </p>
      )}
      <label htmlFor={id} className="mb-1 block text-sm font-medium">Draft for the module review (edit it before you adopt it)</label>
      <Textarea id={id} value={text} onChange={(e) => setText(e.target.value)} maxLength={600} rows={4} className="rounded-xl bg-background text-base" />
      <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
        <Button variant="outline" className="h-10 rounded-xl px-4" disabled={decide.isPending} onClick={() => decide.mutate("dismissed")}>
          <XCircle aria-hidden />Dismiss
        </Button>
        <Button className="h-10 rounded-xl px-4" disabled={decide.isPending || !text.trim()} onClick={() => decide.mutate("adopted")}>
          <CheckCircle2 aria-hidden />{decide.isPending ? "Saving" : "Adopt note"}
        </Button>
        <p className="text-sm text-muted-foreground sm:ml-2" aria-live="polite">
          {m.decision ? `${m.decision.decision === "adopted" ? "Adopted" : "Dismissed"} on ${new Date(m.decision.decidedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.` : "Nothing changes until you adopt it."}
        </p>
      </div>
    </Panel>
  );
}

export function ModuleDetail({ module: m, programmeId, lastDataMonth, horizonMonth, horizonYears, demo = false }: {
  module: ModuleHalfLife; programmeId: string; lastDataMonth: string; horizonMonth: string; horizonYears: number; demo?: boolean;
}) {
  const b = band(m.urgency);
  return (
    <section aria-labelledby="module-heading" className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 id="module-heading" className="text-xl font-semibold tracking-tight"><span className="font-mono">{m.code}</span> {m.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Year {m.year}, semester {m.semester}. {headline(m, horizonMonth)}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-4xl font-semibold tabular-nums">{m.urgency}</p>
          <p className="text-sm text-muted-foreground">urgency of 100, {BAND_LABEL[b].toLowerCase()}</p>
        </div>
      </div>
      <div className="space-y-4">
        {m.flagged && (
          <p role="note" className="flex items-start gap-2 rounded-xl border border-status-gap/30 bg-status-gap/10 p-3 text-sm">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-status-gap" aria-hidden />
            Part of this module&apos;s syllabus text reads like an instruction to an AI. Keystone treated it as data, didn&apos;t quote it, and kept the note to the numbers.
          </p>
        )}
        <Panel title="Demand for its topics, today = 100" icon={ScanSearch}>
          {m.curve.length ? (
            <DecayCurve module={m} lastDataMonth={lastDataMonth} horizonMonth={horizonMonth} horizonYears={horizonYears} />
          ) : (
            <p className="text-sm text-muted-foreground">No curve: none of {m.code}&apos;s skills has a hiring trend yet. Its urgency comes only from rising skills next door.</p>
          )}
        </Panel>
        <Receipts m={m} horizonMonth={horizonMonth} />
        <p className="text-sm text-muted-foreground">
          Urgency {m.urgency} of 100: {Math.round(m.urgencyParts.decay)} points for demand its own topics lose by {monthLabel(horizonMonth)}, plus {Math.round(m.urgencyParts.drift)} for rising demand next door that no module teaches.
        </p>
        {m.refreshNote ? (
          <NoteEditor key={m.code} m={m} programmeId={programmeId} horizonYears={horizonYears} demo={demo} />
        ) : (
          <p className="rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">No refresh needed: nothing it teaches is losing demand and no rising skill next to it is untaught.</p>
        )}
      </div>
    </section>
  );
}
