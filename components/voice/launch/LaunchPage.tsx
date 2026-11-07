// /launch campaign page (P4 PR6, Reply level 3). Server component: static content,
// with the client-only WaitlistForm islands for sign-ups.
import Link from "next/link";
import { ArrowDown, Film, Handshake } from "lucide-react";
import { Poster, type PosterProps } from "./Poster";
import { WaitlistForm } from "./WaitlistForm";

export const SLOGAN_LEAD = "Your degree is the foundation.";
export const SLOGAN_EMPHASIS = "Build the bridge.";
export const SUBTITLE = "Bridge Week · University of Manchester · first 500 students, 100 pods, 6 weeks";

export const TIMELINE: { when: string; title: string; body: string; keystone?: boolean }[] = [
  {
    when: "Week 0",
    title: "Launch",
    body: "We open sign-ups at the freshers' groups and the CS society. You add your modules in two minutes.",
  },
  {
    when: "Week 1",
    title: "Pods formed",
    body: "Keystone matches you with four other students by skills, goals and timetable. Your pod gets a repo and starter issues.",
  },
  {
    when: "Weeks 2–3",
    title: "Build: first pull requests",
    body: "Your pod picks a real project. Each of you ships a first pull request, reviewed by a senior ambassador.",
  },
  {
    when: "Weeks 4–5",
    title: "Build: ship and practise",
    body: "You finish features, fix what reviewers flag, and run a voice mock interview about what you built.",
  },
  {
    when: "Week 6",
    title: "Demo day + passports",
    body: "Pods demo live. Every skill you proved goes on your Keystone passport, linked to the code behind it.",
    keystone: true,
  },
];

export const POSTERS: PosterProps[] = [
  {
    headline: "Don't pay for a course your degree already teaches.",
    subline: "Keystone maps your modules to live job ads, so you only learn the real gap.",
    tone: "indigo",
  },
  {
    headline: "Proof, not claims.",
    subline: "Every skill on your passport links to code you shipped and a pod that reviewed it.",
    tone: "paper",
  },
  {
    headline: "Find your pod.",
    subline: "Five students, one real project, six weeks. Matched on skills and timetable.",
    tone: "amber",
  },
];

export const METRICS: { label: string; target: string; context: string }[] = [
  { label: "Readiness change", target: "+15 pts", context: "average rise in role readiness from week 1 to week 6" },
  { label: "Verified skills per student", target: "3+", context: "skills proven with linked code and a pod review" },
  { label: "Pods with merged PRs", target: "80%", context: "of pods merge at least one reviewed pull request" },
  { label: "Newcomer help response time", target: "< 4 h", context: "median wait for a newcomer's question to get a helpful answer" },
];

export const VOICEOVER_SCRIPT =
  "Your degree teaches you a lot. But nobody tells you what it covers, what industry wants, and what to learn next. Keystone reads your syllabus, the live job market and your real code, then builds your bridge. Learn in a pod. Prove every skill. Your degree is the foundation. Build the bridge.";

const VOICEOVER_WORDS = VOICEOVER_SCRIPT.split(/\s+/).filter(Boolean).length;

const GUTTER = "mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8";
const RING_ON_DARK =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#1e1b4b]";
const RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/* ---------- The arch: the product is named after its top stone ---------- */

const ARCH = { cx: 200, cy: 236, rIn: 104, rOut: 170, stones: 9, gap: 0.014 };

