import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getStore } from "@/lib/store";
import { GET } from "./route";

const BASE = "http://localhost/api/interview/config";

const seed = (c: string, id: string, doc: object, userId: string) => getStore().upsert(c, id, doc as { id?: string }, userId);

beforeAll(async () => {
  await seed("profiles", "zara", { id: "zara", name: "Zara Khan", year: 2, dna: { targetRoles: ["ml-engineer"] } }, "zara");
  await seed(
    "maps",
    "zara:ml-engineer",
    {
      userId: "zara",
      roleId: "ml-engineer",
      edges: [],
      nodes: [
        { skillId: "python", name: "Python", status: "proven", demand: 0.6, level: 2, category: "language", evidenceIds: [], moduleCodes: [] },
        { skillId: "pytorch", name: "PyTorch", status: "gap", demand: 0.52, level: 0, category: "ml-ai", evidenceIds: [], moduleCodes: [] },
        { skillId: "docker", name: "Docker", status: "gap", demand: 0.41, level: 0, category: "cloud-devops", evidenceIds: [], moduleCodes: [] },
      ],
    },
    "zara",
  );
  // Week 1 is finished and in the past, so the current focus is week 2.
  await seed(
    "roadmaps",
    "zara",
    {
      userId: "zara",
      roleId: "ml-engineer",
      weeks: [
        { week: 1, startDate: "2020-01-06", focusSkillId: "python", tasks: [{ id: "t_1_0", done: true }] },
        { week: 2, startDate: "2020-01-13", focusSkillId: "docker", tasks: [{ id: "t_2_0", done: false }] },
      ],
    },
    "zara",
  );
  await seed("pods", "pod_1", { id: "pod_1", members: [{ userId: "zara" }], project: { title: "VisionAid: accessible image captioning API" } }, "zara");
});

beforeEach(() => {
  for (const k of ["ELEVENLABS_API_KEY", "ELEVENLABS_INTERVIEW_AGENT_ID", "ELEVENLABS_ONBOARD_AGENT_ID", "DEMO_MODE"]) vi.stubEnv(k, "");
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/interview/config", () => {
  it("builds project_title from the pod and week_focus from the roadmap, in text mode without ElevenLabs", async () => {
    const res = await GET(new Request(`${BASE}?userId=zara&roleId=ml-engineer`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.agentId).toBe("text-mode");
    expect(body.data.signedUrl).toBeUndefined();
    expect(body.data.dynamicVariables).toMatchObject({
      name: "Zara",
      year: "2",
      role: "ML engineer",
      top_skills: "Python",
      gaps: "PyTorch, Docker",
      project_title: "VisionAid: accessible image captioning API",
      week_focus: "Docker",
    });
    for (const v of Object.values(body.data.dynamicVariables)) expect(typeof v).toBe("string");
  });

  it("reads the user from the ks_uid cookie when the query has none", async () => {
    const res = await GET(new Request(BASE, { headers: { cookie: "theme=dark; ks_uid=zara" } }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.dynamicVariables.name).toBe("Zara");
  });

  it("returns 400 without a user id", async () => {
    const res = await GET(new Request(BASE));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: "bad_request" } });
  });

  it("returns 400 for an unknown agent", async () => {
    const res = await GET(new Request(`${BASE}?userId=zara&agent=sales`));
    expect(res.status).toBe(400);
  });

  it("returns 404 for a student with no profile", async () => {
    const res = await GET(new Request(`${BASE}?userId=nobody-here`));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: "not_found" } });
  });
});
