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
          // Spelled out for a first-year: the shared chip's bare "L3" code gives way to a plain lead-in, and the chip
          // keeps its name, icon and tooltip.
          <div
            className="flex items-center gap-2 text-sm text-muted-foreground [&_[data-level]>span:first-child]:hidden"
            title="Reply's AI on Campus challenge, level 3: a knowledge graph"
          >
            <span>Challenge level 3:</span>
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
