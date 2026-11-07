import type { LabFeature } from "../types";

export const feature: LabFeature = {
  key: "halflife",
  title: "Skill Half-life Radar",
  href: "/labs/halflife",
  summary:
    "Shows module leads how fast each module's skills lose hiring demand, which rising skills sit next door untaught, and drafts a refresh note tied to a learning outcome.",
  pillar: "teaching",
  connects: ["Syllabus Agent", "Trend Forecaster", "Bridge Map", "Lecturer Insights"],
  agent: "trends",
  icon: "Radar",
};
