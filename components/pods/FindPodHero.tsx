"use client";
import { ArrowLeftRight, GitPullRequest, ShieldCheck, Sparkles, Users, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

const POINTS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Users, title: "2–3 students who fill your gaps", body: "Strong where you're stuck, and keen on what you know." },
  { icon: ArrowLeftRight, title: "Learn by teaching", body: "Everyone reviews someone else's work in a skill they already have." },
  { icon: GitPullRequest, title: "A real project on GitHub", body: "Issues for each of you, and merged PRs become proof on your passport." },
];

/** Empty state for /pods: invite the student to be matched. */
export function FindPodHero({ onFind, pending = false }: { onFind: () => void; pending?: boolean }) {
  return (
    <section aria-labelledby="find-pod-title" className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="grid gap-10 p-6 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:p-12">
        <div className="flex flex-col gap-5">
          <p className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
            <Sparkles className="size-4" aria-hidden />
            Peer learning
          </p>
          <h2 id="find-pod-title" className="text-4xl font-semibold tracking-tight text-balance md:text-5xl">
            Learn faster in a pod
          </h2>
          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
            We&apos;ll match you with 2–3 students who are strong where you&apos;re stuck, and you&apos;ll teach them what you know.
          </p>
          <div className="mt-2 flex flex-col gap-3">
            <Button
              size="lg"
              onClick={onFind}
              disabled={pending}
              className="h-14 w-full rounded-xl px-8 text-lg font-semibold md:w-fit"
            >
              <Users className="size-5" aria-hidden />
              Find my pod
            </Button>
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
              Matched on skills, interests and availability. Never on personal characteristics.
            </p>
          </div>
        </div>
        <ul className="flex flex-col justify-center gap-4" aria-label="What you get in a pod">
          {POINTS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-4 rounded-2xl border bg-background/60 p-5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-5" aria-hidden />
              </span>
              <div>
                <p className="font-semibold">{title}</p>
                <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
