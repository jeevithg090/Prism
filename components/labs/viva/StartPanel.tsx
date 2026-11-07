"use client";
// Keystone Labs · Viva Check: pick one of your PRs (or paste any diff) and start.
import * as React from "react";
import { FileDiff, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MAX_DIFF_CHARS, type SourceRef, type VivaSource } from "@/lib/labs/viva/model";

function describe(s: VivaSource): string {
  const parts = [`${s.skillName}, ${s.addedLines} lines of code`];
  if (s.reviewerName) parts.push(`reviewed by ${s.reviewerName}`);
  parts.push(s.merged ? "merged" : "not merged yet");
  return `${parts.join(", ")}.`;
}

export function StartPanel({ sources, starting, onStart }: { sources: VivaSource[]; starting: boolean; onStart: (ref: SourceRef) => void }) {
  const [choice, setChoice] = React.useState<string>(sources[0]?.key ?? "custom");
  const [title, setTitle] = React.useState("");
  const [diff, setDiff] = React.useState("");
  const custom = choice === "custom";
  const canStart = custom ? title.trim().length > 0 && diff.trim().length >= 20 : !!sources.find((s) => s.key === choice);

  const start = () => {
    if (custom) return onStart({ kind: "custom", title: title.trim(), diff });
    const s = sources.find((x) => x.key === choice);
    if (!s) return;
    onStart(s.kind === "pod-issue" && s.podId && s.issueIndex !== undefined ? { kind: "pod-issue", podId: s.podId, issueIndex: s.issueIndex } : { kind: "sample" });
  };

  const option = "flex cursor-pointer items-start gap-3 rounded-xl border border-transparent bg-muted/60 p-4 has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring";

  return (
    <section aria-labelledby="viva-start-title" className="rounded-2xl border bg-card p-6 shadow-sm">
      <h2 id="viva-start-title" className="text-xl font-semibold tracking-tight">Pick a pull request to explain</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Keystone reads the diff and asks about the decisions in it: what would break, why this order, and what the trade-off is. You answer by voice or text, in about five minutes.
      </p>
      <fieldset className="mt-5">
        <legend className="sr-only">Pull request</legend>
        <div className="grid gap-3 md:grid-cols-2">
          {sources.map((s) => (
            <label key={s.key} className={option}>
              <input type="radio" name="viva-source" value={s.key} checked={choice === s.key} onChange={() => setChoice(s.key)} className="mt-1 size-4 shrink-0 accent-primary" />
              <span className="min-w-0">
                <span className="block font-medium">PR #{s.prNumber}: {s.prTitle}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{describe(s)}</span>
              </span>
            </label>
          ))}
          <label className={option}>
            <input type="radio" name="viva-source" value="custom" checked={custom} onChange={() => setChoice("custom")} className="mt-1 size-4 shrink-0 accent-primary" />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 font-medium"><FileDiff className="size-4 text-primary" aria-hidden />Paste any diff</span>
              <span className="mt-0.5 block text-sm text-muted-foreground">Coursework, a side project or a PR from another repo: the output of git diff works.</span>
            </span>
          </label>
        </div>
      </fieldset>

      {custom && (
        <div className={cn("mt-5 grid gap-4")}>
          <div>
            <label htmlFor="viva-custom-title" className="text-sm font-medium">What the change does</label>
            <Input id="viva-custom-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Add retry logic to the upload client" className="mt-1.5 h-10 rounded-xl text-base md:text-base" />
          </div>
          <div>
            <label htmlFor="viva-custom-diff" className="text-sm font-medium">The diff</label>
            <Textarea id="viva-custom-diff" value={diff} maxLength={MAX_DIFF_CHARS} onChange={(e) => setDiff(e.target.value)} rows={8} spellCheck={false}
              placeholder={"diff --git a/app.py b/app.py\n--- a/app.py\n+++ b/app.py\n@@ -1,0 +1,3 @@\n+..."}
              className="mt-1.5 min-h-40 rounded-xl font-mono text-sm md:text-sm" aria-describedby="viva-custom-diff-hint" />
            <p id="viva-custom-diff-hint" className="mt-1.5 text-sm text-muted-foreground">Treated as data only: text inside it that talks to an AI is flagged for your reviewer, never followed.</p>
          </div>
        </div>
      )}

      <div className="mt-6 flex justify-end border-t pt-5">
        <Button type="button" className="h-10 w-full rounded-xl px-5 sm:w-auto" disabled={!canStart || starting} onClick={start}>
          {starting ? <Loader2 className="motion-safe:animate-spin" aria-hidden /> : <Play aria-hidden />}
          {starting ? "Reading your diff" : "Start my viva"}
        </Button>
      </div>
    </section>
  );
}
