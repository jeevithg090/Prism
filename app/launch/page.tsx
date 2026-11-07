import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, GitPullRequest, GraduationCap, MapPin, Target } from "lucide-react";
import { DemoDataNote } from "@/components/keystone";
import { buttonVariants } from "@/components/ui/button";
import { LevelChips } from "@/components/pods/LevelChips";
import { CopyText } from "@/components/launch/CopyText";
import { ListenButton } from "@/components/launch/ListenButton";
import { QrCode } from "@/components/launch/QrCode";
import { WaitlistForm } from "@/components/launch/WaitlistForm";
import { CAMPUSES, linkedInPost, MEASURES, PILOT, POSTERS, TIMELINE, VOICEOVER } from "@/components/launch/data";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Bridge Week · Keystone",
  description: "Your degree is the foundation. Build the bridge. Bridge Week brings Keystone to 10 campuses, starting in Manchester.",
};

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const DEMO_URL = `${APP_URL}/`;

const POSTER_TONE: Record<string, { card: string; body: string; foot: string }> = {
  ink: { card: "bg-foreground text-background", body: "text-background/85", foot: "text-background/80" },
  brand: { card: "bg-primary text-primary-foreground", body: "text-primary-foreground/90", foot: "text-primary-foreground/85" },
  paper: { card: "border-2 border-foreground bg-card text-foreground", body: "text-foreground/80", foot: "text-foreground/75" },
};

