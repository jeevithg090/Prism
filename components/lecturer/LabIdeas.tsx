"use client";
// "Suggested practical labs": one card per idea, each with a Copy to module plan button.
import { useEffect, useId, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, ClipboardCopy, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** "COMP2xxx3", "COMP23311" … if the idea names a module. */
export function moduleCodeOf(idea: string): string | undefined {
  return idea.match(/\b[A-Z]{3,5}\d[0-9x]{2,5}\b/)?.[0];
}

function LabCard({ idea, index }: { idea: string; index: number }) {
  const textId = useId();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const code = moduleCodeOf(idea);

  async function copy() {
    try {
      await navigator.clipboard.writeText(idea);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
      toast.success("Lab idea copied", { description: "Paste it into your module plan." });
    } catch {
      toast.error("Couldn't copy that", { description: "Select the text and copy it instead." });
    }
  }

  return (
    <article className="flex h-full flex-col gap-4 rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span className="rounded-xl bg-primary/10 p-2 text-primary"><FlaskConical className="size-4" aria-hidden /></span>
          Lab idea {index + 1}
        </span>
        {code && <span className="rounded-full border bg-status-degree/10 px-2.5 py-0.5 font-mono text-sm text-status-degree">{code}</span>}
      </div>
      <p id={textId} className="flex-1 text-base leading-relaxed">{idea}</p>
      <Button variant="outline" size="lg" onClick={copy} aria-describedby={textId} className="self-start rounded-xl focus-visible:ring-2 focus-visible:ring-ring">
        {copied ? <Check aria-hidden /> : <ClipboardCopy aria-hidden />}
        {copied ? "Copied" : "Copy to module plan"}
      </Button>
    </article>
  );
}

export function LabIdeas({ ideas }: { ideas: string[] }) {
  const reduce = useReducedMotion();
  return (
    <ul className="grid gap-4 lg:grid-cols-3" aria-label="Suggested practical labs">
      {ideas.map((idea, i) => (
        <motion.li
          key={idea}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut", delay: reduce ? 0 : i * 0.04 }}
        >
          <LabCard idea={idea} index={i} />
        </motion.li>
      ))}
    </ul>
  );
}
