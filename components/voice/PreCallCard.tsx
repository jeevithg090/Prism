"use client";
// Pre-call: the role, what you'll be asked about (the pod PR you merged), the mic explainer and Start.
// The brief leads: your own PR, set large in a well, then the one action with its length, then how it works.
import * as React from "react";
import { CheckCircle2, GitPullRequest, Keyboard, Mic, ShieldCheck } from "lucide-react";
import { DemoDataNote } from "@/components/keystone";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PRACTICE_QUESTION_COUNT } from "@/lib/voice/questions";

export const ROLES = [
  { id: "ml-engineer", name: "ML engineer" },
  { id: "software-engineer", name: "Software engineer" },
  { id: "data-analyst", name: "Data analyst" },
];

export function PreCallCard({
  vars, roleId, onRoleChange, onStart, mode, isDemo, starting,
}: {
  vars: Record<string, string>;
  roleId: string;
  onRoleChange: (roleId: string) => void;
  onStart: () => void;
  mode: "voice" | "practice";
  isDemo?: boolean;
  starting?: boolean;
}) {
  const merged = vars.pr_status === "merged";
  return (
    <section aria-labelledby="precall-title" className="rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between md:px-8 md:pt-8">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="precall-title" className="text-xl font-semibold text-foreground">Your mock interview</h2>
          {isDemo && <DemoDataNote />}
        </div>
        <div className="flex items-center gap-3 sm:w-auto">
          <Label htmlFor="interview-role">Role</Label>
          <select
            id="interview-role"
            value={roleId}
            onChange={(e) => onRoleChange(e.target.value)}
            className="h-10 w-56 min-w-0 cursor-pointer rounded-lg border border-input bg-transparent pr-8 pl-3 text-base text-foreground outline-2 -outline-offset-2 outline-transparent transition-[background-color,color] duration-(--dur-short) hover:bg-muted focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-55"
          >
            {ROLES.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
      </div>

      <div className="px-6 pb-6 md:px-8 md:pb-8">
        <div className="rounded-xl bg-muted p-5 md:p-6">
          <p className="text-lg text-foreground">We&apos;ll ask about your pod project:</p>
          <p className="mt-1 max-w-[30ch] text-2xl font-semibold text-balance text-foreground md:text-3xl">{vars.pr_title}</p>
          <div className="mt-4 flex flex-col gap-1.5 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-6">
            {merged ? (
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="size-4 shrink-0 text-status-proven" aria-hidden />
                Merged{vars.reviewer ? `, reviewed by ${vars.reviewer}` : ""}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <GitPullRequest className="size-4 shrink-0" aria-hidden />
                In progress{vars.reviewer ? `, ${vars.reviewer} reviews it` : ""}
              </span>
            )}
            <span>{vars.project_title}</span>
          </div>
          <p className="mt-4 max-w-[60ch] text-pretty text-muted-foreground">
            {merged
              ? "Explaining it well is the third rung of the Proof Ladder: you built it, now show you can explain it."
              : "Explaining your work well is the third rung of the Proof Ladder, and it's good practice before your PR is reviewed."}
          </p>
        </div>

        <Button size="lg" className="mt-6 w-full sm:w-auto" onClick={onStart} disabled={starting}>
          <Mic className="size-5" aria-hidden />
          {starting ? "Connecting…" : "Start mock interview"}
        </Button>
        <p className="mt-3 text-sm text-muted-foreground">{PRACTICE_QUESTION_COUNT} questions, about 5 minutes, feedback at the end.</p>


        <ul className="mt-8 grid gap-5 md:grid-cols-2 md:gap-x-8">
          <li className="flex gap-3">
            <Mic className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <p className="font-medium text-foreground">Your browser asks for the microphone</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {mode === "voice"
                  ? "You talk with the Keystone Interviewer, a voice agent from ElevenLabs."
                  : "Practice mode: your browser reads each question aloud and writes down what you say."}
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <p className="font-medium text-foreground">We keep the transcript, never the audio</p>
              <p className="mt-1 text-sm text-muted-foreground">It&apos;s only used to score your answers and show your feedback.</p>
            </div>
          </li>
          <li className="flex gap-3">
            <Keyboard className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <p className="font-medium text-foreground">No microphone? Type instead</p>
              <p className="mt-1 text-sm text-muted-foreground">Every question has a text box, so you can answer by typing or use a sample answer.</p>
            </div>
          </li>
        </ul>
      </div>

    </section>
  );
}
