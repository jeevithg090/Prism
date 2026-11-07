import { Suspense } from "react";
import type { Metadata } from "next";
import { DashboardSkeleton, DashboardView } from "@/components/dashboard/DashboardView";
import { loadGraph } from "@/lib/graph/build";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = { title: "Dashboard · Keystone" };

/** Reads the session cookie, so it streams inside Suspense (cacheComponents). */
async function DashboardData() {
  const { userId, profile, roleId } = await getViewer();
  let map = null;
  try { map = await loadGraph(userId, roleId); } catch { map = null; }
  return <DashboardView userId={userId} roleId={roleId} profile={profile} initialMap={map} />;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardData />
    </Suspense>
  );
}
