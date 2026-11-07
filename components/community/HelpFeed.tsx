"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Clock3, GitPullRequest, HandHeart, Loader2, MessageCircleQuestion, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { BadgePill, DemoDataNote, EmptyState, ErrorState, LoadingSkeleton } from "@/components/keystone";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/fetcher";
import type { HelpRequest } from "@/lib/types";
import { displayName, isNewcomer, KIND_LABEL, type ProfilesById } from "./help";
import { PersonAvatar } from "./PersonAvatar";
import { CARD, Region } from "./Region";

export const ASK_MESSAGE_ID = "ask-message";

/**
 * Newcomers first: the New to UoM pill takes the proven hue on its icon, tint and edge so those rows
 * read from the back of the room. The label stays ink. Other badges stay neutral.
 */
export const NEWCOMER_TINT =
  "inline-flex [&>span]:border-status-proven/40 [&>span]:bg-status-proven/8 [&_svg]:text-status-proven";

const KIND_ICON: Record<HelpRequest["kind"], LucideIcon> = {
  question: MessageCircleQuestion,
  "chat-15": Clock3,
  "code-review": GitPullRequest,
};

function relativeTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : formatDistanceToNow(d, { addSuffix: true });
}

function HelpCard({ request, profiles, viewerId }: { request: HelpRequest; profiles: ProfilesById; viewerId: string }) {
  const qc = useQueryClient();
  const profile = profiles[request.fromUserId];
  const name = displayName(request.fromUserId, profile);
  const own = request.fromUserId === viewerId;
  const headingId = `help-${request.id}-name`;
  const KindIcon = KIND_ICON[request.kind];

  const help = useMutation({
    mutationFn: () => apiPost<HelpRequest>("/api/help", { id: request.id, status: "accepted", toUserId: viewerId }),
    onSuccess: () => {
      toast.success("Thank you! +3 momentum");
      void qc.invalidateQueries({ queryKey: ["help"] });
      void qc.invalidateQueries({ queryKey: ["momentum", viewerId] });
    },
    onError: (e: Error) => toast.error(e.message || "We couldn't send that. Please try again."),
  });

  return (
    // Your own request sits in a well: the one row on this list that is yours.
    <li className={own ? "bg-muted px-6 py-5 first:rounded-t-2xl last:rounded-b-2xl" : "px-6 py-5"} data-testid="help-card">
      <article aria-labelledby={headingId} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
        <PersonAvatar userId={request.fromUserId} profile={profile} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <h3 id={headingId} className="text-lg font-semibold text-foreground">
              {own ? <>{name} <span className="text-primary">(you)</span></> : name}
            </h3>
            {profile?.badges.map((b) =>
              b === "new-to-uni" ? (
                <span key={b} className={NEWCOMER_TINT}><BadgePill badge={b} /></span>
              ) : (
                <BadgePill key={b} badge={b} />
              ),
            )}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
              <KindIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>{KIND_LABEL[request.kind]}</span>
            </span>
            <time dateTime={request.createdAt}>{relativeTime(request.createdAt)}</time>
          </p>
        </div>
        {/* On a phone the message and its action take the full row under the avatar. */}
        <p className="col-span-2 mt-3 max-w-[68ch] text-base leading-7 text-pretty break-words whitespace-pre-wrap text-foreground sm:col-span-2 sm:col-start-2 sm:row-start-2">{request.message}</p>
        {own ? (
          <p className="col-span-2 mt-3 max-w-[68ch] text-sm text-pretty text-muted-foreground sm:col-span-2 sm:col-start-2">This is your request. A helper will pick it up soon.</p>
        ) : (
          <div className="col-span-2 mt-4 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:mt-0">
            <Button
              variant="outline"
              onClick={() => help.mutate()}
              disabled={help.isPending || help.isSuccess}
              aria-busy={help.isPending || undefined}
              aria-label={`I can help ${name}`}
            >
              {help.isPending ? <Loader2 className="motion-safe:animate-spin" aria-hidden /> : <HandHeart aria-hidden />}
              {help.isPending ? "Sending…" : help.isSuccess ? "Thanks for helping" : "I can help"}
            </Button>
          </div>
        )}
      </article>
    </li>
  );
}

export function HelpFeed({
  requests, profiles, viewerId, isLoading, isError, onRetry, onUseDemo, isDemo = false,
}: {
  requests: HelpRequest[];
  profiles: ProfilesById;
  viewerId: string;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onUseDemo: () => void;
  isDemo?: boolean;
}) {
  const full = !isLoading && !isError && requests.length > 0;
  // The counts are the requests you could pick up, so your own request is left out of both.
  const others = requests.filter((r) => r.fromUserId !== viewerId);
  const newcomers = others.filter((r) => isNewcomer(profiles[r.fromUserId])).length;

  return (
    <Region
      id="help-feed-title"
      title="Help a newcomer"
      note={full && isDemo ? <DemoDataNote /> : undefined}
      headWidth="max-w-[34ch]"
      description="Students new to UoM are shown first, so nobody waits alone."
      actions={full ? (
        <dl className="flex items-end">
          <div className="flex flex-col-reverse pr-6">
            <dt className="text-sm text-muted-foreground">Open requests</dt>
            <dd className="font-mono text-3xl leading-none font-semibold text-foreground tabular-nums">{others.length}</dd>
          </div>
          <div className="flex flex-col-reverse border-l pl-6">
            <dt className="text-sm text-muted-foreground">New to UoM</dt>
            <dd className="font-mono text-3xl leading-none font-semibold text-foreground tabular-nums">{newcomers}</dd>
          </div>
        </dl>
      ) : undefined}
    >
      {isLoading ? (
        <LoadingSkeleton variant="list" />
      ) : isError ? (
        <ErrorState
          title="We couldn't load the help feed"
          body="That's on us, not you. Try again, or look at demo requests for now."
          onRetry={onRetry}
          onUseDemo={onUseDemo}
        />
      ) : requests.length === 0 ? (
        <EmptyState
          icon={HandHeart}
          title="No open requests right now"
          body="Everyone is sorted for the moment. Got a question of your own? Ask it, and a helper will pick it up."
          action={<Button variant="outline" onClick={() => document.getElementById(ASK_MESSAGE_ID)?.focus()}>Write a request</Button>}
        />
      ) : (
        <ul aria-label="Open help requests" className={`divide-y ${CARD}`}>
          {requests.map((r) => <HelpCard key={r.id} request={r} profiles={profiles} viewerId={viewerId} />)}
        </ul>
      )}
    </Region>
  );
}
