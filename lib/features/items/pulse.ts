import type { LabFeature } from "../types";

export const feature: LabFeature = {
  key: "pulse",
  title: "Live Lab Pulse",
  href: "/labs/pulse",
  summary:
    "A projector board for the lecturer during a lab: where the room is stuck on today's micro-challenge, anonymously, and when to step in with a 3-minute explanation drafted from the rubric.",
  pillar: "teaching",
  connects: ["Micro-challenges", "Lecturer Insights", "Proof Ladder", "Anonymity guardrail", "Activity panel", "Run ledger"],
  agent: "techlead",
  icon: "Activity",
};
