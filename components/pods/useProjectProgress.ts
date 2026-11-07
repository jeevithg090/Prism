"use client";
// Which pod issues are already merged (GET /api/projects/progress?podId=).
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/fetcher";
import type { ProjectProgress } from "@/lib/schemas/studio";

export const projectProgressKey = (podId: string) =>
  ["project-progress", podId] as const;

export function useProjectProgress(podId: string | undefined | null) {
  return useQuery({
    queryKey: projectProgressKey(podId ?? ""),
    queryFn: () =>
      apiGet<ProjectProgress>(
        `/api/projects/progress?podId=${encodeURIComponent(podId ?? "")}`,
      ),
    enabled: !!podId,
  });
}

export function isMerged(
  progress: ProjectProgress | null | undefined,
  issueIndex: number,
): boolean {
  return !!progress?.merged.some((m) => m.issueIndex === issueIndex);
}

/** Optimistically mark an issue merged in a cached ProjectProgress (no duplicates). */
export function withMerged(
  progress: ProjectProgress | undefined,
  entry: ProjectProgress["merged"][number] & { podId: string },
): ProjectProgress {
  const { podId, ...item } = entry;
  const base = progress ?? { podId, merged: [] };
  if (isMerged(base, item.issueIndex)) return base;
  return { ...base, merged: [...base.merged, item] };
}
