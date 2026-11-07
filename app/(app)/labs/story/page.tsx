// /labs/story: Story Mode. Keystone presents itself through one student's first six weeks (Aisha by default,
// ?student=<id> for another seeded student), with every number checked against the live API that produced it.
import { Suspense } from "react";
import type { Metadata } from "next";
import { StoryPlayer, StorySkeleton } from "@/components/labs/story/StoryPlayer";

export const metadata: Metadata = {
  title: "Story Mode · Keystone",
  description: "A narrated, presenter-driven tour of Keystone built from live data: the agents, their receipts, the human checkpoints and the handoffs.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const SAFE_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

async function PlayerFromParams({ searchParams }: { searchParams: SearchParams }) {
  const { student } = await searchParams;
  const raw = Array.isArray(student) ? student[0] : student;
  return <StoryPlayer studentId={raw && SAFE_ID.test(raw) ? raw : undefined} />;
}

export default function StoryPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<StorySkeleton />}>
      <PlayerFromParams searchParams={searchParams} />
    </Suspense>
  );
}
