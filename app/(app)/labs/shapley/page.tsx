import type { Metadata } from "next";
import { PageHeader } from "@/components/keystone";
import { ReadinessExplained } from "@/components/labs/shapley/ReadinessExplained";

export const metadata: Metadata = { title: "Readiness Explained · Keystone" };

export default function ReadinessExplainedPage() {
  return (
    <>
      <PageHeader
        title="Readiness Explained"
        subtitle="See exactly how much each proof and module adds to your readiness, what moved it this week, and which proof to do next."
      />
      <ReadinessExplained />
    </>
  );
}
