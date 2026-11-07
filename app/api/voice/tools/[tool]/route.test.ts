import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { readFileMock, scoreInterviewMock } = vi.hoisted(() => ({ readFileMock: vi.fn(), scoreInterviewMock: vi.fn() }));

vi.mock("node:fs/promises", () => ({ readFile: readFileMock, default: { readFile: readFileMock } }));
vi.mock("@/lib/voice/interviewScoring", () => ({ scoreInterview: scoreInterviewMock }));

import { getStore } from "@/lib/store";
import type { Profile } from "@/lib/types";
import { POST } from "./route";

const enoent = () => Object.assign(new Error("ENOENT"), { code: "ENOENT" });

function call(tool: string, body: unknown, secret: string | null = "s3cret") {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret !== null) headers["x-keystone-secret"] = secret;
  const req = new Request(`http://localhost/api/voice/tools/${tool}`, { method: "POST", headers, body: JSON.stringify(body) });
  return POST(req, { params: Promise.resolve({ tool }) });
}

const zara: Profile = {
  id: "zara",
  name: "Zara",
  programmeId: "uom-bsc-cs",
  year: 2,
  startedAt: "2025-09-22",
  dna: {
    targetRoles: ["data-analyst"],
    timelineLabel: "Summer internship 2027",
    targetDate: "2027-06-01",
    hoursPerWeek: 6,
    theoryPractice: 50,
    formats: ["video"],
    budget: "free",
    constraints: [],
    accessibility: [],
    language: "en",
  },
  badges: ["first-gen"],
  interests: [],
  availability: [],
};

