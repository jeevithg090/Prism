"use client";
// P5 · member display helpers for the pods UI: names, initials, avatar tones and profile lookups.
import { useQueries } from "@tanstack/react-query";
import { apiGet } from "@/lib/fetcher";
import type { BadgeId, Pod, Profile } from "@/lib/types";

export type MemberInfo = {
  id: string;
  name: string;
  firstName: string;
  avatarUrl?: string;
  badges: BadgeId[];
  year?: number;
};

export const DEMO_POD_ID = "pod_demo01";

/** The 12 seeded students the matchmaker compares (data/seed/students.json). */
export const SEEDED_STUDENT_IDS = [
  "priya", "tom", "mei", "jakub", "sara", "leo", "amara", "dev", "hannah", "yusuf", "chloe", "ollie",
] as const;

export function capitalise(id: string): string {
  return id ? id[0].toUpperCase() + id.slice(1) : id;
}

export function fallbackMember(id: string): MemberInfo {
  const name = capitalise(id);
  return { id, name, firstName: name, badges: [] };
}

export function toMemberInfo(p: Profile): MemberInfo {
  return {
    id: p.id,
    name: p.name,
    firstName: p.name.split(/\s+/)[0] || p.name,
    avatarUrl: p.avatarUrl,
    badges: p.badges ?? [],
    year: p.year,
  };
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Literal class strings so Tailwind picks them up. Token tints only (the chart hues, never the coral signal,
// which stays for "you"); the initials are always the ink, so every tone keeps 4.5:1 in light and dark.
const TONES = [
  "bg-chart-2/20 text-foreground",
  "bg-chart-3/25 text-foreground",
  "bg-chart-4/20 text-foreground",
  "bg-chart-5/20 text-foreground",
  "bg-accent text-foreground",
] as const;

/** Stable colour per user id. */
export function avatarTone(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}

/** Profiles for a list of user ids (React Query key ["profile", id]); falls back to the capitalised id. */
export function useMemberProfiles(ids: string[]): Record<string, MemberInfo> {
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["profile", id],
      queryFn: () => apiGet<Profile>(`/api/profile/${encodeURIComponent(id)}`),
      staleTime: 5 * 60_000,
      retry: false,
    })),
  });
  const map: Record<string, MemberInfo> = {};
  ids.forEach((id, i) => {
    const p = results[i]?.data;
    map[id] = p && typeof p.name === "string" ? toMemberInfo(p) : fallbackMember(id);
  });
  return map;
}

export function memberIds(pod: Pod): string[] {
  return pod.members.map((m) => m.userId);
}
