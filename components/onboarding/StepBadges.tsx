"use client";
import * as React from "react";
import { CheckCircle2, Compass, Globe, Repeat, ShieldCheck, Sprout, type LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { choiceOn, choiceSurface, FieldError, StepHeading, toggle } from "./fields";
import { OPT_IN_BADGES, type OptInBadge } from "./draft";
import type { StepProps } from "./StepYou";

// The same lucide marks BadgePill shows next to your name once you've chosen a badge (never an emoji).
const BADGE_ICON: Record<OptInBadge, LucideIcon> = { "new-to-uni": Sprout, international: Globe, "first-gen": Compass, "career-changer": Repeat };

const GITHUB_LOGIN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){1,38}$/i;

function GitHubPreview({ login }: { login: string }) {
  const [loadedFor, setLoadedFor] = React.useState<string | null>(null);
  if (!GITHUB_LOGIN.test(login)) return null;
  const loaded = loadedFor === login;
  return (
    <div className="flex items-center gap-3 rounded-xl bg-muted p-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- a remote avatar preview, no next/image config needed */}
      <img key={login} src={`https://github.com/${encodeURIComponent(login)}.png?size=80`} alt={`GitHub avatar for ${login}`} width={40} height={40}
        className="size-10 rounded-full bg-card" onLoad={() => setLoadedFor(login)} />
      <p className="text-sm text-foreground">
        {loaded ? <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-4 text-status-proven" aria-hidden />Found github.com/{login}</span> : <>Looking for github.com/{login}…</>}
      </p>
    </div>
  );
}

export function StepBadges({ draft, set, errors, touch }: StepProps) {
  return (
    <div className="space-y-7">
      <StepHeading title="Badges and GitHub" body="Both are optional. Skip this step if you like." />
      <fieldset className="space-y-3">
        <legend className="mb-3 text-sm font-medium text-foreground">Show a badge next to your name</legend>
        <div className="flex items-start gap-3 rounded-xl bg-muted p-4 text-sm text-foreground" id="ob-badges-note">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <p>Badges are opt-in and only used to send help your way. They are never used to match pods or rank anyone, and you can remove them at any time.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {OPT_IN_BADGES.map((b) => {
            const on = draft.badges.includes(b.id);
            const Icon = BADGE_ICON[b.id];
            return (
              <button key={b.id} type="button" aria-pressed={on} aria-describedby="ob-badges-note"
                onClick={() => set({ badges: toggle(draft.badges, b.id) })}
                className={cn(choiceSurface, "relative flex h-full items-start gap-3 p-4 pr-11 text-left", on && choiceOn)}>
                <Icon className={cn("mt-0.5 size-5 shrink-0", on ? "text-foreground" : "text-muted-foreground")} aria-hidden />
                <span className="min-w-0 space-y-1">
                  <span className="block text-base font-semibold">{b.name}</span>
                  <span className="block text-sm text-pretty text-muted-foreground">{b.help}</span>
                </span>
                {on && <CheckCircle2 className="absolute top-4 right-4 size-5 text-primary" aria-hidden />}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="ob-github">GitHub username (optional)</Label>
        <div className="flex h-11 items-center rounded-lg border border-input bg-card outline-2 -outline-offset-2 outline-transparent transition-[background-color] duration-(--dur-short) hover:bg-paper-2 has-focus-visible:outline-ring has-[[aria-invalid=true]]:border-destructive">
          <span className="pl-3 text-base text-muted-foreground" aria-hidden>github.com/</span>
          <Input id="ob-github" className="h-full rounded-lg border-0 bg-transparent pl-0.5 text-base shadow-none hover:bg-transparent focus-visible:outline-transparent md:text-base" autoComplete="off" autoCapitalize="none" spellCheck={false}
            value={draft.githubLogin} onChange={(e) => set({ githubLogin: e.target.value.trim() })} onBlur={() => touch("githubLogin")}
            aria-invalid={!!errors.githubLogin} aria-describedby={cn("ob-github-help", errors.githubLogin && "ob-github-error")} />
        </div>
        <p id="ob-github-help" className="text-sm text-muted-foreground">The Evidence Agent reads your public repos to prove skills. We only read public work you choose to share. Nothing is posted anywhere.</p>
        <FieldError id="ob-github-error" message={errors.githubLogin} />
        <GitHubPreview login={draft.githubLogin} />
      </div>
    </div>
  );
}
