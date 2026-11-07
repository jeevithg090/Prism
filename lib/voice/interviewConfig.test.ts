import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { BridgeMap, BridgeNode, Pod, Profile, Roadmap } from "@/lib/types";

const { readFile } = vi.hoisted(() => ({ readFile: vi.fn() }));
vi.mock("node:fs/promises", () => ({ readFile, default: { readFile } }));

import { getStore } from "@/lib/store";
import { buildInterviewConfig, currentWeek, InterviewNotFoundError } from "./interviewConfig";

const node = (skillId: string, name: string, status: BridgeNode["status"], demand: number, level: BridgeNode["level"] = 0): BridgeNode => ({
  skillId, name, status, demand, level, category: "language", evidenceIds: [], moduleCodes: [],
});

const profile = {
  id: "zara", name: "Zara Khan", programmeId: "uom-bsc-cs", year: 2, startedAt: "2025-09-20",
  dna: { targetRoles: ["software-engineer"] }, badges: [], interests: [], availability: [],
} as unknown as Profile;

const map: BridgeMap = {
  userId: "zara", roleId: "software-engineer", edges: [], readinessNow: 0.4, readinessProjected: 0.7, generatedAt: "2026-11-01",
  nodes: [
    node("java", "Java", "proven", 0.5, 3),
    node("python", "Python", "proven", 0.6, 2),
    node("git", "Git", "proven", 0.4, 2),
    node("html-css", "HTML and CSS", "proven", 0.1, 1),
    node("docker", "Docker", "gap", 0.41),
    node("kubernetes", "Kubernetes", "gap", 0.2),
    node("sql", "SQL", "gap", 0.35),
    node("typescript", "TypeScript", "gap", 0.5),
    node("cobol", "COBOL", "gap", 0),
  ],
};

const week = (n: number, startDate: string, focusSkillId: string, done = false) => ({
  week: n, startDate, focusSkillId, isExamWeek: false, proof: "", tasks: [{ id: `t_${n}_0`, type: "learn", title: "x", free: true, hours: 2, done }],
  receipt: { demandPct: 40, coveredByDegree: "no", reason: "" },
});

const roadmap = {
  userId: "zara", roleId: "software-engineer", version: 1, readinessNow: 0.4, readinessProjected: 0.7, skipped: [], generatedAt: "2026-11-01",
  weeks: [week(1, "2026-11-02", "typescript", true), week(2, "2026-11-09", "sql"), week(3, "2026-11-16", "docker")],
} as unknown as Roadmap;

const pod = {
  id: "pod_abc", name: "Pod Aurora", score: 0.8, explanations: [], createdAt: "2026-11-07",
  members: [{ userId: "sam", learns: [], teaches: [], role: "lead" }, { userId: "zara", learns: [], teaches: [], role: "dev" }],
  project: { title: "StudyBuddy: a revision planner", pitch: "", milestones: [], issues: [] },
} as unknown as Pod;

const ELEVEN_ENV = ["ELEVENLABS_API_KEY", "ELEVENLABS_INTERVIEW_AGENT_ID", "ELEVENLABS_ONBOARD_AGENT_ID", "DEMO_MODE"];

const seed = (c: string, id: string, doc: object, userId: string) => getStore().upsert(c, id, doc as { id?: string }, userId);

beforeAll(async () => {
  await seed("profiles", "zara", profile, "zara");
  await seed("maps", "zara:software-engineer", map, "zara");
  await seed("roadmaps", "zara", roadmap, "zara");
  // Saved under the member who created it (sam), so the config has to find zara by membership.
  await seed("pods", "pod_abc", pod, "sam");
});

