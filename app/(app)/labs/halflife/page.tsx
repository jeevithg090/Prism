import { Suspense } from "react";
import type { Metadata } from "next";
import { GraduationCap } from "lucide-react";
import { PageHeader } from "@/components/keystone";
import { Skeleton } from "@/components/ui/skeleton";
import { HalfLifeSkeleton, HalfLifeView } from "@/components/labs/halflife/HalfLifeView";
import { SAFE_PROGRAMME_ID } from "@/lib/labs/halflife/schema";

export const metadata: Metadata = { title: "Skill Half-life Radar · Keystone" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const DEFAULT_PROGRAMME = "uom-bsc-cs";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** A safe programme id from the query string, else the seeded BSc. */
function programmeFrom(raw: string | string[] | undefined): string {
  const candidate = first(raw)?.trim() ?? "";
  return SAFE_PROGRAMME_ID.test(candidate) ? candidate : DEFAULT_PROGRAMME;
}

// searchParams is request data: it is only read inside <Suspense> so the static shell still prerenders.
async function ProgrammePill({ searchParams }: { searchParams: SearchParams }) {
  const programmeId = programmeFrom((await searchParams).programmeId);
  return (
    <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm font-medium">
      <GraduationCap className="size-4 text-status-degree" aria-hidden />
      {programmeId === DEFAULT_PROGRAMME ? "BSc Computer Science" : programmeId}
    </span>
  );
}

async function HalfLifeFromParams({ searchParams }: { searchParams: SearchParams }) {
  const { programmeId, demo } = await searchParams;
  return <HalfLifeView programmeId={programmeFrom(programmeId)} demo={first(demo) === "1"} />;
}

export default function HalfLifePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Skill Half-life Radar"
        subtitle="How fast each module's skills lose hiring demand, which rising skills sit next door untaught, and a refresh note for each. You decide what changes."
        actions={
          <Suspense fallback={<Skeleton className="h-9 w-48 rounded-full" />}>
            <ProgrammePill searchParams={searchParams} />
          </Suspense>
        }
      />
      <Suspense fallback={<HalfLifeSkeleton />}>
        <HalfLifeFromParams searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
