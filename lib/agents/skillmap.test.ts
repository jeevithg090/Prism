import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { llmJSON } from "@/lib/llm";
import { canonicalize, emergingCandidates, mapTextToSkills, matchSkills, trackUnknownTerms } from "./skillmap";

vi.mock("@/lib/llm", () => ({ llmJSON: vi.fn() }));
vi.mock("@/lib/agents/events", () => ({ emit: vi.fn() }));

const ids = (text: string) => matchSkills(text).map((s) => s.skillId);

beforeEach(() => {
  vi.mocked(llmJSON).mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("canonicalize", () => {
  it("resolves aliases and rejects unknown terms", () => {
    expect(canonicalize("JS")).toBe("javascript");
    expect(canonicalize("Postgres")).toBe("postgresql");
    expect(canonicalize("k8s")).toBe("kubernetes");
    expect(canonicalize("unknownthing")).toBeNull();
  });

  it("keeps punctuation that is part of the name", () => {
    expect(canonicalize(" C++, ")).toBe("cpp");
    expect(canonicalize(".NET")).toBe("dotnet");
  });
});

describe("mapTextToSkills, deterministic pass", () => {
  it("finds skills and raises the level near build verbs", async () => {
    const { skills } = await mapTextToSkills("Build REST APIs in Node and deploy with Docker", { useLLM: false });
    expect(skills.find((s) => s.skillId === "rest-apis")?.level).toBe(3);
    expect(skills.map((s) => s.skillId)).toEqual(expect.arrayContaining(["nodejs", "docker"]));
  });

  it("does not double-count machine learning", async () => {
    const { skills } = await mapTextToSkills("Machine learning with scikit learn", { useLLM: false });
    expect(skills.map((s) => s.skillId).sort()).toEqual(["machine-learning", "scikit-learn"]);
  });

  it("keeps JavaScript apart from Java, and C++ apart from C", () => {
    expect(ids("JavaScript")).toEqual(["javascript"]);
    expect(ids("C++")).toEqual(["cpp"]);
  });

  it("only treats everyday words as technologies when written that way", () => {
    expect(ids("You will go on to rest and excel in spring")).toEqual([]);
    expect(ids("We use Rust & Go")).toEqual(expect.arrayContaining(["rust", "go"]));
  });

  it("does not read R&D or C-suite as languages", () => {
    expect(ids("R&D with the C-suite")).toEqual([]);
    expect(ids("Written in C and R")).toEqual(expect.arrayContaining(["c", "r"]));
  });
});

describe("mapTextToSkills, LLM pass", () => {
  it("drops ids outside the taxonomy and returns unknown terms", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test");
    vi.mocked(llmJSON).mockResolvedValue({
      skills: [{ skillId: "fake", level: 2 }, { skillId: "python", level: 2 }],
      unknownTerms: ["mojo"],
    });
    const r = await mapTextToSkills("some text");
    expect(r.skills).toEqual([{ skillId: "python", level: 2 }]);
    expect(r.unknownTerms).toEqual(["mojo"]);
  });

  it("keeps the deterministic matches when the LLM fails", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test");
    vi.mocked(llmJSON).mockRejectedValue(new Error("no_key"));
    const r = await mapTextToSkills("Python");
    expect(r.skills.map((s) => s.skillId)).toEqual(["python"]);
  });

  it("does not call the LLM without an API key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    await mapTextToSkills("Python", { useLLM: true });
    expect(llmJSON).not.toHaveBeenCalled();
  });
});

it("reports a term as emerging after three sightings", () => {
  trackUnknownTerms(["zigzag", "zigzag"]);
  expect(emergingCandidates()).not.toContain("zigzag");
  trackUnknownTerms(["Zigzag"]);
  expect(emergingCandidates()).toContain("zigzag");
});
