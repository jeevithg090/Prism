import Link from "next/link";
import type { Metadata } from "next";
import { ClipboardCheck, GitPullRequest, Hammer, Presentation, Route, Sprout, type LucideIcon } from "lucide-react";
import aishaMap from "@/data/fixtures/bridgemap.aisha.ml-engineer.json";
import aishaProfile from "@/data/fixtures/profile.aisha.json";
import aishaPod from "@/data/fixtures/pod.aisha.json";
import { DemoDataNote, ReadinessRing, StatusBadge } from "@/components/keystone";
import { ProductShot } from "@/components/landing/ProductShot";
import "@/components/landing/landing.css";
import bridgeMapShot from "@/components/landing/shots/bridge-map.webp";
import roadmapShot from "@/components/landing/shots/roadmap.webp";
import podShot from "@/components/landing/shots/pod.webp";
import passportShot from "@/components/landing/shots/passport.webp";
import { LevelChips } from "@/components/pods/LevelChips";
import { KeystoneMark } from "@/components/shell/Sidebar";
import { buttonVariants } from "@/components/ui/button";
import type { BridgeMap } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Keystone: your degree is the foundation",
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

/** One container for every band: capped and centred, so at 1920 the gutters grow and the grids hold. */
const CONTAINER = "mx-auto w-full max-w-7xl px-4 md:px-8";
const SECTION_HEAD = "text-4xl font-semibold tracking-tight lg:text-5xl";
const TEXT_LINK =
  "rounded-md font-medium text-primary underline decoration-1 underline-offset-4 outline-none transition-[color] duration-(--dur-short) hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:text-foreground";
const NAV_LINK =
  "rounded-lg px-3 py-2 text-muted-foreground outline-none transition-[color] duration-(--dur-short) hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:text-foreground";

const primaryCta = cn(buttonVariants({ size: "lg" }), "w-full sm:w-fit");
const secondaryCta = cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full sm:w-fit");

function Ctas() {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Link href="/dashboard?demo=1" className={primaryCta}>
        Try the demo as Aisha
      </Link>
      <Link href="/onboard" className={secondaryCta}>
        Start onboarding
      </Link>
    </div>
  );
}

