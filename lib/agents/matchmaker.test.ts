import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import skills from "@/data/skills.json";
import { PodZ, skillName } from "@/lib/schemas/community";
import type { Pod } from "@/lib/types";
import {
  buildCandidate, greedyPod, learnsTeaches, matchPod, NotFoundError, podName, roleLabel, scoreParts, scoreTeam,
  templateExplanations, type CandidateSkills,
} from "./matchmaker";
import { AISHA_MAP, fakeStore, PROFILES, serveDataFiles, STUDENT_SKILLS } from "./matchmaker.testdata";

const mocks = vi.hoisted(() => ({ embed: vi.fn(), llmJSON: vi.fn(), emit: vi.fn(), loadGraph: vi.fn() }));
vi.mock("@/lib/llm", () => ({
  embed: mocks.embed, llmJSON: mocks.llmJSON, llmText: vi.fn(), cosine: () => 0, LLMError: class LLMError extends Error {},
}));
vi.mock("@/lib/agents/events", () => ({ emit: mocks.emit, newRunId: () => "run_auto", subscribe: () => () => {} }));
vi.mock("@/lib/graph/build", () => ({ loadGraph: mocks.loadGraph }));
vi.mock("@/lib/store", async () => {
  const { fakeStore: store } = await import("@/lib/agents/matchmaker.testdata");
  return { getStore: () => store };
});

const cand = (userId: string, o: Partial<CandidateSkills> = {}): CandidateSkills => ({
  userId, proven: [], gaps: [], interests: ["computer vision"], availability: ["tue-eve"], badges: [], year: 1, targetRole: "ml-engineer", ...o,
});
const ids = (p: Pod) => p.members.map((m) => m.userId).sort();
const SKILL_NAMES = (skills as { id: string; name: string }[]).map((s) => s.name);
const named = (text: string) =>
  SKILL_NAMES.filter((n) => new RegExp(`(^|[^A-Za-z0-9+#])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^A-Za-z0-9+#])`, "i").test(text));

beforeEach(() => {
  fakeStore.reset();
  mocks.emit.mockReset();
  mocks.embed.mockReset().mockRejectedValue(new Error("embeddings unavailable")); // force the Jaccard path
  mocks.llmJSON.mockReset().mockRejectedValue(new Error("no_key"));
  mocks.loadGraph.mockReset().mockImplementation(async (u: string, r: string) => (u === "aisha" && r === "ml-engineer" ? AISHA_MAP : null));
  serveDataFiles({ "data/seed/student-skills.json": STUDENT_SKILLS });
  delete process.env.DEMO_MODE;
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.DEMO_MODE;
});

describe("scoreTeam", () => {
  it("scores a complementary team above a team with identical skills", () => {
    const a = cand("a", { proven: ["python", "docker"], gaps: ["sql", "react"] });
    const b = cand("b", { proven: ["sql", "react"], gaps: ["python", "docker"] });
    const twin = cand("c", { proven: ["python", "docker"], gaps: ["sql", "react"] });
    expect(scoreParts([a, b]).coverage).toBe(1);
    expect(scoreParts([a, twin]).coverage).toBe(0);
    expect(scoreTeam([a, b])).toBeGreaterThan(scoreTeam([a, twin]));
  });

  it("penalises redundancy: identical proven sets lower the score", () => {
    const x = cand("x", { proven: ["python", "git"] });
    const distinct = cand("y", { proven: ["sql", "aws"] });
    const same = cand("z", { proven: ["python", "git"] });
    expect(scoreParts([x, same]).redundancy).toBe(1);
    expect(scoreParts([x, distinct]).redundancy).toBe(0);
    expect(scoreTeam([x, same])).toBeLessThan(scoreTeam([x, distinct]));
    expect(scoreTeam([x, distinct]) - scoreTeam([x, same])).toBeCloseTo(0.15, 10);
  });

  it("mix: adding a new-to-uni member plus a year-2 member raises the score by 0.10", () => {
    const base = [cand("a"), cand("b")];
    const mixed = [...base, cand("newbie", { badges: ["new-to-uni"] }), cand("senior", { year: 2 })];
    const before = scoreParts(base);
    const after = scoreParts(mixed);
    expect(before.mix).toBe(0);
    expect(after.mix).toBe(1);
    expect({ ...after, mix: 0 }).toEqual({ ...before, mix: 0 }); // only mix changes
    expect(scoreTeam(mixed) - scoreTeam(base)).toBeCloseTo(0.1, 10);
  });

  it("is clamped to [0,1], rounded to 2 decimals, and uses opts.interestSim", () => {
    const lonely = [cand("a", { proven: ["python"], availability: ["mon-am"], targetRole: "x" }), cand("b", { proven: ["python"], availability: ["fri-pm"], interests: [], targetRole: "y" })];
    expect(scoreTeam(lonely)).toBe(0);
    expect(scoreTeam([])).toBe(0);
    const t = [cand("a", { gaps: ["sql"] }), cand("b", { proven: ["sql"] }), cand("c")];
    const s = scoreTeam(t);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
    expect(Math.round(s * 100) / 100).toBe(s);
    expect(scoreParts(t, { interestSim: () => 0.5 }).interest).toBe(0.5);
  });
});

