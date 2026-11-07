import { Suspense } from "react";
import type { Metadata } from "next";
import { ChangeRequestSkeleton, ChangeRequestView } from "@/components/labs/changereq/ChangeRequestView";

export const metadata: Metadata = { title: "Plan change requests · Keystone" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function FromParams({ searchParams }: { searchParams: SearchParams }) {
  const { demo } = await searchParams;
  return <ChangeRequestView demo={demo === "1"} />;
}

export default function ChangeRequestsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<ChangeRequestSkeleton />}>
        <FromParams searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
