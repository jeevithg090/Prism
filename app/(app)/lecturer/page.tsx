import { Suspense } from "react";
import type { Metadata } from "next";
import { GraduationCap } from "lucide-react";
import { LoadingSkeleton, PageHeader } from "@/components/keystone";
import { LecturerInsightsView } from "@/components/lecturer/LecturerInsightsView";
import { PROGRAMME_LABELS } from "@/components/lecturer/demoData";

export const metadata: Metadata = { title: "Lecturer Insights · Keystone" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function programmeIdFrom(searchParams: SearchParams) {
  const { programmeId: raw } = await searchParams;
  return (Array.isArray(raw) ? raw[0] : raw)?.trim() || "uom-bsc-cs";
}

async function ProgrammePill({ searchParams }: { searchParams: SearchParams }) {
  const programmeId = await programmeIdFrom(searchParams);
  return (
    <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm font-medium">
      <GraduationCap className="size-4 text-status-degree" aria-hidden />
      {PROGRAMME_LABELS[programmeId] ?? programmeId}
    </span>
  );
}

async function ViewFromParams({ searchParams }: { searchParams: SearchParams }) {
  return <LecturerInsightsView programmeId={await programmeIdFrom(searchParams)} />;
}

export default function LecturerPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Lecturer Insights"
        subtitle="Anonymous cohort view for module leads. Groups of 10+ students only."
        actions={<Suspense fallback={null}><ProgrammePill searchParams={searchParams} /></Suspense>}
      />
      <Suspense fallback={<LoadingSkeleton variant="chart" />}>
        <ViewFromParams searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
