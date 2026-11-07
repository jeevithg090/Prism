// /labs: the Labs hub. Every Labs feature, grouped by pillar, with the Keystone parts it connects and the agent that runs it.
import { createElement } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { FlaskConical, icons, type LucideIcon } from "lucide-react";
import { AgentAvatar, EmptyState, PageHeader } from "@/components/keystone";
import type { AgentName } from "@/lib/types";

// Server-side names (AGENT_META lives in a "use client" module, so a server component cannot read it).
const AGENT_NAMES: Record<AgentName, string> = {
  orchestrator: "Orchestrator", syllabus: "Syllabus agent", skillmap: "Skill map agent", market: "Market agent", trends: "Trends agent",
  evidence: "Evidence agent", roadmap: "Roadmap agent", matchmaker: "Matchmaker", architect: "Project Architect", techlead: "Tech Lead",
  trajectories: "Trajectories agent", guides: "Guides agent", voice: "Voice coach", n8n: "n8n automations",
};
import { LAB_FEATURES } from "@/lib/features";
import type { LabFeature, Pillar } from "@/lib/features/types";

export const metadata: Metadata = {
  title: "Keystone Labs",
  description: "New Keystone tools for learning, assessment and teaching, each wired into the screens and agents you already use.",
};

const PILLARS: { id: Pillar; title: string; description: string }[] = [
  { id: "learning", title: "Learning", description: "See where you stand, try a plan before you commit to it, and find the shortest way to the role you want." },
  { id: "assessment", title: "Assessment", description: "Show what you understand in ways a lecturer or an employer can check for themselves." },
  { id: "teaching", title: "Teaching", description: "For lecturers: what the cohort understands right now, and which parts of the course are ageing." },
];

/** The feature's lucide icon by name, falling back to the Labs flask. */
function FeatureIcon({ name }: { name: string }) {
  const icon = (icons as Record<string, LucideIcon>)[name] ?? FlaskConical;
  return createElement(icon, { className: "mt-0.5 size-5 shrink-0 text-muted-foreground", "aria-hidden": true });
}

function LabCard({ feature }: { feature: LabFeature }) {
  const agent = { name: AGENT_NAMES[feature.agent] ?? AGENT_NAMES.orchestrator };
  return (
    <li
      data-lab={feature.key}
      className="relative flex flex-col rounded-2xl border bg-card p-6 shadow-sm transition-transform duration-(--dur-short) hover:-translate-y-px has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div className="flex items-start gap-3">
        <FeatureIcon name={feature.icon} />
        <h3 className="min-w-0 text-lg font-semibold text-balance text-foreground">
          <Link href={feature.href} className="outline-none after:absolute after:inset-0 after:rounded-2xl after:content-['']">
            {feature.title}
          </Link>
        </h3>
      </div>
      <p className="mt-2 text-base text-pretty text-muted-foreground">{feature.summary}</p>
      {feature.connects.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium text-ink-2">Works with</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {feature.connects.map((part) => (
              <li key={part} className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-ink-2">{part}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-auto flex items-center gap-2.5 pt-5">
        <AgentAvatar agent={feature.agent} size={28} />
        <p className="text-sm text-ink-2">Run by the {agent.name.charAt(0).toLowerCase() + agent.name.slice(1)}</p>
      </div>
    </li>
  );
}

export default function LabsPage() {
  const groups = PILLARS.map((p) => ({
    ...p,
    features: LAB_FEATURES.filter((f) => f.pillar === p.id).sort((a, b) => a.title.localeCompare(b.title)),
  })).filter((g) => g.features.length > 0);

  return (
    <>
      <PageHeader
        title="Labs"
        subtitle={`${LAB_FEATURES.length} new tools that plug into the parts of Keystone you already use. Each one names the agent that does the work, and nothing it suggests changes your plan until you say so.`}
      />
      {groups.length === 0 ? (
        <EmptyState icon={FlaskConical} title="No labs are switched on yet" body="Labs appear here as soon as a feature is added to Keystone. Your dashboard has everything you need this week." action={<Link href="/dashboard" className="text-sm font-medium text-primary underline-offset-4 hover:underline">Go to your dashboard</Link>} />
      ) : (
        <div className="space-y-10">
          {groups.map((g) => (
            <section key={g.id} aria-labelledby={`labs-${g.id}`}>
              <h2 id={`labs-${g.id}`} className="text-xl font-semibold text-foreground">{g.title}</h2>
              <p className="mt-1 max-w-[62ch] text-sm text-muted-foreground">{g.description}</p>
              <ul className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                {g.features.map((f) => <LabCard key={f.key} feature={f} />)}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
