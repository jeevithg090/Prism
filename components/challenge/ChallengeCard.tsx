"use client";
// The challenge itself: context, the task, an optional timer, the editor and the actions.
import * as React from "react";
import { CheckCheck, Loader2, RotateCcw, Wand2 } from "lucide-react";
import { DemoDataNote } from "@/components/keystone";
import { Button } from "@/components/ui/button";
import { ChallengeTimer } from "./ChallengeTimer";
import { CodeEditor } from "./CodeEditor";
import type { PublicChallenge } from "./model";

/** Plain lines → paragraphs, "1. …" lines → an ordered list, indented lines → monospace. */
export function PromptText({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ol key={`l${blocks.length}`} className="list-decimal space-y-1 ps-6">{list.map((l, i) => <li key={i}>{l}</li>)}</ol>);
    list = [];
  };
  text.split("\n").forEach((line, i) => {
    const item = line.match(/^\s*\d+\.\s+(.*)$/);
    if (item) { list.push(item[1]); return; }
    flush();
    if (!line.trim()) return;
    blocks.push(/^\s{2,}/.test(line)
      ? <p key={i} className="font-mono text-sm text-foreground">{line.trim()}</p>
      : <p key={i}>{line}</p>);
  });
  flush();
  return <div className="space-y-2">{blocks}</div>;
}

export function ChallengeCard({ challenge, code, onCode, onCheck, onSample, checking, loadingSample, passed, isDemo }: {
  challenge: PublicChallenge; code: string; onCode: (v: string) => void; onCheck: () => void; onSample: () => void;
  checking: boolean; loadingSample: boolean; passed: boolean; isDemo: boolean;
}) {
  const edited = code !== challenge.starter;
  return (
    <section aria-labelledby="challenge-title" className="space-y-6 rounded-2xl border bg-card p-6 shadow-sm">
      <div className="space-y-2">
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{challenge.skillName} · {challenge.minutes} minutes</span>
          {challenge.roadmapWeek && <span>· your week {challenge.roadmapWeek} task</span>}
          {isDemo && <DemoDataNote />}
        </p>
        <h2 id="challenge-title" className="text-2xl font-semibold tracking-tight text-balance">{challenge.title}</h2>
        <p className="max-w-2xl text-muted-foreground">{challenge.context}</p>
      </div>

      <div className="rounded-xl bg-muted/60 p-4">
        <h3 className="mb-2 text-sm font-semibold">Your task</h3>
        <div className="text-base leading-7"><PromptText text={challenge.prompt} /></div>
      </div>

      <ChallengeTimer key={challenge.id} minutes={challenge.minutes} />

      <CodeEditor id={`editor-${challenge.id}`} label={challenge.fileName} value={code} onChange={onCode} disabled={checking} />

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
        <Button variant="ghost" onClick={() => onCode(challenge.starter)} disabled={!edited || checking}>
          <RotateCcw aria-hidden /> Reset to starter
        </Button>
        <Button variant="outline" onClick={onSample} disabled={checking || loadingSample} aria-describedby="sample-note">
          {loadingSample ? <Loader2 className="animate-spin" aria-hidden /> : <Wand2 aria-hidden />} Use sample answer
        </Button>
        <Button
          variant={passed ? "outline" : "default"}
          size="lg"
          onClick={onCheck}
          disabled={checking || !code.trim()}
          aria-busy={checking}
          className="h-11 px-5 text-base sm:ms-auto"
        >
          {checking ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCheck aria-hidden />}
          {checking ? "Checking your work" : passed ? "Check again" : "Check my work"}
        </Button>
      </div>
      <p id="sample-note" className="text-xs text-muted-foreground">
        The sample answer is here for the demo. If you pass with it, your passport says so.
      </p>
    </section>
  );
}
