import type { LabFeature } from "@/lib/features/types";

export const feature: LabFeature = {
  key: "pathway",
  title: "Shortest path to opportunity",
  href: "/labs/pathway",
  summary: "For each placement and internship, the fewest skills and weeks between you and applying, counting what your degree will teach you by the deadline.",
  pillar: "learning",
  connects: ["Bridge Map", "Market Agent", "Roadmap Agent", "Syllabus Agent", "Keystone Coach"],
  agent: "roadmap",
  icon: "Waypoints",
};
