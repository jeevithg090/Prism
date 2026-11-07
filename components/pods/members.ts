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

// Literal class strings so Tailwind picks them up. 800/900 text on 100 backgrounds keeps contrast above 4.5:1.
const TONES = [
  "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/25 dark:text-indigo-100",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/25 dark:text-emerald-100",
  "bg-amber-100 text-amber-900 dark:bg-amber-500/25 dark:text-amber-100",
  "bg-rose-100 text-rose-800 dark:bg-rose-500/25 dark:text-rose-100",
  "bg-sky-100 text-sky-800 dark:bg-sky-500/25 dark:text-sky-100",
  "bg-violet-100 text-violet-800 dark:bg-violet-500/25 dark:text-violet-100",
  "bg-teal-100 text-teal-800 dark:bg-teal-500/25 dark:text-teal-100",
  "bg-orange-100 text-orange-900 dark:bg-orange-500/25 dark:text-orange-100",
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
