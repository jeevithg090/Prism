"use client";
import { ArrowLeftRight, GitPullRequest, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

const POINTS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Users, title: "2 to 3 students who fill your gaps", body: "Strong where you're stuck, and keen on what you know." },
  { icon: ArrowLeftRight, title: "Learn by teaching", body: "Everyone reviews someone else's work in a skill they already have." },
  { icon: GitPullRequest, title: "A real project on GitHub", body: "Issues for each of you, and merged PRs become proof on your passport." },
];

/** Empty state for /pods: invite the student to be matched. */
export function FindPodHero({ onFind, pending = false }: { onFind: () => void; pending?: boolean }) {
  return (
    <section aria-labelledby="find-pod-title" className="rounded-2xl border bg-card shadow-sm">
      <div className="grid gap-8 p-6 md:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-12 lg:p-10">
        <div className="flex min-w-0 flex-col gap-4">
          <h2 id="find-pod-title" className="text-3xl font-semibold text-pretty md:text-4xl">
            Learn faster in a pod
          </h2>
          <p className="max-w-[46ch] text-lg text-pretty text-muted-foreground">
            We&apos;ll match you with 2 to 3 students who are strong where you&apos;re stuck, and you&apos;ll teach them what you know.
          </p>
          <div className="mt-2 flex flex-col gap-3">
            <Button size="lg" onClick={onFind} disabled={pending} aria-busy={pending || undefined} className="w-full sm:w-fit">
              <Users aria-hidden />
              Find my pod
            </Button>
            <p className="flex max-w-[46ch] items-start gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
              Matched on skills, interests and availability. Never on personal characteristics.
            </p>
          </div>
        </div>
        <ul className="rounded-xl bg-muted px-5 md:px-6" aria-label="What you get in a pod">
          {POINTS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-4 border-t py-5 first:border-t-0">
              <Icon className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0">
                <p className="text-lg font-semibold">{title}</p>
                <p className="mt-1 text-pretty text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
