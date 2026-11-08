import type { Metadata } from "next";
import { BookmarkPlus, Brain, Eye, Hand, ListChecks, MessageSquareText, ShieldCheck, Wrench } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/keystone";
import { CoachPanel } from "@/components/coach/CoachPanel";
import { CoachMemory } from "@/components/coach/CoachMemory";
import "./coach.css";

export const metadata: Metadata = { title: "Coach · Keystone" };

const LOOP = [
  { icon: Brain, name: "Perceive", text: "Reads a short brief: your readiness, top gaps, this week's focus, your pod and what it remembers." },
  { icon: ListChecks, name: "Plan", text: "Writes down which Keystone agents to ask before doing anything." },
  { icon: Wrench, name: "Act", text: "Calls specialist agents as tools: Roadmap, Matchmaker, Architect, Tech Lead, Trajectories, Guides." },
  { icon: Eye, name: "Observe", text: "Reads a short summary of each result, never raw data dumps." },
  { icon: Hand, name: "You decide", text: "Anything that touches GitHub or acts outside Keystone waits for your Approve." },
  { icon: ShieldCheck, name: "Reflect", text: "A grounding check removes any number it can't trace to your data." },
  { icon: MessageSquareText, name: "Answer", text: "A short, kind answer with a receipt for every recommendation." },
  { icon: BookmarkPlus, name: "Remember", text: "Notes how you like to learn. You can see and delete every note." },
];

export default function CoachPage() {
  return (
    <div>
      <PageHeader
        title="Coach"
        subtitle="One agent you can ask “What should I do this week?”. It plans, asks Keystone's agents, and checks with you before it touches GitHub."
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* The conversation leads. Empty, the composer sits right under the starter card; once answers arrive the
            panel fills the screen and scrolls inside on a laptop or projector. On a phone it flows with the page. */}
        <div className="flex min-w-0 flex-col">
          <CoachPanel streamToActivity />
        </div>
        <aside className="min-w-0 space-y-8" aria-label="About the Coach">
          <SectionCard title="How the Coach works" description="A real agent loop, shown step by step on every answer.">
            {/* Drawn with the same marks as the live timeline in every answer, so the loop reads the same in both places. */}
            <ol>
              {LOOP.map(({ icon: Icon, name, text }, i) => (
                <li key={name} className="group relative grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3 pb-4 last:pb-0">
                  <span aria-hidden className="absolute top-7 bottom-1 left-2.5 w-px bg-border group-last:hidden" />
                  <Icon className="mt-0.5 size-5 text-muted-foreground" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      <span className="sr-only">Step {i + 1}: </span>
                      {name}
                    </p>
                    <p className="mt-0.5 text-sm text-pretty text-muted-foreground">{text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-6 rounded-xl bg-muted p-4 text-sm text-pretty text-muted-foreground">
              It keeps five principles: an explicit plan, typed tools with declared effects, human approval, a grounding check, and
              visible, deletable memory. Without an AI key it runs on Keystone&apos;s deterministic rules, and it says so.
            </p>
          </SectionCard>
          <section aria-labelledby="coach-memory-title">
            <h2 id="coach-memory-title" className="text-xl font-semibold text-foreground">What the Coach remembers</h2>
            <p className="mt-1 text-sm text-muted-foreground">Opt-in notes from your chats. Delete any of them.</p>
            <div className="mt-4">
              <CoachMemory />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
