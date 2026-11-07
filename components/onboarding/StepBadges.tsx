"use client";
import * as React from "react";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { FieldError, StepHeading, toggle } from "./fields";
import { OPT_IN_BADGES } from "./draft";
import type { StepProps } from "./StepYou";

const GITHUB_LOGIN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){1,38}$/i;

function GitHubPreview({ login }: { login: string }) {
  const [loadedFor, setLoadedFor] = React.useState<string | null>(null);
  if (!GITHUB_LOGIN.test(login)) return null;
  const loaded = loadedFor === login;
  return (
    <div className="flex items-center gap-3 rounded-xl bg-muted/60 p-3">
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
    <div className="space-y-6">
      <StepHeading title="Badges and GitHub" body="Both are optional. Skip this step if you like." />
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-foreground">Show a badge next to your name</legend>
        <div className="flex items-start gap-3 rounded-xl border bg-muted/60 p-4 text-sm text-foreground" id="ob-badges-note">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-status-degree" aria-hidden />
          <p>Badges are opt-in and only used to send help your way. They are never used to match pods or rank anyone, and you can remove them at any time.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {OPT_IN_BADGES.map((b) => {
            const on = draft.badges.includes(b.id);
            return (
              <button key={b.id} type="button" aria-pressed={on} aria-describedby="ob-badges-note"
                onClick={() => set({ badges: toggle(draft.badges, b.id) })}
                className={cn("flex h-full flex-col items-start gap-1 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/60 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on && "border-primary bg-primary/5")}>
                <span className="flex w-full items-center justify-between gap-2 font-medium text-foreground">
                  <span><span aria-hidden>{b.emoji}</span> {b.name}</span>
                  {on && <CheckCircle2 className="size-4 text-primary" aria-hidden />}
                </span>
                <span className="text-sm text-muted-foreground">{b.help}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="ob-github">GitHub username (optional)</Label>
        <div className="flex items-center rounded-xl border border-input bg-card focus-within:ring-2 focus-within:ring-ring">
          <span className="pl-3 text-sm text-muted-foreground" aria-hidden>github.com/</span>
          <Input id="ob-github" className="h-10 rounded-xl border-0 pl-0.5 text-base shadow-none focus-visible:ring-0 md:text-base" autoComplete="off" autoCapitalize="none" spellCheck={false}
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
