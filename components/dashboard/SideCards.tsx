"use client";
// Dashboard side cards: Market pulse (only when the market route answers) and Ask Keystone.
import * as React from "react";
import Link from "next/link";
import { ArrowRight, Briefcase, Sparkles } from "lucide-react";
import { StatCard } from "@/components/keystone";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { roleName, useMarket } from "./data";

/** "214 ads analysed · Docker in 41%". Hidden while loading, on 404 and on error: it's a bonus card. */
export function MarketPulse({ roleId, focus }: { roleId: string; focus?: { skillId: string; name: string } }) {
  const q = useMarket(roleId);
  const m = q.data;
  if (!m || !m.adsAnalysed) return null;
  const share = focus ? m.skills.find((s) => s.skillId === focus.skillId)?.share : undefined;
  const top = m.skills[0];
  const hint =
    focus && share !== undefined
      ? `${roleName(roleId)} ads analysed · ${focus.name} in ${Math.round(share * 100)}%`
      : top
        ? `${roleName(roleId)} ads analysed · top skill in ${Math.round(top.share * 100)}%`
        : `${roleName(roleId)} ads analysed`;
  return (
    <Link href="/market" aria-label={`Market pulse: ${m.adsAnalysed} ${hint}. Open the Industry Radar`} className="block rounded-2xl outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring">
      <StatCard label="Market pulse" value={m.adsAnalysed} hint={hint} icon={Briefcase} />
    </Link>
  );
}

export function AskKeystoneCard({ focusName }: { focusName?: string }) {
  return (
    <section aria-labelledby="ask-title" className="flex h-full flex-col rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="size-5" aria-hidden />
        </span>
        <h2 id="ask-title" className="text-xl font-semibold tracking-tight">Ask Keystone</h2>
      </div>
      <p className="mt-3 text-muted-foreground">
        {focusName
          ? `Not sure why ${focusName} comes first, or how to fit it around lectures? Ask the coach.`
          : "Not sure what to learn next, or how to fit it around lectures? Ask the coach."}
      </p>
      <div className="mt-auto pt-5">
        <Link href="/coach" className={cn(buttonVariants({ variant: "outline" }), "h-11 w-full rounded-xl px-4 text-base sm:w-fit")}>
          Ask the coach
          <ArrowRight aria-hidden />
        </Link>
      </div>
    </section>
  );
}

/** Keeps a slot (P5's pod and momentum cards) from taking the dashboard down with it. */
export class SlotBoundary extends React.Component<{ title: string; href: string; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn(`[dashboard] ${this.props.title} card failed`, error);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="flex h-full flex-col rounded-2xl border bg-card p-6 shadow-sm" data-testid="slot-fallback">
        <h2 className="text-xl font-semibold tracking-tight">{this.props.title}</h2>
        <p className="mt-2 text-muted-foreground">This card didn&apos;t load. The rest of your dashboard still works.</p>
        <Link href={this.props.href} className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium text-primary underline-offset-4 hover:underline">
          Open {this.props.title.toLowerCase()}<ArrowRight className="size-4" aria-hidden />
        </Link>
      </section>
    );
  }
}
