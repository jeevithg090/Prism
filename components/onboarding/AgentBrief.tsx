"use client";
import { AgentAvatar, AGENT_META } from "@/components/keystone";
import { cn } from "@/lib/utils";
import type { AgentName } from "@/lib/types";
import { FORMATS, hoursLabel, ROLES, TIMELINES, type OnboardDraft } from "./draft";

// The screen's signature: the brief your answers become. Each row is one agent and the part of the
// form it reads (the same facts each step's heading states), filling in as you go. A row only shows
// an answer once you have reached the step that asks for it, so defaults never pose as answers.

type Row = { agent: AgentName; reads: string; value: string | null; detail?: string; steps: number[]; pending: string };

function rows(d: OnboardDraft, reached: number): Row[] {
  const role = ROLES.find((r) => r.id === d.roleId);
  const timeline = TIMELINES.find((t) => t.id === d.timeline);
  const formats = FORMATS.filter((f) => d.formats.includes(f.id)).map((f) => f.name).join(", ");
  const login = d.githubLogin.trim();
  return [
    { agent: "syllabus", reads: "Your programme page", value: d.university.trim() || null, detail: `Year ${d.year}`, steps: [0], pending: "Add your university in step 1" },
    { agent: "market", reads: "UK job ads for the role you pick", value: role?.name ?? null, detail: timeline?.when, steps: [1], pending: "Pick a role in step 2" },
    {
      agent: "roadmap", reads: "Your hours and how you like to learn",
      value: reached >= 1 ? hoursLabel(d.hoursPerWeek) : null,
      detail: reached >= 2 && formats ? formats : undefined,
      steps: [1, 2], pending: "Set your hours in step 2",
    },
    { agent: "evidence", reads: "Your public GitHub repos", value: login ? `github.com/${login}` : null, steps: [3], pending: "Optional, in step 4" },
  ];
}

export function AgentBrief({ draft, step, reached = step }: { draft: OnboardDraft; step: number; reached?: number }) {
  return (
    <aside aria-labelledby="ob-brief-title" className="rounded-2xl border bg-card p-6 shadow-sm lg:sticky lg:top-[calc(var(--topbar-height)+2rem)]">
      <h2 id="ob-brief-title" className="text-xl font-semibold text-foreground">What your agents will read</h2>
      <p className="mt-1 text-sm text-muted-foreground">This fills in as you answer.</p>
      <ul className="mt-5 space-y-1">
        {rows(draft, Math.max(reached, step)).map((r) => {
          const here = r.steps.includes(step);
          return (
            <li key={r.agent} className={cn("flex items-start gap-3 rounded-xl p-3 transition-[background-color] duration-(--dur-short)", here && "bg-muted")}>
              {/* The GitHub mark ignores AgentAvatar's inline size; pin every icon to the same 18px. */}
              <span className="contents [&_svg]:size-4.5">
                <AgentAvatar agent={r.agent} size={36} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline justify-between gap-2 text-base font-semibold text-foreground">
                  {AGENT_META[r.agent].name}
                  {here && <span className="shrink-0 text-sm font-medium text-primary">This step</span>}
                </p>
                <p className="text-sm text-muted-foreground">{r.reads}</p>
                {r.value ? (
                  <p className="mt-1.5 text-lg font-semibold break-words text-foreground">
                    {r.value}
                    {r.detail && <span className="block text-sm font-normal text-muted-foreground">{r.detail}</span>}
                  </p>
                ) : (
                  <p className="mt-1.5 text-sm text-muted-foreground">{r.pending}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
