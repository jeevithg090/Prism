"use client";
// Client data hooks for the Bridge Map and Roadmap (contract §9.8 query keys).
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import type { ApiResult, BridgeMap, EvidenceItem, Pod, Profile, Roadmap } from "@/lib/types";
import { useViewerId } from "@/components/community/useViewerId";

/** An API error that keeps its HTTP status, so a 404 can show the empty state instead of the error state. */
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url);
  let json: ApiResult<T> | null = null;
  try { json = (await res.json()) as ApiResult<T>; } catch { /* not JSON */ }
  if (!json) throw new HttpError(res.status, "We couldn't reach Keystone.");
  if (!json.ok) throw new HttpError(res.status, json.error.message);
  return json.data;
}
export const isNotFound = (e: unknown) => e instanceof HttpError && e.status === 404;

/** `?demo=1` always shows the demo student; otherwise the `ks_uid` cookie (default "aisha"). */
export function useMapViewer(demo?: boolean): string {
  const uid = useViewerId();
  return demo ? "aisha" : uid;
}

export function useGraph(uid: string) {
  return useQuery({ queryKey: ["graph", uid, "default"], queryFn: () => apiGet<BridgeMap>(`/api/graph/${encodeURIComponent(uid)}`) });
}
export function useProfileQuery(uid: string) {
  return useQuery({ queryKey: ["profile", uid], queryFn: () => apiGet<Profile>(`/api/profile/${encodeURIComponent(uid)}`), retry: 0 });
}
export function useEvidence(uid: string) {
  return useQuery({ queryKey: ["evidence", uid], queryFn: () => apiGet<EvidenceItem[]>(`/api/evidence/${encodeURIComponent(uid)}`), retry: 0 });
}
export function useRoadmapQuery(uid: string) {
  return useQuery({ queryKey: ["roadmap", uid], queryFn: () => apiGet<Roadmap>(`/api/roadmap/${encodeURIComponent(uid)}`) });
}
export function usePods(uid: string) {
  return useQuery({ queryKey: ["pods", uid], queryFn: () => apiGet<Pod[]>(`/api/pods?userId=${encodeURIComponent(uid)}`), retry: 0 });
}

/** The ISO date today on the client; null during server render (no Date in prerender). */
const noop = () => () => {};
export function useToday(): string | null {
  return React.useSyncExternalStore(noop, () => new Date().toISOString().slice(0, 10), () => null);
}
