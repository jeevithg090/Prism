// P5 · Demo Skill Passport for Aisha ("Use demo data" when the API can't be reached).
import { DEMO_LADDER } from "@/components/ladder/demo";
import type { Passport } from "@/components/ladder/model";

export const DEMO_PASSPORT: Passport = {
  userId: "aisha",
  name: "Aisha Rahman",
  programme: "BSc Computer Science, University of Manchester",
  year: 1,
  badges: ["new-to-uni", "international"],
  roleName: "ML engineer",
  readinessNow: 0.38,
  readinessProjected: 0.84,
  isPublic: false,
  isOwner: true,
  isDemo: true,
  skills: DEMO_LADDER.skills.filter((s) => s.level > 0),
};