/** Aisha's readiness, built live from the real dashboard components and her demo data (the hero's picture). */
function ReadinessPreview({ caption }: { caption?: React.ReactNode }) {
  return (
    <figure aria-label="Aisha's dashboard in Keystone" className="min-w-0">
      <div data-slot="product" data-kind="product" className="rounded-2xl border bg-card p-6 shadow-sm md:p-8">
        <p className="text-sm font-medium text-muted-foreground">Aisha&apos;s dashboard, Year 1, BSc CS</p>
        <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-center">
          <ReadinessRing value={map.readinessNow} projected={map.readinessProjected} label={`${pct(map.readinessProjected)}% by ${by}`} />
          <div className="min-w-0">
            <p className="text-2xl font-semibold tracking-tight">{pct(map.readinessNow)}% ready for ML engineer roles</p>
            <p className="mt-1 text-muted-foreground">
              {pct(map.readinessProjected)}% by {by} if she follows her roadmap.
            </p>
          </div>
        </div>
        {docker && (
          <div className="mt-6 rounded-xl bg-muted p-5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="text-xl font-semibold tracking-tight">This week: Docker</p>
              <div className="flex flex-wrap gap-2">
                <StatusBadge status="gap" />
                {docker.trend === "rising" && <StatusBadge status="rising" />}
              </div>
            </div>
            <p className="mt-3 flex items-baseline gap-3">
              <span className="font-mono text-4xl font-semibold tabular-nums">{pct(docker.demand)}%</span>
              <span className="text-muted-foreground">of ML engineer ads ask for Docker, and none of her modules teach it.</span>
            </p>
          </div>
        )}
      </div>
      {caption && <figcaption className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">{caption}</figcaption>}
    </figure>
  );
}

const PILLARS: { icon: LucideIcon; title: string; line: string }[] = [
  { icon: Route, title: "Learning", line: "A week-by-week roadmap that skips what your modules already teach, with a Why? receipt on every step." },
  { icon: ClipboardCheck, title: "Assessment", line: "Skills count when there's proof: a merged PR, a micro-challenge or a mock interview. Never a self-rating." },
  { icon: Presentation, title: "Teaching", line: "You teach a pod-mate what you know. Lecturers see anonymous cohort gaps and lab ideas for groups of 10 or more." },
];

const STEPS: { title: string; href: string; body: string }[] = [
  {
    title: "Bridge Map",
    href: "/map?demo=1",
    body: `Your syllabus, real job ads and your GitHub on one map. For Aisha: ${proven.length} skills proven, ${later.length} covered later by her degree, Docker the biggest gap.`,
  },
  {
    title: "Roadmap",
    href: "/roadmap?demo=1",
    body: "Weeks that build on your modules, skip what they'll teach you anyway, and go lighter in exam weeks.",
  },
  {
    title: "Pod",
    href: "/pods?demo=1",
    body: "Two or three students who are strong where you're stuck. Aisha learns Docker from Priya and reviews Mei's Python.",
  },
  {
    title: "Proof",
    href: "/profile/aisha?demo=1",
    body: "A real GitHub project. When a teammate approves your PR, the skill moves up your Skill Passport.",
  },
];

/** The picture beside each step: a capture of the page it names, cropped inside the app's own card so the frame is the only line. */
const STEP_VISUALS: Record<string, React.ReactNode> = {
  "Bridge Map": (
    <ProductShot
      src={bridgeMapShot}
      alt="Aisha's Bridge Map in Keystone: a skills graph in four columns, proven, in your degree, later in your degree and gap, with Docker selected at the top of her 13 gaps"
    />
  ),
  Roadmap: (
    <ProductShot
      src={roadmapShot}
      alt="Aisha's roadmap in Keystone: week 1 is Docker, with a learn, practise and build task and her proof for the week, then week 2, PyTorch"
      caption={
        <span>
          Skipped: {later.slice(0, 3).map((n) => n.name).join(", ")} and {later.length - 3} more. Her degree teaches them later.
        </span>
      }
    />
  ),
  Pod: (
    <ProductShot
      src={podShot}
      alt="Aisha's pod project in Keystone: VisionAid, an accessible image captioning API, planned as a 3-week project with one milestone a week"
      caption={
        <span>
          {aishaPod.name}: {podLine}.
        </span>
      }
    />
  ),
  Proof: (
    <ProductShot
      src={passportShot}
      alt="Aisha's Skill Passport in Keystone: Python, Git and Data structures each sit on the Tried it rung, with Built it and Can teach it still to climb, and every rung links to its proof"
    />
  ),
};

const LADDER: { icon: LucideIcon; rung: string; how: string }[] = [
  { icon: Sprout, rung: "Tried it", how: "You finished a micro-challenge" },
  { icon: Hammer, rung: "Built it", how: "A pod-mate approved your merged PR" },
  { icon: GitPullRequest, rung: "Can teach it", how: "You reviewed someone else's work in it" },
];
/** Each rung sits higher than the last, so the three wells read as a stair. */
const RUNG_STEP = ["", "sm:mb-14", "sm:mb-28"];

const FAQ: { q: string; a: string }[] = [
  { q: "Does Keystone grade me?", a: "No. Agents propose and you decide. A skill counts only when there's proof you chose to share, and every recommendation explains where it came from." },
  { q: "What does it read?", a: "Your programme's public syllabus, job ads, and public work you link, like your GitHub. Nothing is posted anywhere on your behalf." },
  { q: "How are pods matched?", a: "On skills, interests and availability. Never on personal characteristics. Badges like New to UoM are optional and only send help your way." },
];

export default function Landing() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header>
        <div className={cn(CONTAINER, "flex h-16 items-center justify-between gap-4")}>
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-xl outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:opacity-80"
          >
            <KeystoneMark />
            <span className="text-lg font-semibold tracking-tight">Keystone</span>
          </Link>
          <nav aria-label="Landing" className="flex items-center gap-1 text-sm font-medium">
            <a href="#how" className={cn(NAV_LINK, "hidden sm:inline-block")}>
              How it works
            </a>
            <Link href="/lecturer" className={NAV_LINK}>
              For lecturers
            </Link>
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1">
        {/* Hero, Stage posture: the head on the narrow track, Aisha's live readiness on the wide one. */}
        <section aria-labelledby="hero-title">
          <div className={cn(CONTAINER, "grid gap-10 pt-8 pb-16 md:pt-12 lg:min-h-[calc(100svh-4rem)] lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] lg:items-center lg:gap-14 lg:pt-14 lg:pb-24")}>
            <div className="min-w-0">
              <h1 id="hero-title" className="text-4xl font-semibold tracking-tight sm:text-5xl xl:text-6xl">
                <span className="block">Your degree is the foundation.</span>
                <span className="block">Keystone builds the bridge.</span>
              </h1>
              <p className="mt-6 max-w-md text-lg text-muted-foreground">
                Agents read your syllabus, real job ads and your public work, then plan only what your degree doesn&apos;t teach yet, with a pod of students to build it with.
              </p>
              <div className="mt-8">
                <Ctas />
              </div>
            </div>
            <ReadinessPreview
              caption={
                <>
                  <span>The demo follows Aisha, a first-year Computer Science student at Manchester who wants to become an ML engineer.</span>
                  <DemoDataNote />
                </>
              }
            />
          </div>
        </section>

        <section aria-labelledby="pillars-title" className="border-t">
          <div className={cn(CONTAINER, "py-24 lg:py-30")}>
            <h2 id="pillars-title" className={cn(SECTION_HEAD, "max-w-4xl")}>
              Learning, assessment and teaching, joined up around the degree you already have
            </h2>
            <ul className="mt-14 border-b">
              {PILLARS.map((p) => (
                <li key={p.title} className="grid gap-3 border-t py-8 md:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] md:items-baseline md:gap-8">
                  <h3 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
                    <p.icon className="size-6 shrink-0 text-muted-foreground" aria-hidden />
                    {p.title}
                  </h3>
                  <p className="max-w-2xl text-lg text-muted-foreground">{p.line}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="how" aria-labelledby="how-title" className="scroll-mt-6 border-t bg-sidebar">
          <div className={cn(CONTAINER, "py-24 lg:py-36")}>
            <div className="max-w-2xl">
              <h2 id="how-title" className={SECTION_HEAD}>How it works</h2>
              <p className="mt-4 text-lg text-muted-foreground">Four steps, each one a page in the demo. Every step has a Why? so you can see the numbers behind it.</p>
            </div>
            <ol className="mt-16 space-y-16 lg:space-y-20">
              {STEPS.map((s, i) => (
                <li key={s.title} className="grid gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:items-start lg:gap-14">
                  <div className="min-w-0 lg:pt-6">
                    <h3 className="flex items-baseline gap-3 text-3xl font-semibold tracking-tight">
                      <span aria-hidden="true" className="font-mono tabular-nums text-muted-foreground">
                        {i + 1}
                      </span>{" "}
                      {s.title}
                    </h3>
                    <p className="mt-4 max-w-md text-lg text-muted-foreground">{s.body}</p>
                    <Link href={s.href} className={cn(TEXT_LINK, "mt-6 inline-block")}>
                      {s.title === "Proof" ? "See the Skill Passport" : `See the ${s.title}`}
                    </Link>
                  </div>
                  {STEP_VISUALS[s.title]}
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="ladder-title" className="border-t">
          <div className={cn(CONTAINER, "grid gap-12 py-24 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:items-end lg:py-36")}>
            <div className="min-w-0 lg:pb-2">
              <h2 id="ladder-title" className={SECTION_HEAD}>Proof climbs a ladder</h2>
              <p className="mt-4 max-w-md text-lg text-muted-foreground">
                Keystone turns what you&apos;re taught into what you can prove. Each skill on your passport sits on one rung, and only real work moves it up.
              </p>
            </div>
            <ol className="grid gap-4 sm:grid-cols-3 sm:items-end" aria-label="The proof ladder, from first try to teaching">
              {LADDER.map((r, i) => (
                <li key={r.rung} className={cn("rounded-xl bg-muted p-6 sm:min-h-44", RUNG_STEP[i])}>
                  <h3 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight">
                    <r.icon className="size-6 shrink-0 text-status-proven" aria-hidden />
                    {r.rung}
                  </h3>
                  <p className="mt-2 text-muted-foreground">{r.how}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="faq-title" className="border-t">
          <div className={cn(CONTAINER, "grid gap-10 py-24 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:py-30")}>
            <h2 id="faq-title" className={SECTION_HEAD}>Questions students ask first</h2>
            <dl className="border-b">
              {FAQ.map((f) => (
                <div key={f.q} className="grid gap-2 border-t py-8 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-8">
                  <dt className="text-xl font-semibold tracking-tight">{f.q}</dt>
                  <dd className="text-lg text-muted-foreground">{f.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section aria-labelledby="reply-title" className="border-t bg-card">
          <div className={cn(CONTAINER, "flex flex-col gap-8 py-20 lg:flex-row lg:items-center lg:justify-between lg:py-24")}>
            <div className="min-w-0">
              <h2 id="reply-title" className={SECTION_HEAD}>Built for Reply&apos;s AI on Campus</h2>
              <p className="mt-4 max-w-xl text-lg text-muted-foreground">
                Specialist agents hand work to each other, one knowledge graph joins modules, job ads and people, and Bridge Week takes it to campus.
              </p>
              <LevelChips
                items={["multi-agent", "knowledge-graph", "launch-campaign"]}
                className="mt-6 [&_button]:h-8 [&_button]:px-3 [&_button]:text-sm [&_button>span:first-child]:text-xs"
              />
            </div>
            <div className="shrink-0">
              <Ctas />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className={cn(CONTAINER, "flex flex-col gap-2 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between")}>
          <p>Keystone, GreatUniHack 2026</p>
          <p>Seeded demo data is labelled &ldquo;Demo data&rdquo; wherever it appears.</p>
        </div>
      </footer>
    </div>
  );
}
