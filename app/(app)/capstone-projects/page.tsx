import { Suspense } from "react";
import type { Metadata } from "next";
import { LoadingSkeleton } from "@/components/keystone";
import { CapstoneRoadmap } from "@/components/projects/CapstoneRoadmap";
import { getViewer } from "@/lib/session";

export const metadata: Metadata = { title: "Capstone projects · Keystone" };

/** Reads the session cookie, so it streams inside Suspense (cacheComponents). */
async function CapstoneData() {
  const { userId, roleId } = await getViewer();
  return <CapstoneRoadmap userId={userId} roleId={roleId} />;
}

function CapstoneSkeleton() {
  return (
    <div aria-busy="true" className="space-y-6">
      <span className="sr-only">Loading your capstone projects</span>
      <LoadingSkeleton variant="list" />
    </div>
  );
}

export default function CapstoneProjectsPage() {
  return (
    <Suspense fallback={<CapstoneSkeleton />}>
      <CapstoneData />
    </Suspense>
  );
}
