import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { llmText } from "@/lib/llm";
import { getStore } from "@/lib/store";
import { BriefingZ } from "@/lib/schemas/voice";
import fixtureBriefing from "@/data/fixtures/briefing.aisha.json";
import {
  BRIEFING_SYSTEM,
  BriefingUnavailable,
  buildBriefing,
  gatherBriefingData,
  getBriefing,
  marketMovesFor,
  templateScript,
  weekOfFor,
} from "./briefing";

vi.mock("@/lib/llm", () => ({
  llmText: vi.fn(),
  llmJSON: vi.fn(),
  LLMError: class LLMError extends Error {},
}));

const NOW = new Date("2026-11-07T10:00:00Z"); // a Saturday → briefing for Monday 9 November
let root: string;

function write(rel: string, data: unknown) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, typeof data === "string" ? data : JSON.stringify(data));
}

const roadmap = {
  userId: "aisha",
  roleId: "ml-engineer",
  version: 1,
  readinessNow: 0.38,
  readinessProjected: 0.7,
  generatedAt: "2026-11-01T00:00:00Z",
  skipped: [],
  weeks: [
    {
      week: 1, startDate: "2026-11-02", focusSkillId: "python", isExamWeek: false, proof: "", tasks: [{ id: "t0", type: "learn", title: "Python refresher", free: true, hours: 2, done: true }],
      receipt: { demandPct: 60, coveredByDegree: "done", reason: "" },
    },
    {
      week: 2, startDate: "2026-11-09", focusSkillId: "docker", isExamWeek: false, proof: "",
      tasks: [
        { id: "t1", type: "build", title: "Finish your Dockerfile and get the PR merged", free: true, hours: 3 },
        { id: "t2", type: "learn", title: "PyTorch quickstart: 2 hours", free: true, hours: 2 },
        { id: "t3", type: "practice", title: "Answer one question in the Help a newcomer feed", free: true, hours: 1 },
        { id: "t4", type: "practice", title: "A fourth task", free: true, hours: 1 },
      ],
      receipt: { demandPct: 41, trend: "stable", coveredByDegree: "no", reason: "" },
    },
  ],
};

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ks-briefing-"));
  write("data/skills.json", [
    { id: "docker", name: "Docker" },
    { id: "pytorch", name: "PyTorch" },
    { id: "llm-evaluation", name: "LLM evaluation" },
    { id: "rag", name: "RAG" },
  ]);
  write("data/fixtures/roadmap.aisha.ml-engineer.json", roadmap);
  write("data/fixtures/momentum.aisha.json", [
    { userId: "aisha", week: "2026-W44", score: 50, baseline: 50, changePct: 3, breakdown: [] },
    { userId: "aisha", week: "2026-W45", score: 59, baseline: 50, changePct: 18, breakdown: [] },
  ]);
  write("data/fixtures/trends.json", [
    { skillId: "llm-evaluation", history: [], projection: [], growthPerYear: 0.38, label: "rising", source: "hn-whoishiring" },
    { skillId: "rag", history: [], projection: [], growthPerYear: 0.3, label: "rising", source: "hn-whoishiring" },
    { skillId: "jquery", history: [], projection: [], growthPerYear: -0.2, label: "declining", source: "hn-whoishiring" },
  ]);
  write("data/fixtures/pod.aisha.json", {
    id: "pod-1", name: "VisionAid", members: [{ userId: "aisha", learns: [], teaches: [], role: "ML" }],
    explanations: [], score: 0.9, createdAt: "2026-11-01T00:00:00Z",
    project: { title: "an app that describes photos aloud", pitch: "", milestones: [], issues: [] },
  });
});

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

beforeEach(() => {
  vi.spyOn(process, "cwd").mockReturnValue(root);
  vi.mocked(llmText).mockReset();
  delete process.env.DEMO_MODE;
});

afterEach(async () => {
  vi.restoreAllMocks();
  const store = getStore();
  for (const d of await store.list<{ id: string }>("briefings")) await store.remove("briefings", d.id);
  await store.remove("roadmaps", "aisha_ml-engineer");
  fs.rmSync(path.join(root, "public"), { recursive: true, force: true });
});

describe("weekOfFor", () => {
  it("returns next Monday, or today when today is Monday", () => {
    expect(weekOfFor(new Date("2026-11-07T10:00:00Z"))).toBe("2026-11-09"); // Saturday
    expect(weekOfFor(new Date("2026-11-08T23:00:00Z"))).toBe("2026-11-09"); // Sunday
    expect(weekOfFor(new Date("2026-11-09T08:00:00Z"))).toBe("2026-11-09"); // Monday
    expect(weekOfFor(new Date("2026-11-10T08:00:00Z"))).toBe("2026-11-16"); // Tuesday
  });
});

