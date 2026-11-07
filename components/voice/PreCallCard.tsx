"use client";
// Pre-call: the role, what you'll be asked about (the pod PR you merged), the mic explainer and Start.
import * as React from "react";
import { CheckCircle2, GitPullRequest, Keyboard, Mic, ShieldCheck } from "lucide-react";
import { DemoDataNote } from "@/components/keystone";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

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
    <section aria-labelledby="precall-title" className="rounded-2xl border bg-card p-6 shadow-sm md:p-8">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h2 id="precall-title" className="text-2xl font-semibold tracking-tight">Your mock interview</h2>
            <p className="text-muted-foreground">4 questions · about 5 minutes · feedback at the end</p>
          </div>
          <div className="space-y-1.5 sm:w-56">
            <Label htmlFor="interview-role">Role</Label>
            <select
              id="interview-role"
              value={roleId}
              onChange={(e) => onRoleChange(e.target.value)}
              className="h-10 w-full rounded-xl border border-input bg-card px-3 text-base focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {ROLES.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        </div>

        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <p className="flex items-start gap-3">
            <GitPullRequest className="mt-1 size-5 shrink-0 text-primary" aria-hidden />
            <span className="text-lg">
              We&apos;ll ask about your pod project: <strong className="font-semibold">{vars.pr_title}</strong>
            </span>
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 pl-8 text-sm text-muted-foreground">
            {merged ? (
              <span className="inline-flex items-center gap-1"><CheckCircle2 className="size-4 text-status-proven" aria-hidden />Merged{vars.reviewer ? ` · reviewed by ${vars.reviewer}` : ""}</span>
            ) : (
              <span>In progress{vars.reviewer ? ` · ${vars.reviewer} reviews it` : ""}</span>
            )}
            <span aria-hidden>·</span>
            <span>{vars.project_title}</span>
            {isDemo && <DemoDataNote />}
          </p>
          <p className="mt-2 pl-8 text-sm text-muted-foreground">
            {merged
              ? "Explaining it well is the third rung of the Proof Ladder: you built it, now show you can explain it."
              : "Explaining your work well is the third rung of the Proof Ladder, and it's good practice before your PR is reviewed."}
          </p>
        </div>

        <ul className="grid gap-4 md:grid-cols-2">
          <li className="flex gap-3">
            <Mic className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <p className="font-medium">Your browser asks for the microphone</p>
              <p className="text-sm text-muted-foreground">
                {mode === "voice"
                  ? "You talk with the Keystone Interviewer, a voice agent from ElevenLabs."
                  : "Practice mode: your browser reads each question aloud and writes down what you say."}
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <p className="font-medium">We keep the transcript, never the audio</p>
              <p className="text-sm text-muted-foreground">It&apos;s only used to score your answers and show your feedback.</p>
            </div>
          </li>
          <li className="flex gap-3 md:col-span-2">
            <Keyboard className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <p className="font-medium">No microphone? Type instead</p>
              <p className="text-sm text-muted-foreground">Every question has a text box, so you can answer by typing or use a sample answer.</p>
            </div>
          </li>
        </ul>

        <div>
          <Button size="lg" className="h-12 w-full rounded-xl px-6 text-base sm:w-auto" onClick={onStart} disabled={starting}>
            <Mic className="size-5" aria-hidden />
            {starting ? "Connecting…" : "Start mock interview"}
          </Button>
        </div>
      </div>
    </section>
  );
}
