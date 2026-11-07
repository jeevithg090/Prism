import { z } from "zod";
import type { BadgeId, LearningDNA, Profile } from "@/lib/types";

// The onboarding wizard's state, its per-step validation and the mapping to a contract Profile.

export const UOM_CS_URL = "https://www.manchester.ac.uk/study/undergraduate/courses/2026/00560/bsc-computer-science/";

export type RoleId = "ml-engineer" | "software-engineer" | "data-analyst";
export type TimelineId = "internship-2027" | "placement-2027" | "graduate-2029";
export type OptInBadge = Extract<BadgeId, "new-to-uni" | "international" | "first-gen" | "career-changer">;

export const ROLES: { id: RoleId; name: string; blurb: string }[] = [
  { id: "ml-engineer", name: "ML engineer", blurb: "Train, ship and look after models that run in production." },
  { id: "software-engineer", name: "Software engineer", blurb: "Build and run the apps and APIs people use every day." },
  { id: "data-analyst", name: "Data analyst", blurb: "Turn messy data into answers with SQL, Python and dashboards." },
];

export const TIMELINES: { id: TimelineId; name: string; label: string; date: string; when: string }[] = [
  { id: "internship-2027", name: "Summer internship 2027", label: "Summer internship, June 2027", date: "2027-06-01", when: "Ready by June 2027" },
  { id: "placement-2027", name: "Placement year 2027/28", label: "Placement applications Sept 2027", date: "2027-09-01", when: "Ready by September 2027" },
  { id: "graduate-2029", name: "Graduate job 2029", label: "Graduate job applications Sept 2029", date: "2029-09-01", when: "Ready by September 2029" },
];

export const FORMATS: { id: LearningDNA["formats"][number]; name: string }[] = [
  { id: "projects", name: "Projects" }, { id: "video", name: "Video" }, { id: "docs", name: "Docs" }, { id: "pair", name: "Pair work" },
];
export const CONSTRAINTS = ["Part-time job", "Caring responsibilities", "Commuting"] as const;
export const ACCESSIBILITY: { id: LearningDNA["accessibility"][number]; name: string }[] = [
  { id: "dyslexia-friendly", name: "Dyslexia-friendly text" },
  { id: "audio-first", name: "Audio first" },
  { id: "high-contrast", name: "High contrast" },
  { id: "reduced-motion", name: "Reduced motion" },
];
export const OPT_IN_BADGES: { id: OptInBadge; emoji: string; name: string; help: string }[] = [
  { id: "new-to-uni", emoji: "🌱", name: "New to UoM", help: "Helpers explain things in more detail, and your questions go to the top of the help feed." },
  { id: "international", emoji: "🌍", name: "International", help: "Helpers know you may be new to how UK universities and job applications work." },
  { id: "first-gen", emoji: "🧭", name: "First-gen", help: "You're the first in your family at university. Helpers explain the unwritten rules." },
  { id: "career-changer", emoji: "🔁", name: "Career changer", help: "Helpers link what you already know from work to what you're learning now." },
];

export interface OnboardDraft {
  name: string;
  university: string;
  programmeUrl: string;
  year: 1 | 2 | 3 | 4;
  roleId: RoleId | "";
  timeline: TimelineId | "";
  hoursPerWeek: number;
  theoryPractice: number;
  formats: LearningDNA["formats"];
  budget: LearningDNA["budget"];
  constraints: string[];
  accessibility: LearningDNA["accessibility"];
  badges: OptInBadge[];
  githubLogin: string;
}

export const DEFAULT_DRAFT: OnboardDraft = {
  name: "", university: "University of Manchester", programmeUrl: UOM_CS_URL, year: 1,
  roleId: "", timeline: "", hoursPerWeek: 6,
  theoryPractice: 50, formats: ["projects"], budget: "free", constraints: [], accessibility: [],
  badges: [], githubLogin: "",
};

export const STEPS = [
  { id: "you", label: "You", title: "About you" },
  { id: "goal", label: "Goal", title: "Where you're heading" },
  { id: "learn", label: "How you learn", title: "Your Learning DNA" },
  { id: "badges", label: "Badges", title: "Badges and GitHub" },
] as const;

