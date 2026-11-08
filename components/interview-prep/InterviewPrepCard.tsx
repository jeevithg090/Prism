"use client";
// Interview prep card: slots into the dashboard row beside AskKeystoneCard.
// Fetches gap-tailored questions from /api/interview/prep and renders four states.
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import type { BridgeMap } from "@/lib/types";
import { SectionCard, SkillChip, StatusBadge, EmptyState, ErrorState, LoadingSkeleton } from "@/components/keystone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type QType = "behavioural" | "technical" | "system-design" | "coding";
interface InterviewQuestion {
  id: string;
  skillId: string;
  question: string;
  type: QType;
  difficulty: 1 | 2 | 3;
  tip: string;
}
interface PrepSlice {
  skillId: string;
  questions: InterviewQuestion[];
  focus: string;
}

const TYPE_LABEL: Record<QType, string> = {
  behavioural: "Behavioural",
  technical: "Technical",
  "system-design": "System design",
  coding: "Coding",
};

async function fetchPrep(userId: string, roleId: string): Promise<PrepSlice[]> {
  const res = await fetch(`/api/interview/prep?userId=${encodeURIComponent(userId)}&roleId=${encodeURIComponent(roleId)}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to load interview prep");
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message || "Failed to load interview prep");
  return json.data ?? [];
}

function readPractised(questionId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(`keystone:interview-prep:practised:${questionId}`) === "true";
  } catch {
    return false;
  }
}

function writePractised(questionId: string, value: boolean): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(`keystone:interview-prep:practised:${questionId}`, String(value)); } catch { /* localStorage unavailable */ }
}

/** "Mark practised" toggle: a keyboard-reachable switch with a focus ring and aria-checked. */
function PractiseToggle({ questionId }: { questionId: string }) {
  const [pressed, setPressed] = React.useState<boolean>(() => readPractised(questionId));

  const handleClick = () => {
    const next = !pressed;
    setPressed(next);
    writePractised(questionId, next);
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      role="switch"
      aria-checked={pressed ? "true" : "false"}
      aria-label={pressed ? `Mark ${questionId} as not practised` : `Mark ${questionId} as practised`}
      onClick={handleClick}
      className={cn("w-auto px-3", pressed ? "bg-status-gap/20 text-status-gap border-status-gap/40" : "")}
    >
      {pressed ? "Practised" : "Mark practised"}
    </Button>
  );
}

/** Three filled dots up to the difficulty level, mirroring SkillChip's level marker. */
function DifficultyChips({ difficulty }: { difficulty: 1 | 2 | 3 }) {
  return (
    <div className="flex items-center gap-1" aria-label={`Difficulty ${difficulty} of 3`} role="img">
      <span className="sr-only">Difficulty {difficulty} of 3</span>
      {[1, 2, 3].map((d) => (
        <span key={d} className={cn("size-1.5 rounded-full", d <= difficulty ? "bg-foreground" : "bg-rule-2")} aria-hidden />
      ))}
      <span className="ml-2 text-xs text-muted-foreground">Level {difficulty} of 3</span>
    </div>
  );
}

export function InterviewPrepCard({
  userId, roleId,
}: {
  userId: string;
  roleId: string;
  map?: BridgeMap | null;
}) {
  const query = useQuery({
    queryKey: ["interview-prep", userId, roleId],
    queryFn: () => fetchPrep(userId, roleId),
    enabled: Boolean(userId),
  });

  if (query.isPending) return <LoadingSkeleton variant="list" />;
  if (query.isError) {
    return (
      <ErrorState
        title="We couldn't load your interview prep"
        body="That's on us, not you. Try again, and we'll pick up where we left off."
        onRetry={() => query.refetch()}
      />
    );
  }

  const prep = query.data ?? [];
  if (!prep.length) {
    return (
      <EmptyState
        title="No interview prep yet"
        body="Build your Bridge Map first, and we'll pick your top gap skills and questions to practise before your interview."
      />
    );
  }

  return (
    <SectionCard title="Interview prep" description={prep[0]?.focus ?? "Here are questions for your biggest gaps."}>
      {prep.map((slice) => (
        <Card key={slice.skillId} className="mt-4">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <SkillChip skillId={slice.skillId} name={slice.skillId.charAt(0).toUpperCase() + slice.skillId.slice(1)} status="gap" />
              <StatusBadge status="gap" size="sm" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {slice.questions.map((q) => (
              <div key={q.id} className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 p-3 rounded-xl bg-muted/50 border border-rule/50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground leading-snug">{q.question}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant={q.type === "behavioural" ? "default" : "outline"} className="text-xs">
                      {TYPE_LABEL[q.type]}
                    </Badge>
                    <DifficultyChips difficulty={q.difficulty} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{q.tip}</p>
                </div>
                <PractiseToggle questionId={q.id} />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </SectionCard>
  );
}
