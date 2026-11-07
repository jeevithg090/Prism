// P5 PR1: every seed and fixture file parses with its zod schema, plus the invariants the demo relies on.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CORE_SKILL_IDS, GuideSuggestionZ, HelpRequestZ, MomentumWeekZ, PodZ, ProfileZ, StudentSkillsZ, TrajectoryZ,
} from "@/lib/schemas/community";

const read = (rel: string): unknown => JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), "utf8"));
const students = ProfileZ.array().parse(read("data/seed/students.json"));
const skills = StudentSkillsZ.parse(read("data/seed/student-skills.json"));
const trajectories = TrajectoryZ.array().parse(read("data/seed/trajectories.json"));
const pod = PodZ.parse(read("data/fixtures/pod.aisha.json"));
const momentum = MomentumWeekZ.array().parse(read("data/fixtures/momentum.aisha.json"));
const help = HelpRequestZ.array().parse(read("data/fixtures/help.json"));
const guides = GuideSuggestionZ.array().parse(read("data/fixtures/guides.aisha.json"));
const DAY = 86_400_000;
const TODAY = Date.parse("2026-11-07");

describe("students.json", () => {
  it("has 12 demo students with unique ids", () => {
    expect(students).toHaveLength(12);
    expect(new Set(students.map((s) => s.id)).size).toBe(12);
    expect(students.every((s) => s.isDemo === true && s.programmeId === "uom-bsc-cs")).toBe(true);
  });

  it("has at least 3 new-to-uni students, all started within 70 days", () => {
    const fresh = students.filter((s) => s.badges.includes("new-to-uni"));
    expect(fresh.length).toBeGreaterThanOrEqual(3);
    for (const s of fresh) expect(TODAY - Date.parse(s.startedAt)).toBeLessThanOrEqual(70 * DAY);
  });

  it("spreads target roles 5 ML / 4 SWE / 3 data and has 2 international + 2 first-gen", () => {
    const roles = students.map((s) => s.dna.targetRoles[0]);
    expect(roles.filter((r) => r === "ml-engineer")).toHaveLength(5);
    expect(roles.filter((r) => r === "software-engineer")).toHaveLength(4);
    expect(roles.filter((r) => r === "data-analyst")).toHaveLength(3);
    expect(students.filter((s) => s.badges.includes("international"))).toHaveLength(2);
    expect(students.filter((s) => s.badges.includes("first-gen"))).toHaveLength(2);
  });
});

describe("student-skills.json", () => {
  it("covers exactly the seeded students", () => {
    expect(Object.keys(skills).sort()).toEqual(students.map((s) => s.id).sort());
  });

  it("only uses core skill ids", () => {
    const core = new Set<string>(CORE_SKILL_IDS);
    for (const { proven, gaps } of Object.values(skills)) {
      for (const id of [...proven, ...gaps]) expect(core.has(id), id).toBe(true);
    }
  });

  it("keeps the agreed facts for Priya, Tom and Mei", () => {
    expect(skills.priya).toEqual({ proven: ["python", "pytorch", "docker", "git"], gaps: ["sql", "aws"] });
    expect(skills.tom).toEqual({ proven: ["sql", "postgresql", "aws"], gaps: ["pytorch", "react"] });
    expect(skills.mei).toEqual({ proven: ["react", "typescript", "ci-cd"], gaps: ["python", "machine-learning"] });
  });
});

describe("trajectories.json", () => {
  it("has 40 demo trajectories with unique ids and 4-7 steps sorted by year", () => {
    expect(trajectories).toHaveLength(40);
    expect(new Set(trajectories.map((t) => t.id)).size).toBe(40);
    for (const t of trajectories) {
      expect(t.isDemo).toBe(true);
      expect(t.steps.length).toBeGreaterThanOrEqual(4);
      expect(t.steps.length).toBeLessThanOrEqual(7);
      const years = t.steps.map((s) => s.year);
      expect(years, t.id).toEqual([...years].sort((a, b) => a - b));
    }
  });

  it("has roughly 60% open to chat", () => {
    const open = trajectories.filter((t) => t.openToChat).length;
    expect(open).toBeGreaterThanOrEqual(20);
    expect(open).toBeLessThanOrEqual(28);
  });
});

