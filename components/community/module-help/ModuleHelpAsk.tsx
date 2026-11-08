"use client";
import * as React from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Region } from "@/components/community/Region";
import { apiPost } from "@/lib/fetcher";
import type { HelpRequest } from "@/lib/types";

// Client-side module → skill map used for helper suggestions (no extra endpoint needed).
const MODULE_SKILLS: Record<string, { skill: string; students: string[] }> = {
  COMP1xxx1: { skill: "Hash maps", students: ["Aisha Rahman", "Tom Baker", "Mei Chen"] },
  "DBS-101": { skill: "SQL joins", students: ["Priya Shah", "Leo Park"] },
  "CS-202": { skill: "React components", students: ["Tom Baker", "Leo Park"] },
};

export function ModuleHelpAsk({
  viewerId,
  newcomer = false,
}: {
  viewerId: string;
  newcomer?: boolean;
  profile?: { id: string; name: string } | undefined;
}) {
  const [moduleCode, setModuleCode] = React.useState("");
  const [concept, setConcept] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [isPending, setIsPending] = React.useState(false);

  const q = React.useMemo(() => (moduleCode || concept).trim().toLowerCase(), [moduleCode, concept]);
  const suggestion = React.useMemo(() => {
    if (!q) return null;
    for (const [code, info] of Object.entries(MODULE_SKILLS)) {
      if (code.toLowerCase() === q || info.skill.toLowerCase().includes(q)) return info;
    }
    return null;
  }, [q]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending) return;
    if (!message.trim()) {
      toast.error("Write a message first.");
      return;
    }
    setIsPending(true);
    try {
      await apiPost<HelpRequest>("/api/help/module", {
        fromUserId: viewerId,
        ...(moduleCode ? { moduleCode } : {}),
        ...(concept ? { concept } : {}),
        message: message.trim(),
      });
      toast.success("Posted. Helpers who proved this skill will see it.");
      setMessage("");
      setModuleCode("");
      setConcept("");
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      toast.error(err.message || "We couldn't post that. Please try again.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Region
      id="module-help-title"
      title="Ask about a module concept"
      description={newcomer ? "Stuck on a module concept? Tell us the module or concept, and we'll point you at podmates who proved that skill. Helpers explain in more detail for students new to uni." : "Stuck on a module concept? Tell us the module or concept, and we'll point you at podmates who proved that skill."}
    >
      <form noValidate onSubmit={onSubmit} className="space-y-5 p-6 rounded-2xl border bg-card shadow-sm" aria-label="Ask about a module concept">
        <div className="space-y-2">
          <Label htmlFor="mh-module">Module code (optional)</Label>
          <Input
            id="mh-module"
            value={moduleCode}
            onChange={(e) => setModuleCode(e.target.value)}
            placeholder="e.g. COMP1xxx1"
            aria-label="Module code"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="mh-concept">Concept</Label>
          <Input
            id="mh-concept"
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            placeholder="e.g. hash maps, SQL joins"
            aria-label="Concept"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="mh-message">Message</Label>
          <Textarea
            id="mh-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder="e.g. I don't get hash maps yet. Could someone walk me through one?"
            aria-label="Message"
          />
        </div>
        {suggestion && (
          <p className="text-sm text-muted-foreground">
            We found {suggestion.students.length} students who proved{" "}
            <span className="font-semibold">{suggestion.skill}</span>{" "}
            ({suggestion.students.join(", ")}).
          </p>
        )}
        <Button type="submit" size="lg" disabled={isPending} aria-busy={isPending || undefined} className="w-full">
          {isPending ? <Loader2 className="motion-safe:animate-spin" aria-hidden /> : <Send aria-hidden />}
          {isPending ? "Asking…" : "Ask"}
        </Button>
      </form>
    </Region>
  );
}
