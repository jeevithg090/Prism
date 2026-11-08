// Colocated unit tests for the Stack Overflow connector. All HTTP is mocked: no real network.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRunEvents } from "@/lib/agents/events";
import { EvidenceItemZ } from "@/lib/graph/schemas";
import type { EvidenceItem } from "@/lib/types";

const h = vi.hoisted(() => ({ docs: new Map<string, { doc: unknown; userId?: string }>() }));
vi.mock("@/lib/store", () => ({
  getStore: () => ({
    get: async (c: string, id: string) => structuredClone(h.docs.get(`${c}/${id}`)?.doc ?? null),
    list: async (c: string, f?: { userId?: string }) =>
      [...h.docs.entries()].filter(([k, r]) => k.startsWith(`${c}/`) && (!f?.userId || r.userId === f.userId)).map(([, r]) => structuredClone(r.doc)),
    upsert: async (c: string, id: string, doc: unknown, userId?: string) => {
      h.docs.set(`${c}/${id}`, { doc: structuredClone(doc), userId });
      return doc;
    },
    remove: async (c: string, id: string) => { h.docs.delete(`${c}/${id}`); },
  }),
}));

import { TAG_TO_SKILL, syncStackOverflowEvidence, tagsToEvidence } from "./stackoverflow";

const USER_ID = "test-user";
const SE_ID = "22656";
let runNo = 0;
const RUN_ID = () => `run_so_${++runNo}`;

// Shape captured from the live API (users/22656 = Jon Skeet, 8 Nov 2026).
const SE_USER = {
  user_id: 22656, display_name: "Jon Skeet", reputation: 1530453,
  badge_counts: { bronze: 9364, silver: 9325, gold: 895 },
  link: "https://stackoverflow.com/users/22656/jon-skeet",
  profile_image: "https://www.gravatar.com/avatar/6d8ebb117e8d83d74ea95fbdd0f87e13?s=256&d=identicon&r=PG",
  user_type: "registered",
};
const SE_TAGS = { items: [
  { user_id: 22656, answer_count: 19992, answer_score: 269937, tag_name: "c#" },
  { user_id: 22656, answer_count: 10585, answer_score: 159724, tag_name: "java" },
  { user_id: 22656, answer_count: 5638, answer_score: 93616, tag_name: ".net" },
  { user_id: 22656, answer_count: 3000, answer_score: 38880, tag_name: "linq" },
] };

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** Mocks fetch the way the live API behaves: GET /users/{id} then GET /users/{id}/top-tags. Unexpected URLs throw. */
const routeFetch = (user: { body: unknown; status?: number }, tags?: { body: unknown; status?: number }) =>
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/top-tags")) {
      if (!tags) throw new Error(`unexpected call ${url}`);
      return respond(tags.body, tags.status ?? 200);
    }
    if (url.includes("/users/")) return respond(user.body, user.status ?? 200);
    throw new Error(`unexpected call ${url}`);
  });

/** One item of GitHub evidence, so every test can see a re-sync keeps the evidence you already have. */
const seedPriorEvidence = async () => {
  const prior: EvidenceItem = {
    id: "ev_test-user_python_github", userId: USER_ID, skillId: "python", level: 1, confidence: 0.5,
    source: "github", url: "https://github.com/test-user/proj", createdAt: "2026-11-01T00:00:00Z",
  };
  const { getStore } = await import("@/lib/store");
  await getStore().upsert("evidence", prior.id, prior, USER_ID);
  return prior;
};

