import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/keystone";
import { VivaFlow, VivaSkeleton } from "@/components/labs/viva/VivaFlow";

export const metadata: Metadata = { title: "Viva Check · Keystone" };

export default function VivaPage() {
  return (
    <>
      <PageHeader
        title="Viva Check"
        subtitle="Prove you understand the code you merged. Three questions written from your own pull request; explain it and your Proof Ladder's top rung lights up."
      />
      <Suspense fallback={<VivaSkeleton />}>
        <VivaFlow />
      </Suspense>
    </>
  );
}
