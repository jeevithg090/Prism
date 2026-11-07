"use client";
// Decorative call-state orb (aria-hidden); the status itself is announced by the parent's live region.
import { motion, useReducedMotion } from "motion/react";
import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";

export type OrbState = "connecting" | "agent" | "user" | "idle";

export function InterviewOrb({ state, className }: { state: OrbState; className?: string }) {
  const reduce = useReducedMotion();
  const ring = state === "agent" ? "border-primary" : state === "user" ? "border-chart-2" : "border-border";
  return (
    <div aria-hidden data-state={state} className={cn("relative grid size-28 place-items-center md:size-32", className)}>
      {!reduce && (state === "agent" || state === "user") && (
        <motion.span
          className={cn("absolute inset-0 rounded-full border-4", ring)}
          initial={{ opacity: 0.6, scale: 0.9 }}
          animate={{ opacity: 0, scale: 1.15 }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <span
        className={cn(
          "grid size-full place-items-center rounded-full border-4 bg-primary/10",
          ring,
          state === "connecting" && !reduce && "animate-spin border-t-primary border-r-transparent",
        )}
      />
      <Mic className={cn("absolute size-8", state === "user" ? "text-chart-2" : "text-primary")} />
    </div>
  );
}
