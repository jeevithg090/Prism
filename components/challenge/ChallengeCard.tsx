"use client";
// The challenge itself: the title with its facts and an optional timer, the context, the task, the editor and the actions.
import * as React from "react";
import { CheckCheck, Clock, Loader2, RotateCcw, Route, Wand2, type LucideIcon } from "lucide-react";
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

/** A fact about the challenge as a plain run of text, with an optional inline icon. No box, no border. */
function Fact({ icon: Icon, children }: { icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {Icon && <Icon className="size-4 shrink-0" aria-hidden />}
      {children}
    </span>
  );
}

export function ChallengeCard({ challenge, code, onCode, onCheck, onSample, checking, loadingSample, passed, isDemo }: {
  challenge: PublicChallenge; code: string; onCode: (v: string) => void; onCheck: () => void; onSample: () => void;
  checking: boolean; loadingSample: boolean; passed: boolean; isDemo: boolean;
}) {
  const edited = code !== challenge.starter;
  return (
    <section aria-labelledby="challenge-title" className="space-y-6 rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
        <div className="min-w-0 space-y-3">
          <h2 id="challenge-title" className="max-w-[28ch] text-2xl font-semibold text-balance text-foreground md:text-3xl">{challenge.title}</h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <Fact>{challenge.skillName}</Fact>
            <Fact icon={Clock}>{challenge.minutes} minutes</Fact>
            {challenge.roadmapWeek && <Fact icon={Route}>Your week {challenge.roadmapWeek} task</Fact>}
            {isDemo && <DemoDataNote />}
          </div>
        </div>
        <ChallengeTimer key={challenge.id} minutes={challenge.minutes} />
      </div>

      <p className="max-w-[68ch] text-pretty text-muted-foreground">{challenge.context}</p>

      <div className="rounded-xl bg-muted p-5">
        <h3 className="mb-2 text-base font-semibold text-foreground">Your task</h3>
        <div className="text-base leading-7 text-foreground"><PromptText text={challenge.prompt} /></div>
      </div>

      <CodeEditor id={`editor-${challenge.id}`} label={challenge.fileName} value={code} onChange={onCode} disabled={checking} />

      <div className="space-y-3 border-t pt-6">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          <Button variant="ghost" onClick={() => onCode(challenge.starter)} disabled={!edited || checking}>
            <RotateCcw aria-hidden /> Reset to starter
          </Button>
          <Button variant="outline" onClick={onSample} disabled={checking || loadingSample} aria-describedby="sample-note">
            {loadingSample ? <Loader2 className="motion-safe:animate-spin" aria-hidden /> : <Wand2 aria-hidden />} Use sample answer
          </Button>
          <Button
            variant={passed ? "outline" : "default"}
            size="lg"
            onClick={onCheck}
            disabled={checking || !code.trim()}
            aria-busy={checking}
            className="sm:ms-auto"
          >
            {checking ? <Loader2 className="motion-safe:animate-spin" aria-hidden /> : <CheckCheck aria-hidden />}
            {checking ? "Checking your work" : passed ? "Check again" : "Check my work"}
          </Button>
        </div>
        <p id="sample-note" className="text-sm text-muted-foreground sm:text-end">
          The sample answer is here for the demo. If you pass with it, your passport says so.
        </p>
      </div>
    </section>
  );
}
