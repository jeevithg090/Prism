"use client";
// On a pass: "Rung 1: Tried it, Docker", what it unlocked on the ladder, and the next rung.
import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { buttonVariants } from "@/components/ui/button";
import { LadderStep } from "@/components/ladder/LadderStep";
import { cn } from "@/lib/utils";
import type { GradeResult } from "./model";

export function RungCelebration({ result, passportHref }: { result: GradeResult; passportHref: string }) {
  const reduce = useReducedMotion();
  const ref = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => { ref.current?.focus(); }, []);
  return (
    <motion.section
      aria-labelledby="rung-celebration-title"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="rounded-2xl border border-status-proven/40 bg-card p-6 shadow-sm md:p-8"
    >
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:gap-10">
        <LadderStep skillName={result.skillName} level={1} from={0} className="md:shrink-0" />
        <div className="min-w-0 space-y-3 md:border-s md:ps-10">
          <h2 id="rung-celebration-title" ref={ref} tabIndex={-1} className="text-2xl font-semibold text-pretty text-foreground outline-none md:text-3xl">
            You&apos;ve tried {result.skillName} for real
          </h2>
          <p className="max-w-[60ch] text-pretty text-muted-foreground">
            {result.usedSample
              ? "You used the sample answer, so your passport says so. Try it in your own words any time to replace it."
              : "This pass is now micro-challenge evidence on your Skill Passport. Next rung: build it in your pod, where a peer who knows it reviews your pull request."}
          </p>
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row">
            <Link href={passportHref} className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
              See your passport
            </Link>
            <Link href="/pods" className={cn(buttonVariants({ size: "lg" }))}>
              Next: build it in your pod
            </Link>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