describe("pod.aisha.json", () => {
  it("is Pod Aurora with aisha, priya, tom and mei", () => {
    expect(pod.id).toBe("pod_demo01");
    expect(pod.members.map((m) => m.userId)).toEqual(["aisha", "priya", "tom", "mei"]);
    expect(pod.members.find((m) => m.userId === "aisha")?.learns).toContain("docker");
  });

  it("has a project with 3 milestones and 7 issues assigned by learns/teaches", () => {
    const project = pod.project!;
    expect(project.milestones).toHaveLength(3);
    expect(project.issues).toHaveLength(7);
    expect(project.repoUrl).toBe("https://github.com/keystone-demo/pod-vision-demo");
    const byId = new Map(pod.members.map((m) => [m.userId, m]));
    project.issues.forEach((issue, i) => {
      expect(issue.reviewerUserId).not.toBe(issue.assigneeUserId);
      expect(byId.get(issue.assigneeUserId)?.learns).toContain(issue.skillId);
      expect(byId.get(issue.reviewerUserId)?.teaches).toContain(issue.skillId);
      expect(project.milestones).toContain(issue.milestone);
      expect(issue.body).toContain("- [ ]");
      expect(issue.githubIssueUrl).toBe(`https://github.com/keystone-demo/pod-vision-demo/issues/${i + 1}`);
    });
  });
});

describe("momentum.aisha.json", () => {
  it("has 6 rising weeks W40-W45 ending at +18%", () => {
    expect(momentum.map((w) => w.week)).toEqual(["2026-W40", "2026-W41", "2026-W42", "2026-W43", "2026-W44", "2026-W45"]);
    for (let i = 1; i < momentum.length; i++) expect(momentum[i].score).toBeGreaterThan(momentum[i - 1].score);
    expect(momentum.at(-1)?.changePct).toBe(18);
  });

  it("is internally consistent (breakdown sums, baseline, changePct)", () => {
    for (const w of momentum) {
      expect(w.breakdown.reduce((a, b) => a + b.points, 0)).toBe(w.score);
      expect(w.changePct).toBe(Math.round(((w.score - w.baseline) / w.baseline) * 100));
    }
    for (let i = 4; i < momentum.length; i++) {
      const prev = momentum.slice(i - 4, i).map((w) => w.score);
      expect(momentum[i].baseline).toBeCloseTo(prev.reduce((a, b) => a + b, 0) / 4);
    }
  });
});

describe("help.json and guides.aisha.json", () => {
  it("has 8 help requests: 4 from new-to-uni users and 2 chat-15", () => {
    const freshIds = new Set(["aisha", ...students.filter((s) => s.badges.includes("new-to-uni")).map((s) => s.id)]);
    expect(help.map((h) => h.id)).toEqual(["help_01", "help_02", "help_03", "help_04", "help_05", "help_06", "help_07", "help_08"]);
    expect(help.filter((h) => freshIds.has(h.fromUserId))).toHaveLength(4);
    expect(help.filter((h) => h.kind === "chat-15")).toHaveLength(2);
    for (const h of help) expect(TODAY - Date.parse(h.createdAt)).toBeLessThan(7 * DAY);
  });

  it("chat-15 requests go to seniors who are open to chat", () => {
    const open = new Set(trajectories.filter((t) => t.openToChat).map((t) => t.userId));
    for (const h of help.filter((x) => x.kind === "chat-15")) expect(open.has(h.toUserId ?? "")).toBe(true);
  });

  it("has 4 guide suggestions", () => {
    expect(guides).toHaveLength(4);
  });
});
