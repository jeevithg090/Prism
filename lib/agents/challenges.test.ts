import { beforeEach, describe, expect, it, vi } from "vitest";
import fixtures from "@/data/fixtures/challenges.json";
import mapFixture from "@/data/fixtures/bridgemap.aisha.ml-engineer.json";
import { ChallengeZ, GradeResultZ, PublicChallengeZ, type Challenge } from "@/components/challenge/model";
import type { EvidenceItem } from "@/lib/types";

const h = vi.hoisted(() => ({
  docs: new Map<string, { doc: unknown; userId?: string }>(),
  emit: vi.fn(),
  llmJSON: vi.fn(),
  llmText: vi.fn(),
}));

vi.mock("@/lib/agents/events", () => ({ emit: h.emit, newRunId: () => "run_mc", subscribe: vi.fn() }));
vi.mock("@/lib/llm", () => ({
  llmJSON: h.llmJSON,
  llmText: h.llmText,
  LLMError: class extends Error {},
}));
vi.mock("@/lib/graph/build", () => ({
  loadGraph: async (u: string, r: string) => (u === "aisha" && r === "ml-engineer" ? structuredClone(mapFixture) : null),
}));
vi.mock("@/lib/store", () => ({
  getStore: () => ({
    get: async (c: string, id: string) => structuredClone(h.docs.get(`${c}/${id}`)?.doc ?? null),
    list: async (c: string, f?: { userId?: string }) =>
      [...h.docs.entries()].filter(([k, r]) => k.startsWith(`${c}/`) && (!f?.userId || r.userId === f.userId)).map(([, r]) => structuredClone(r.doc)),
    upsert: async (c: string, id: string, doc: unknown, userId?: string) => { h.docs.set(`${c}/${id}`, { doc: structuredClone(doc), userId }); return doc; },
    remove: async (c: string, id: string) => { h.docs.delete(`${c}/${id}`); },
  }),
}));

import {
  answerTokens, generateChallenge, getChallengeMenu, gradeChallenge, gradeWithRules, isSafeFeedback,
  loadChallengeFixtures, NotFoundError, runRule, stripComments,
} from "./challenges";

const all = fixtures as Challenge[];
const docker = all.find((c) => c.skillId === "docker")!;
const noLLM = () => Promise.reject(new Error("no_key"));

const GOOD_DOCKERFILE = `# syntax=docker/dockerfile:1
FROM python:3.12-slim-bookworm
ENV PIP_NO_CACHE_DIR=1 PYTHONUNBUFFERED=1
WORKDIR /srv
COPY requirements.txt ./
RUN pip install -r requirements.txt
COPY app/ ./app/
RUN adduser --disabled-password --gecos "" captioner
USER captioner
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
`;

beforeEach(() => {
  vi.clearAllMocks();
  h.docs.clear();
  h.docs.set("profiles/aisha", { doc: { id: "aisha", name: "Aisha Rahman", programmeId: "uom-bsc-cs", dna: { targetRoles: ["ml-engineer"] }, badges: [] }, userId: "aisha" });
  h.llmJSON.mockImplementation(noLLM);
  h.llmText.mockImplementation(noLLM);
});

describe("challenges.json fixture", () => {
  it("has a valid challenge for docker, pytorch, sql, aws, python and git, each with 4 criteria and 3 checks", () => {
    expect(all.map((c) => c.skillId).sort()).toEqual(["aws", "docker", "git", "python", "pytorch", "sql"]);
    for (const c of all) {
      expect(ChallengeZ.safeParse(c).success, c.id).toBe(true);
      expect(c.rubric).toHaveLength(4);
      expect(c.checks).toHaveLength(3);
    }
    expect(loadChallengeFixtures()).toHaveLength(6);
  });

  it.each(all.map((c) => [c.skillId, c] as const))("%s: the sample answer passes every criterion and the starter fails", (_id, c) => {
    const good = gradeWithRules(c, c.sampleAnswer);
    expect(good.rubric.filter((r) => !r.met).map((r) => r.id)).toEqual([]);
    expect(good.checks.filter((r) => !r.met).map((r) => r.id)).toEqual([]);
    expect(good.passed).toBe(true);
    const bad = gradeWithRules(c, c.starter);
    expect(bad.passed).toBe(false);
    expect(bad.rubricMet).toBeLessThan(2);
  });

  it.each(all.map((c) => [c.skillId, c] as const))("%s: hints are questions and never contain the answer", (_id, c) => {
    const tokens = answerTokens(c);
    expect(tokens.length).toBeGreaterThan(0);
    for (const k of [...c.rubric, ...c.checks]) {
      expect(k.hint.trim().endsWith("?"), k.id).toBe(true);
      expect(isSafeFeedback(k.hint, c), k.id).toBe(true);
    }
  });
});