const GITHUB_LOGIN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

const stepSchemas = [
  z.object({
    name: z.string().trim().min(2, "Add your name (at least 2 letters) so your pod knows who you are.").max(60, "Keep your name under 60 characters."),
    university: z.string().trim().min(2, "Add your university."),
    programmeUrl: z.string().trim().regex(/^https?:\/\/\S+\.\S+/, "Paste the link to your programme page. It starts with https://"),
    year: z.number().int().min(1).max(4),
  }),
  z.object({
    roleId: z.enum(["ml-engineer", "software-engineer", "data-analyst"], { error: "Pick the role you're aiming for." }),
    timeline: z.enum(["internship-2027", "placement-2027", "graduate-2029"], { error: "Pick when you want to be ready." }),
    hoursPerWeek: z.number().min(2).max(20),
  }),
  z.object({
    theoryPractice: z.number().min(0).max(100),
    formats: z.array(z.string()).min(1, "Pick at least one way you like to learn."),
    budget: z.enum(["free", "paid-ok"]),
  }),
  z.object({
    githubLogin: z.string().trim().refine((v) => v === "" || GITHUB_LOGIN.test(v), "That doesn't look like a GitHub username: letters, numbers and single hyphens only."),
  }),
] as const;

export type StepErrors = Partial<Record<keyof OnboardDraft, string>>;

/** Field errors for one step (empty object = the step is valid). */
export function validateStep(step: number, draft: OnboardDraft): StepErrors {
  const res = stepSchemas[step]?.safeParse(draft);
  if (!res || res.success) return {};
  const errors: StepErrors = {};
  for (const issue of res.error.issues) {
    const key = issue.path[0] as keyof OnboardDraft;
    errors[key] ??= issue.message;
  }
  return errors;
}

export function theorySentence(n: number): string {
  if (n >= 60) return `Mostly building (${n}%), some reading (${100 - n}%)`;
  if (n <= 40) return `Mostly reading (${100 - n}%), some building (${n}%)`;
  return `Half building, half reading (${n}/${100 - n})`;
}

export function hoursLabel(n: number): string {
  return `${n} ${n === 1 ? "hour" : "hours"} a week`;
}

/** The UoM BSc CS page maps to the cached programme; anything else gets its own id for the Syllabus Agent. */
export function programmeIdFromUrl(url: string): string {
  const u = url.trim().toLowerCase();
  if (u.includes("manchester.ac.uk") && u.includes("computer-science")) return "uom-bsc-cs";
  try {
    const { hostname, pathname } = new URL(u);
    const host = hostname.replace(/^www\./, "").split(".")[0];
    const last = pathname.split("/").filter(Boolean).pop() ?? "programme";
    return `${host}-${last}`.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "custom-programme";
  } catch {
    return "custom-programme";
  }
}

/** UoM terms start in late September: year 1 students started this autumn. */
function startedAt(year: OnboardDraft["year"]): string {
  return `${2026 - (year - 1)}-09-21`;
}

export function toProfileInput(d: OnboardDraft): Omit<Profile, "id"> {
  const timeline = TIMELINES.find((t) => t.id === d.timeline) ?? TIMELINES[1];
  const login = d.githubLogin.trim();
  return {
    name: d.name.trim().replace(/\s+/g, " "),
    ...(login ? { githubLogin: login } : {}),
    programmeId: programmeIdFromUrl(d.programmeUrl),
    year: d.year,
    startedAt: startedAt(d.year),
    badges: [...d.badges],
    interests: [],
    availability: [],
    dna: {
      targetRoles: [d.roleId || "ml-engineer"],
      timelineLabel: timeline.label,
      targetDate: timeline.date,
      hoursPerWeek: d.hoursPerWeek,
      theoryPractice: d.theoryPractice,
      formats: [...d.formats],
      budget: d.budget,
      constraints: [...d.constraints],
      accessibility: [...d.accessibility],
      language: "en",
    },
  };
}
