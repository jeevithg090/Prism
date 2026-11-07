import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/keystone";
import { RoadmapSkeleton, RoadmapView } from "@/components/roadmap/RoadmapView";

export const metadata: Metadata = { title: "Roadmap · Keystone" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function RoadmapFromParams({ searchParams }: { searchParams: SearchParams }) {
  const { demo } = await searchParams;
  return <RoadmapView demo={demo === "1"} />;
}

export default function RoadmapPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-6">
      <PageHeader title="Your roadmap" subtitle="Built on your degree, not instead of it" />
      <Suspense fallback={<RoadmapSkeleton />}>
        <RoadmapFromParams searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
