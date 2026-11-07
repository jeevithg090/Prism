import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  BadgeCheck,
  ClipboardCheck,
  GitPullRequest,
  GraduationCap,
  Hammer,
  Network,
  Presentation,
  Route,
  Sprout,
  Users,
  type LucideIcon,
} from "lucide-react";
import aishaMap from "@/data/fixtures/bridgemap.aisha.ml-engineer.json";
import aishaProfile from "@/data/fixtures/profile.aisha.json";
import aishaPod from "@/data/fixtures/pod.aisha.json";
import { DemoDataNote, ReadinessRing, StatusBadge } from "@/components/keystone";
import { LevelChips } from "@/components/pods/LevelChips";
import { KeystoneMark } from "@/components/shell/Sidebar";
import { buttonVariants } from "@/components/ui/button";
import type { BridgeMap } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Keystone · Your degree is the foundation",
  description: "Keystone reads your syllabus, real job ads and your public work, then plans only what your degree doesn't teach yet.",
};

// Every number on this page comes from the demo fixtures (Aisha's map, profile and pod), labelled as demo data.
const map = aishaMap as BridgeMap;
const pct = (n: number) => Math.round(n * 100);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const by = (() => {
  const m = aishaProfile.dna.targetDate.match(/^(\d{4})-(\d{2})/);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : "";
})();
const docker = map.nodes.find((n) => n.skillId === "docker");
const later = map.nodes.filter((n) => n.status === "degree-upcoming");
const proven = map.nodes.filter((n) => n.status === "proven");
const cap = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);
const myIssue = aishaPod.project.issues.find((i) => i.assigneeUserId === "aisha" && i.skillId === "docker");
const iReview = aishaPod.project.issues.find((i) => i.reviewerUserId === "aisha");
const podLine = [
  myIssue && `${cap(myIssue.reviewerUserId)} reviews her Docker PR`,
  iReview && `she reviews ${cap(iReview.assigneeUserId)}'s ${iReview.skillId === "python" ? "Python" : iReview.skillId}`,
].filter(Boolean).join(", and ");

const primaryCta = cn(buttonVariants(), "h-12 w-full rounded-xl px-6 text-base sm:w-fit");
const secondaryCta = cn(buttonVariants({ variant: "outline" }), "h-12 w-full rounded-xl px-6 text-base sm:w-fit");

function Ctas() {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Link href="/dashboard?demo=1" className={primaryCta}>
        Try the demo as Aisha
        <ArrowRight aria-hidden />
      </Link>
      <Link href="/onboard" className={secondaryCta}>
        Start onboarding
      </Link>
    </div>
  );
}

/** A live product view (the real dashboard components, fed with Aisha's demo data). */
function HeroPreview() {
  return (
    <figure aria-label="Aisha's dashboard in Keystone" className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">Aisha&apos;s dashboard · Year 1, BSc CS</p>
        <DemoDataNote />
      </div>
      <div className="mt-5 flex items-center gap-5">
        <ReadinessRing value={map.readinessNow} projected={map.readinessProjected} label={`→ ${pct(map.readinessProjected)}% by ${by}`} />
        <div className="min-w-0">
          <p className="text-lg font-semibold">{pct(map.readinessNow)}% ready for ML engineer roles</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {pct(map.readinessProjected)}% by {by} if she follows her roadmap.
          </p>
        </div>
      </div>
      {docker && (
        <div className="mt-5 rounded-xl bg-muted/60 p-4">
          <p className="text-sm text-muted-foreground">This week</p>
          <p className="mt-0.5 text-xl font-semibold tracking-tight">Docker</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusBadge status="gap" />
            {docker.trend === "rising" && <StatusBadge status="rising" />}
          </div>
          <p className="mt-2 text-sm">
            <span className="font-mono font-semibold tabular-nums">{pct(docker.demand)}%</span> of ML engineer ads ask for Docker, and none of her modules teach it.
          </p>
        </div>
      )}
      <ul className="mt-4 space-y-3 text-sm">
        <li className="flex gap-2.5">
          <GraduationCap className="mt-0.5 size-4 shrink-0 text-status-degree" aria-hidden />
          <span>
            <span className="font-medium">Skipped:</span> {later.slice(0, 3).map((n) => n.name).join(", ")} and {later.length - 3} more. Her degree teaches them later.
          </span>
        </li>
        <li className="flex gap-2.5">
          <Users className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>
            <span className="font-medium">{aishaPod.name}:</span> {podLine}.
          </span>
        </li>
      </ul>
    </figure>
  );
}

