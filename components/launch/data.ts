// Bridge Week launch campaign content (Reply level 3). Plan figures are targets; demo numbers come from the seed.

export const CAMPUSES = [
  { id: "manchester", city: "Manchester", campus: "University of Manchester", country: "United Kingdom", pilot: true },
  { id: "london-imperial", city: "London", campus: "Imperial College London", country: "United Kingdom" },
  { id: "sheffield", city: "Sheffield", campus: "University of Sheffield", country: "United Kingdom" },
  { id: "torino", city: "Torino", campus: "", country: "Italy" },
  { id: "milano-1", city: "Milano", campus: "1 of 2 Milano campuses", country: "Italy" },
  { id: "milano-2", city: "Milano", campus: "2 of 2 Milano campuses", country: "Italy" },
  { id: "roma", city: "Roma", campus: "", country: "Italy" },
  { id: "liege", city: "Liège", campus: "", country: "Belgium" },
  { id: "munich-tum", city: "Munich", campus: "Technical University of Munich (TUM)", country: "Germany" },
  { id: "paris", city: "Paris", campus: "", country: "France" },
] as const;
export type CampusId = (typeof CAMPUSES)[number]["id"];
export const CAMPUS_IDS = CAMPUSES.map((c) => c.id) as [CampusId, ...CampusId[]];

export const POSTERS = [
  {
    id: "skip",
    headline: "Don't pay for a course your degree already teaches.",
    body: "Keystone reads your syllabus first, so your plan skips what a module will cover and spends your hours on the gaps.",
    tone: "ink",
  },
  {
    id: "proof",
    headline: "Proof, not claims.",
    body: "Every skill on your passport links to something real: a challenge, a merged pull request, a peer you taught.",
    tone: "brand",
  },
  {
    id: "pod",
    headline: "Find your pod.",
    body: "Four students, one real GitHub project, and a reviewer who already knows the skill you're learning.",
    tone: "paper",
  },
] as const;

export const PILOT = [
  { value: "500", label: "students", hint: "the first cohort, from CS and engineering societies and freshers' groups" },
  { value: "100", label: "pods", hint: "4 students each, matched on skills, interests and availability" },
  { value: "6", label: "weeks", hint: "from the Week 0 launch to demo day and skill passports" },
];

export const TIMELINE = [
  { when: "Week 0", title: "Launch", body: "Posters and QR codes at freshers' groups, the CS society and the careers service. Students map their degree in 10 minutes." },
  { when: "Week 1", title: "Pods form", body: "The Matchmaker groups students who can teach each other. Each pod gets a real repo with issues tied to everyone's roadmap." },
  { when: "Weeks 2 to 5", title: "Build and review", body: "Every merged pull request, reviewed by a peer, becomes proof. Seniors join as Trajectory ambassadors and earn the Helper badge." },
  { when: "Week 6", title: "Demo day", body: "Pods present their projects, practise interviews about them, and leave with a skill passport of linked proof." },
];

export const MEASURES = [
  { name: "Readiness change", how: "Bridge Map readiness at Week 0 and Week 6, per student, against their own baseline." },
  { name: "Verified skills per student", how: "Evidence items with a link: challenges, merged PRs, reviews and interviews." },
  { name: "Pods with merged PRs", how: "Pods where every member merged at least one reviewed pull request, read from GitHub." },
  { name: "Newcomer help response time", how: "Median time until a newcomer's question in the help feed gets an answer." },
  { name: "Mock interviews done", how: "Interviews about a student's own pod work, saved as keystone-interview evidence." },
  { name: "Placement and internship applications", how: "Asked at Week 6, opt-in and anonymous for groups under 10." },
];

export const VOICEOVER =
  "Your degree teaches you a lot. But nobody tells you what it covers, what industry wants, and what to learn next. Keystone reads your syllabus, the live job market and your real code, then builds your bridge. Learn in a pod. Prove every skill. Your degree is the foundation. Build the bridge.";

export function linkedInPost(appUrl: string): string {
  return [
    "I've just finished Bridge Week with Keystone at the University of Manchester.",
    "",
    "In 6 weeks I:",
    "• skipped what my degree already teaches, because my Semester 2 module covers statistics",
    "• learned Docker, which appears in 41% of ML engineer ads",
    "• merged a real pull request in our pod project, VisionAid, after a peer review from Priya",
    "• explained that work in a mock interview",
    "",
    `Every skill on my passport links to the proof: ${appUrl.replace(/\/+$/, "")}/profile/aisha`,
    "",
    "#BridgeWeek #Keystone #StudentTechClash",
  ].join("\n");
}
