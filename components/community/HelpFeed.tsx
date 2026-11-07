"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { HandHeart } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { BadgePill, EmptyState, ErrorState, LoadingSkeleton, SectionCard } from "@/components/keystone";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/fetcher";
import type { HelpRequest } from "@/lib/types";
import { displayName, KIND_LABEL, type ProfilesById } from "./help";
import { PersonAvatar } from "./PersonAvatar";

export const ASK_MESSAGE_ID = "ask-message";

function relativeTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : formatDistanceToNow(d, { addSuffix: true });
}

function HelpCard({ request, profiles, viewerId, index }: { request: HelpRequest; profiles: ProfilesById; viewerId: string; index: number }) {
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const profile = profiles[request.fromUserId];
  const name = displayName(request.fromUserId, profile);
  const own = request.fromUserId === viewerId;
  const headingId = `help-${request.id}-name`;

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
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut", delay: reduce ? 0 : index * 0.04 }}
      className="rounded-2xl border bg-card p-5 shadow-sm"
      data-testid="help-card"
    >
      <div className="flex items-start gap-3">
        <PersonAvatar userId={request.fromUserId} profile={profile} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={headingId} className="font-semibold">{own ? `${name} (you)` : name}</h3>
            {profile?.badges.map((b) => <BadgePill key={b} badge={b} />)}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{KIND_LABEL[request.kind]}</span>
            <time dateTime={request.createdAt}>{relativeTime(request.createdAt)}</time>
          </p>
        </div>
      </div>
      <p className="mt-3 whitespace-pre-wrap break-words">{request.message}</p>
      <div className="mt-4 flex justify-end">
        {own ? (
          <p className="text-sm text-muted-foreground">This is your request. A helper will pick it up soon.</p>
        ) : (
          <Button
            onClick={() => help.mutate()}
            disabled={help.isPending || help.isSuccess}
            aria-label={`I can help ${name}`}
            className="focus-visible:ring-2 focus-visible:ring-ring"
          >
            <HandHeart aria-hidden />
            {help.isPending ? "Sending…" : help.isSuccess ? "Thanks for helping" : "I can help"}
          </Button>
        )}
      </div>
    </motion.li>
  );
}

export function HelpFeed({
  requests, profiles, viewerId, isLoading, isError, onRetry, onUseDemo,
}: {
  requests: HelpRequest[];
  profiles: ProfilesById;
  viewerId: string;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onUseDemo: () => void;
}) {
  return (
    <SectionCard title="Help a newcomer" description="Open requests from other students. 🌱 newcomers are shown first, so nobody waits alone.">
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
        <ul aria-label="Open help requests" className="space-y-4">
          {requests.map((r, i) => <HelpCard key={r.id} request={r} profiles={profiles} viewerId={viewerId} index={i} />)}
        </ul>
      )}
    </SectionCard>
  );
}