describe("AST-lite rules", () => {
  it("ignores commented-out lines, so `# COPY requirements.txt` can't game the cache check", () => {
    const sneaky = `FROM python:3.12-slim\nWORKDIR /app\n# COPY requirements.txt .\n# RUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nRUN pip install -r requirements.txt\nUSER app\nCMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]`;
    const g = gradeWithRules(docker, sneaky);
    expect(g.rubric.find((r) => r.id === "deps-layer")!.met).toBe(false);
    expect(g.rubric.find((r) => r.id === "pip-cache")!.met).toBe(false);
  });

  it("checks the LAST USER instruction, so switching back to root fails", () => {
    const back = GOOD_DOCKERFILE.replace("USER captioner", "USER captioner\nUSER root");
    expect(gradeWithRules(docker, back).rubric.find((r) => r.id === "non-root")!.met).toBe(false);
  });

  it("keeps # inside quotes in Python and shell", () => {
    expect(stripComments(`x = f"#{n}"  # note`, "python")).toBe(`x = f"#{n}"  `);
    expect(stripComments(`echo "# hi" # bye`, "shell")).toBe(`echo "# hi" `);
  });

  it("json rule parses, order rule needs both in sequence", () => {
    expect(runRule({ kind: "json" }, "{\"a\":1}")).toBe(true);
    expect(runRule({ kind: "json" }, "{a:1}")).toBe(false);
    expect(runRule({ kind: "order", first: "a", then: "b" }, "b a")).toBe(false);
    expect(runRule({ kind: "order", first: "a", then: "b" }, "a b")).toBe(true);
    expect(runRule({ kind: "match", pattern: "(" }, "x")).toBe(false); // bad pattern never throws
  });
});

