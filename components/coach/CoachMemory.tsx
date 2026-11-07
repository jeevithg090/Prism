"use client";
// P5 · "What the Coach remembers": the student sees every memory note and can delete any of them.
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookmarkPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/keystone";
import { Button } from "@/components/ui/button";
import { useViewerId } from "@/components/community/useViewerId";
import { apiGet } from "@/lib/fetcher";
import type { MemoryNote } from "@/lib/schemas/coach";

export function CoachMemory({ userId: userIdProp }: { userId?: string }) {
  const viewer = useViewerId();
  const userId = userIdProp ?? viewer;
  const qc = useQueryClient();
  const key = ["coach-memory", userId];
  const q = useQuery({ queryKey: key, queryFn: () => apiGet<MemoryNote[]>(`/api/coach/memory?userId=${encodeURIComponent(userId)}`) });

  const remove = async (id: string) => {
    try {
      const res = await fetch(`/api/coach/memory?userId=${encodeURIComponent(userId)}&id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const json = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!json.ok) throw new Error(json.error?.message);
      qc.setQueryData<MemoryNote[]>(key, (old) => (old ?? []).filter((n) => n.id !== id));
      toast.success("Forgotten", { description: "The Coach won't use that note any more." });
    } catch (e) {
      toast.error("Couldn't delete that note", { description: e instanceof Error ? e.message : undefined });
    }
  };

  if (q.isLoading) return <LoadingSkeleton variant="list" />;
  if (q.isError) return <ErrorState title="Couldn't load your memory notes" onRetry={() => void q.refetch()} />;
  const notes = q.data ?? [];
  if (!notes.length) {
    return <EmptyState icon={BookmarkPlus} title="Nothing remembered yet" body={'Tell the Coach things like "I prefer project-based learning" and it will note them here.'} />;
  }
  return (
    // One card, rows split by hairlines: the states above replace the card, so nothing nests.
    <ul className="divide-y rounded-2xl border bg-card px-5 shadow-sm" aria-label="Memory notes">
      {notes.map((n) => (
        <li key={n.id} className="flex items-start justify-between gap-3 py-3">
          <div className="min-w-0 pt-1 text-base text-pretty text-foreground">
            <span className="mr-2 inline-flex h-6 items-center rounded-md border bg-muted px-1.5 text-xs font-medium text-muted-foreground">{n.kind}</span>
            {n.text}
          </div>
          <Button variant="ghost" size="icon-sm" aria-label={`Forget: ${n.text}`} onClick={() => void remove(n.id)}>
            <Trash2 aria-hidden />
          </Button>
        </li>
      ))}
    </ul>
  );
}
