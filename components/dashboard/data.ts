"use client";
// Dashboard + shell data: optional reads that treat "route not there yet" (404) as "no data", not as an error.
import { useQuery } from "@tanstack/react-query";
import type { ApiResult, BridgeMap, BridgeNode, RoleDemand, Roadmap, RoadmapWeek } from "@/lib/types";


/** GET an ApiResult route. Returns null on 404 (the route or the record doesn't exist), throws otherwise. */
export async function fetchOptional<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (res.status === 404) {
    // Drain the body: an unread response keeps the request open (and the page never goes network-idle).
    await res.text().catch(() => "");
    return null;
  }
  let json: ApiResult<T>;
  try {
    json = (await res.json()) as ApiResult<T>;
  } catch {
    throw new Error(`Unexpected response from ${url.split("?")[0]} (${res.status})`);
  }
  if (!json.ok) {
    if (json.error?.code === "not_found") return null;
    throw new Error(json.error?.message || "Request failed");
  }
  return json.data;
}

const ROLE_NAMES: Record<string, string> = {
  "ml-engineer": "ML engineer",
  "software-engineer": "Software engineer",
  "data-analyst": "Data analyst",
  "data-scientist": "Data scientist",
  "frontend-engineer": "Frontend engineer",
  "devops-engineer": "DevOps engineer",
};
export function roleName(roleId: string): string {
  if (ROLE_NAMES[roleId]) return ROLE_NAMES[roleId];
  const s = roleId.replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2027-09-01" → "Sep 2027" without touching Date (safe during prerender). */
export function monthYear(iso: string | undefined): string | null {
  const m = iso?.match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${m[1]}` : null;
}
/** "2026-11-23" → "23 Nov". */
export function dayMonth(iso: string | undefined): string | null {
  const m = iso?.match(/^\d{4}-(\d{2})-(\d{2})/);
  if (!m) return null;
  const month = MONTHS[Number(m[1]) - 1];
  return month ? `${Number(m[2])} ${month}` : null;
}

/**
 * The Bridge Map for (user, role). Reads /api/graph; when that route isn't there (404) it falls back
 * to the map the server already loaded with loadGraph (passed in as `initial`). Shared by the
 * TopBar readiness pill and the dashboard through the ["graph", userId, roleId] key.
 */
export function useBridgeMap(userId: string, roleId: string, initial?: BridgeMap | null) {
  return useQuery({
    queryKey: ["graph", userId, roleId],
    queryFn: async () => {
      try {
        const map = await fetchOptional<BridgeMap>(`/api/graph/${encodeURIComponent(userId)}?roleId=${encodeURIComponent(roleId)}`);
        return map ?? initial ?? null;
      } catch (e) {
        if (initial) return initial;
        throw e;
      }
    },
    initialData: initial ?? undefined,
  });
}

export function useRoadmap(userId: string) {
  return useQuery({
    queryKey: ["roadmap", userId],
    queryFn: () => fetchOptional<Roadmap>(`/api/roadmap/${encodeURIComponent(userId)}`),
  });
}

export function useMarket(roleId: string) {
  return useQuery({
    queryKey: ["market", roleId],
    queryFn: () => fetchOptional<RoleDemand>(`/api/market/${encodeURIComponent(roleId)}`),
    retry: false,
  });
}

/** Gaps ranked by demand for the target role (biggest first). */
export function topGaps(map: BridgeMap, n = 3): BridgeNode[] {
  return map.nodes.filter((x) => x.status === "gap").sort((a, b) => b.demand - a.demand).slice(0, n);
}

export function statusCounts(map: BridgeMap) {
  let proven = 0, degree = 0, gaps = 0;
  for (const n of map.nodes) {
    if (n.status === "proven") proven++;
    else if (n.status === "gap") gaps++;
    else degree++;
  }
  return { proven, degree, gaps };
}

/** This week = the first week that still has an unfinished task (or the last week when all are done). */
export function currentWeek(roadmap: Roadmap): RoadmapWeek | null {
  if (!roadmap.weeks.length) return null;
  return roadmap.weeks.find((w) => w.tasks.some((t) => !t.done)) ?? roadmap.weeks[roadmap.weeks.length - 1];
}

/** A proof suggestion for a gap when there is no roadmap week yet. Suggestions, not data. */
const PROOF_HINTS: Record<string, string> = {
  docker: "Merge a PR that adds a Dockerfile to your pod repo",
  pytorch: "Merge a PR that trains a small PyTorch model in your pod repo",
  sql: "Push five SQL queries that answer real questions about a public dataset",
  aws: "Deploy one endpoint to the AWS free tier and share the URL",
  mlops: "Add a CI job that runs your model's tests on every PR",
  "llm-apps": "Ship a small LLM feature with an evaluation script",
  kubernetes: "Run your pod's API on a local Kubernetes cluster and write down how",
  "ci-cd": "Add a GitHub Actions workflow that runs your tests on every PR",
  react: "Merge a PR that adds an accessible React page to your pod repo",
};
export function proofHint(skillId: string, name: string): string {
  return PROOF_HINTS[skillId] ?? `Merge a reviewed PR in your pod repo that uses ${name}`;
}