describe("gradeChallenge", () => {
  it("a good Docker submission (not the sample) passes and writes rung-1 micro-challenge evidence", async () => {
    const out = await gradeChallenge({ userId: "aisha", challengeId: docker.id, submission: GOOD_DOCKERFILE });
    expect(GradeResultZ.safeParse(out).success).toBe(true);
    expect(out).toMatchObject({ passed: true, rubricMet: 4, checksPassed: 3, usedSample: false, feedbackSource: "rules", skillName: "Docker" });
    expect(out.rubric.every((r) => r.met && r.hint === undefined)).toBe(true);
    const ev = h.docs.get("evidence/ev_mc_aisha_docker")?.doc as EvidenceItem;
    expect(ev).toMatchObject({ userId: "aisha", skillId: "docker", level: 1, source: "micro-challenge", url: "/challenge?skill=docker" });
    expect(ev.quote).toContain("4 of 4 rubric criteria");
    expect(out.evidenceId).toBe(ev.id);
    expect(h.docs.get("momentum_events/mc-aisha-docker")).toBeDefined();
    const msgs = h.emit.mock.calls.map((c) => c[0]);
    expect(msgs.some((e) => e.agent === "evidence" && e.message.includes("rung 1 · Tried it"))).toBe(true);
    expect(msgs.at(-1)).toMatchObject({ agent: "orchestrator", status: "done" });
  });

  it("a bad Docker submission fails with Socratic hints and no solution", async () => {
    const out = await gradeChallenge({ userId: "aisha", challengeId: docker.id, submission: docker.starter });
    expect(out.passed).toBe(false);
    expect(out.rubricMet).toBe(0);
    const unmet = out.rubric.filter((r) => !r.met);
    expect(unmet).toHaveLength(4);
    for (const r of unmet) expect(r.hint).toMatch(/\?$/);
    const text = JSON.stringify(out);
    for (const leak of ["--no-cache-dir", "python:3.12-slim", "useradd", "USER app", "COPY requirements.txt ."]) {
      expect(text).not.toContain(leak);
    }
    expect(text).not.toContain(docker.sampleAnswer.trim());
    expect(out.feedback).toMatch(/^Not yet/);
    expect(h.docs.has("evidence/ev_mc_aisha_docker")).toBe(false);
  });

  it("labels a pass with the sample answer honestly (demo) at lower confidence", async () => {
    const out = await gradeChallenge({ userId: "aisha", challengeId: docker.id, submission: `  ${docker.sampleAnswer}\n\n` });
    expect(out).toMatchObject({ passed: true, usedSample: true });
    const ev = h.docs.get("evidence/ev_mc_aisha_docker")?.doc as EvidenceItem;
    expect(ev.quote).toContain("sample answer (demo)");
    expect(ev.confidence).toBeLessThan(0.5);
  });

  it("uses LLM feedback when it's safe, and drops it when it leaks the fix", async () => {
    h.llmText.mockResolvedValueOnce("Nice work splitting the layers. What happens to the image size after pip finishes?");
    const a = await gradeChallenge({ userId: "aisha", challengeId: docker.id, submission: docker.starter });
    expect(a.feedbackSource).toBe("llm");
    h.llmText.mockResolvedValueOnce("Just add --no-cache-dir and switch to python:3.12-slim.");
    const b = await gradeChallenge({ userId: "aisha", challengeId: docker.id, submission: docker.starter });
    expect(b.feedbackSource).toBe("rules");
    expect(b.feedback).not.toContain("--no-cache-dir");
  });

  it("throws NotFoundError for an unknown challenge", async () => {
    await expect(gradeChallenge({ userId: "aisha", challengeId: "nope", submission: "x" })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("generateChallenge + menu", () => {
  it("falls back to the fixture without an LLM, never sends rules or the sample answer, and emits events", async () => {
    const out = await generateChallenge("aisha", "docker");
    expect(PublicChallengeZ.safeParse(out).success).toBe(true);
    expect(out).toMatchObject({ id: docker.id, skillName: "Docker", minutes: 20, checksCount: 3, source: "fixture", runId: "run_mc" });
    const text = JSON.stringify(out);
    expect(text).not.toContain("sampleAnswer");
    expect(text).not.toContain("\"rules\"");
    expect(text).not.toContain("--no-cache-dir");
    expect(h.emit.mock.calls.map((c) => c[0].agent)).toEqual(["roadmap", "roadmap", "orchestrator"]);
  });

  it("keeps the fixture rubric when the LLM re-frames the task", async () => {
    h.llmJSON.mockResolvedValueOnce({ title: "Dockerise Pod Orbit's captioning API", context: "This is your week 2 task." });
    const out = await generateChallenge("aisha", "docker");
    expect(out.title).toBe("Dockerise Pod Orbit's captioning API");
    expect(out.id).toBe(`${docker.id}_aisha`);
    const graded = await gradeChallenge({ userId: "aisha", challengeId: out.id, submission: GOOD_DOCKERFILE });
    expect(graded.passed).toBe(true);
  });

  it("says plainly when there's no challenge for a skill and no LLM", async () => {
    await expect(generateChallenge("aisha", "kubernetes")).rejects.toThrow(/don't have a 20-minute Kubernetes challenge/);
  });

  it("menu puts the top gap first when there's no roadmap, and marks tried skills", async () => {
    const before = await getChallengeMenu("aisha");
    expect(before.focusSkillId).toBe("docker");
    expect(before.options[0]).toMatchObject({ skillId: "docker", status: "gap", demand: 0.41, tried: false });
    await gradeChallenge({ userId: "aisha", challengeId: docker.id, submission: GOOD_DOCKERFILE });
    const after = await getChallengeMenu("aisha");
    expect(after.options.find((o) => o.skillId === "docker")!.tried).toBe(true);
    expect(after.focusSkillId).toBe("pytorch");
  });

  it("menu follows the roadmap week's focus", async () => {
    h.docs.set("roadmaps/aisha", {
      doc: { userId: "aisha", weeks: [
        { week: 1, focusSkillId: "linux", tasks: [{ id: "t1", done: true }] },
        { week: 2, focusSkillId: "sql", tasks: [{ id: "t2", done: false }] },
      ] },
      userId: "aisha",
    });
    const menu = await getChallengeMenu("aisha");
    expect(menu).toMatchObject({ focusSkillId: "sql", focusWeek: 2 });
    expect(menu.options[0].skillId).toBe("sql");
  });
});
