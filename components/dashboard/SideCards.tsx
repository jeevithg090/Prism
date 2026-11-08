"use client";
// Dashboard side cards: Market pulse (only when the market route answers) and Ask Keystone.
import * as React from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { roleName, useMarket } from "./data";

const textLink = "font-medium text-primary underline decoration-1 underline-offset-4 outline-none hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** "214 ML engineer ads analysed, with Docker in 41%". Hidden while loading, on 404 and on error: it's a bonus card. */
export function MarketPulse({ roleId, focus }: { roleId: string; focus?: { skillId: string; name: string } }) {
  const q = useMarket(roleId);
  const m = q.data;
  if (!m || !m.adsAnalysed) return null;
  const share = focus ? m.skills.find((s) => s.skillId === focus.skillId)?.share : undefined;
  const top = m.skills[0];
  const hint =
    focus && share !== undefined
      ? `${roleName(roleId)} ads analysed, with ${focus.name} in ${Math.round(share * 100)}%`
      : top
        ? `${roleName(roleId)} ads analysed, with the top skill in ${Math.round(top.share * 100)}%`
        : `${roleName(roleId)} ads analysed`;
  return (
    <Link
      href="/market"
      className="block rounded-2xl outline-none transition-[transform] duration-(--dur-short) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-safe:hover:-translate-y-px motion-safe:active:translate-y-0"
    >
      {/* Same head as the Momentum and Ask Keystone cards beside it: region title, then the key number. */}
      <section className="flex h-full flex-col rounded-2xl border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-foreground">Market pulse</h2>
        <p className="mt-4 font-mono text-4xl leading-none font-semibold text-foreground tabular-nums">{m.adsAnalysed}</p>
        <p className="mt-2 text-sm text-pretty text-muted-foreground">{hint}</p>
        {/* The link is named by its visible text (WCAG 2.5.3 label in name), plus where it goes. */}
        <span className="sr-only">Open the Industry Radar</span>
      </section>
    </Link>
  );
}

export function AskKeystoneCard({ focusName }: { focusName?: string }) {
  return (
    <section aria-labelledby="ask-title" className="flex h-full flex-col rounded-2xl border bg-card p-6 shadow-sm">
      <h2 id="ask-title" className="text-xl font-semibold text-foreground">Ask Keystone</h2>
      <p className="mt-3 text-pretty text-muted-foreground">
        {focusName
          ? `Not sure why ${focusName} comes first, or how to fit it around lectures? Ask the coach.`
          : "Not sure what to learn next, or how to fit it around lectures? Ask the coach."}
      </p>
      <div className="mt-5">
        <Link href="/coach" className={cn(buttonVariants({ variant: "outline" }), "w-full sm:w-auto")}>
          Ask the coach
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
        <h2 className="text-xl font-semibold text-foreground">{this.props.title}</h2>
        <p className="mt-2 text-pretty text-muted-foreground">This card didn&apos;t load. The rest of your dashboard still works.</p>
        <Link href={this.props.href} className={cn(textLink, "mt-auto self-start pt-4 text-sm")}>
          Open {this.props.title.toLowerCase()}
        </Link>
      </section>
    );
  }
}