beforeEach(() => {
  for (const k of ELEVEN_ENV) vi.stubEnv(k, "");
  readFile.mockReset();
  readFile.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const NOW = new Date("2026-11-10T12:00:00Z");

describe("buildInterviewConfig", () => {
  it("builds the dynamic variables from the store's profile, map, roadmap and pod", async () => {
    const cfg = await buildInterviewConfig({ userId: "zara", now: NOW });
    expect(cfg).toEqual({
      agentId: "text-mode",
      dynamicVariables: {
        name: "Zara",
        year: "2",
        role: "Software engineer",
        top_skills: "Java, Python, Git",
        gaps: "TypeScript, Docker, SQL",
        project_title: "StudyBuddy: a revision planner",
        week_focus: "SQL",
      },
    });
  });

  it("uses an explicit roleId over the profile's target role", async () => {
    const cfg = await buildInterviewConfig({ userId: "zara", roleId: "data-analyst", now: NOW });
    expect(cfg.dynamicVariables.role).toBe("Data analyst");
    // No map for that role, so skills fall back to neutral wording.
    expect(cfg.dynamicVariables.top_skills).toBe("the skills from your course so far");
  });

  it("falls back to the built-in Aisha default when nothing is stored", async () => {
    const cfg = await buildInterviewConfig({ userId: "aisha" });
    expect(cfg.agentId).toBe("text-mode");
    expect(cfg.signedUrl).toBeUndefined();
    expect(cfg.dynamicVariables).toEqual({
      name: "Aisha",
      year: "1",
      role: "ML engineer",
      top_skills: "Python, Git, HTML and CSS",
      gaps: "Docker, PyTorch, SQL",
      project_title: "VisionAid: accessible image captioning API",
      week_focus: "Docker",
    });
  });

  it("reads teammates' fixtures when the store is empty", async () => {
    readFile.mockImplementation(async (p: string) => {
      if (p.endsWith("pod.aisha.json")) return JSON.stringify({ ...pod, project: { title: "From the fixture" } });
      throw new Error("ENOENT");
    });
    const cfg = await buildInterviewConfig({ userId: "aisha" });
    expect(cfg.dynamicVariables.project_title).toBe("From the fixture");
  });

  it("throws not found for an unknown student", async () => {
    await expect(buildInterviewConfig({ userId: "nobody" })).rejects.toBeInstanceOf(InterviewNotFoundError);
  });

  it("does not read fixture paths built from unsafe ids", async () => {
    await expect(buildInterviewConfig({ userId: "../../etc/passwd" })).rejects.toBeInstanceOf(InterviewNotFoundError);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("lets a new student without a profile use the onboarding coach", async () => {
    const cfg = await buildInterviewConfig({ userId: "newbie", agent: "onboard" });
    expect(cfg.agentId).toBe("text-mode");
    expect(cfg.dynamicVariables.name).toBe("there");
  });

  it("returns the agent id and a signed URL when ElevenLabs is configured", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    vi.stubEnv("ELEVENLABS_INTERVIEW_AGENT_ID", "agent_interview");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ signed_url: "wss://signed.example/abc" }));

    const cfg = await buildInterviewConfig({ userId: "aisha" });

    expect(cfg.agentId).toBe("agent_interview");
    expect(cfg.signedUrl).toBe("wss://signed.example/abc");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("agent_id=agent_interview");
  });

  it("signs the onboarding agent for agent=onboard", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    vi.stubEnv("ELEVENLABS_INTERVIEW_AGENT_ID", "agent_interview");
    vi.stubEnv("ELEVENLABS_ONBOARD_AGENT_ID", "agent_onboard");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ signed_url: "wss://signed.example/onb" }));

    const cfg = await buildInterviewConfig({ userId: "aisha", agent: "onboard" });

    expect(cfg.agentId).toBe("agent_onboard");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("agent_id=agent_onboard");
  });

  it("uses text mode for agent=onboard when no onboarding agent is set", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    vi.stubEnv("ELEVENLABS_INTERVIEW_AGENT_ID", "agent_interview");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const cfg = await buildInterviewConfig({ userId: "aisha", agent: "onboard" });
    expect(cfg.agentId).toBe("text-mode");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("switches to text mode when signing fails", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    vi.stubEnv("ELEVENLABS_INTERVIEW_AGENT_ID", "agent_interview");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 401 }));
    const cfg = await buildInterviewConfig({ userId: "aisha" });
    expect(cfg).toMatchObject({ agentId: "text-mode" });
    expect(cfg.signedUrl).toBeUndefined();
  });

  it("keeps voice on in DEMO_MODE when ElevenLabs is configured", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    vi.stubEnv("ELEVENLABS_INTERVIEW_AGENT_ID", "agent_interview");
    vi.stubEnv("DEMO_MODE", "true");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ signed_url: "wss://signed.example/demo" }));
    const cfg = await buildInterviewConfig({ userId: "aisha" });
    expect(cfg).toMatchObject({ agentId: "agent_interview", signedUrl: "wss://signed.example/demo" });
  });

  it("signs the onboarding coach without an interviewer agent id", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    vi.stubEnv("ELEVENLABS_ONBOARD_AGENT_ID", "agent_onboard");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ signed_url: "wss://signed.example/onb" }));
    const cfg = await buildInterviewConfig({ userId: "aisha", agent: "onboard" });
    expect(cfg).toMatchObject({ agentId: "agent_onboard", signedUrl: "wss://signed.example/onb" });
  });
});

describe("currentWeek", () => {
  it("picks the week containing today, else the first unfinished week", () => {
    expect(currentWeek(roadmap, new Date("2026-11-17T09:00:00Z"))?.focusSkillId).toBe("docker");
    expect(currentWeek(roadmap, new Date("2026-10-01T09:00:00Z"))?.focusSkillId).toBe("sql");
    expect(currentWeek(null)).toBeUndefined();
  });
});
