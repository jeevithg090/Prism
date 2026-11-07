// /labs/council: the Agent Council. Three agents debate one recommendation from real Keystone data, a judge rules
// with the strongest objection kept on record, and the student accepts or overrules.
import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/keystone";
import { CouncilSkeleton, CouncilView } from "@/components/labs/council/CouncilView";
import { getCurrentUserId } from "@/lib/session";

export const metadata: Metadata = {
  title: "Agent Council · Keystone",
  description: "Three agents debate a recommendation with receipts; you have the final say.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function CouncilFromParams({ searchParams }: { searchParams: SearchParams }) {
  const [{ session }, userId] = await Promise.all([searchParams, getCurrentUserId()]);
  const id = typeof session === "string" && /^council_[A-Za-z0-9_-]{6,40}$/.test(session) ? session : undefined;
  return <CouncilView userId={userId} initialSession={id} />;
}

export default function CouncilPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Agent Council"
        subtitle="Three agents argue over one recommendation with receipts. A judge rules, the strongest objection stays on record, and you decide."
      />
      <Suspense fallback={<CouncilSkeleton />}>
        <CouncilFromParams searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