const PILLARS: { icon: LucideIcon; title: string; line: string }[] = [
  { icon: Route, title: "Learning", line: "A week-by-week roadmap that skips what your modules already teach, with a Why? receipt on every step." },
  { icon: ClipboardCheck, title: "Assessment", line: "Skills count when there's proof: a merged PR, a micro-challenge or a mock interview. Never a self-rating." },
  { icon: Presentation, title: "Teaching", line: "You teach a pod-mate what you know. Lecturers see anonymous cohort gaps and lab ideas for groups of 10 or more." },
];

const STEPS: { icon: LucideIcon; title: string; href: string; body: string }[] = [
  {
    icon: Network,
    title: "Bridge Map",
    href: "/map?demo=1",
    body: `Your syllabus, real job ads and your GitHub on one map. For Aisha: ${proven.length} skills proven, ${later.length} covered later by her degree, Docker the biggest gap.`,
  },
  {
    icon: Route,
    title: "Roadmap",
    href: "/roadmap?demo=1",
    body: "Weeks that build on your modules, skip what they'll teach you anyway, and go lighter in exam weeks.",
  },
  {
    icon: Users,
    title: "Pod",
    href: "/pods?demo=1",
    body: "Two or three students who are strong where you're stuck. Aisha learns Docker from Priya and reviews Mei's Python.",
  },
  {
    icon: BadgeCheck,
    title: "Proof",
    href: "/profile/aisha?demo=1",
    body: "A real GitHub project. When a teammate approves your PR, the skill moves up your Skill Passport.",
  },
];

const LADDER: { icon: LucideIcon; rung: string; how: string }[] = [
  { icon: Sprout, rung: "Tried it", how: "You finished a micro-challenge" },
  { icon: Hammer, rung: "Built it", how: "A pod-mate approved your merged PR" },
  { icon: GitPullRequest, rung: "Can teach it", how: "You reviewed someone else's work in it" },
];

const FAQ: { q: string; a: string }[] = [
  { q: "Does Keystone grade me?", a: "No. Agents propose and you decide. A skill counts only when there's proof you chose to share, and every recommendation explains where it came from." },
  { q: "What does it read?", a: "Your programme's public syllabus, job ads, and public work you link, like your GitHub. Nothing is posted anywhere on your behalf." },
  { q: "How are pods matched?", a: "On skills, interests and availability. Never on personal characteristics. Badges like 🌱 New to UoM are optional and only send help your way." },
];

