"use client";
// "Labs that would close these gaps": one hairline row per idea, headed by its module code, each with a Copy to module plan button.
import { useEffect, useId, useRef, useState } from "react";
import { Check, ClipboardCopy } from "lucide-react";
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
    <article className="grid gap-x-6 gap-y-3 md:grid-cols-[9rem_minmax(0,1fr)_auto] md:items-start">
      <p className="font-mono text-base leading-relaxed font-medium text-foreground">
        {code ? <span>{code}</span> : <span className="sr-only">Lab idea {index + 1}</span>}
      </p>
      <p id={textId} className="max-w-[68ch] text-base leading-relaxed text-pretty text-foreground">{idea}</p>
      <Button variant="outline" onClick={copy} aria-describedby={textId} className="justify-self-start focus-visible:outline-ring active:translate-y-px disabled:opacity-55 md:justify-self-end">
        {copied ? <Check aria-hidden /> : <ClipboardCopy aria-hidden />}
        {copied ? "Copied" : "Copy to module plan"}
      </Button>
    </article>
  );
}

export function LabIdeas({ ideas }: { ideas: string[] }) {
  return (
    <ul className="divide-y" aria-label="Labs that would close these gaps">
      {ideas.map((idea, i) => (
        <li key={idea} className="py-5 first:pt-0 last:pb-0">
          <LabCard idea={idea} index={i} />
        </li>
      ))}
    </ul>
  );
}
