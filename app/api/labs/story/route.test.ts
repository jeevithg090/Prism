import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/store", async () => (await import("@/tests/seededStore")).seededStoreModule());
vi.mock("@/lib/llm", () => ({
  llmJSON: vi.fn(async () => { throw new Error("no_key"); }),
  llmText: vi.fn(async () => { throw new Error("no_key"); }),
  embed: vi.fn(async (t: string[]) => t.map(() => [1, 0])),
  cosine: vi.fn(() => 0),
  LLMError: class extends Error {},
}));
const jar = vi.hoisted(() => ({ uid: "aisha" as string | undefined }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (jar.uid ? { value: jar.uid } : undefined) }) }));

import { POST as story } from "./route";
import { POST as remember } from "./remember/route";
import { listMemory } from "@/lib/agents/coach/memory";
import { testStore } from "@/tests/seededStore";

const post = (url: string, body?: unknown, raw?: string) =>
  new Request(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });

beforeAll(() => { process.env.DEMO_MODE = "true"; });
afterAll(() => { delete process.env.DEMO_MODE; });
beforeEach(() => { testStore().reset(); jar.uid = "aisha"; });

describe("POST /api/labs/story", () => {
  it("returns the grounded story envelope for Aisha with an empty body", async () => {
    const res = await story(post("/api/labs/story"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.beats).toHaveLength(10);
    expect(body.data.grounding.removed).toBe(0);
    expect(body.data.runId).toMatch(/^run_/);
  });

  it("tells another seeded student's story", async () => {
    const body = await (await story(post("/api/labs/story", { studentId: "priya" }))).json();
    expect(body.data.subject.userId).toBe("priya");
  });

  it("400s bad JSON, unsafe ids and unknown fields", async () => {
    expect((await story(post("/api/labs/story", undefined, "{nope"))).status).toBe(400);
    expect((await story(post("/api/labs/story", { studentId: "../etc/passwd" }))).status).toBe(400);
    expect((await story(post("/api/labs/story", { studentId: "aisha", sendTo: "everyone" }))).status).toBe(400);
  });

  it("404s an unknown student with the envelope", async () => {
    const res = await story(post("/api/labs/story", { studentId: "nobody" }));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
  });
});

describe("POST /api/labs/story/remember (human checkpoint → Coach memory)", () => {
  it("writes nothing without an explicit confirm: true", async () => {
    expect((await remember(post("/api/labs/story/remember", { confirm: false, beatsSeen: 10 }))).status).toBe(400);
    expect((await remember(post("/api/labs/story/remember", { beatsSeen: 10 }))).status).toBe(400);
    expect(await listMemory("aisha")).toEqual([]);
  });

  it("saves one visible preference note for the signed-in student (cookie, never the body), idempotently", async () => {
    jar.uid = "tom";
    const res = await remember(post("/api/labs/story/remember", { confirm: true, beatsSeen: 10 }));
    expect(res.status).toBe(201);
    const note = (await res.json()).data;
    expect(note).toMatchObject({ userId: "tom", kind: "preference", source: "story mode" });
    expect(note.text).toContain("Story Mode (10 beats)");
    const again = (await (await remember(post("/api/labs/story/remember", { confirm: true, beatsSeen: 10 }))).json()).data;
    expect(again.id).toBe(note.id);
    expect(await listMemory("tom")).toHaveLength(1);
    expect(await listMemory("aisha")).toEqual([]);
  });

  it("rejects a userId smuggled into the body", async () => {
    expect((await remember(post("/api/labs/story/remember", { confirm: true, beatsSeen: 3, userId: "priya" }))).status).toBe(400);
  });
});
