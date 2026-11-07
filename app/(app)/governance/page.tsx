// /governance: how Keystone's agents are governed (registry, live run ledger, EU AI Act stance).
import type { Metadata } from "next";
import { GovernanceView } from "@/components/governance/GovernanceView";

export const metadata: Metadata = {
  title: "Agent governance · Keystone",
  description: "Every Keystone agent, its guardrails, human checkpoints and a live run ledger.",
};

export default function GovernancePage() {
  return <GovernanceView />;
}