export default function Landing() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 md:px-8">
          <Link href="/" className="flex items-center gap-2.5 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <KeystoneMark />
            <span className="text-lg font-semibold tracking-tight">Keystone</span>
          </Link>
          <nav aria-label="Landing" className="flex items-center gap-1 text-sm font-medium">
            <a href="#how" className="hidden rounded-lg px-3 py-2 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:inline-block">
              How it works
            </a>
            <Link href="/lecturer" className="rounded-lg px-3 py-2 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
              For lecturers
            </Link>
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1">
        <section aria-labelledby="hero-title" className="border-b bg-linear-to-b from-primary/5 to-background">
          <div className="mx-auto grid w-full max-w-7xl gap-12 px-4 py-14 md:px-8 md:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:items-center">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-primary">Reply · AI on Campus</p>
              <h1 id="hero-title" className="mt-3 text-4xl font-semibold tracking-tight text-balance md:text-display">
                <span className="text-muted-foreground">Your degree is the foundation.</span> Keystone builds the bridge.
              </h1>
              <p className="mt-5 max-w-xl text-lg text-muted-foreground md:text-xl">
                Agents read your syllabus, real job ads and your public work, then plan only what your degree doesn&apos;t teach yet, with a pod of students to build it with.
              </p>
              <div className="mt-8">
                <Ctas />
              </div>
              <p className="mt-6 max-w-xl text-sm text-muted-foreground">
                The demo follows Aisha, a first-year Computer Science student at Manchester who wants to become an ML engineer.
              </p>
            </div>
            <HeroPreview />
          </div>
        </section>

        <section aria-labelledby="pillars-title" className="mx-auto w-full max-w-7xl px-4 py-14 md:px-8 md:py-20">
          <h2 id="pillars-title" className="max-w-2xl text-2xl font-semibold tracking-tight text-balance md:text-h2">
            Learning, assessment and teaching, joined up around the degree you already have
          </h2>
          <ul className="mt-10 grid gap-8 md:grid-cols-3">
            {PILLARS.map((p) => (
              <li key={p.title} className="border-t pt-6">
                <p.icon className="size-6 text-primary" aria-hidden />
                <h3 className="mt-4 text-xl font-semibold">{p.title}</h3>
                <p className="mt-2 text-muted-foreground">{p.line}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="how" aria-labelledby="how-title" className="scroll-mt-6 border-y bg-card">
          <div className="mx-auto w-full max-w-7xl px-4 py-14 md:px-8 md:py-20">
            <h2 id="how-title" className="text-2xl font-semibold tracking-tight md:text-h2">How it works</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">Four steps, each one a page in the demo. Every step has a Why? so you can see the numbers behind it.</p>
            <ol className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex flex-col rounded-2xl border bg-background p-6">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 font-mono text-base font-semibold text-primary tabular-nums">
                      {i + 1}
                    </span>
                    <s.icon className="size-5 text-muted-foreground" aria-hidden />
                  </div>
                  <h3 className="mt-4 text-xl font-semibold">{s.title}</h3>
                  <p className="mt-2 text-muted-foreground">{s.body}</p>
                  <Link href={s.href} className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
                    {s.title === "Proof" ? "See the Skill Passport" : `See the ${s.title}`}
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="ladder-title" className="mx-auto w-full max-w-7xl px-4 py-14 md:px-8 md:py-20">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
            <div>
              <h2 id="ladder-title" className="text-2xl font-semibold tracking-tight md:text-h2">Proof climbs a ladder</h2>
              <p className="mt-3 text-muted-foreground">
                Keystone turns what you&apos;re taught into what you can prove. Each skill on your passport sits on one rung, and only real work moves it up.
              </p>
            </div>
            <ol className="grid gap-4 sm:grid-cols-3" aria-label="The proof ladder, from first try to teaching">
              {LADDER.map((r, i) => (
                <li key={r.rung} className="relative rounded-2xl border bg-card p-6 shadow-sm">
                  <span className="font-mono text-sm text-muted-foreground tabular-nums">Rung {i + 1}</span>
                  <r.icon className="mt-3 size-6 text-status-proven" aria-hidden />
                  <h3 className="mt-3 text-xl font-semibold">{r.rung}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{r.how}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="faq-title" className="border-t">
          <div className="mx-auto w-full max-w-7xl px-4 py-14 md:px-8 md:py-20">
            <h2 id="faq-title" className="text-2xl font-semibold tracking-tight md:text-h2">Questions students ask first</h2>
            <dl className="mt-8 grid gap-8 md:grid-cols-3">
              {FAQ.map((f) => (
                <div key={f.q}>
                  <dt className="text-lg font-semibold">{f.q}</dt>
                  <dd className="mt-2 text-muted-foreground">{f.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section aria-labelledby="reply-title" className="border-t bg-card">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-14 md:px-8 md:py-16 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <h2 id="reply-title" className="text-2xl font-semibold tracking-tight md:text-h2">Built for Reply&apos;s AI on Campus</h2>
              <p className="mt-2 max-w-xl text-muted-foreground">
                Specialist agents hand work to each other, one knowledge graph joins modules, job ads and people, and Bridge Week takes it to campus.
              </p>
              <LevelChips
                items={["multi-agent", "knowledge-graph", "launch-campaign"]}
                className="mt-4 [&_button]:h-8 [&_button]:px-3 [&_button]:text-sm [&_button>span:first-child]:text-xs"
              />
            </div>
            <div className="shrink-0">
              <Ctas />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between md:px-8">
          <p>Keystone · GreatUniHack 2026</p>
          <p>Seeded demo data is labelled &ldquo;Demo data&rdquo; wherever it appears.</p>
        </div>
      </footer>
    </div>
  );
}
