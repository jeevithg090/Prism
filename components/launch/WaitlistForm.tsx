"use client";
// Waitlist: email + campus + consent, stored by a server action in the `waitlist` collection. Never emailed.
import * as React from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { joinWaitlist, type WaitlistState } from "./actions";
import { CAMPUSES } from "./data";

const initial: WaitlistState = { status: "idle", message: "" };

export function WaitlistForm({ action = joinWaitlist }: { action?: typeof joinWaitlist }) {
  const [state, formAction, pending] = React.useActionState(action, initial);
  const fe = state.status === "error" ? state.fieldErrors ?? {} : {};
  if (state.status === "ok") {
    return (
      <div role="status" className="space-y-2 rounded-xl bg-status-proven/10 p-5 text-foreground">
        <p className="flex items-center gap-2 text-lg font-semibold"><CheckCircle2 className="size-5 shrink-0 text-status-proven" aria-hidden />You&apos;re on the list</p>
        <p>{state.message}</p>
        {typeof state.campusCount === "number" && (
          <p className="text-sm text-muted-foreground">
            <span className="font-mono tabular-nums">{state.campusCount}</span> {state.campusCount === 1 ? "student has" : "students have"} joined from your campus in this demo.
          </p>
        )}
      </div>
    );
  }
  return (
    <form action={formAction} className="space-y-5" noValidate aria-describedby="waitlist-privacy">
      <div className="space-y-2">
        <Label htmlFor="wl-email">University email</Label>
        <Input
          id="wl-email" name="email" type="email" autoComplete="email" required className="h-11"
          placeholder="name@student.manchester.ac.uk" aria-invalid={!!fe.email} aria-describedby={fe.email ? "wl-email-err" : undefined}
        />
        {fe.email && <p id="wl-email-err" className="text-sm text-destructive">{fe.email}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="wl-campus">Campus</Label>
        <select
          id="wl-campus" name="campus" defaultValue="manchester" aria-invalid={!!fe.campus} aria-describedby={fe.campus ? "wl-campus-err" : undefined}
          className="h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-base text-foreground outline-2 -outline-offset-2 outline-transparent transition-[background-color] duration-(--dur-short) ease-(--ease-out) hover:bg-paper-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-55 aria-invalid:border-destructive"
        >
          {CAMPUSES.map((c) => <option key={c.id} value={c.id}>{c.city}{c.campus ? `, ${c.campus}` : ""}</option>)}
        </select>
        {fe.campus && <p id="wl-campus-err" className="text-sm text-destructive">{fe.campus}</p>}
      </div>
      <label className="flex items-start gap-3">
        <input type="checkbox" name="ambassador" className="mt-0.5 size-5 shrink-0 rounded border-input accent-primary disabled:cursor-not-allowed disabled:opacity-55" />
        <span>I&apos;m in year 2 or above and would like to be a Trajectory ambassador (earn the Helper badge and a certificate).</span>
      </label>
      <label className={cn("flex items-start gap-3", fe.consent && "text-destructive")}>
        <input type="checkbox" name="consent" required className="mt-0.5 size-5 shrink-0 rounded border-input accent-primary disabled:cursor-not-allowed disabled:opacity-55" aria-invalid={!!fe.consent} />
        <span>Keep my email on the Bridge Week pilot list. I can ask for it to be deleted at any time.</span>
      </label>
      {fe.consent && <p className="text-sm text-destructive">{fe.consent}</p>}
      {state.status === "error" && !Object.keys(fe).length && <p role="alert" className="text-sm text-destructive">{state.message}</p>}
      <p id="waitlist-privacy" className="text-sm text-muted-foreground">We only store your email and campus. This demo never sends emails.</p>
      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={pending} aria-busy={pending}>
        {pending && <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />}
        {pending ? "Joining…" : "Join the waitlist"}
      </Button>
    </form>
  );
}
