"use client";
// Keystone Labs · Viva Check: the grade, what it wrote to the Proof Ladder, and one follow-up question per answer.
import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { CheckCircle2, Circle, MessageCircleQuestion, RotateCw, ShieldAlert, Sparkles, Users } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { RungStrip } from "@/components/ladder/LadderRungs";
import { cn } from "@/lib/utils";
import { FLAG_LABEL, type VivaSession } from "@/lib/labs/viva/model";
import { VERDICT } from "./DiffView";

export function ResultPanel({ session, onRetry, onNew, onActivity }: {
  session: VivaSession; onRetry?: () => void; onNew: () => void; onActivity?: () => void;
}) {
  const reduce = useReducedMotion();
  const r = session.result;
  if (!r) return null;
  const reviewer = session.source.reviewerName ?? "your reviewer";
  const passed = r.passed;
  const rungLit = r.rungs.length === 3 && r.rungs[2].status === "done";

  return (
    <motion.section
      aria-labelledby="viva-result-title"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="rounded-2xl border bg-card p-6 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="viva-result-title" className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            {passed
              ? <CheckCircle2 className="size-5 shrink-0 text-status-proven" aria-hidden />
              : <Users className="size-5 shrink-0 text-status-rising" aria-hidden />}
            {passed ? "Passed: you can explain your own code" : session.status === "cleared" ? `Cleared in person by ${reviewer}` : `Re-viva with ${reviewer}`}
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">{r.summary}</p>
        </div>
        <div className="sm:text-right">
          <p className="text-4xl font-semibold tracking-tight"><span className="font-mono tabular-nums">{r.score}</span><span className="text-xl font-medium text-muted-foreground"> of <span className="font-mono tabular-nums">{r.maxScore}</span></span></p>
          <p className="text-sm text-muted-foreground">points, pass mark {r.passMark}</p>
        </div>
      </div>

      {r.rungs.length === 3 && (
        <div className="mt-5 space-y-4 rounded-xl bg-muted/60 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
          <RungStrip ladder={{ skillName: session.source.skillName, rungs: r.rungs }} showLabels size="md" className="shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{session.source.skillName} on your Proof Ladder: level {r.ladderAfter} of 3</p>
            <p className="text-sm text-muted-foreground">
              {r.evidenceId
                ? `Saved as Viva Check evidence. Can teach it is ${rungLit ? "lit" : "recorded"}${r.ladderBefore < r.ladderAfter ? `, up from level ${r.ladderBefore}` : ""}.`
                : session.status === "cleared"
                  ? `${reviewer} confirmed it in person, and that is saved as Can teach it evidence.`
                  : `This attempt saved nothing. ${reviewer} can clear it after a short chat, and that counts for Can teach it too.`}
            </p>
          </div>
          </div>
          <Link href={`/profile/${encodeURIComponent(session.userId)}`} className={cn(buttonVariants({ variant: "outline" }), "h-10 rounded-xl px-4")}>
            See your Skill Passport
          </Link>
        </div>
      )}

      {session.integrity.length > 0 && (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-status-gap/30 bg-status-gap/10 p-3 text-sm">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-status-gap" aria-hidden />
          <span>{session.integrity[session.integrity.length - 1]}. {reviewer} sees this and decides; the AI never fails anyone.</span>
        </p>
      )}

      <ol className="mt-5 divide-y">
        {r.perQuestion.map((g, k) => {
          const q = session.questions.find((x) => x.id === g.questionId);
          const v = VERDICT[g.verdict];
          const Icon = v.icon;
          return (
            <li key={g.questionId} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">Q{k + 1}: {q?.topic}</p>
                <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium text-foreground", v.row)}>
                  <Icon className={cn("size-3.5", v.text)} aria-hidden /><span className="tabular-nums">{`${v.label}, ${g.score} of ${g.maxScore}`}</span>
                </span>
              </div>
              {(g.covered.length > 0 || g.missing.length > 0) && (
                <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                  {g.covered.map((c) => (
                    <li key={c} className="flex items-start gap-1.5"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-status-proven" aria-hidden /><span><span className="sr-only">Covered: </span>{c}</span></li>
                  ))}
                  {g.missing.map((c) => (
                    <li key={c} className="flex items-start gap-1.5 text-muted-foreground"><Circle className="mt-0.5 size-4 shrink-0" aria-hidden /><span><span className="sr-only">Not yet: </span>{c}</span></li>
                  ))}
                </ul>
              )}
              {g.flags.length > 0 && (
                <p className="mt-2 text-sm"><span className="font-medium">Capped:</span> {g.flags.map((f) => FLAG_LABEL[f]).join(", ")}</p>
              )}
              <p className="mt-2 flex items-start gap-2 text-sm">
                <MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span>{g.feedback}</span>
              </p>
            </li>
          );
        })}
      </ol>

      <div className="mt-6 flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end">
        {onActivity && (
          <Button type="button" variant="ghost" className="h-10 rounded-xl px-4" onClick={onActivity}>
            <Sparkles aria-hidden />Show what the agents did
          </Button>
        )}
        {onRetry && (
          <Button type="button" variant="outline" className="h-10 rounded-xl px-4" onClick={onRetry}>
            <RotateCw aria-hidden />Try these questions again
          </Button>
        )}
        <Button type="button" variant="outline" className="h-10 rounded-xl px-4" onClick={onNew}>Start another viva</Button>
      </div>
    </motion.section>
  );
}
