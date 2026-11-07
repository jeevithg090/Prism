import type { Metadata } from "next";
import { GraduationCap } from "lucide-react";
import { PageHeader } from "@/components/keystone";
import { HalfLifeView } from "@/components/labs/halflife/HalfLifeView";
import { SAFE_PROGRAMME_ID } from "@/lib/labs/halflife/schema";

export const metadata: Metadata = { title: "Skill Half-life Radar · Keystone" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function HalfLifePage({ searchParams }: { searchParams: SearchParams }) {
  const { programmeId: raw } = await searchParams;
  const candidate = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const programmeId = SAFE_PROGRAMME_ID.test(candidate) ? candidate : "uom-bsc-cs";
  return (
    <div className="space-y-6">
      <PageHeader
        title="Skill Half-life Radar"
        subtitle="How fast each module's skills lose hiring demand, which rising skills sit next door untaught, and a refresh note for each. You decide what changes."
        actions={
          <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm font-medium">
            <GraduationCap className="size-4 text-status-degree" aria-hidden />
            {programmeId === "uom-bsc-cs" ? "BSc Computer Science" : programmeId}
          </span>
        }
      />
      <HalfLifeView programmeId={programmeId} />
    </div>
  );
}
