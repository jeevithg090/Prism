"use client";
// Keystone Labs · Viva Check: the three questions, each answered by typing or by speaking (browser speech, no keys).
import * as React from "react";
import { GitPullRequest, Loader2, Mic, MicOff, Send, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { YouDecideChip } from "@/components/governance/pills";
import { listen, speak, speechRecognitionCtor, stopSpeaking } from "@/components/voice/speech";
import { cn } from "@/lib/utils";
import { KIND_LABEL, MAX_ANSWER_CHARS, type VivaSession } from "@/lib/labs/viva/model";
import { InlineCode, speakable } from "./InlineCode";

export type Draft = { text: string; mode: "text" | "voice" };

const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

function useHasSpeech() {
  return React.useSyncExternalStore(() => () => {}, () => !!speechRecognitionCtor(), () => false);
}

export function QuestionList({
  session, drafts, onDraft, onFocusQ, onSubmit, submitting, onDemo,
}: {
  session: VivaSession;
  drafts: Record<string, Draft>;
  onDraft: (id: string, d: Draft) => void;
  onFocusQ: (q: number | null) => void;
  onSubmit: () => void;
  submitting: boolean;
  onDemo?: (set: "honest" | "gamed") => void;
}) {
  const hasSpeech = useHasSpeech();
  const [listening, setListening] = React.useState<string | null>(null);
  const [micError, setMicError] = React.useState<string | null>(null);
  const stopRef = React.useRef<(() => void) | null>(null);
  const answered = session.questions.filter((q) => drafts[q.id]?.text.trim()).length;

  React.useEffect(() => () => { stopRef.current?.(); stopSpeaking(); }, []);

  const toggleMic = (qid: string) => {
    if (listening === qid) { stopRef.current?.(); stopRef.current = null; setListening(null); return; }
    stopRef.current?.();
    setMicError(null);
    const base = drafts[qid]?.text.trim() ?? "";
    const stop = listen(
      (finalText, interim) => onDraft(qid, { text: [base, finalText, interim].filter(Boolean).join(" ").slice(0, MAX_ANSWER_CHARS), mode: "voice" }),
      (code) => { setMicError(code === "not-allowed" ? "Your browser blocked the microphone. You can type your answer instead." : "Speech stopped. You can type your answer instead."); setListening(null); },
      () => setListening((cur) => (cur === qid ? null : cur)),
    );
    if (stop) { stopRef.current = stop; setListening(qid); }
  };

  return (
    <section aria-labelledby="viva-q-title" className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 id="viva-q-title" className="text-xl font-semibold tracking-tight">Explain your own code</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {session.reviewHints > 0
              ? `${session.questions.length} questions written from your diff. ${session.reviewHints} of them pick up points the AI Tech Lead raised in your review, so you can show the review landed.`
              : `${session.questions.length} questions written from your diff. Answer out loud or in writing, the way you'd explain it to a podmate.`}
          </p>
        </div>
        <YouDecideChip title="You choose when to submit. A viva is practice for you and your reviewer, never a mark for credit." />
      </div>

      <ol className="mt-5 divide-y">
        {session.questions.map((q, k) => {
          const d = drafts[q.id] ?? { text: "", mode: "text" as const };
          const fieldId = `viva-answer-${q.id}`;
          const isListening = listening === q.id;
          return (
            <li key={q.id} className="py-5 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex size-7 items-center justify-center rounded-full bg-primary/10 font-mono text-sm font-semibold text-primary">{k + 1}</span>
                <span className="rounded-full border px-2.5 py-0.5 text-xs font-medium">{KIND_LABEL[q.kind]}</span>
                <span className="text-sm text-muted-foreground">{q.topic}</span>
              </div>
              <p className="mt-3 text-base leading-relaxed text-pretty"><InlineCode text={q.prompt} /></p>
              {q.fromReview && (
                <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <GitPullRequest className="size-4 text-primary" aria-hidden />The AI Tech Lead raised this in your review.
                </p>
              )}
              {q.mutation?.length ? (
                <div className="mt-3 rounded-xl bg-muted/60 p-3">
                  <p className="text-sm font-medium">The change to reason about</p>
                  <pre className="mt-1.5 overflow-x-auto font-mono text-sm whitespace-pre" aria-label="A change that breaks this line">
                    {q.mutation.map((m, i) => (
                      <span key={i} className={cn("block", m.startsWith("-") ? "text-status-gap" : "text-status-proven")}>{m}</span>
                    ))}
                  </pre>
                </div>
              ) : null}

              <label htmlFor={fieldId} className="mt-4 block text-sm font-medium">Your answer to question {k + 1}</label>
              <Textarea
                id={fieldId}
                value={d.text}
                maxLength={MAX_ANSWER_CHARS}
                rows={4}
                placeholder="Say what happens, why, and what it costs."
                onFocus={() => onFocusQ(k + 1)}
                onBlur={() => onFocusQ(null)}
                onChange={(e) => onDraft(q.id, { text: e.target.value, mode: d.mode })}
                className="mt-1.5 min-h-28 rounded-xl text-base md:text-base"
                aria-describedby={`${fieldId}-meta`}
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p id={`${fieldId}-meta`} className="text-sm text-muted-foreground tabular-nums">
                  {wordCount(d.text)} words{d.mode === "voice" ? ", spoken" : ""}{isListening ? ". Listening now" : ""}
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="h-10 rounded-xl px-3" onClick={() => void speak(speakable(q.prompt))} aria-label={`Read question ${k + 1} aloud`}>
                    <Volume2 aria-hidden />
                  </Button>
                  {hasSpeech && (
                    <Button type="button" variant="outline" className="h-10 rounded-xl px-3" aria-pressed={isListening} onClick={() => toggleMic(q.id)}>
                      {isListening ? <MicOff aria-hidden /> : <Mic aria-hidden />}
                      {isListening ? "Stop" : "Speak"}
                    </Button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {micError && <p role="status" className="mt-4 text-sm text-muted-foreground">{micError}</p>}

      <div className="mt-6 space-y-4 border-t pt-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">{answered} of {session.questions.length} answered. You can submit with gaps; each one gets a follow-up question.</p>
          <Button type="button" className="h-10 shrink-0 rounded-xl px-5" onClick={onSubmit} disabled={submitting || answered === 0}>
            {submitting ? <Loader2 className="motion-safe:animate-spin" aria-hidden /> : <Send aria-hidden />}
            {submitting ? "Grading" : "Submit answers"}
          </Button>
        </div>
        {onDemo && (session.demo?.honest.length || session.demo?.gamed.length) ? (
        <div className="flex flex-col gap-2 rounded-xl bg-muted/60 p-3 sm:flex-row sm:flex-wrap sm:items-center">
          <p className="text-sm text-muted-foreground sm:mr-1">Demo shortcuts:</p>
          {session.demo?.honest.length ? (
            <Button type="button" variant="outline" className="h-10 rounded-xl px-4" onClick={() => onDemo("honest")} disabled={submitting}>
              Fill {session.studentName}&apos;s answers
            </Button>
          ) : null}
          {session.demo?.gamed.length ? (
            <Button type="button" variant="outline" className="h-10 rounded-xl px-4" onClick={() => onDemo("gamed")} disabled={submitting}>
              Try a gamed attempt
            </Button>
          ) : null}
        </div>
        ) : null}
      </div>
    </section>
  );
}
