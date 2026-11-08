import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/keystone";
import { Skeleton } from "@/components/ui/skeleton";
import { InterviewFlow } from "@/components/voice/InterviewFlow";

export const metadata: Metadata = { title: "Mock interview · Keystone" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const ROLE_IDS = new Set(["ml-engineer", "software-engineer", "data-analyst"]);

async function FlowFromParams({ searchParams }: { searchParams: SearchParams }) {
  const { roleId, demo } = await searchParams;
  const role = typeof roleId === "string" && ROLE_IDS.has(roleId) ? roleId : "ml-engineer";
  return <InterviewFlow initialRoleId={role} forceDemo={demo === "1"} />;
}

function FlowSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]" aria-busy="true" aria-label="Loading your interview">
      <div className="rounded-2xl border bg-card p-6 shadow-sm md:p-8">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="mt-6 h-44 w-full rounded-xl" />
        <div className="mt-6 grid grid-cols-3 gap-4"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
        <Skeleton className="mt-6 h-11 w-full rounded-xl sm:w-56" />
      </div>
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-5 h-14 w-full" />
        <Skeleton className="mt-4 h-14 w-full" />
      </div>
    </div>
  );
}

export default function InterviewPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Practise your interview"
        subtitle="A 5-minute mock interview about your own pod work, with feedback you can use in a real one."
      />
      <Suspense fallback={<FlowSkeleton />}>
        <FlowFromParams searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
