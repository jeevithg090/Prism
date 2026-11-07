import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AISHA_MAP, fakeStore, serveDataFiles, STUDENT_SKILLS } from "@/lib/agents/matchmaker.testdata";
import { PodZ } from "@/lib/schemas/community";
import { POST } from "./route";

vi.mock("@/lib/llm", () => ({
  embed: vi.fn(async () => { throw new Error("embeddings unavailable"); }),
  llmJSON: vi.fn(async () => { throw new Error("no_key"); }),
  llmText: vi.fn(), cosine: () => 0, LLMError: class LLMError extends Error {},
}));
vi.mock("@/lib/agents/events", () => ({ emit: vi.fn(), newRunId: () => "run_route", subscribe: () => () => {} }));
vi.mock("@/lib/graph/build", () => ({ loadGraph: vi.fn(async (u: string) => (u === "aisha" ? AISHA_MAP : null)) }));
vi.mock("@/lib/store", async () => {
  const { fakeStore: store } = await import("@/lib/agents/matchmaker.testdata");
  return { getStore: () => store };
});

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/pods/match", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));

beforeEach(() => {
  fakeStore.reset();
  serveDataFiles({ "data/seed/student-skills.json": STUDENT_SKILLS });
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/pods/match", () => {
  it("returns 200 with a PodZ-valid pod (plus runId) for aisha", async () => {
    const res = await post({ userId: "aisha" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(PodZ.safeParse(json.data).success).toBe(true);
    expect(json.data.runId).toBe("run_route");
    expect(json.data.members.map((m: { userId: string }) => m.userId).sort()).toEqual(["aisha", "mei", "priya", "tom"]);
    expect(await fakeStore.get("pods", json.data.id)).toMatchObject({ id: json.data.id });
  });

  it("returns 404 not_found for an unknown user", async () => {
    const res = await post({ userId: "nobody" });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: "not_found" } });
  });

  it("returns 400 bad_request on bad input", async () => {
    for (const body of [{}, { userId: "" }, "not json"]) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ ok: false, error: { code: "bad_request" } });
    }
  });

  it("returns 500 internal when matching fails outside DEMO_MODE", async () => {
    serveDataFiles({}); // no seed → no candidates
    const res = await post({ userId: "aisha" });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: "internal" } });
  });
});
