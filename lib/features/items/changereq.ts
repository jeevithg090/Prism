import type { LabFeature } from "@/lib/features/types";

export const feature: LabFeature = {
  key: "changereq",
  title: "Plan change requests",
  href: "/labs/changereq",
  summary: "When the job market moves, the Roadmap Agent opens a pull request against your plan with a week-by-week diff, receipts and checks, and nothing changes until you approve it.",
  pillar: "learning",
  connects: ["Trend Forecaster", "Market Agent", "Roadmap Agent", "Bridge Map", "Governance ledger", "Coach"],
  agent: "roadmap",
  icon: "GitPullRequest",
};
