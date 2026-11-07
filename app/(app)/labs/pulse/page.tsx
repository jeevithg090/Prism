import type { Metadata } from "next";
import { PageHeader } from "@/components/keystone";
import { PulseBoard } from "@/components/labs/pulse/PulseBoard";

export const metadata: Metadata = { title: "Live Lab Pulse · Keystone" };

export default function LabPulsePage() {
  return (
    <div className="space-y-2">
      <PageHeader
        title="Live Lab Pulse"
        subtitle="Where your lab is stuck on today's micro-challenge, right now, and when to step in. Anonymous: groups of 10 or more only."
      />
      <PulseBoard demo={process.env.DEMO_MODE === "true"} />
    </div>
  );
}
