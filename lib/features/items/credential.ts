import type { LabFeature } from "../types";

export const feature: LabFeature = {
  key: "credential",
  title: "Verifiable Skill Credential",
  href: "/labs/credential",
  summary:
    "Every proof on your ladder becomes a leaf of one signed Merkle tree; you choose which skills a link reveals, and an employer checks the signature and each proof themselves.",
  pillar: "assessment",
  connects: ["Proof Ladder", "Evidence Agent", "Proof engine", "Skill Passport", "Keystone Coach", "Injection shield", "Agent run ledger"],
  agent: "evidence",
  icon: "ShieldCheck",
};
