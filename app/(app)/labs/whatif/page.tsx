import { Suspense } from "react";
import type { Metadata } from "next";
import { WhatIfSkeleton, WhatIfView } from "@/components/labs/whatif/WhatIfView";

export const metadata: Metadata = { title: "What-if Simulator · Keystone" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function FromParams({ searchParams }: { searchParams: SearchParams }) {
  const { demo } = await searchParams;
  return <WhatIfView demo={demo === "1"} />;
}

export default function WhatIfPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<WhatIfSkeleton />}>
        <FromParams searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
