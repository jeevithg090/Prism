import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/keystone";
import { PodCardSkeleton, PodsFlow } from "@/components/pods/PodsFlow";

export const metadata: Metadata = { title: "Pods · Keystone" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function PodsFlowFromParams({ searchParams }: { searchParams: SearchParams }) {
  const { demo } = await searchParams;
  return <PodsFlow startFresh={demo === "1"} />;
}

export default function PodsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Pods"
        subtitle="Peer learning: teach what you know, learn what you don't, and ship a real project together."
      />
      <Suspense fallback={<PodCardSkeleton />}>
        <PodsFlowFromParams searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
