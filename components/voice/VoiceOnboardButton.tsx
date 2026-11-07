"use client";
// PR5: voice alternative to the onboarding form. The ElevenLabs "Onboarding Coach" chats for ~2 minutes,
// then calls the client tool `save_dna`. We show what it heard in a confirmation sheet; only the student's
// [Apply to form] passes values to the form (via onComplete). The coach never submits anything itself.
// Renders nothing when voice isn't available (config fails or returns agentId "text-mode").
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { CheckCircle2, MicOff, Square } from "lucide-react";
import { toast } from "sonner";
import type { LearningDNA } from "@/lib/types";
import { apiGet } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getClientUserId } from "@/lib/voice/clientUser";
import { mapToDNA, summariseDNA, type SaveDnaParams } from "@/lib/voice/dna";

interface OnboardConfig {
  agentId: string;
  signedUrl?: string;
  dynamicVariables?: Record<string, string>;
}

interface Caption {
  id: number;
  who: "coach" | "you";
  text: string;
}

export interface VoiceOnboardButtonProps {
  onComplete: (dna: Partial<LearningDNA>) => void;
}

const onboardConfigUrl = () => `/api/interview/config?userId=${encodeURIComponent(getClientUserId())}&agent=onboard`;

const usableConfig = (c: OnboardConfig | null | undefined): c is OnboardConfig & { signedUrl: string } =>
  !!c && c.agentId !== "text-mode" && typeof c.signedUrl === "string" && c.signedUrl.length > 0;