function stonePath(a0: number, a1: number, rIn: number, rOut: number) {
  const { cx, cy } = ARCH;
  const pt = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy - r * Math.sin(a)).toFixed(2)}`;
  return `M${pt(rOut, a0)} A${rOut} ${rOut} 0 0 1 ${pt(rOut, a1)} L${pt(rIn, a1)} A${rIn} ${rIn} 0 0 0 ${pt(rIn, a0)} Z`;
}

function KeystoneArch({ className }: { className?: string }) {
  const step = Math.PI / ARCH.stones;
  const mid = Math.floor(ARCH.stones / 2);
  return (
    <svg viewBox="0 0 400 300" className={className} aria-hidden="true" focusable="false">
      {/* Piers: the degree */}
      <rect x={ARCH.cx - ARCH.rOut} y={ARCH.cy + 4} width={ARCH.rOut - ARCH.rIn} height={60} rx={4} fill="rgba(255,255,255,0.28)" />
      <rect x={ARCH.cx + ARCH.rIn} y={ARCH.cy + 4} width={ARCH.rOut - ARCH.rIn} height={60} rx={4} fill="rgba(255,255,255,0.28)" />
      {/* Voussoirs: the weeks of building */}
      {Array.from({ length: ARCH.stones }, (_, i) => {
        const isKey = i === mid;
        const a0 = Math.PI - i * step - ARCH.gap;
        const a1 = Math.PI - (i + 1) * step + ARCH.gap;
        return (
          <path
            key={i}
            d={stonePath(a0, a1, ARCH.rIn, isKey ? ARCH.rOut + 14 : ARCH.rOut)}
            fill={isKey ? "#fcd34d" : `rgba(199,210,254,${0.22 + (i % 2) * 0.1})`}
          />
        );
      })}
    </svg>
  );
}

function Swatch({ className }: { className: string }) {
  return <span className={`mt-1.5 inline-block size-3.5 shrink-0 rounded-sm ${className}`} aria-hidden="true" />;
}

/* ---------- Page ---------- */

export function LaunchPage() {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      {/* The banner sits over the hero's gradient, outside <main>; the hero itself is inside <main>. */}
      <header className="absolute inset-x-0 top-0 z-10 text-white">
        <div className={`${GUTTER} flex items-center justify-between gap-4 py-5`}>
          <Link href="/" className={`flex items-center gap-2.5 rounded-md text-lg font-bold tracking-tight ${RING_ON_DARK}`}>
            <span
              className="block h-5 w-5 bg-amber-300"
              style={{ clipPath: "polygon(0 0, 100% 0, 78% 100%, 22% 100%)" }}
              aria-hidden="true"
            />
            Keystone
          </Link>
          <nav aria-label="Launch page sections">
            <ul className="flex items-center gap-1 text-base font-medium sm:gap-2">
              {[
                ["#bridge-week", "Bridge Week"],
                ["#posters", "Posters"],
                ["#ambassadors", "Ambassadors"],
                ["#goals", "Pilot goals"],
              ].map(([href, label]) => (
                <li key={href} className="hidden md:block">
                  <a href={href} className={`rounded-lg px-3 py-2 text-indigo-100 hover:text-white ${RING_ON_DARK}`}>
                    {label}
                  </a>
                </li>
              ))}
              <li>
                <a
                  href="#waitlist"
                  className={`rounded-xl bg-white/10 px-4 py-2 font-semibold text-white hover:bg-white/20 motion-safe:transition-colors ${RING_ON_DARK}`}
                >
                  Join<span className="sr-only"> the waitlist</span>
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </header>

      <main id="main">
        {/* Hero (top padding leaves room for the banner above) */}
        <div
          className="bg-[#1e1b4b] text-white"
          style={{ backgroundImage: "linear-gradient(140deg, #1e1b4b 0%, #312e81 55%, #4338ca 100%)" }}
        >
          <section aria-labelledby="launch-title" className={`${GUTTER} grid items-center gap-12 pb-20 pt-28 lg:grid-cols-12 lg:pb-28 lg:pt-34`}>
            <div className="lg:col-span-7">
              <h1
                id="launch-title"
                className="text-[clamp(2.5rem,1.6rem+4vw,4.5rem)] font-semibold leading-[1.02] tracking-tight text-balance"
              >
                {SLOGAN_LEAD} <strong className="block font-extrabold text-amber-300">{SLOGAN_EMPHASIS}</strong>
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-indigo-100 sm:text-xl">{SUBTITLE}</p>

              <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <a
                  href="#waitlist"
                  className={`inline-flex h-13 items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-base font-semibold text-[#1e1b4b] hover:bg-indigo-50 motion-safe:transition-colors ${RING_ON_DARK}`}
                >
                  Join the waitlist
                  <ArrowDown className="size-4" aria-hidden="true" />
                </a>
                <a
                  href="#ambassadors"
                  className={`inline-flex h-13 items-center justify-center gap-2 rounded-xl border-2 border-white/60 px-6 py-3 text-base font-semibold text-white hover:border-white hover:bg-white/10 motion-safe:transition-colors ${RING_ON_DARK}`}
                >
                  <Handshake className="size-5" aria-hidden="true" />
                  Become a Trajectory ambassador
                </a>
              </div>

              <dl className="mt-12 grid max-w-xl grid-cols-3 gap-4">
                {[
                  ["500", "students"],
                  ["100", "pods"],
                  ["6", "weeks"],
                ].map(([n, label]) => (
                  <div key={label} className="flex flex-col-reverse">
                    <dt className="text-base font-medium text-indigo-100">{label}</dt>
                    <dd className="text-4xl font-bold tabular-nums tracking-tight sm:text-5xl">{n}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <figure className="mx-auto w-full max-w-md lg:col-span-5 lg:max-w-none">
              <KeystoneArch className="w-full motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500" />
              <figcaption className="mt-6 space-y-2 text-base text-indigo-100">
                <p className="flex gap-3">
                  <Swatch className="bg-white/40" />
                  <span>
                    <span className="font-semibold text-white">The piers</span> are your degree: the foundation.
                  </span>
                </p>
                <p className="flex gap-3">
                  <Swatch className="bg-indigo-200/60" />
                  <span>
                    <span className="font-semibold text-white">The stones</span> are six weeks of building with your pod.
                  </span>
                </p>
                <p className="flex gap-3">
                  <Swatch className="bg-amber-300" />
                  <span>
                    <span className="font-semibold text-white">The keystone</span> is your skills passport. It holds the
                    bridge together.
                  </span>
                </p>
              </figcaption>
            </figure>
          </section>
        </div>

        {/* Timeline */}
        <section id="bridge-week" aria-labelledby="bridge-week-title" className="scroll-mt-6 py-20 lg:py-28">
          <div className={GUTTER}>
            <div className="max-w-3xl">
              <h2 id="bridge-week-title" className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Bridge Week, from freshers&apos; fair to demo day
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
                Six weeks alongside your first semester. You keep your degree; Keystone shows you the gap and gives
                you a pod to close it with.
              </p>
            </div>

            <div className="relative mt-14">
              <span
                className="absolute bottom-2 left-[15px] top-2 w-1.5 rounded-full bg-primary/15 lg:bottom-auto lg:left-2 lg:right-2 lg:top-[13px] lg:h-1.5 lg:w-auto"
                aria-hidden="true"
              />
              <ol className="grid gap-10 lg:grid-cols-5 lg:gap-6">
                {TIMELINE.map((step) => (
                  <li key={step.when} className="relative pl-14 lg:pl-0 lg:pt-14">
                    <span
                      className={`absolute left-0 top-0 block h-8 w-9 ${step.keystone ? "bg-amber-400" : "bg-primary"}`}
                      style={{ clipPath: "polygon(0 0, 100% 0, 80% 100%, 20% 100%)" }}
                      aria-hidden="true"
                    />
                    <p className="text-base font-semibold text-primary">{step.when}</p>
                    <h3 className="mt-1 text-xl font-semibold leading-snug">{step.title}</h3>
                    <p className="mt-2 text-base leading-relaxed text-muted-foreground">{step.body}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* Posters */}
        <section id="posters" aria-labelledby="posters-title" className="scroll-mt-6 bg-card py-20 lg:py-28">
          <div className={GUTTER}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <h2 id="posters-title" className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
                Three posters for the corridors
              </h2>
              <p className="max-w-md text-lg leading-relaxed text-muted-foreground">
                Printed A3 for the Kilburn Building, the library and freshers&apos; stalls. Every word is real text, so
                screen readers and translators can read it.
              </p>
            </div>
            <ul className="mt-12 grid gap-8 lg:grid-cols-3">
              {POSTERS.map((p) => (
                <li key={p.headline} className="mx-auto w-full max-w-md lg:max-w-none">
                  <Poster {...p} />
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Ambassadors */}
        <section id="ambassadors" aria-labelledby="ambassadors-title" className="scroll-mt-6 bg-primary/5 py-20 lg:py-28">
          <div className={`${GUTTER} grid gap-12 lg:grid-cols-12 lg:gap-16`}>
            <div className="lg:col-span-7">
              <h2 id="ambassadors-title" className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                Seniors: share your journey, earn <span aria-hidden="true">🤝</span> Helper and a certificate.
              </h2>
              <p className="mt-4 max-w-2xl text-lg leading-relaxed">
                You&apos;ve been where a first-year is now. An hour a week from you can save them a semester of
                guessing.
              </p>
              <div className="mt-10 grid gap-8 sm:grid-cols-2">
                <div>
                  <h3 className="text-xl font-semibold">What you&apos;ll do</h3>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-base leading-relaxed marker:text-primary">
                    <li>Share your Trajectory: the modules, side projects and lucky breaks behind your placement.</li>
                    <li>Answer newcomer questions in your pod&apos;s channel.</li>
                    <li>Review one pull request a week during the build weeks.</li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-xl font-semibold">What you&apos;ll get</h3>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-base leading-relaxed marker:text-primary">
                    <li>
                      The <span aria-hidden="true">🤝</span> Helper badge on your Keystone passport.
                    </li>
                    <li>A Bridge Week ambassador certificate for your CV.</li>
                    <li>Your Trajectory shown to the first 500 students.</li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="lg:col-span-5">
              <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
                <h3 className="text-2xl font-semibold tracking-tight">Become a Trajectory ambassador</h3>
                <p className="mt-2 text-base text-muted-foreground">
                  Leave your email and we&apos;ll send the ambassador pack before Week 0.
                </p>
                <div className="mt-6">
                  <WaitlistForm role="ambassador" submitLabel="Sign me up" emailLabel="Your university email" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Success metrics band */}
        <section id="goals" aria-labelledby="goals-title" className="scroll-mt-6 bg-primary py-20 text-primary-foreground lg:py-24">
          <div className={GUTTER}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <h2 id="goals-title" className="text-3xl font-semibold tracking-tight sm:text-4xl">
                What success looks like
              </h2>
              <p className="max-w-lg text-lg leading-relaxed text-primary-foreground/90">
                These are goals for the 6-week pilot, not results. We&apos;ll publish the real numbers after demo day.
              </p>
            </div>
            <dl className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
              {METRICS.map((m) => (
                <div key={m.label} className="flex flex-col">
                  <dt className="order-2 mt-3 text-lg font-semibold">{m.label}</dt>
                  <dd className="order-1 flex items-baseline gap-3">
                    <span className="text-5xl font-bold tabular-nums tracking-tight">{m.target}</span>
                    <span className="rounded-full bg-primary-foreground/15 px-2.5 py-0.5 text-sm font-semibold">
                      Pilot goal
                    </span>
                  </dd>
                  <dd className="order-3 mt-1 text-base leading-relaxed text-primary-foreground/90">{m.context}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* 30-second video */}
        <section id="film" aria-labelledby="film-title" className="scroll-mt-6 py-20 lg:py-28">
          <div className={`${GUTTER} grid items-center gap-12 lg:grid-cols-2`}>
            <figure>
              <div
                className="relative grid aspect-video place-items-center overflow-hidden rounded-2xl bg-[#1e1b4b] text-white"
                style={{ backgroundImage: "linear-gradient(140deg, #1e1b4b 0%, #312e81 60%, #4338ca 100%)" }}
              >
                <div className="flex flex-col items-center gap-3 px-6 text-center">
                  <span className="grid size-16 place-items-center rounded-full bg-white/15">
                    <Film className="size-7" aria-hidden="true" />
                  </span>
                  <p className="text-xl font-semibold">The 30-second film</p>
                  <p className="text-base text-indigo-100">Premieres at demo day. Video embed goes here.</p>
                </div>
                <div className="absolute inset-x-5 bottom-4 flex items-center gap-3 text-sm font-medium text-indigo-100" aria-hidden="true">
                  <span className="tabular-nums">0:00</span>
                  <span className="h-1.5 flex-1 rounded-full bg-white/20">
                    <span className="block h-full w-1/12 rounded-full bg-amber-300" />
                  </span>
                  <span className="tabular-nums">0:30</span>
                </div>
              </div>
              <figcaption className="mt-3 text-sm text-muted-foreground">
                Placeholder frame for the launch film.
              </figcaption>
            </figure>
            <div>
              <h2 id="film-title" className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Thirty seconds, one voice
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
                The voiceover is read by an ElevenLabs voice: {VOICEOVER_WORDS} words, about 30 seconds.
              </p>
              <blockquote className="mt-8 border-l-4 border-primary pl-6 text-xl leading-relaxed">
                <p>&ldquo;{VOICEOVER_SCRIPT}&rdquo;</p>
              </blockquote>
            </div>
          </div>
        </section>

        {/* Waitlist */}
        <section id="waitlist" aria-labelledby="waitlist-title" className="scroll-mt-6 bg-[#1e1b4b] py-20 text-white lg:py-28">
          <div className={`${GUTTER} grid gap-10 lg:grid-cols-12 lg:gap-16`}>
            <div className="lg:col-span-5">
              <h2 id="waitlist-title" className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Join the waitlist
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-indigo-100">
                The first 500 students get a pod for Bridge Week. Signing up takes 30 seconds, and you can leave any
                time.
              </p>
            </div>
            <div className="lg:col-span-7">
              <WaitlistForm surface="dark" emailLabel="Your university email" />
            </div>
          </div>
        </section>
      </main>

      <footer className="py-16">
        <div className={`${GUTTER} flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between`}>
          <div>
            <p className="text-5xl font-extrabold tracking-tight sm:text-6xl">Keystone</p>
            <p className="mt-3 text-lg">
              {SLOGAN_LEAD} <strong>{SLOGAN_EMPHASIS}</strong>
            </p>
          </div>
          <p className="text-sm text-muted-foreground">Bridge Week pilot · University of Manchester · 2026</p>
        </div>
      </footer>
    </div>
  );
}

export default LaunchPage;
