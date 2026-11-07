"use client";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/fetcher";
import type { Profile } from "@/lib/types";

export function getClientUserId() {
  if (typeof document === "undefined") return "aisha";
  return document.cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith("ks_uid="))?.split("=")[1] ?? "aisha";
}
export function useCurrentUser() {
  const id = getClientUserId();
  return useQuery({ queryKey: ["profile", id], queryFn: () => apiGet<Profile>(`/api/profile/${encodeURIComponent(id)}`) });
}
