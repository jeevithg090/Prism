"use client";
// Keystone Labs · Viva Check: the student's own diff, with the lines each question is about marked Q1-Q3.
// After grading, each marked line turns green (explained), amber (partly) or red (not yet): an understanding map of the PR.
import * as React from "react";
import { CheckCircle2, CircleDot, ExternalLink, GitPullRequest, Target, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DiffLine, QuestionGrade, VivaSession } from "@/lib/labs/viva/model";

type Verdict = QuestionGrade["verdict"];
export const VERDICT: Record<Verdict, { label: string; icon: LucideIcon; row: string; text: string }> = {
  explained: { label: "Explained", icon: CheckCircle2, row: "border-status-proven bg-status-proven/10", text: "text-status-proven" },
  partial: { label: "Partly", icon: CircleDot, row: "border-status-rising bg-status-rising/10", text: "text-status-rising" },
  missed: { label: "Not yet", icon: Target, row: "border-status-gap bg-status-gap/10", text: "text-status-gap" },
};

interface Mark { q: number; verdict?: Verdict }

function marksFor(session: VivaSession): Map<number, Mark[]> {
  const m = new Map<number, Mark[]>();
  session.questions.forEach((q, k) => {
    const verdict = session.result?.perQuestion.find((g) => g.questionId === q.id)?.verdict;
    for (const i of q.anchor) m.set(i, [...(m.get(i) ?? []), { q: k + 1, verdict }]);
  });
  return m;
}

/** Visible lines: file headers once per file, then added/context/deleted lines (git metadata hidden). */
function visible(lines: DiffLine[]): ({ kind: "file"; file: string } | { kind: "line"; line: DiffLine })[] {
  const out: ({ kind: "file"; file: string } | { kind: "line"; line: DiffLine })[] = [];
  let file = "";
  for (const l of lines) {
    if (l.kind === "meta") continue;
    if (l.file !== file) { file = l.file; out.push({ kind: "file", file }); }
    out.push({ kind: "line", line: l });
  }
  return out;
}

export function DiffView({ session, activeQ, className }: { session: VivaSession; activeQ: number | null; className?: string }) {
  const marks = React.useMemo(() => marksFor(session), [session]);
  const rows = React.useMemo(() => visible(session.diff), [session.diff]);
  const graded = !!session.result;
  const explained = session.result?.perQuestion.filter((g) => g.verdict === "explained").length ?? 0;
  const { source } = session;
  const external = /^https?:\/\//.test(source.prUrl);

  return (
    <section aria-labelledby="viva-diff-title" className={cn("min-w-0 rounded-2xl border bg-card p-6 shadow-sm", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 id="viva-diff-title" className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <GitPullRequest className="size-5 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0">Your PR #{source.prNumber}</span>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{source.prTitle}</p>
        </div>
        {external && (
          <a
            href={source.prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Open on GitHub<ExternalLink className="size-3.5" aria-hidden /><span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
      </div>

      <p className="mt-3 text-sm" aria-live="polite">
        {graded
          ? `You explained ${explained} of ${session.questions.length} marked decisions in full. The colours show where your understanding is solid.`
          : `${session.source.addedLines} lines of code you added. The marked lines are what each question asks about.`}
      </p>

      <div
        role="region"
        tabIndex={0}
        aria-label={`Diff of PR ${source.prNumber}`}
        className="relative mt-4 max-h-[26rem] overflow-auto rounded-xl border bg-background font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring lg:max-h-[calc(100dvh-16rem)]"
      >
        <table className="w-full border-collapse">
          <tbody>
            {rows.map((r, idx) => {
              if (r.kind === "file") {
                return (
                  <tr key={`f-${r.file}-${idx}`}>
                    <th colSpan={3} scope="colgroup" className="sticky top-0 z-10 border-b bg-muted px-3 py-1.5 text-left text-sm font-medium">
                      {r.file}
                    </th>
                  </tr>
                );
              }
              const l = r.line;
              const ms = marks.get(l.i);
              const top = ms?.[0];
              const tone = top ? (top.verdict ? VERDICT[top.verdict].row : "border-primary bg-primary/5") : "border-transparent";
              const active = ms?.some((m) => m.q === activeQ);
              return (
                <tr
                  key={l.i}
                  data-line={l.i}
                  className={cn(
                    "border-l-4 align-top motion-safe:transition-colors motion-safe:duration-200",
                    tone,
                    l.kind === "del" && !top && "bg-muted/60 text-muted-foreground",
                    active && "outline-2 -outline-offset-2 outline-ring",
                  )}
                >
                  <td className="w-10 px-2 py-0.5 text-right text-muted-foreground tabular-nums select-none">{l.newLine ?? ""}</td>
                  <td className="w-4 py-0.5 text-muted-foreground select-none" aria-hidden>{l.kind === "add" ? "+" : l.kind === "del" ? "−" : ""}</td>
                  <td className="py-0.5 pr-3 whitespace-pre">
                    <span className="sr-only">{l.kind === "add" ? "Added: " : l.kind === "del" ? "Removed: " : ""}</span>
                    {l.text || " "}
                    {ms?.map((m) => {
                      const v = m.verdict ? VERDICT[m.verdict] : null;
                      const Icon = v?.icon;
                      return (
                        <span key={m.q} className="ml-3 inline-flex items-center gap-1 rounded-full border bg-card px-2 align-middle font-sans text-xs font-medium text-foreground">
                          {Icon && <Icon className={cn("size-3.5", v.text)} aria-hidden />}
                          Q{m.q}{v ? <span className="sr-only">: {v.label}</span> : null}
                        </span>
                      );
                    })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {graded && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground" aria-label="Colour key">
          {(Object.keys(VERDICT) as Verdict[]).map((k) => {
            const { icon: Icon, label, text } = VERDICT[k];
            return <li key={k} className="inline-flex items-center gap-1.5"><Icon className={cn("size-4", text)} aria-hidden />{label}</li>;
          })}
        </ul>
      )}
    </section>
  );
}
