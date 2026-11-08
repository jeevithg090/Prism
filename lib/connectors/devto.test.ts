// Colocated unit tests for the DEV.to connector. All HTTP is mocked: no real network.
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

import { TAG_TO_SKILL, articlesToEvidence, syncDevtoEvidence } from "./devto";

const USER_ID = "test-user";
const HANDLE = "dev-writer";
let runNo = 0;
const RUN_ID = () => `run_dev_${++runNo}`;

// Shape captured from the live API (dev.to/api/articles, 8 Nov 2026); the input is deliberately out of order.
const ARTICLES = [
  {
    type_of: "article", id: 101, title: "Cool TypeScript patterns", description: "Types help.",
    url: "https://dev.to/dev-writer/typescript-patterns", published_at: "2026-10-01T09:00:00Z",
    tag_list: ["typescript", "webdev"], tags: "typescript, webdev",
  },
  {
    type_of: "article", id: 103, title: "Getting started with PyTorch", description: "First tensors.",
    url: "https://dev.to/dev-writer/getting-started-with-pytorch", published_at: "2026-11-05T10:00:00Z",
    tag_list: ["pytorch", "machinelearning", "deep-learning"], tags: "pytorch, machinelearning, deep-learning",
  },
  {
    type_of: "article", id: 102, title: "CSS grid tips", description: "Grid beats flex, sometimes.",
    url: "https://dev.to/dev-writer/css-grid-tips", published_at: "2026-09-20T10:00:00Z", published_timestamp: "2026-09-20T10:00:00Z",
    tag_list: ["css", "beginners"], tags: "css, beginners",
  },
];

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const routeFetch = (articles: { body: unknown; status?: number }) =>
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/api/articles")) return respond(articles.body, articles.status ?? 200);
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

describe("articlesToEvidence (pure mapper)", () => {
  it("maps only taxonomy tags, one item per skill, sourced from the newest article with that tag", () => {
    const items = articlesToEvidence(USER_ID, HANDLE, ARTICLES);
    // Newest article first (PyTorch, 5 Nov) → its tags come first, whatever order the API response arrived in.
    expect(items.map((e) => e.skillId)).toEqual(["pytorch", "machine-learning", "deep-learning", "typescript", "html-css"]);
    const byId = new Map(items.map((e) => [e.skillId, e]));
    expect(byId.get("machine-learning")?.id).toBe(`ev_${USER_ID}_machine-learning_devto`);
    expect(byId.get("machine-learning")?.url).toBe("https://dev.to/dev-writer/getting-started-with-pytorch");
    expect(byId.get("typescript")?.url).toBe("https://dev.to/dev-writer/typescript-patterns");
    for (const e of items) {
      expect(e.level).toBe(1);
      expect(e.confidence).toBe(0.5);
      expect(e.source).toBe("devto");
      expect(new Date(e.createdAt).toISOString()).toBe(e.createdAt);
      expect(EvidenceItemZ.safeParse(e).success).toBe(true);
    }
  });

  it("writes one plain-English sentence with the article count and the newest title", () => {
    const items = articlesToEvidence(USER_ID, HANDLE, ARTICLES);
    expect(items[0].quote).toBe('Wrote 3 DEV articles · latest "Getting started with PyTorch"');
    expect(new Set(items.map((e) => e.quote)).size).toBe(1);
  });

  it("nothing to claim for zero articles or articles with no mappable tag", () => {
    expect(articlesToEvidence(USER_ID, HANDLE, [])).toEqual([]);
    expect(articlesToEvidence(USER_ID, HANDLE, [{ title: "Why I mentor juniors", tag_list: ["beginners", "career", "motivation"] }])).toEqual([]);
  });

  it("a missing url falls back to the profile URL", () => {
    const items = articlesToEvidence(USER_ID, HANDLE, [{ title: "Investigating it", tag_list: ["machinelearning"] }]);
    expect(items).toHaveLength(1);
    expect(items[0].skillId).toBe("machine-learning");
    expect(items[0].url).toBe(`https://dev.to/${HANDLE}`);
  });

  it("accepts tags as a comma string fallback and truncates the title in the quote", () => {
    const items = articlesToEvidence(USER_ID, HANDLE, [{ title: "y".repeat(200), tags: "python, webdev" }]);
    expect(items).toHaveLength(1);
    expect(items[0].skillId).toBe("python");
    expect(items[0].quote).toBe(`Wrote 1 DEV article · latest "${"y".repeat(80)}"`);
  });

  it("maps the verified subset of DEV.to tag names", () => {
    expect(TAG_TO_SKILL.machinelearning).toBe("machine-learning");
    expect(TAG_TO_SKILL.deeplearning).toBe("deep-learning");
    expect(TAG_TO_SKILL.sklearn).toBe("scikit-learn");
    expect(TAG_TO_SKILL.node).toBe("nodejs");
    expect(TAG_TO_SKILL.security).toBe("security-basics");
    // Broad community tags are skipped entirely: the taxonomy has to stay honest about what writing proves.
    expect("webdev" in TAG_TO_SKILL).toBe(false);
    expect("beginners" in TAG_TO_SKILL).toBe(false);
  });
});

