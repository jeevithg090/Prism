import type { Metadata } from "next";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { BadgePill, DemoDataNote, ReadinessRing, StatusBadge } from "@/components/keystone";
import { buttonVariants } from "@/components/ui/button";
import { LevelChips } from "@/components/pods/LevelChips";
import { CopyText } from "@/components/launch/CopyText";
import { ListenButton } from "@/components/launch/ListenButton";
import { QrCode } from "@/components/launch/QrCode";
import { WaitlistForm } from "@/components/launch/WaitlistForm";
import { CAMPUSES, linkedInPost, MEASURES, PILOT, POSTERS, TIMELINE, VOICEOVER } from "@/components/launch/data";
import { cn } from "@/lib/utils";
import "@/components/launch/launch.css";

export const metadata: Metadata = {
  title: "Keystone Bridge Week",
  description: "Your degree is the foundation. Build the bridge. Bridge Week brings Keystone to 10 campuses, starting in Manchester.",
};

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const DEMO_URL = `${APP_URL}/`;

// Show the demo address under the QR code only when it is public: a localhost URL means nothing to someone in the room.
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}
const DEMO_HOST = /^(localhost|127\.0\.0\.1)(:|$)/.test(hostOf(DEMO_URL)) ? "" : hostOf(DEMO_URL);

// Three printed papers: the ink board, a kraft desk tone and cotton. Coral stays a signal, never a poster fill.
const POSTER_TONE: Record<string, { card: string; body: string; foot: string }> = {
  ink: { card: "bg-board text-board-type", body: "text-board-type", foot: "text-board-type" },
  brand: { card: "bg-accent text-foreground", body: "text-ink-2", foot: "text-ink-2" },
  paper: { card: "border bg-card text-foreground shadow-sm", body: "text-ink-2", foot: "text-ink-2" },
};

const LINK =
  "rounded-md font-medium text-primary underline decoration-1 underline-offset-4 transition-[color] duration-(--dur-short) ease-(--ease-out) hover:decoration-2 active:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function SectionTitle({ id, title, sub }: { id: string; title: string; sub: string }) {
  return (
    <div className="mb-8 max-w-3xl space-y-3 md:mb-10">
      <h2 id={id} className="text-3xl font-semibold text-balance md:text-4xl xl:text-5xl">{title}</h2>
      <p className="max-w-[60ch] text-lg text-muted-foreground">{sub}</p>
    </div>
  );
}

const byCountry = CAMPUSES.reduce<Record<string, (typeof CAMPUSES)[number][]>>((acc, c) => {
  (acc[c.country] ??= []).push(c);
  return acc;
}, {});