describe("pure building blocks", () => {
  const aisha = buildCandidate(PROFILES[0], AISHA_MAP);

  it("buildCandidate takes proven nodes and the top-8 role gaps by demand", () => {
    expect(aisha.proven.sort()).toEqual(["git", "html-css", "javascript", "python"]);
    expect(aisha.gaps).toEqual(["docker", "pytorch", "sql", "aws", "mlops", "llm-apps", "ci-cd", "kubernetes"]);
    expect(aisha).toMatchObject({ year: 1, targetRole: "ml-engineer", badges: ["new-to-uni", "international"], availability: ["tue-eve", "thu-eve", "sat-am"] });
  });

  it("greedyPod breaks ties alphabetically and stops at 3 when nothing raises the score", () => {
    const u = cand("u", { gaps: ["sql"] });
    const team = greedyPod(u, [cand("zed", { proven: ["sql"] }), cand("amy", { proven: ["sql"] }), cand("u")]);
    expect(team.map((t) => t.userId)).toEqual(["u", "amy", "zed"]); // amy/zed tie → alphabetical; the user is never a candidate
    const size3 = greedyPod(u, [cand("b", { proven: ["sql"] }), cand("c"), cand("d", { proven: ["sql"], availability: ["mon-am"] })]);
    expect(size3.map((t) => t.userId)).toEqual(["u", "b", "c"]);
  });

  it("learnsTeaches keeps the top 3 and roleLabel reads 'Learns X · Teaches Y'", () => {
    const [m] = learnsTeaches([cand("a", { proven: ["python"], gaps: ["docker", "sql", "aws", "react"] }), cand("b", { proven: ["docker", "sql", "aws", "react"], gaps: ["python"] })]);
    expect(m.learns).toEqual(["docker", "sql", "aws"]);
    expect(m.teaches).toEqual(["python"]);
    expect(roleLabel(m.learns, m.teaches)).toBe("Learns Docker · Teaches Python");
    expect(roleLabel([], ["python"])).toBe("Teaches Python");
    expect(roleLabel([], [])).toBe("Pod member");
  });

  it("templateExplanations handles two-way and one-way exchanges", () => {
    const lines = templateExplanations(
      "aisha",
      [
        { userId: "aisha", learns: ["docker"], teaches: ["python"] },
        { userId: "priya", learns: ["python"], teaches: ["docker"] },
        { userId: "mei", learns: ["python"], teaches: [] },
      ],
      { aisha: "Aisha Rahman", priya: "Priya Shah", mei: "Mei Lin" },
    );
    expect(lines).toEqual([
      { fromUserId: "aisha", toUserId: "priya", text: "Priya reviews your Docker; you review Priya's Python." },
      { fromUserId: "aisha", toUserId: "mei", text: "You review Mei's Python; teaching it is the fastest way to lock it in." },
    ]);
  });

  it("podName is deterministic from the score", () => {
    expect(podName(0.82)).toBe("Pod Aurora");
    expect(podName(0.61)).toBe(podName(0.61));
  });
});

