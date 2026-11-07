import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/keystone";
import { ChallengeFlow, ChallengeSkeleton } from "@/components/challenge/ChallengeFlow";

export const metadata: Metadata = { title: "Micro-challenges · Keystone" };

export default function ChallengePage() {
  return (
    <>
      <PageHeader
        title="Micro-challenges"
        subtitle="Rung 1 of your Proof Ladder: a 20-minute practical task that proves you've tried a skill. You choose when to start."
      />
      <Suspense fallback={<ChallengeSkeleton />}>
        <ChallengeFlow />
      </Suspense>
    </>
  );
}