export default function LaunchPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b">
        <div className="mx-auto flex min-h-16 w-full max-w-7xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 md:h-16 md:flex-nowrap md:px-8 md:py-0">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              className="rounded-md text-lg font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:text-ink-2"
            >
              Keystone
            </Link>
            <span className="hidden border-l pl-3 font-medium text-foreground sm:inline">Bridge Week</span>
          </div>
          <LevelChips items={["launch-campaign"]} className="max-sm:hidden md:ml-auto" />
          <Link href="/" className={buttonVariants({ variant: "outline", size: "lg" })}>Try the demo</Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 md:px-8">
        {/* Hero: the head on the left, the week 0 plan beside it at the same centre */}
        <section
          aria-labelledby="hero-title"
          className="grid items-center gap-10 py-12 lg:min-h-[min(calc(100svh-12rem),44rem)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16 lg:py-12"
        >
          <div className="min-w-0 space-y-6">
            <h1 id="hero-title" className="text-4xl font-semibold sm:text-5xl xl:text-6xl">
              <span className="block">Your degree is the foundation.</span>{" "}
              <span className="block">Build the bridge.</span>
            </h1>
            <p className="max-w-[42ch] text-lg text-muted-foreground lg:text-xl">
              Keystone reads your syllabus, live job ads and your code, then gives you a weekly plan, a pod to build with and proof of every
              skill.
            </p>
            <div className="flex flex-col flex-wrap items-start gap-x-6 gap-y-4 pt-2 sm:flex-row sm:items-center">
              <a href="#waitlist" className={buttonVariants({ size: "lg" })}>Join the waitlist</a>
              <a href="#ambassadors" className={cn(LINK, "text-sm sm:text-base sm:whitespace-nowrap")}>Seniors: become a Trajectory ambassador</a>
            </div>
            <p className="max-w-[60ch] text-lg text-pretty text-ink-2">The pilot starts with 500 students and 100 pods over 6 weeks.</p>
          </div>

          <figure aria-labelledby="week0-title" className="min-w-0 rounded-2xl border bg-card p-6 shadow-sm md:p-8">
            <figcaption className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 id="week0-title" className="text-xl font-semibold">What Aisha saw in week 0</h2>
                <p className="mt-1 text-sm text-muted-foreground">University of Manchester</p>
              </div>
              <DemoDataNote />
            </figcaption>
            <ul className="mt-5">
              <li className="border-t py-4">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <p className="text-lg font-semibold">Skip: Statistics</p>
                  <StatusBadge status="degree-done" />
                </div>
                <p className="mt-1 text-muted-foreground">Your Year 1, Semester 2 module covers it.</p>
              </li>
              <li className="border-t py-4">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <p className="text-lg font-semibold">Learn: Docker</p>
                  <StatusBadge status="gap" />
                </div>
                <p className="mt-1 text-muted-foreground">In 41% of ML engineer ads, and no module covers it.</p>
              </li>
              <li className="border-t py-4">
                <p className="text-lg font-semibold">Prove it</p>
                <p className="mt-1 text-muted-foreground">Containerise your pod&apos;s captioning API, reviewed by Priya.</p>
              </li>
            </ul>
            <div className="flex items-center gap-5 border-t pt-5">
              <ReadinessRing value={0.38} projected={0.84} label="today" className="size-28 md:size-32" />
              <div className="min-w-0">
                <p className="text-lg font-semibold">Readiness for ML engineer roles</p>
                <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
                  <span className="font-mono text-3xl font-medium text-ink-3 tabular-nums">84%</span>
                  <span className="text-muted-foreground">projected by Sept 2027</span>
                </p>
              </div>
            </div>
          </figure>
        </section>

        {/* Posters: the campaign's real artefacts, at the A3 print ratio */}
        <section aria-labelledby="posters-title" className="pt-12">
          <SectionTitle id="posters-title" title="Three posters for campus noticeboards" sub="Printed at A3 for freshers' fairs, society rooms and the careers service. Each QR code opens the demo." />
          <ul className="grid gap-6 lg:grid-cols-3">
            {POSTERS.map((p) => {
              const tone = POSTER_TONE[p.tone];
              return (
                <li key={p.id} className="mx-auto w-full max-w-md min-w-0 lg:max-w-none">
                  <article aria-labelledby={`poster-${p.id}`} className={cn("flex aspect-[297/420] h-full flex-col rounded-2xl p-6 xl:p-8", tone.card)}>
                    <h3
                      id={`poster-${p.id}`}
                      className={cn(
                        "font-semibold text-balance",
                        p.headline.length < 24 ? "text-5xl leading-[1.02] xl:text-6xl" : "text-3xl xl:text-4xl",
                      )}
                    >
                      {p.headline}
                    </h3>
                    <p className={cn("mt-4 text-base xl:text-lg", tone.body)}>{p.body}</p>
                    <div className="mt-auto flex items-end justify-between gap-4 pt-6">
                      <p className={cn("text-sm", tone.foot)}>
                        <span className="block font-semibold">Keystone Bridge Week</span>
                        Scan to try the demo
                      </p>
                      <QrCode value={`${DEMO_URL}?ref=poster-${p.id}`} label={`QR code: opens the Keystone demo (${p.headline})`} className="size-24 shrink-0 p-1" />
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Campus tour: hairline rows by country, straight on the paper */}
        <section aria-labelledby="tour-title" className="pt-(--section-gap)">
          <SectionTitle id="tour-title" title="The tour: 10 campuses, starting in Manchester" sub="Bridge Week follows the same campuses as Reply's Student Tech Clash. Each campus plugs in its own syllabus, so the plan is local from day one." />
          <div className="border-t">
            {Object.entries(byCountry).map(([country, list]) => (
              <section
                key={country}
                aria-labelledby={`country-${country}`}
                className="grid gap-4 border-b py-6 md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] md:gap-8"
              >
                <div>
                  <h3 id={`country-${country}`} className="text-lg font-semibold">{country}</h3>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-mono tabular-nums">{list.length}</span> {list.length === 1 ? "campus" : "campuses"}
                  </p>
                </div>
                <ol className="grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
                  {list.map((c) => {
                    const pilot = "pilot" in c && c.pilot;
                    return (
                      <li key={c.id} className="flex min-w-0 items-start gap-3">
                        <MapPin className={cn("mt-0.5 size-5 shrink-0", pilot ? "text-primary" : "text-muted-foreground")} aria-hidden />
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
                            {c.city}
                            {pilot && (
                              <span className="inline-flex h-6 items-center rounded-md border border-primary/50 px-1.5 text-xs font-medium text-foreground">
                                Pilot starts here
                              </span>
                            )}
                          </p>
                          {c.campus && <p className="text-sm text-muted-foreground">{c.campus}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        </section>

        {/* Pilot plan: the three figures, then the six weeks beside how success is measured */}
        <section aria-labelledby="pilot-title" className="pt-(--section-gap)">
          <SectionTitle id="pilot-title" title="The pilot plan" sub="One programme and one society first, so every pod gets a reviewer who knows the skill and every number can be checked." />
          <div className="grid rounded-2xl border bg-card shadow-sm sm:grid-cols-3">
            {PILOT.map((p) => (
              <div key={p.label} className="border-t p-6 first:border-t-0 sm:border-t-0 sm:border-l sm:first:border-l-0 md:p-8">
                <p className="font-mono text-5xl font-semibold tabular-nums">{p.value}</p>
                <p className="mt-2 text-lg font-semibold">{p.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{p.hint}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
            <div className="rounded-2xl border bg-card p-6 shadow-sm md:p-8">
              <h3 className="mb-2 text-xl font-semibold">Six weeks, week by week</h3>
              <ol>
                {TIMELINE.map((t) => (
                  <li key={t.when} className="grid gap-1 border-t py-4 first:border-t-0 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-4">
                    <p className="pt-0.5 text-sm font-medium text-muted-foreground">{t.when}</p>
                    <div className="min-w-0">
                      <p className="text-lg font-semibold">{t.title}</p>
                      <p className="mt-1 text-muted-foreground">{t.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="rounded-2xl border bg-card p-6 shadow-sm md:p-8">
              <h3 className="mb-2 text-xl font-semibold">How we&apos;ll measure success</h3>
              <ul>
                {MEASURES.map((m) => (
                  <li key={m.name} className="border-t py-4 first:border-t-0">
                    <p className="font-semibold">{m.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{m.how}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div id="ambassadors" className="mt-6 scroll-mt-6 rounded-xl bg-muted p-6 md:p-8">
            <p className="max-w-[65ch] text-lg text-foreground">
              <span className="font-semibold">Seniors:</span> share how you got where you are as a Trajectory ambassador. You&apos;ll answer
              newcomers&apos; questions, review pod PRs, and earn the <BadgePill badge="helper" /> badge and a certificate. Tick the ambassador
              box below.
            </p>
          </div>
        </section>

        {/* Waitlist: one card, the form beside the demo QR code */}
        <section id="waitlist" aria-labelledby="waitlist-title" className="scroll-mt-6 pt-(--section-gap-s)">
          <SectionTitle id="waitlist-title" title="Join Bridge Week" sub="Pick your campus and we'll keep your place for the pilot. No spam: this demo never sends emails." />
          <div className="grid rounded-2xl border bg-card shadow-sm lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0 p-6 md:p-8">
              <WaitlistForm />
            </div>
            <div className="flex flex-col items-center justify-center gap-4 border-t p-6 text-center md:p-8 lg:border-t-0 lg:border-l">
              <QrCode value={DEMO_URL} label="QR code: opens the Keystone demo" className="size-48 p-2" />
              <div>
                <p className="text-lg font-semibold">Scan to try the demo</p>
                {DEMO_HOST && <p className="text-sm break-all text-muted-foreground">{DEMO_HOST}</p>}
              </div>
            </div>
          </div>
        </section>

        {/* Share kit: the LinkedIn template beside the video voiceover */}
        <section aria-labelledby="share-title" className="pt-(--section-gap)">
          <SectionTitle id="share-title" title="Share what you built" sub="Every finished pod project is a portfolio piece. Students post it themselves; Keystone never posts for you." />
          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <div className="min-w-0 rounded-2xl border bg-card p-6 shadow-sm md:p-8">
              <div className="mb-1 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <h3 className="text-xl font-semibold">LinkedIn post template</h3>
                <DemoDataNote />
              </div>
              <p className="mb-5 text-muted-foreground">Aisha&apos;s version, written from her real Keystone proof. Edit it to match yours.</p>
              <CopyText text={linkedInPost(APP_URL)} label="Post text" />
            </div>
            <div className="min-w-0 rounded-2xl border bg-card p-6 shadow-sm md:p-8">
              <h3 className="mb-1 text-xl font-semibold">30-second video voiceover</h3>
              <p className="mb-5 text-muted-foreground">For the vertical campus video. Voiced with ElevenLabs when it&apos;s connected, or your browser&apos;s voice.</p>
              <blockquote className="rounded-xl bg-muted p-5 text-lg leading-8">{VOICEOVER}</blockquote>
              <div className="mt-5"><ListenButton text={VOICEOVER} /></div>
            </div>
          </div>
        </section>
      </main>

      <footer className="mt-(--section-gap) border-t">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground md:flex-row md:justify-between md:px-8">
          <p>Keystone, built at GreatUniHack 2026 for Reply&apos;s AI on Campus challenge.</p>
          <p>Matching uses skills, interests and availability, never personal characteristics.</p>
        </div>
      </footer>
    </div>
  );
}