describe("matchPod", () => {
  it("matches aisha with exactly priya, tom and mei, deterministically", async () => {
    const pod = await matchPod({ userId: "aisha", runId: "run_1" });
    expect(PodZ.safeParse(pod).success).toBe(true);
    expect(ids(pod)).toEqual(["aisha", "mei", "priya", "tom"]);
    expect(pod.members.length).toBeGreaterThanOrEqual(3);
    expect(pod.members.length).toBeLessThanOrEqual(4);
    expect(pod.members[0].userId).toBe("aisha");
    const aisha = pod.members[0];
    expect(aisha.learns).toContain("docker");
    expect(aisha.role).toBe("Learns Docker · Teaches Python");
    expect(pod.id).toMatch(/^pod_[A-Za-z0-9_-]{6}$/);
    expect(pod.name).toMatch(/^Pod [A-Z][a-z]+$/);

    const again = await matchPod({ userId: "aisha", runId: "run_2" });
    expect(ids(again)).toEqual(ids(pod));
    expect(again.score).toBe(pod.score);
    expect(again.name).toBe(pod.name);
    expect(again.members).toEqual(pod.members);
    expect(again.explanations).toEqual(pod.explanations);

    expect(await fakeStore.get("pods", pod.id)).toEqual(pod);
    expect(mocks.embed).toHaveBeenCalledTimes(2); // once per run (precomputed), then Jaccard fallback
  });

  it("emits started / progress / progress / done with real numbers", async () => {
    const pod = await matchPod({ userId: "aisha", runId: "run_ev" });
    const evs = mocks.emit.mock.calls.map(([e]) => e as { runId: string; agent: string; status: string; message: string });
    expect(evs.every((e) => e.runId === "run_ev" && e.agent === "matchmaker")).toBe(true);
    expect(evs.map((e) => e.status)).toEqual(["started", "progress", "progress", "done"]);
    expect(evs[0].message).toBe("Matchmaker: comparing 4 students");
    expect(evs[1].message).toBe("best partner: Priya (fills Docker, PyTorch)");
    expect(evs[2].message).toBe(`pod score ${pod.score.toFixed(2)}`);
    expect(evs[3].message).toContain(pod.name);
  });

  it("every explanation names real skills from the members' learns/teaches", async () => {
    const pod = await matchPod({ userId: "aisha" });
    expect(pod.explanations.length).toBeGreaterThan(0);
    const byId = new Map(pod.members.map((m) => [m.userId, m]));
    for (const e of pod.explanations) {
      const from = byId.get(e.fromUserId)!;
      const to = byId.get(e.toUserId)!;
      expect(from && to).toBeTruthy();
      const allowed = new Set([...from.learns, ...from.teaches, ...to.learns, ...to.teaches].map(skillName));
      const inText = named(e.text);
      expect(inText.length).toBeGreaterThan(0);
      for (const n of inText) expect(allowed.has(n)).toBe(true);
    }
    // every teammate is explained
    const explained = new Set(pod.explanations.flatMap((e) => [e.fromUserId, e.toUserId]));
    for (const m of pod.members) expect(explained.has(m.userId)).toBe(true);
    expect(pod.explanations.find((e) => e.toUserId === "priya")?.text).toBe("Priya reviews your Docker and PyTorch work, so you learn from someone a step ahead.");
  });

  it("uses the template explanations when the LLM polish throws", async () => {
    const pod = await matchPod({ userId: "aisha" });
    expect(mocks.llmJSON).toHaveBeenCalledTimes(1);
    const names = Object.fromEntries(PROFILES.map((p) => [p.id, p.name]));
    expect(pod.explanations).toEqual(templateExplanations("aisha", pod.members, names));
  });

  it("uses polished lines that keep the skills and ignores ones that drop them", async () => {
    mocks.llmJSON.mockImplementation(async ({ user }: { user: string }) => {
      const { lines } = JSON.parse(user) as { lines: { fromUserId: string; toUserId: string; text: string }[] };
      return {
        lines: lines.map((l) => ({ ...l, text: l.toUserId === "priya" ? "Priya will happily check your Docker and PyTorch work." : "You two will get on great!" })),
      };
    });
    const pod = await matchPod({ userId: "aisha" });
    expect(pod.explanations.find((e) => e.toUserId === "priya")?.text).toBe("Priya will happily check your Docker and PyTorch work.");
    for (const e of pod.explanations.filter((x) => x.toUserId !== "priya")) expect(e.text).not.toBe("You two will get on great!");
  });

  it("throws NotFoundError for an unknown user", async () => {
    await expect(matchPod({ userId: "nobody" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("DEMO_MODE runs the algorithm without embeddings or the LLM", async () => {
    process.env.DEMO_MODE = "true";
    const pod = await matchPod({ userId: "aisha" });
    expect(ids(pod)).toEqual(["aisha", "mei", "priya", "tom"]);
    expect(mocks.embed).not.toHaveBeenCalled();
    expect(mocks.llmJSON).not.toHaveBeenCalled();
  });

  it("DEMO_MODE falls back to data/fixtures/pod.aisha.json when anything throws", async () => {
    process.env.DEMO_MODE = "true";
    const fixture: Pod = {
      id: "pod_demo01", name: "Pod Aurora", score: 0.82, createdAt: "2026-11-07T12:00:00Z", explanations: [],
      members: [{ userId: "aisha", learns: ["docker"], teaches: ["python"], role: "Learns Docker · Teaches Python" }],
    };
    serveDataFiles({ "data/fixtures/pod.aisha.json": fixture }); // no student-skills.json → no candidates → throws
    await expect(matchPod({ userId: "aisha" })).resolves.toEqual(fixture);
    delete process.env.DEMO_MODE;
    await expect(matchPod({ userId: "aisha" })).rejects.toThrow(/No other students/);
  });

  it("matches a seeded student without a Bridge Map from student-skills.json", async () => {
    const pod = await matchPod({ userId: "tom" });
    expect(pod.members[0].userId).toBe("tom");
    expect(pod.members[0].learns.length).toBeGreaterThan(0);
    expect(ids(pod)).toContain("aisha"); // non-seeded users join the pool through their Bridge Map
  });
});
