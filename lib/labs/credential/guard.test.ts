// The consent guardrail runs before the first write: if a link would reveal a skill the student didn't choose,
// the run fails and nothing is left behind (no credential, no public link, no Coach note).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mapFixture from "@/data/fixtures/bridgemap.aisha.ml-engineer.json";

const h = vi.hoisted(() => ({ overDisclose: false }));
vi.mock("@/lib/store", async () => (await import("@/tests/seededStore")).seededStoreModule());
vi.mock("@/lib/agents/events", () => ({ emit: vi.fn(), newRunId: () => "run_guard", subscribe: () => () => {} }));
vi.mock("@/lib/graph/build", () => ({ loadGraph: async (u: string) => (u === "aisha" ? structuredClone(mapFixture) : null) }));
vi.mock("./vc", async (importOriginal) => {
  const real = await importOriginal<typeof import("./vc")>();
  // A buggy disclosure step that reveals every leaf, whatever the student picked.
  return { ...real, discloseSkills: (leaves: Parameters<typeof real.discloseSkills>[0], ids: string[]) => real.discloseSkills(leaves, h.overDisclose ? leaves.map((l) => l.skillId) : ids) };
});

import { testStore } from "@/tests/seededStore";
import { getStore } from "@/lib/store";
import { listRuns } from "@/lib/agents/harness";
import { listMemory } from "@/lib/agents/coach/memory";
import { resetIssuerKeyCache } from "./keys";
import { CREDENTIALS, SHARES, issueCredential } from "./service";

beforeAll(() => { process.env.DEMO_MODE = "true"; });
afterAll(() => { delete process.env.DEMO_MODE; });
beforeEach(() => { testStore().reset(); resetIssuerKeyCache(); h.overDisclose = false; });

describe("disclosureMatchesConsent runs before any side effect", () => {
  it("blocks an over-revealing link and writes nothing", async () => {
    h.overDisclose = true;
    const err = await issueCredential({ userId: "aisha", skillIds: ["python"] }).catch((e: unknown) => e) as Error | undefined;
    expect(err).toBeInstanceOf(Error);
    expect(String(err?.message)).toMatch(/disclosureMatchesConsent/);
    expect(await getStore().list(SHARES)).toHaveLength(0);
    expect(await getStore().list(CREDENTIALS)).toHaveLength(0);
    expect((await listMemory("aisha")).filter((n) => n.source === "credential")).toHaveLength(0);
    const run = (await listRuns({ agent: "evidence" })).find((r) => /verifiable credential/.test(r.purpose));
    expect(run?.status).toBe("error");
    expect(run?.guardrails).toEqual([expect.objectContaining({ name: "disclosureMatchesConsent", action: "blocked" })]);
  });

  it("passes an honest link, recording the check both mid-run and on the output", async () => {
    const r = await issueCredential({ userId: "aisha", skillIds: ["python"] });
    expect(r.share.disclosures.every((d) => d.leaf.skillId === "python")).toBe(true);
    expect(await getStore().list(SHARES)).toHaveLength(1);
    const run = (await listRuns({ agent: "evidence" })).find((x) => /verifiable credential/.test(x.purpose));
    expect(run?.guardrails.filter((g) => g.name === "disclosureMatchesConsent").map((g) => g.action)).toEqual(["pass", "pass"]);
  });
});
