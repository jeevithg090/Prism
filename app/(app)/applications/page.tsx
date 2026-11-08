import { Suspense } from "react";
import type { Metadata } from "next";
import { LoadingSkeleton } from "@/components/keystone";
import ApplicationTracker from "@/components/applications/ApplicationTracker";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = { title: "Application tracker · Keystone" };

/** Reads the session cookie, so it streams inside Suspense (cacheComponents). */
async function ApplicationsData() {
  const { userId } = await getViewer();
  return <ApplicationTracker userId={userId} />;
}

function ApplicationsSkeleton() {
  return (
    <div aria-busy="true" className="space-y-6">
      <span className="sr-only">Loading your applications</span>
      <LoadingSkeleton variant="list" />
    </div>
  );
}

export default function ApplicationsPage() {
  return (
    <Suspense fallback={<ApplicationsSkeleton />}>
      <ApplicationsData />
    </Suspense>
  );
}