describe("syncDevtoEvidence", () => {
  it("fetches the articles, upserts items and streams started → progress → done", async () => {
    const prior = await seedPriorEvidence();
    const spy = routeFetch({ body: ARTICLES });
    const runId = RUN_ID();
    const out = await syncDevtoEvidence({ userId: USER_ID, handle: HANDLE, runId });

    expect(spy.mock.calls.map((c) => String(c[0]))).toEqual([`https://dev.to/api/articles?username=${HANDLE}&per_page=30`]);
    expect(out.map((e) => e.id)).toEqual([
      prior.id,
      `ev_${USER_ID}_pytorch_devto`, `ev_${USER_ID}_machine-learning_devto`, `ev_${USER_ID}_deep-learning_devto`,
      `ev_${USER_ID}_typescript_devto`, `ev_${USER_ID}_html-css_devto`,
    ]);
    expect(out.at(-2)?.level).toBe(1);
    expect(out.at(-2)?.confidence).toBe(0.5);
    expect(out.at(-2)?.url).toBe("https://dev.to/dev-writer/typescript-patterns");

    const events = getRunEvents(runId);
    expect(events.map((e) => e.status)).toEqual(["started", "progress", "done"]);
    expect(events.every((e) => e.agent === "evidence")).toBe(true);
    expect(events[0].message).toBe(`Evidence Agent: reading DEV for @${HANDLE}`);
    expect(events[1].message).toBe("read 3 articles · 5 of 7 tags map to your skills");
    expect(events[1].data).toMatchObject({ articles: 3, tags: 7, mappable: 5 });
    expect(events[2].message).toBe("found 5 skills in 3 DEV articles");
  });

  it("an account with zero articles stores nothing and finishes cleanly", async () => {
    const prior = await seedPriorEvidence();
    routeFetch({ body: [] });
    const runId = RUN_ID();
    const out = await syncDevtoEvidence({ userId: USER_ID, handle: HANDLE, runId });
    expect(out).toEqual([prior]);
    const events = getRunEvents(runId);
    expect(events.map((e) => e.status)).toEqual(["started", "progress", "done"]);
    expect(events[2].message).toBe("found 0 skills in 0 DEV articles");
  });

  it("articles whose tags are all outside the taxonomy finish cleanly claiming nothing", async () => {
    await seedPriorEvidence();
    routeFetch({ body: [
      { id: 1, title: "Why I mentor juniors", url: "https://dev.to/dev-writer/mentorship", published_at: "2026-10-10T00:00:00Z", tag_list: ["beginners", "career", "motivation"] },
    ] });
    const runId = RUN_ID();
    const out = await syncDevtoEvidence({ userId: USER_ID, handle: HANDLE, runId });
    expect(out.map((e) => e.source)).toEqual(["github"]);
    expect(getRunEvents(runId).at(-1)?.message).toBe("found 0 skills in 1 DEV article");
  });

  it("degrades with a kind error event for an unknown user (404) and never rethrows", async () => {
    const prior = await seedPriorEvidence();
    routeFetch({ body: { error: "not_found", status: 404 }, status: 404 });
    const runId = RUN_ID();
    const out = await syncDevtoEvidence({ userId: USER_ID, handle: HANDLE, runId });
    expect(out).toEqual([prior]);
    const events = getRunEvents(runId);
    expect(events.at(-1)?.status).toBe("error");
    expect(events.at(-1)?.agent).toBe("evidence");
    expect(events.at(-1)?.message).toBe("DEV wasn't available just now: keeping the evidence we already have");
    expect(String(events.at(-1)?.data?.reason)).toContain("404");
  });

  it("degrades on a 5xx, a non-array payload or a dead network, and never rethrows", async () => {
    await seedPriorEvidence();
    const runId = RUN_ID();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 503 }));
    await expect(syncDevtoEvidence({ userId: USER_ID, handle: HANDLE, runId })).resolves.toBeDefined();
    expect(getRunEvents(runId).at(-1)?.status).toBe("error");

    const runId2 = RUN_ID();
    routeFetch({ body: { error: "boom" } });
    await expect(syncDevtoEvidence({ userId: USER_ID, handle: HANDLE, runId: runId2 })).resolves.toBeDefined();
    expect(getRunEvents(runId2).at(-1)?.status).toBe("error");

    const runId3 = RUN_ID();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(syncDevtoEvidence({ userId: USER_ID, handle: HANDLE, runId: runId3 })).resolves.toBeDefined();
    expect(getRunEvents(runId3).at(-1)?.status).toBe("error");
  });
});
