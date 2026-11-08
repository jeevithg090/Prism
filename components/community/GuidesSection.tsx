"use client";
import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { Compass, Copy, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/keystone";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ApiResult, GuideSuggestion } from "@/lib/types";
import { CARD, Region } from "./Region";

export class GuidesError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/** Raw fetch (not apiPost) so we keep the error code and can show a friendly daily-limit message. */
export async function requestGuides(userId: string, demo = false): Promise<GuideSuggestion[]> {
  const res = await fetch(`/api/guides/find${demo ? "?demo=1" : ""}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  let json: ApiResult<GuideSuggestion[]>;
  try {
    json = (await res.json()) as ApiResult<GuideSuggestion[]>;
  } catch {
    throw new GuidesError("internal", "Something went wrong on our side.");
  }
  if (!json.ok) throw new GuidesError(json.error.code, json.error.message);
  return json.data;
}

function GuideCard({ guide, index }: { guide: GuideSuggestion; index: number }) {
  const draftId = `guide-draft-${index}`;
  const ref = React.useRef<HTMLTextAreaElement>(null);

  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(guide.draftMessage);
      toast.success("Copied: send it yourself");
    } catch {
      ref.current?.focus();
      ref.current?.select();
      toast.error("We couldn't copy automatically. The message is selected: press Ctrl+C (or ⌘C).");
    }
  }

  return (
    <li className={`flex flex-col gap-4 p-6 ${CARD}`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-lg font-semibold break-words text-foreground">{guide.name}</h3>
        <span className="inline-flex h-6 shrink-0 items-center rounded-md border px-1.5 text-xs font-medium text-foreground">{guide.source === "github" ? "GitHub" : "Web"}</span>
      </div>
      <p className="text-base leading-7 text-pretty text-foreground">{guide.whyRelevant}</p>
      <a
        href={guide.publicUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="w-fit rounded-sm text-sm font-medium text-primary underline decoration-1 underline-offset-4 transition-[color] duration-(--dur-short) hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {guide.source === "github" ? "View public GitHub profile" : "View public page"}
        <span className="sr-only"> for {guide.name} (opens in a new tab)</span>
      </a>
      <div className="rounded-xl bg-muted p-4">
        <p className="text-sm font-medium text-muted-foreground">A question you could ask</p>
        <p className="mt-1 text-base text-pretty text-foreground">“{guide.suggestedQuestion}”</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor={draftId}>Draft message</Label>
        <Textarea id={draftId} ref={ref} readOnly value={guide.draftMessage} rows={5} className="text-sm leading-6 md:text-sm" />
      </div>
      <Button variant="outline" onClick={copy} aria-label={`Copy message for ${guide.name}`} className="self-start">
        <Copy aria-hidden />
        Copy message
      </Button>
    </li>
  );
}

export function GuidesSection({ viewerId }: { viewerId: string }) {
  const [guides, setGuides] = React.useState<GuideSuggestion[] | null>(null);
  const find = useMutation({
    mutationFn: (demo: boolean) => requestGuides(viewerId, demo),
    onSuccess: (data) => {
      setGuides(data);
      if (data.length > 0) toast.success(`Found ${data.length} ${data.length === 1 ? "guide" : "guides"}. Drafts are ready to copy.`);
    },
  });
  const err = find.error;
  const limited = err instanceof GuidesError && err.code === "daily_limit";

  return (
    <Region
      id="guides-title"
      title="Learn from practitioners"
      description="People in Manchester who already work with your top gap skill, plus a friendly first message you can send."
      actions={guides !== null ? (
        <Button variant="outline" onClick={() => find.mutate(false)} disabled={find.isPending} aria-busy={find.isPending || undefined}>
          {find.isPending && <Loader2 className="motion-safe:animate-spin" aria-hidden />}
          Find new guides
        </Button>
      ) : undefined}
    >
      <p className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground">
        <ShieldCheck className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        You send it yourself. We never message anyone.
      </p>
      <p className="sr-only" role="status">
        {find.isPending ? "Looking for practitioners…" : guides ? `${guides.length} guides found.` : ""}
      </p>
      <div>
        {limited && (
          <p role="alert" className="mb-4 rounded-xl bg-muted px-4 py-3 text-sm leading-6 text-foreground">
            You&apos;ve used today&apos;s 3 drafts. Come back tomorrow for fresh suggestions{guides?.length ? "; today's drafts are still below" : ""}.
          </p>
        )}
        {find.isPending ? (
          <div className="grid gap-6 md:grid-cols-2">
            <LoadingSkeleton variant="card" />
            <LoadingSkeleton variant="card" />
          </div>
        ) : err && !limited ? (
          <ErrorState
            title="We couldn't find guides right now"
            body="That's on us, not you. Try again, or look at demo suggestions."
            onRetry={() => find.mutate(false)}
            onUseDemo={() => find.mutate(true)}
          />
        ) : guides === null ? (
          !limited && (
            <EmptyState
              icon={Compass}
              title="Learn from people who already do this"
              body="Up to 3 drafts a day."
              action={<Button variant="outline" onClick={() => find.mutate(false)}>Find guides</Button>}
            />
          )
        ) : guides.length === 0 ? (
          <EmptyState icon={Compass} title="No guides found this time" body="Try again tomorrow, or ask a question in the help feed." />
        ) : (
          <ul aria-label="Suggested guides" className="grid gap-6 md:grid-cols-2">
            {guides.map((g, i) => <GuideCard key={g.publicUrl} guide={g} index={i} />)}
          </ul>
        )}
      </div>
    </Region>
  );
}