describe("POST /api/voice/tools/[tool]", () => {
  beforeEach(() => {
    vi.stubEnv("KEYSTONE_SHARED_SECRET", "s3cret");
    readFileMock.mockRejectedValue(enoent());
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    readFileMock.mockReset();
    scoreInterviewMock.mockReset();
    for (const id of ["zara", "aisha"]) await getStore().remove("profiles", id);
  });

  it("returns 401 without the secret (even for an unknown tool)", async () => {
    expect((await call("get_profile", { userId: "aisha" }, null)).status).toBe(401);
    expect((await call("get_profile", { userId: "aisha" }, "wrong")).status).toBe(401);
    const res = await call("nope", {}, null);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false });
  });

  it("returns 404 for an unknown tool", async () => {
    const res = await call("drop_tables", {});
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect((await call("toString", {})).status).toBe(404);
  });

  describe("get_profile", () => {
    it("reads the store first", async () => {
      await getStore().upsert("profiles", "zara", zara, "zara");
      const res = await call("get_profile", { userId: "zara" });
      expect(await res.json()).toEqual({
        ok: true,
        data: { name: "Zara", year: 2, targetRoles: ["data-analyst"], badges: ["first-gen"] },
      });
    });

    it("falls back to the built-in Aisha when there is no store doc or fixture", async () => {
      const res = await call("get_profile", { userId: "aisha" });
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data).toMatchObject({ name: "Aisha", year: 1, targetRoles: ["ml-engineer"] });
      expect(data.badges).toContain("new-to-uni");
    });

    it("uses P2's profile fixture when present", async () => {
      readFileMock.mockImplementation(async (p: string) => {
        if (String(p).endsWith("profile.zara.json")) return JSON.stringify(zara);
        throw enoent();
      });
      const { data } = await (await call("get_profile", { userId: "zara" })).json();
      expect(data.name).toBe("Zara");
    });

    it("returns 404 for an unknown user and 400 for a bad id", async () => {
      expect((await call("get_profile", { userId: "nobody" })).status).toBe(404);
      expect((await call("get_profile", { userId: "../../etc/passwd" })).status).toBe(400);
      expect((await call("get_profile", {})).status).toBe(400);
    });

    it("accepts params nested under `parameters`", async () => {
      const res = await call("get_profile", { parameters: { userId: "aisha" } });
      expect(res.status).toBe(200);
    });
  });

  describe("get_role_skills", () => {
    it("returns the built-in ML engineer default without market data", async () => {
      const res = await call("get_role_skills", { roleId: "ml-engineer" });
      expect(await res.json()).toEqual({
        ok: true,
        data: {
          role: "ML engineer",
          topSkills: [
            { skill: "python", pct: 86 },
            { skill: "machine-learning", pct: 78 },
            { skill: "pytorch", pct: 52 },
            { skill: "sql", pct: 48 },
            { skill: "docker", pct: 41 },
          ],
        },
      });
    });

    it("reads P1's market fixture (top 5 by share) when present", async () => {
      readFileMock.mockImplementation(async (p: string) => {
        if (!String(p).endsWith("market.data-analyst.json")) throw enoent();
        return JSON.stringify({
          roleId: "data-analyst",
          roleName: "Data analyst",
          skills: [
            { skillId: "excel", share: 0.6 },
            { skillId: "sql", share: 0.812 },
            { skillId: "python", share: 0.45 },
            { skillId: "tableau", share: 0.3 },
            { skillId: "statistics", share: 0.28 },
            { skillId: "r", share: 0.1 },
          ],
        });
      });
      const { data } = await (await call("get_role_skills", { roleId: "data-analyst" })).json();
      expect(data.role).toBe("Data analyst");
      expect(data.topSkills).toHaveLength(5);
      expect(data.topSkills[0]).toEqual({ skill: "sql", pct: 81 });
      expect(data.topSkills.map((s: { skill: string }) => s.skill)).not.toContain("r");
    });

    it("returns 400 without a roleId", async () => {
      expect((await call("get_role_skills", {})).status).toBe(400);
    });

    it("lower-cases a mixed-case roleId so it matches the market fixture names", async () => {
      const res = await call("get_role_skills", { roleId: "ML-Engineer" });
      const { data } = await res.json();
      expect(data.role).toBe("ML engineer");
      expect(data.topSkills).toHaveLength(5);
      expect(readFileMock.mock.calls.some(([p]) => String(p).endsWith("market.ml-engineer.json"))).toBe(true);
      expect((await call("get_role_skills", { roleId: "ml_engineer" })).status).toBe(400);
    });
  });

  describe("save_dna", () => {
    it("clamps hoursPerWeek to 1-40 and theoryPractice to 0-100, merging into the stored dna", async () => {
      await getStore().upsert("profiles", "zara", zara, "zara");
      const res = await call("save_dna", { userId: "zara", hoursPerWeek: 99, theoryPractice: -20, budget: "paid-ok" });
      expect(await res.json()).toEqual({ ok: true, data: { saved: true } });

      const saved = await getStore().get<Profile>("profiles", "zara");
      expect(saved?.dna.hoursPerWeek).toBe(40);
      expect(saved?.dna.theoryPractice).toBe(0);
      expect(saved?.dna.budget).toBe("paid-ok");
      expect(saved?.dna.targetRoles).toEqual(["data-analyst"]);
      expect(saved?.dna.timelineLabel).toBe("Summer internship 2027");
      expect(saved?.name).toBe("Zara");
    });

    it("clamps the low end too and accepts numeric strings", async () => {
      await getStore().upsert("profiles", "zara", zara, "zara");
      await call("save_dna", { userId: "zara", hoursPerWeek: "0", theoryPractice: 250 });
      const saved = await getStore().get<Profile>("profiles", "zara");
      expect(saved?.dna.hoursPerWeek).toBe(1);
      expect(saved?.dna.theoryPractice).toBe(100);
    });

    it("seeds the demo user from the built-in Aisha when she is not in the store yet", async () => {
      const res = await call("save_dna", { userId: "aisha", hoursPerWeek: 12 });
      expect(res.status).toBe(200);
      const saved = await getStore().get<Profile>("profiles", "aisha");
      expect(saved?.dna.hoursPerWeek).toBe(12);
      expect(saved?.dna.targetRoles).toEqual(["ml-engineer"]);
    });

    it("stores target role ids lower-cased", async () => {
      await getStore().upsert("profiles", "zara", zara, "zara");
      expect((await call("save_dna", { userId: "zara", targetRoles: ["ML-Engineer"] })).status).toBe(200);
      const saved = await getStore().get<Profile>("profiles", "zara");
      expect(saved?.dna.targetRoles).toEqual(["ml-engineer"]);
    });

    it("returns 400 for invalid params and 404 for an unknown user", async () => {
      expect((await call("save_dna", { hoursPerWeek: 10 })).status).toBe(400);
      expect((await call("save_dna", { userId: "zara", budget: "lots" })).status).toBe(400);
      expect((await call("save_dna", { userId: "zara", hoursPerWeek: "ten" })).status).toBe(400);
      expect((await call("save_dna", { userId: "nobody", hoursPerWeek: 10 })).status).toBe(404);
    });
  });

  describe("log_interview", () => {
    it("scores the interview and returns the scores", async () => {
      const scores = { content: 4, structure: 3, clarity: 4, confidence: 3 };
      scoreInterviewMock.mockResolvedValue({
        userId: "aisha",
        roleId: "ml-engineer",
        scores,
        fillerWordsPerMin: 6.2,
        strengths: [],
        improvements: [],
        createdAt: "2026-11-07T15:00:00.000Z",
      });
      const input = { userId: "aisha", roleId: "ml-engineer", transcript: "AI: Hi. USER: Hello.", durationSec: 120 };
      const res = await call("log_interview", input);
      expect(await res.json()).toEqual({ ok: true, data: { scores } });
      expect(scoreInterviewMock).toHaveBeenCalledWith(input);
    });

    it("returns 400 for an empty transcript without scoring", async () => {
      const res = await call("log_interview", { userId: "aisha", roleId: "ml-engineer", transcript: "", durationSec: 60 });
      expect(res.status).toBe(400);
      expect(scoreInterviewMock).not.toHaveBeenCalled();
    });

    it("returns 400 for a whitespace-only or over-long transcript without scoring", async () => {
      const base = { userId: "aisha", roleId: "ml-engineer", durationSec: 60 };
      expect((await call("log_interview", { ...base, transcript: "   \n\t " })).status).toBe(400);
      expect((await call("log_interview", { ...base, transcript: "a".repeat(50_001) })).status).toBe(400);
      expect(scoreInterviewMock).not.toHaveBeenCalled();
    });

    it("returns 500 (no stack trace) when scoring throws", async () => {
      scoreInterviewMock.mockRejectedValue(new Error("db exploded at /secret/path"));
      const res = await call("log_interview", { userId: "aisha", roleId: "ml-engineer", transcript: "hi", durationSec: 60 });
      expect(res.status).toBe(500);
      expect(await res.text()).not.toContain("/secret/path");
    });
  });
});
