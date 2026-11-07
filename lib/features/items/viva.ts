import type { LabFeature } from "../types";

export const feature: LabFeature = {
  key: "viva",
  title: "Viva Check",
  href: "/labs/viva",
  summary: "Three oral-exam questions written from your own pull request's diff; explain your code and Proof Ladder rung 3 lights up, or your pod reviewer runs a short re-viva in person.",
  pillar: "assessment",
  connects: ["AI Tech Lead", "Proof engine", "Proof Ladder", "Mock interview evidence", "Pod reviewer", "Keystone Coach"],
  agent: "voice",
  icon: "MessageSquareQuote",
};