export function VoiceOnboardButton({ onComplete }: VoiceOnboardButtonProps) {
  const [config, setConfig] = useState<OnboardConfig | null>(null);

  // This fetch only decides whether voice is available. Signed URLs expire (~15 min), so the coach
  // asks for a fresh one each time the student taps Talk.
  useEffect(() => {
    let alive = true;
    apiGet<OnboardConfig>(onboardConfigUrl())
      .then((c) => {
        if (alive && usableConfig(c)) setConfig(c);
      })
      .catch(() => {
        // Voice unavailable: render nothing, P3's onboarding form works on its own.
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!config?.signedUrl) return null;
  return (
    <ConversationProvider>
      <OnboardCoach dynamicVariables={config.dynamicVariables} onComplete={onComplete} />
    </ConversationProvider>
  );
}

const STATUS_TEXT = {
  connecting: "Connecting to your coach…",
  speaking: "Your coach is speaking",
  listening: "Your coach is listening",
} as const;

const APPLIED_NOTICE = "Your answers are in the form. Check them and tap Continue.";

function OnboardCoach({
  dynamicVariables,
  onComplete,
}: {
  dynamicVariables?: Record<string, string>;
  onComplete: (dna: Partial<LearningDNA>) => void;
}) {
  const [starting, setStarting] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [pending, setPending] = useState<SaveDnaParams | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const captionId = useRef(0);
  const captionsEnd = useRef<HTMLLIElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  // Bumped by Stop and on unmount, so a start() still waiting on the mic prompt or the config fetch gives up.
  const attempt = useRef(0);

  useEffect(() => {
    const ref = attempt;
    return () => {
      ref.current++;
    };
  }, []);

  const conv = useConversation({
    onConnect: () => {
      setStarting(false);
      setNotice("You're connected. Your coach is listening.");
    },
    onDisconnect: () => {
      setStarting(false);
      setNotice((n) => (n === APPLIED_NOTICE ? n : "Your chat with the coach has ended. You can keep filling in the form."));
    },
    onError: () => {
      setStarting(false);
      toast.error("Voice connection dropped. You can keep filling in the form.");
    },
    onMessage: (m: { message: string; source: "user" | "ai"; role?: "user" | "agent" }) => {
      const text = m.message?.trim();
      if (!text) return;
      const who: Caption["who"] = m.role === "agent" || m.source === "ai" ? "coach" : "you";
      setCaptions((prev) => [...prev, { id: ++captionId.current, who, text }].slice(-6));
    },
  });

  const status = conv.status;
  const active = starting || status === "connecting" || status === "connected";
  const orbState: keyof typeof STATUS_TEXT = status === "connected" ? (conv.isSpeaking ? "speaking" : "listening") : "connecting";

  useEffect(() => {
    captionsEnd.current?.scrollIntoView?.({ block: "nearest" });
  }, [captions]);

  // Keyboard focus: the Talk button unmounts when the panel opens (and the reverse), so move focus
  // to Stop when the chat starts and back to Talk when it ends, unless focus is somewhere else already.
  const wasActive = useRef(false);
  useEffect(() => {
    if (active === wasActive.current) return;
    wasActive.current = active;
    const focusLost = !document.activeElement || document.activeElement === document.body;
    const target = rootRef.current?.querySelector<HTMLButtonElement>(active ? '[data-focus="stop"]' : '[data-focus="talk"]');
    if (active || focusLost) target?.focus();
  }, [active]);

  const start = useCallback(async () => {
    const my = ++attempt.current;
    const failToStart = () => {
      setStarting(false);
      setNotice("");
      toast.error("We couldn't reach your coach. You can keep filling in the form.");
    };
    setMicDenied(false);
    setNotice("Starting your chat with the coach.");
    setCaptions([]);
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // We only needed the permission prompt; the SDK opens its own stream.
      stream.getTracks?.().forEach((t) => t.stop());
    } catch {
      if (attempt.current !== my) return;
      setStarting(false);
      setMicDenied(true);
      setNotice("");
      return;
    }
    if (attempt.current !== my) return; // Stopped or unmounted while the mic prompt was open.

    let fresh: OnboardConfig | null = null;
    try {
      fresh = await apiGet<OnboardConfig>(onboardConfigUrl());
    } catch {
      fresh = null;
    }
    if (attempt.current !== my) return;
    if (!usableConfig(fresh)) {
      failToStart();
      return;
    }
    try {
      conv.startSession({
        signedUrl: fresh.signedUrl,
        connectionType: "websocket",
        // The coach's first message only uses {{name}} (voice/agents.md); send just that.
        dynamicVariables: { name: fresh.dynamicVariables?.name || dynamicVariables?.name || "there" },
        clientTools: {
          save_dna: async (p: Record<string, unknown>) => {
            setPending(p as SaveDnaParams);
            setSheetOpen(true);
            return "saved";
          },
        },
      });
    } catch {
      failToStart();
    }
  }, [conv, dynamicVariables]);

  const stop = useCallback(() => {
    attempt.current++;
    setStarting(false);
    conv.endSession();
  }, [conv]);

  const dna = useMemo(() => mapToDNA(pending), [pending]);
  const rows = useMemo(() => summariseDNA(dna), [dna]);
  const connected = status === "connected";

  const apply = () => {
    onComplete(dna);
    setSheetOpen(false);
    setPending(null);
    setNotice(APPLIED_NOTICE);
    toast.success("Added to your form. Check it and tap Continue.");
    stop();
  };

  // Closing the sheet never throws the answers away: they stay in `pending` and
  // "Review your answers" reopens them until the student applies them.
  const closeSheet = () => setSheetOpen(false);

  const edit = () => {
    closeSheet();
    if (connected) {
      try {
        conv.sendContextualUpdate?.(
          "The student wants to change some answers. Ask what they'd like to change, then call save_dna again with all the values.",
        );
      } catch {
        // Not critical: the student can just say what to change.
      }
    }
  };

  return (
    <div className="w-full" ref={rootRef}>
      {!active ? (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={start}
            data-focus="talk"
            className="w-full gap-2 rounded-xl text-base focus-visible:ring-2 focus-visible:ring-ring sm:w-auto"
          >
            <span aria-hidden="true">🎙</span> Talk to the coach instead
          </Button>
          {micDenied && (
            <p role="alert" className="flex items-center gap-2 text-sm text-muted-foreground">
              <MicOff aria-hidden="true" className="h-4 w-4 text-status-gap" />
              We couldn&apos;t access your microphone. You can fill in the form instead.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 text-foreground">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              data-state={orbState}
              className={
                "inline-block h-10 w-10 shrink-0 rounded-full " +
                (orbState === "speaking"
                  ? "bg-primary ring-4 ring-primary/30 motion-safe:animate-pulse"
                  : orbState === "listening"
                    ? "bg-primary/60 ring-4 ring-primary/10"
                    : "border-4 border-primary/30 border-t-primary motion-safe:animate-spin motion-reduce:border-primary")
              }
            />
            {/* Not a live region: it flips on every turn. Connect/end are announced in the sr-only notice below. */}
            <p className="flex-1 text-base font-medium">{STATUS_TEXT[orbState]}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={stop}
              data-focus="stop"
              className="gap-1 rounded-xl focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Square aria-hidden="true" className="h-4 w-4" /> Stop
            </Button>
          </div>
          <ol aria-live="polite" aria-label="Live captions" className="flex max-h-40 flex-col gap-1 overflow-y-auto text-base">
            {captions.length === 0 ? (
              <li className="text-muted-foreground">Say hello when you&apos;re ready. Your coach will ask a few quick questions.</li>
            ) : (
              captions.map((c, i) => (
                <li key={c.id} ref={i === captions.length - 1 ? captionsEnd : undefined}>
                  <span className={c.who === "coach" ? "font-semibold text-primary" : "font-semibold text-foreground"}>
                    {c.who === "coach" ? "Coach" : "You"}:
                  </span>{" "}
                  <span className="text-foreground">{c.text}</span>
                </li>
              ))
            )}
          </ol>
        </div>
      )}

      {pending && rows.length > 0 && !sheetOpen && (
        <Button
          type="button"
          variant="outline"
          onClick={() => setSheetOpen(true)}
          className="mt-2 w-full gap-2 rounded-xl text-base focus-visible:ring-2 focus-visible:ring-ring sm:w-auto"
        >
          <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-status-proven" /> Review your answers
        </Button>
      )}

      <p className="sr-only" aria-live="polite">
        {notice}
      </p>

      <Sheet open={sheetOpen} onOpenChange={(o) => (o ? setSheetOpen(true) : closeSheet())}>
        {/* Once the chat has ended the footer button is "Close" itself, so drop the corner X (also named
            "Close") to avoid two identically named buttons in one dialog. While connected the footer says
            "Edit", and the X stays as the plain way out. */}
        <SheetContent side="bottom" className="rounded-t-2xl" showCloseButton={connected}>
          <SheetHeader>
            <SheetTitle>Here&apos;s what your coach heard</SheetTitle>
            <SheetDescription>
              {connected
                ? "Check these answers. Nothing is saved until you apply them and tap Continue on the form."
                : "Your chat has ended. Apply these answers, then change anything you like in the form before you tap Continue."}
            </SheetDescription>
          </SheetHeader>
          {rows.length === 0 ? (
            <p className="px-4 text-base text-muted-foreground">
              {connected
                ? "Your coach didn't catch any answers yet. Tap Edit and keep talking."
                : "Your coach didn't catch any answers. You can talk to the coach again or fill in the form."}
            </p>
          ) : (
            <ul className="flex flex-col gap-2 px-4" aria-label="Answers from your chat">
              {rows.map((r) => (
                <li key={r.key} className="flex items-start gap-3 rounded-xl border bg-card p-3">
                  <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-status-proven" />
                  <div>
                    <p className="text-sm text-muted-foreground">{r.label}</p>
                    <p className="text-base font-medium text-foreground">{r.value}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <SheetFooter>
            <Button type="button" onClick={apply} disabled={rows.length === 0} className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring">
              Apply to form
            </Button>
            <Button type="button" variant="outline" onClick={connected ? edit : closeSheet} className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring">
              {connected ? "Edit" : "Close"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default VoiceOnboardButton;