describe("buildBriefing", () => {
  it("passes the focus skill and momentum % to the LLM and returns its script", async () => {
    vi.mocked(llmText).mockResolvedValue("  Morning Aisha! A great week ahead.  ");
    const b = await buildBriefing("aisha", NOW);

    expect(llmText).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(llmText).mock.calls[0][0];
    expect(arg.system).toBe(BRIEFING_SYSTEM);
    expect(arg.agent).toBe("voice");
    const sent = JSON.parse(arg.user);
    expect(sent.focusSkill).toBe("Docker");
    expect(sent.momentumChangePct).toBe(18);
    expect(sent.focusDemandPct).toBe(41);
    expect(sent.pod).toEqual({ name: "VisionAid", project: "an app that describes photos aloud" });
    expect(sent.risingSkills[0]).toEqual({ skill: "LLM evaluation", growthPerYearPct: 38 });

    expect(BriefingZ.parse(b)).toBeTruthy();
    expect(b.script).toBe("Morning Aisha! A great week ahead.");
    expect(b.weekOf).toBe("2026-11-09");
    expect(b.topTasks).toEqual([
      "Finish your Dockerfile and get the PR merged",
      "PyTorch quickstart: 2 hours",
      "Answer one question in the Help a newcomer feed",
    ]);
    expect(b.marketMoves).toEqual(["LLM evaluation up 38% a year", "Docker steady at 41% of ads"]);
    expect(b.audioUrl).toBeUndefined(); // no public/demo mp3 in this temp dir
  });

  it("falls back to a ~140-word template when the LLM has no key, and stores the briefing", async () => {
    vi.mocked(llmText).mockRejectedValue(new Error("no_key"));
    const b = await buildBriefing("aisha", NOW);
    expect(b.script).toMatch(/^Morning Aisha! Here's your Keystone briefing for the week of 9 November\./);
    expect(b.script).toContain("Docker demand held steady at 41% of ML engineer ads");
    expect(b.script).toContain("up 18%");
    expect(b.script).toContain("First, finish your Dockerfile and get the PR merged. Next, PyTorch quickstart, 2 hours.");
    expect(b.script).toContain("You're 38% of the way to ML engineer");
    const words = b.script.split(/\s+/).length;
    expect(words).toBeGreaterThan(100);
    expect(words).toBeLessThan(190);

    const stored = await getStore().get("briefings", "aisha_2026-11-09");
    expect(BriefingZ.parse(stored).script).toBe(b.script);
  });

  it("prefers a roadmap from the store over the fixture", async () => {
    vi.mocked(llmText).mockResolvedValue("ok");
    const fromStore = { ...roadmap, version: 2, weeks: [{ ...roadmap.weeks[1], focusSkillId: "pytorch" }] };
    await getStore().upsert("roadmaps", "aisha_ml-engineer", { id: "aisha_ml-engineer", ...fromStore }, "aisha");
    await buildBriefing("aisha", NOW);
    expect(JSON.parse(vi.mocked(llmText).mock.calls[0][0].user).focusSkill).toBe("PyTorch");
  });

  it("returns the fixture in DEMO_MODE without calling the LLM", async () => {
    process.env.DEMO_MODE = "true";
    const b = await buildBriefing("aisha", NOW);
    expect(llmText).not.toHaveBeenCalled();
    expect(b.script).toBe(fixtureBriefing.script);
    expect(b.audioUrl).toBeUndefined();
  });

  it("links the demo MP3 for Aisha only when the file exists", async () => {
    vi.mocked(llmText).mockResolvedValue("ok");
    write("public/demo/briefing-aisha.mp3", "ID3");
    expect((await buildBriefing("aisha", NOW)).audioUrl).toBe("/demo/briefing-aisha.mp3");
  });

  it("throws BriefingUnavailable for a user with no roadmap", async () => {
    await expect(buildBriefing("nobody", NOW)).rejects.toBeInstanceOf(BriefingUnavailable);
  });

  it("getBriefing reuses this week's stored briefing unless refresh is asked for", async () => {
    vi.mocked(llmText).mockResolvedValueOnce("first").mockResolvedValueOnce("second");
    expect((await getBriefing("aisha", { now: NOW })).script).toBe("first");
    expect((await getBriefing("aisha", { now: NOW })).script).toBe("first");
    expect((await getBriefing("aisha", { now: NOW, refresh: true })).script).toBe("second");
  });
});

describe("gatherBriefingData", () => {
  it("uses the built-in Aisha default when no data files exist", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(path.join(root, "empty"));
    const d = await gatherBriefingData("aisha", "2026-11-09");
    expect(d.focusSkill).toBe("Docker");
    expect(d.momentumChangePct).toBe(18);
    expect(d.tasks).toHaveLength(3);
    expect(marketMovesFor(d)).toEqual(fixtureBriefing.marketMoves.slice(0, 1).concat("Docker steady at 41% of ads"));
    expect(templateScript(d)).toContain("VisionAid");
  });

  it("ignores unsafe user ids instead of reading arbitrary files", async () => {
    await expect(gatherBriefingData("../../etc", "2026-11-09")).rejects.toBeInstanceOf(BriefingUnavailable);
  });
});