function SectionTitle({ id, title, sub }: { id: string; title: string; sub: string }) {
  return (
    <div className="mb-6 max-w-2xl space-y-2">
      <h2 id={id} className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">{title}</h2>
      <p className="text-muted-foreground">{sub}</p>
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
      <header className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8">
          <Link href="/" className="rounded-lg text-lg font-semibold tracking-tight focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            Keystone
          </Link>
          <div className="flex items-center gap-3">
            <LevelChips items={["launch-campaign"]} />
            <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "h-10 rounded-xl px-4")}>Try the demo</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-16 px-4 py-8 md:px-8 md:py-12">
        {/* Hero */}
        <section aria-labelledby="hero-title" className="grid gap-8 rounded-2xl border bg-primary/5 p-6 md:p-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-center">
          <div className="space-y-5">
            <p className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Bridge Week · University of Manchester</p>
            <h1 id="hero-title" className="text-4xl font-semibold tracking-tight text-balance md:text-display">
              Your degree is the foundation. <span className="text-primary">Build the bridge.</span>
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              Keystone reads your syllabus, live job ads and your code, then gives you a weekly plan, a pod to build with and proof of every
              skill. The pilot starts with 500 students and 100 pods over 6 weeks.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <a href="#waitlist" className={cn(buttonVariants({ size: "lg" }), "h-12 rounded-xl px-6 text-base")}>
                Join the waitlist <ArrowRight className="size-5" aria-hidden />
              </a>
              <a href="#ambassadors" className="rounded-lg px-1 text-base font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                Seniors: become a Trajectory ambassador
              </a>
            </div>
          </div>
          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-semibold">What Aisha saw in week 0</h2>
              <DemoDataNote />
            </div>
            <ul className="divide-y">
              <li className="flex gap-3 py-3">
                <GraduationCap className="mt-0.5 size-5 shrink-0 text-status-degree" aria-hidden />
                <p><span className="font-medium">Skip: Statistics.</span> <span className="text-muted-foreground">Your Year 1, Semester 2 module covers it.</span></p>
              </li>
              <li className="flex gap-3 py-3">
                <Target className="mt-0.5 size-5 shrink-0 text-status-gap" aria-hidden />
                <p><span className="font-medium">Learn: Docker.</span> <span className="text-muted-foreground">In 41% of ML engineer ads, and no module covers it.</span></p>
              </li>
              <li className="flex gap-3 py-3">
                <GitPullRequest className="mt-0.5 size-5 shrink-0 text-status-proven" aria-hidden />
                <p><span className="font-medium">Prove it:</span> <span className="text-muted-foreground">containerise your pod&apos;s captioning API, reviewed by Priya.</span></p>
              </li>
            </ul>
            <p className="mt-4 border-t pt-4 text-sm text-muted-foreground">
              Readiness for ML engineer roles: <span className="font-mono font-semibold tabular-nums text-foreground">38%</span> today,{" "}
              <span className="font-mono font-semibold tabular-nums text-foreground">84%</span> projected by Sept 2027.
            </p>
          </div>
        </section>

        {/* Posters */}
        <section aria-labelledby="posters-title">
          <SectionTitle id="posters-title" title="Three posters for campus noticeboards" sub="Printed at A3 for freshers' fairs, society rooms and the careers service. Each QR code opens the demo." />
          <ul className="grid gap-6 md:grid-cols-3">
            {POSTERS.map((p) => {
              const tone = POSTER_TONE[p.tone];
              return (
                <li key={p.id}>
                  <article aria-labelledby={`poster-${p.id}`} className={cn("flex aspect-[3/4] flex-col rounded-2xl p-6 shadow-sm md:p-8", tone.card)}>
                    <p className={cn("text-sm font-semibold tracking-wide uppercase", tone.foot)}>Bridge Week</p>
                    <h3 id={`poster-${p.id}`} className="mt-4 text-3xl leading-tight font-bold tracking-tight text-balance lg:text-4xl">{p.headline}</h3>
                    <p className={cn("mt-4 text-base", tone.body)}>{p.body}</p>
                    <div className="mt-auto flex items-end justify-between gap-4 pt-6">
                      <div className={cn("text-sm", tone.foot)}>
                        <p className="font-semibold">Keystone</p>
                        <p>Scan to try the demo</p>
                      </div>
                      <QrCode value={`${DEMO_URL}?ref=poster-${p.id}`} label={`QR code: opens the Keystone demo (${p.headline})`} className="size-24 shrink-0 p-1" />
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Campus tour */}
        <section aria-labelledby="tour-title">
          <SectionTitle id="tour-title" title="The tour: 10 campuses, starting in Manchester" sub="Bridge Week follows the same campuses as Reply's Student Tech Clash. Each campus plugs in its own syllabus, so the plan is local from day one." />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Object.entries(byCountry).map(([country, list]) => (
              <section key={country} aria-labelledby={`country-${country}`} className="rounded-2xl border bg-card p-6 shadow-sm">
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <h3 id={`country-${country}`} className="text-lg font-semibold">{country}</h3>
                  <span className="text-sm text-muted-foreground"><span className="font-mono tabular-nums">{list.length}</span> {list.length === 1 ? "campus" : "campuses"}</span>
                </div>
                <ol className="divide-y">
                  {list.map((c) => (
                    <li key={c.id} className="flex items-start gap-3 py-3">
                      <MapPin className={cn("mt-0.5 size-5 shrink-0", "pilot" in c && c.pilot ? "text-primary" : "text-muted-foreground")} aria-hidden />
                      <div className="min-w-0">
                        <p className="font-medium">
                          {c.city}
                          {"pilot" in c && c.pilot && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-foreground">Pilot · first</span>}
                        </p>
                        <p className="text-sm text-muted-foreground">{c.campus || "Student Tech Clash campus"}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        </section>

        {/* Pilot plan */}
        <section aria-labelledby="pilot-title">
          <SectionTitle id="pilot-title" title="The pilot plan" sub="One programme and one society first, so every pod gets a reviewer who knows the skill and every number can be checked." />
          <div className="grid gap-6 md:grid-cols-3">
            {PILOT.map((p) => (
              <div key={p.label} className="rounded-2xl border bg-card p-6 shadow-sm">
                <p className="font-mono text-5xl font-semibold tabular-nums">{p.value}</p>
                <p className="mt-1 text-lg font-medium">{p.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{p.hint}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="rounded-2xl border bg-card p-6 shadow-sm">
              <h3 className="mb-4 text-xl font-semibold">Six weeks, week by week</h3>
              <ol className="space-y-4">
                {TIMELINE.map((t, i) => (
                  <li key={t.when} className="flex gap-4">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 font-mono text-sm font-semibold tabular-nums text-foreground" aria-hidden>{i + 1}</span>
                    <div>
                      <p className="font-medium">{t.when}: {t.title}</p>
                      <p className="text-sm text-muted-foreground">{t.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="rounded-2xl border bg-card p-6 shadow-sm">
              <h3 className="mb-4 text-xl font-semibold">How we&apos;ll measure success</h3>
              <ul className="divide-y">
                {MEASURES.map((m) => (
                  <li key={m.name} className="flex gap-3 py-3">
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-status-proven" aria-hidden />
                    <div>
                      <p className="font-medium">{m.name}</p>
                      <p className="text-sm text-muted-foreground">{m.how}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p id="ambassadors" className="mt-6 max-w-3xl scroll-mt-6 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-foreground">
            <span className="font-semibold">Seniors:</span> share how you got where you are as a Trajectory ambassador. You&apos;ll answer newcomers&apos;
            questions, review pod PRs, and earn the 🤝 Helper badge and a certificate. Tick the ambassador box below.
          </p>
        </section>

        {/* Waitlist */}
        <section id="waitlist" aria-labelledby="waitlist-title" className="scroll-mt-6">
          <SectionTitle id="waitlist-title" title="Join Bridge Week" sub="Pick your campus and we'll keep your place for the pilot. No spam: this demo never sends emails." />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="rounded-2xl border bg-card p-6 shadow-sm md:p-8">
              <WaitlistForm />
            </div>
            <div className="flex flex-col items-center gap-4 rounded-2xl border bg-card p-6 text-center shadow-sm">
              <QrCode value={DEMO_URL} label="QR code: opens the Keystone demo" className="size-48 p-2" />
              <div>
                <p className="font-semibold">Scan to try the demo</p>
                <p className="text-sm break-all text-muted-foreground">{DEMO_URL}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Share */}
        <section aria-labelledby="share-title">
          <SectionTitle id="share-title" title="Share what you built" sub="Every finished pod project is a portfolio piece. Students post it themselves; Keystone never posts for you." />
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border bg-card p-6 shadow-sm">
              <h3 className="mb-1 text-xl font-semibold">LinkedIn post template</h3>
              <p className="mb-4 text-sm text-muted-foreground">Aisha&apos;s version, written from her real Keystone proof. Edit it to match yours.</p>
              <CopyText text={linkedInPost(APP_URL)} label="Post text" />
            </div>
            <div className="rounded-2xl border bg-card p-6 shadow-sm">
              <h3 className="mb-1 text-xl font-semibold">30-second video voiceover</h3>
              <p className="mb-4 text-sm text-muted-foreground">For the vertical campus video. Voiced with ElevenLabs when it&apos;s connected, or your browser&apos;s voice.</p>
              <blockquote className="rounded-xl bg-muted/60 p-4 text-lg leading-8">{VOICEOVER}</blockquote>
              <div className="mt-4"><ListenButton text={VOICEOVER} /></div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t bg-card">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground md:flex-row md:justify-between md:px-8">
          <p>Keystone · built at GreatUniHack 2026 for Reply&apos;s AI on Campus challenge.</p>
          <p>Matching uses skills, interests and availability, never personal characteristics.</p>
        </div>
      </footer>
    </div>
  );
}
