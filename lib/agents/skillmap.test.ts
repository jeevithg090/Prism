import { beforeEach, describe, expect, it, vi } from "vitest";
const { llmJSON, emit } = vi.hoisted(() => ({ llmJSON: vi.fn(), emit: vi.fn() }));
vi.mock("@/lib/llm", () => ({ llmJSON, LLMError: class extends Error {} }));
vi.mock("@/lib/agents/events", () => ({ emit, newRunId: () => "run_test" }));

import { canonicalize, emergingCandidates, getSkills, mapTextToSkills, matchSkills, resetUnknownTerms, trackUnknownTerms } from "./skillmap";

const ids = async (text: string) => (await mapTextToSkills(text, { useLLM: false })).skills.map((s) => s.skillId).sort();

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.OPENAI_API_KEY;
});

describe("canonicalize", () => {
  it("maps aliases to taxonomy ids", () => {
    expect(canonicalize("JS")).toBe("javascript");
    expect(canonicalize("Postgres")).toBe("postgresql");
    expect(canonicalize("k8s")).toBe("kubernetes");
    expect(canonicalize("  sklearn. ")).toBe("scikit-learn");
    expect(canonicalize("LLM evals")).toBe("llm-evaluation");
    expect(canonicalize("unknownthing")).toBeNull();
  });
});

describe("mapTextToSkills (alias matching)", () => {
  it("finds rest-apis at level 3, nodejs and docker", async () => {
    const { skills } = await mapTextToSkills("Build REST APIs in Node and deploy with Docker", { useLLM: false });
    expect(skills.find((s) => s.skillId === "rest-apis")?.level).toBe(3);
    expect(skills.map((s) => s.skillId)).toEqual(expect.arrayContaining(["rest-apis", "nodejs", "docker"]));
  });

  it("prefers the longest alias and doesn't double count", async () => {
    expect(await ids("Machine learning with scikit learn")).toEqual(["machine-learning", "scikit-learn"]);
    expect(await ids("ML pipelines and MLOps")).toEqual(["machine-learning", "mlops"]);
  });

  it("keeps JavaScript, Java, C++ and C apart", async () => {
    expect(await ids("JavaScript")).toEqual(["javascript"]);
    expect(await ids("Strong C++ skills")).toEqual(["cpp"]);
    expect(await ids("Systems programming in C and Java")).toEqual(["c", "java"]);
    expect(await ids("C# and .NET")).toEqual([]);
  });

  it("ignores everyday words that only look like skills", async () => {
    expect(await ids("Take a rest, then visit each node of the tree")).toEqual([]);
  });

  it("levels by the nearest verb", () => {
    expect(matchSkills("You will use Python for scripting").get("python")).toBe(2);
    expect(matchSkills("An introduction to statistics").get("statistics")).toBe(1);
    expect(matchSkills("Design and implement PyTorch models").get("pytorch")).toBe(3);
  });

  it("emits a progress event with the count when runId is set", async () => {
    await mapTextToSkills("Python and SQL", { runId: "run_1", useLLM: false });
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ runId: "run_1", agent: "skillmap", status: "progress", message: "Skill Mapper: mapped 2 skills" }));
  });
});

describe("optional LLM pass", () => {
  it("drops ids outside the taxonomy, keeps real ones and returns unknown terms", async () => {
    process.env.OPENAI_API_KEY = "test";
    llmJSON.mockResolvedValue({ skills: [{ skillId: "fake", level: 2 }, { skillId: "python", level: 2 }], unknownTerms: ["mojo"] });
    const out = await mapTextToSkills("Some text about programming");
    expect(out.skills).toEqual([{ skillId: "python", level: 2 }]);
    expect(out.unknownTerms).toEqual(["mojo"]);
  });

  it("is never called without OPENAI_API_KEY", async () => {
    await mapTextToSkills("Python", { useLLM: true });
    expect(llmJSON).not.toHaveBeenCalled();
  });

  it("falls back to the alias pass when the model fails", async () => {
    process.env.OPENAI_API_KEY = "test";
    llmJSON.mockRejectedValue(new Error("no_key"));
    expect((await mapTextToSkills("Docker")).skills).toEqual([{ skillId: "docker", level: 1 }]);
  });
});

describe("taxonomy + emerging terms", () => {
  it("merges aliases into every skill and keeps them lowercase", () => {
    const skills = getSkills();
    expect(skills.length).toBeGreaterThanOrEqual(43);
    for (const s of skills) for (const a of s.aliases) expect(a).toBe(a.toLowerCase());
    expect(skills.find((s) => s.id === "kubernetes")?.aliases).toContain("k8s");
  });

  it("reports terms seen 3 or more times", () => {
    resetUnknownTerms();
    trackUnknownTerms(["Mojo", "mojo", "dspy"]);
    trackUnknownTerms(["mojo", "python"]);
    expect(emergingCandidates()).toEqual([{ term: "mojo", count: 3 }]);
  });
});
