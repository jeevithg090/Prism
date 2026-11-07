// Test helpers for components/pods (not a test file itself).
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { Pod, Profile } from "@/lib/types";

export function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  const utils = render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
  return { qc, ...utils };
}

const REPO = "https://github.com/keystone-demo/pod-vision-demo";

/** Inline copy of the demo pod (data/fixtures/pod.aisha.json lives on another branch). */
export function demoPod(withProject = true): Pod {
  const milestones = ["Week 1: Captioning API skeleton", "Week 2: Model + data", "Week 3: Ship + accessibility review"];
  const issues = [
    { title: "Add Docker support", assigneeUserId: "aisha", reviewerUserId: "priya", skillId: "docker", milestone: milestones[0] },
    { title: "Set up the Postgres schema", assigneeUserId: "mei", reviewerUserId: "tom", skillId: "sql", milestone: milestones[0] },
    { title: "CI pipeline with tests", assigneeUserId: "tom", reviewerUserId: "mei", skillId: "ci-cd", milestone: milestones[0] },
    { title: "Fine-tune the captioning model", assigneeUserId: "aisha", reviewerUserId: "priya", skillId: "pytorch", milestone: milestones[1] },
    { title: "Store captions in Postgres", assigneeUserId: "priya", reviewerUserId: "tom", skillId: "sql", milestone: milestones[1] },
    { title: "React demo page", assigneeUserId: "priya", reviewerUserId: "mei", skillId: "react", milestone: milestones[2] },
    { title: "Deploy to AWS", assigneeUserId: "mei", reviewerUserId: "tom", skillId: "aws", milestone: milestones[2] },
  ].map((i, n) => ({ ...i, body: "- [ ] done", githubIssueUrl: `${REPO}/issues/${n + 1}` }));
  return {
    id: "pod_demo01",
    name: "Pod Aurora",
    score: 0.82,
    createdAt: "2026-11-07T15:00:00.000Z",
    members: [
      { userId: "aisha", learns: ["docker", "pytorch"], teaches: ["python"], role: "Learns Docker · Teaches Python" },
      { userId: "priya", learns: ["sql", "aws"], teaches: ["python", "pytorch", "docker"], role: "Learns SQL · Teaches PyTorch" },
      { userId: "tom", learns: ["pytorch", "react"], teaches: ["sql", "aws"], role: "Learns PyTorch · Teaches SQL" },
      { userId: "mei", learns: ["python"], teaches: ["react", "ci-cd"], role: "Learns Python · Teaches React" },
    ],
    explanations: [
      { fromUserId: "aisha", toUserId: "priya", text: "Priya reviews your Docker; you review her Python." },
      { fromUserId: "aisha", toUserId: "tom", text: "Tom reviews your SQL; you review his Python." },
      { fromUserId: "aisha", toUserId: "mei", text: "Mei reviews your CI/CD; you review her Python." },
    ],
    project: withProject
      ? { title: "VisionAid: accessible image captioning API", pitch: "An API that writes alt text for images.", milestones, issues, repoUrl: REPO }
      : undefined,
  };
}

export function profile(id: string, name: string, extra: Partial<Profile> = {}): Profile {
  return {
    id, name, programmeId: "uom-bsc-cs", year: 1, startedAt: "2026-09-21", badges: [], interests: [], availability: [],
    dna: { targetRoles: ["ml-engineer"], timelineLabel: "", targetDate: "2027-09-01", hoursPerWeek: 6, theoryPractice: 50, formats: [], budget: "free", constraints: [], accessibility: [], language: "en" },
    ...extra,
  };
}

/** apiGet mock: profiles for the demo members, 404 for anyone else. */
export async function profileGet(url: string): Promise<unknown> {
  const names: Record<string, Profile> = {
    aisha: profile("aisha", "Aisha Rahman", { badges: ["new-to-uni", "international"] }),
    priya: profile("priya", "Priya Shah", { year: 2 }),
    tom: profile("tom", "Tom Evans", { year: 3 }),
    mei: profile("mei", "Mei Chen", { year: 2 }),
  };
  const m = url.match(/^\/api\/profile\/([^/?]+)/);
  if (m && names[m[1]]) return names[m[1]];
  throw new Error(`No mock for ${url}`);
}
