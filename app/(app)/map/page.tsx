import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/keystone";
import { LevelChips } from "@/components/pods/LevelChips";
import { BridgeMapView, MapSkeleton } from "@/components/map/BridgeMapView";

export const metadata: Metadata = { title: "Bridge Map · Keystone" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function MapFromParams({ searchParams }: { searchParams: SearchParams }) {
  const { demo, skill } = await searchParams;
  return <BridgeMapView demo={demo === "1"} skill={typeof skill === "string" ? skill : undefined} />;
}

export default function MapPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Your Bridge Map"
        subtitle="Your degree, the job market and your proof, in one graph"
        actions={
          // The chip's "L3" tag is 10px in the shared component; lift it to the 13px projector floor here.
          <div className="[&_[data-level]>span:first-child]:text-xs [&_[data-level]>span:first-child]:leading-5">
            <LevelChips items={["knowledge-graph"]} />
          </div>
        }
      />
      <Suspense fallback={<MapSkeleton />}>
        <MapFromParams searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
