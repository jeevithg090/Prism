import type { Metadata } from "next";
import { BookmarkPlus, Brain, Eye, Hand, ListChecks, MessageSquareText, ShieldCheck, Wrench } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/keystone";
import { CoachPanel } from "@/components/coach/CoachPanel";
import { CoachMemory } from "@/components/coach/CoachMemory";

export const metadata: Metadata = { title: "Coach · Keystone" };

const LOOP = [
  { icon: Brain, name: "Perceive", text: "Reads a short brief: your readiness, top gaps, this week's focus, your pod and what it remembers." },
  { icon: ListChecks, name: "Plan", text: "Writes down which Keystone agents to ask before doing anything." },
  { icon: Wrench, name: "Act", text: "Calls specialist agents as tools: Roadmap, Matchmaker, Architect, Tech Lead, Trajectories, Guides." },
  { icon: Eye, name: "Observe", text: "Reads a short summary of each result, never raw data dumps." },
  { icon: Hand, name: "You decide", text: "Anything that changes data or touches GitHub waits for your Approve." },
  { icon: ShieldCheck, name: "Reflect", text: "A grounding check removes any number it can't trace to your data." },
  { icon: MessageSquareText, name: "Answer", text: "A short, kind answer with a receipt for every recommendation." },
  { icon: BookmarkPlus, name: "Remember", text: "Notes how you like to learn. You can see and delete every note." },
];

export default function CoachPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Coach"
        subtitle="One agent you can ask “What should I do this week?”. It plans, asks Keystone's agents, and checks with you before acting."
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex h-[calc(100dvh-14rem)] min-h-[520px] flex-col rounded-2xl border bg-muted/30 p-4 md:p-5">
          <CoachPanel streamToActivity />
        </div>
        <aside className="min-w-0 space-y-6">
          <SectionCard title="How the Coach works" description="A real agent loop, shown step by step on every answer.">
            <ol className="space-y-3">
              {LOOP.map(({ icon: Icon, name, text }, i) => (
                <li key={name} className="flex gap-3">
                  <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <div className="text-sm">
                    <p className="font-semibold">
                      <span className="sr-only">Step {i + 1}: </span>
                      {name}
                    </p>
                    <p className="text-muted-foreground">{text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-4 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
              Principles: explicit plan · typed tools with declared effects · human approval · grounding check · visible, deletable memory.
              Without an AI key it runs on Keystone&apos;s deterministic rules, and it says so.
            </p>
          </SectionCard>
          <SectionCard title="What the Coach remembers" description="Opt-in notes from your chats. Delete any of them.">
            <CoachMemory />
          </SectionCard>
        </aside>
      </div>
    </div>
  );
}
