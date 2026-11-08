// /market: Industry Radar (P1). What a role's job ads ask for now, tagged against your Bridge Map, and where it's heading.
import { Suspense } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { MarketSkeleton } from "@/components/market/MarketSkeleton";
import { MarketView } from "@/components/market/MarketView";
import { ROLES } from "@/components/market/summaries";
import { loadViewerContext } from "@/components/market/viewerContext";

export const metadata: Metadata = { title: "Industry Radar · Keystone" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function MarketData({ searchParams }: { searchParams: SearchParams }) {
  const [sp, jar] = await Promise.all([searchParams, cookies()]);
  const raw = jar.get("ks_uid")?.value;
  const userId = raw && /^[a-z0-9_-]{1,40}$/i.test(raw) ? raw : "aisha";
  const ctx = await loadViewerContext(userId);
  const asked = first(sp.role);
  const initialRole = asked && ROLES.some((r) => r.id === asked) ? asked : ctx.primaryRole;
  return (
    <MarketView
      key={`${userId}:${initialRole}`}
      initialRole={initialRole}
      primaryRole={ctx.primaryRole}
      statusBySkill={ctx.statusBySkill}
      fallbackStatus={ctx.fallbackStatus}
      roadmapWeeks={ctx.roadmapWeeks}
      initialDemo={first(sp.demo) === "1"}
    />
  );
}

export default function MarketPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<MarketSkeleton />}>
      <MarketData searchParams={searchParams} />
    </Suspense>
  );
}
