import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/keystone";
import { PathwaySkeleton, PathwayView } from "@/components/labs/pathway/PathwayView";

export const metadata: Metadata = { title: "Shortest path to opportunity · Keystone" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function PathwayFromParams({ searchParams }: { searchParams: SearchParams }) {
  const { demo } = await searchParams;
  return <PathwayView demo={demo === "1"} />;
}

export default function PathwayPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Shortest path to opportunity"
        subtitle="For each placement and internship: the fewest skills and weeks between you and applying, counting what your degree teaches you before the deadline."
      />
      <Suspense fallback={<PathwaySkeleton />}>
        <PathwayFromParams searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