beforeEach(() => {
  h.docs.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("tagsToEvidence (pure mapper)", () => {
  it("maps only taxonomy tags, one item per skill, level 1, confidence 0.55, profile URL from the API", () => {
    const items = tagsToEvidence(USER_ID, SE_USER, SE_TAGS.items);
    expect(items.map((e) => e.skillId)).toEqual(["java"]); // "c#", ".net" and "linq" aren't taxonomy skill ids
    expect(items[0].id).toBe(`ev_${USER_ID}_java_stackoverflow`);
    expect(items[0].level).toBe(1);
    expect(items[0].confidence).toBe(0.55);
    expect(items[0].source).toBe("stackoverflow");
    expect(items[0].url).toBe(SE_USER.link);
    expect(items[0].quote).toBe("Stack Overflow reputation 1530453 · top tag java");
    expect(new Date(items[0].createdAt).toISOString()).toBe(items[0].createdAt);
    expect(EvidenceItemZ.safeParse(items[0]).success).toBe(true);
  });

  it("keeps the order the API scores for us and claims a skill once, however many tags hit it", () => {
    const items = tagsToEvidence(USER_ID, SE_USER, [
      { tag_name: "html" }, { tag_name: "css" }, { tag_name: "javascript" }, { tag_name: "unit-testing" }, { tag_name: "javascript" },
    ]);
    expect(items.map((e) => e.skillId)).toEqual(["html-css", "javascript", "testing"]);
    expect(items.every((e) => e.source === "stackoverflow" && e.url === SE_USER.link)).toBe(true);
  });

  it("writes one plain-English sentence with the reputation and the top tag", () => {
    expect(tagsToEvidence(USER_ID, SE_USER, [{ tag_name: "java" }])[0]?.quote).toBe("Stack Overflow reputation 1530453 · top tag java");
  });

  it("no tags, no mappable tag or an empty tag name → nothing to claim", () => {
    expect(tagsToEvidence(USER_ID, SE_USER, [])).toEqual([]);
    expect(tagsToEvidence(USER_ID, SE_USER, [{ tag_name: ".net" }, { tag_name: "linq" }])).toEqual([]);
    expect(tagsToEvidence(USER_ID, SE_USER, [{ tag_name: "" }])).toEqual([]);
  });

  it("maps the verified subset of Stack Overflow tag names", () => {
    expect(TAG_TO_SKILL.python).toBe("python");
    expect(TAG_TO_SKILL["node.js"]).toBe("nodejs");
    expect(TAG_TO_SKILL.rest).toBe("rest-apis");
    expect(TAG_TO_SKILL["amazon-web-services"]).toBe("aws");
    expect(TAG_TO_SKILL.security).toBe("security-basics");
    expect(TAG_TO_SKILL["unit-testing"]).toBe("testing");
    expect(TAG_TO_SKILL.mysql).toBe("sql");
    expect("git" in TAG_TO_SKILL && "github" in TAG_TO_SKILL).toBe(true);
  });
});

describe("syncStackOverflowEvidence", () => {
  it("fetches profile + top tags, upserts items and streams started → progress → done", async () => {
    const prior = await seedPriorEvidence();
    const spy = routeFetch({ body: { items: [SE_USER] } }, { body: SE_TAGS });
    const runId = RUN_ID();
    const out = await syncStackOverflowEvidence({ userId: USER_ID, handle: SE_ID, runId });

    expect(spy.mock.calls.map((c) => String(c[0]))).toEqual([
      `https://api.stackexchange.com/2.3/users/${SE_ID}?site=stackoverflow`,
      `https://api.stackexchange.com/2.3/users/${SE_ID}/top-tags?site=stackoverflow`,
    ]);
    expect(out.map((e) => e.id)).toEqual([prior.id, `ev_${USER_ID}_java_stackoverflow`]);
    const java = out.at(-1)!;
    expect(java.skillId).toBe("java");
    expect(java.level).toBe(1);
    expect(java.confidence).toBe(0.55);
    expect(java.url).toBe(SE_USER.link);
    expect(java.quote).toBe("Stack Overflow reputation 1530453 · top tag java");

    const events = getRunEvents(runId);
    expect(events.map((e) => e.status)).toEqual(["started", "progress", "done"]);
    expect(events.every((e) => e.agent === "evidence")).toBe(true);
    expect(events[0].message).toBe(`Evidence Agent: reading Stack Overflow for user ${SE_ID}`);
    expect(events[1].message).toBe("reputation 1530453 · 4 top tags");
    expect(events[1].data).toMatchObject({ reputation: 1530453, tags: 4, badges: SE_USER.badge_counts });
    expect(events[2].message).toBe("found 1 skills from your answers and top tags");
  });

  it("keeps going when top-tags fails (the profile loads; no readable tags claim nothing)", async () => {
    const prior = await seedPriorEvidence();
    routeFetch({ body: { items: [SE_USER] } }, { body: "nope", status: 400 });
    const runId = RUN_ID();
    const out = await syncStackOverflowEvidence({ userId: USER_ID, handle: SE_ID, runId });
    expect(out).toEqual([prior]);
    const events = getRunEvents(runId);
    expect(events.map((e) => e.status)).toEqual(["started", "progress", "done"]);
    expect(events[1].message).toBe("reputation 1530453 · 0 top tags");
    expect(events.at(-1)?.message).toBe("found 0 skills from your answers and top tags");
  });

  it("degrades with a kind error event for an unknown user id (empty items array)", async () => {
    const prior = await seedPriorEvidence();
    routeFetch({ body: { items: [], quota_max: 300, quota_remaining: 297 } }, { body: { items: [] } });
    const runId = RUN_ID();
    const out = await syncStackOverflowEvidence({ userId: USER_ID, handle: SE_ID, runId });
    expect(out).toEqual([prior]);
    const events = getRunEvents(runId);
    expect(events.at(-1)?.status).toBe("error");
    expect(events.at(-1)?.agent).toBe("evidence");
    expect(events.at(-1)?.message).toBe("Stack Overflow wasn't available just now: keeping the evidence we already have");
    expect(String(events.at(-1)?.data?.reason)).toContain(`No Stack Overflow user "${SE_ID}"`);
  });

  it("degrades on HTTP error responses or a dead network, and never rethrows", async () => {
    await seedPriorEvidence();
    const runId = RUN_ID();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("bad gateway", { status: 502 }));
    await expect(syncStackOverflowEvidence({ userId: USER_ID, handle: SE_ID, runId })).resolves.toBeDefined();
    expect(getRunEvents(runId).at(-1)?.status).toBe("error");

    const runId2 = RUN_ID();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(syncStackOverflowEvidence({ userId: USER_ID, handle: SE_ID, runId: runId2 })).resolves.toBeDefined();
    expect(getRunEvents(runId2).at(-1)?.status).toBe("error");
  });

  it("a profile with no mappable top tags finishes cleanly and claims nothing", async () => {
    await seedPriorEvidence();
    routeFetch({ body: { items: [SE_USER] } }, { body: { items: [
      { user_id: 22656, answer_count: 500, answer_score: 9000, tag_name: "c#" },
      { user_id: 22656, answer_count: 300, answer_score: 4000, tag_name: ".net" },
      { user_id: 22656, answer_count: 100, answer_score: 900, tag_name: "string" },
    ] } });
    const runId = RUN_ID();
    const out = await syncStackOverflowEvidence({ userId: USER_ID, handle: SE_ID, runId });
    expect(out.map((e) => e.source)).toEqual(["github"]);
    expect(getRunEvents(runId).at(-1)?.message).toBe("found 0 skills from your answers and top tags");
  });
});
