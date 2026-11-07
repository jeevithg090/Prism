"use client";
import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MemberAvatar } from "./MemberAvatar";
import { fallbackMember, SEEDED_STUDENT_IDS, type MemberInfo } from "./members";

const DRIFT_MS = 650; // candidates drift in (staggered)
const SETTLE_MS = 450; // the picks settle next to the user
const RX = 132; // ellipse the candidates float on (px)
const RY = 92;
const SLOT = 72; // spacing of the final row (user + picks)

type Props = {
  /** The student being matched. */
  user: MemberInfo;
  /** The matched members (without the user). Until they arrive, candidates keep floating. */
  picks?: string[];
  candidates?: readonly string[];
  /** Called once the picks have settled (~1.2s after mount when the match is quick). */
  onDone?: () => void;
};

function caption(count: number) {
  return `Comparing ${count} students… finding who fills your gaps`;
}

/** "Comparing 12 students…": candidate avatars drift in, then the matched ones settle next to the user. */
export function MatchingAnimation({ user, picks, candidates = SEEDED_STUDENT_IDS, onDone }: Props) {
  const reduce = useReducedMotion();
  const [drifted, setDrifted] = React.useState(false);
  const doneRef = React.useRef(onDone);
  React.useEffect(() => {
    doneRef.current = onDone;
  });

  // Make sure every pick has a slot among the candidates (replace non-picks from the end if needed).
  const slots = React.useMemo(() => {
    const ids = [...candidates].filter((id) => id !== user.id).slice(0, 12);
    for (const p of picks ?? []) {
      if (ids.includes(p)) continue;
      const free = ids.findLastIndex((id) => !(picks ?? []).includes(id));
      if (free >= 0) ids[free] = p;
    }
    return ids;
  }, [candidates, picks, user.id]);

  const settling = !reduce && drifted && !!picks;

  React.useEffect(() => {
    if (reduce) return;
    const t = setTimeout(() => setDrifted(true), DRIFT_MS);
    return () => clearTimeout(t);
  }, [reduce]);

  React.useEffect(() => {
    if (!picks) return;
    if (!reduce && !settling) return;
    const t = setTimeout(() => doneRef.current?.(), reduce ? 400 : SETTLE_MS + 100);
    return () => clearTimeout(t);
  }, [picks, reduce, settling]);

  const count = slots.length;

  if (reduce) {
    return (
      <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-2xl border bg-card p-6 shadow-sm md:p-8">
        <Loader2 className="size-5 shrink-0 text-muted-foreground motion-safe:animate-spin" aria-hidden />
        <p className="text-lg font-medium">{caption(count)}</p>
      </div>
    );
  }

  const pickOrder = picks ?? [];
  const rowX = (i: number) => (i - pickOrder.length / 2) * SLOT; // seats: the user, then the picks

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div aria-hidden className="relative h-80 w-full">
        <div className="absolute top-1/2 left-1/2 md:scale-125">
          {slots.map((id, i) => {
            const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
            const x = Math.cos(angle) * RX;
            const y = Math.sin(angle) * RY;
            const seat = pickOrder.indexOf(id);
            const isPick = settling && seat >= 0;
            const hidden = settling && seat < 0;
            return (
              <motion.div
                key={`${i}-${id}`}
                className="absolute -mt-6 -ml-6"
                initial={{ x: x * 2.2, y: y * 2.2, opacity: 0, scale: 0.6 }}
                animate={
                  isPick
                    ? { x: rowX(seat + 1), y: 0, opacity: 1, scale: 1.15 }
                    : hidden
                      ? { x: x * 1.25, y: y * 1.25, opacity: 0, scale: 0.6 }
                      : { x, y, opacity: 1, scale: 1 }
                }
                transition={
                  settling
                    ? { duration: SETTLE_MS / 1000, ease: [0.22, 1, 0.36, 1] }
                    : { duration: 0.36, ease: "easeOut", delay: i * 0.03 }
                }
              >
                <MemberAvatar member={fallbackMember(id)} size="lg" className={cn("shadow-sm ring-2 ring-card", isPick && "ring-primary/45")} />
              </motion.div>
            );
          })}
          <motion.div
            className="absolute -mt-8 -ml-8"
            initial={{ x: 0, scale: 0.8, opacity: 0 }}
            animate={{ x: settling ? rowX(0) : 0, scale: 1, opacity: 1 }}
            transition={{ duration: settling ? SETTLE_MS / 1000 : 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <MemberAvatar member={user} size="xl" className="ring-2 ring-primary ring-offset-4 ring-offset-card" />
          </motion.div>
        </div>
      </div>
      <p role="status" aria-live="polite" className="flex items-center justify-center gap-3 border-t px-6 py-4 text-center text-lg font-medium text-pretty">
        {!settling && <Loader2 className="size-5 shrink-0 text-muted-foreground motion-safe:animate-spin" aria-hidden />}
        {settling ? `Found ${pickOrder.length} students who fill your gaps` : caption(count)}
      </p>
    </div>
  );
}
