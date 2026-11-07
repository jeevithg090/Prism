"use client";
import { useQueries } from "@tanstack/react-query";
import { apiGet } from "@/lib/fetcher";
import type { Profile } from "@/lib/types";
import type { ProfilesById } from "./help";

/** Fetches `GET /api/profile/[id]` for each unique id. Missing profiles resolve to undefined (UI falls back to the id). */
export function useProfiles(ids: string[]): ProfilesById {
  const unique = [...new Set(ids.filter(Boolean))].sort();
  return useQueries({
    queries: unique.map((id) => ({
      queryKey: ["profile", id],
      queryFn: () => apiGet<Profile>(`/api/profile/${encodeURIComponent(id)}`),
      retry: false,
      staleTime: 5 * 60_000,
    })),
    combine: (results) => Object.fromEntries(unique.map((id, i) => [id, results[i]?.data])) as ProfilesById,
  });
}
