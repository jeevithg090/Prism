import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agents/events", () => ({ emit: vi.fn(), newRunId: () => "run_r", subscribe: () => () => {} }));
vi.mock("@/lib/store", async () => {
  const { fakeStore: store } = await import("@/lib/agents/matchmaker.testdata");
  return { getStore: () => store };
});

import { fakeStore } from "@/lib/agents/matchmaker.testdata";
import { runAgent } from "@/lib/agents/harness";
import { SAMPLE_RUNS } from "@/lib/agents/ledger-sample";
import { GET } from "./route";

const get = (qs = "") => GET(new Request(`http://localhost/api/agents/runs${qs}`));

beforeEach(() => fakeStore.reset([]));

describe("GET /api/agents/runs", () => {
  it("returns ledger entries newest first, filtered by runId and agent", async () => {
    await runAgent({ agent: "matchmaker", runId: "run_1", purpose: "Form a pod", run: async () => 1 });
    await new Promise((r) => setTimeout(r, 5));
    await runAgent({ agent: "guides", runId: "run_1", purpose: "Find guides", run: async () => 2 });
    await new Promise((r) => setTimeout(r, 5));
    await runAgent({ agent: "matchmaker", runId: "run_2", purpose: "Form a pod", run: async () => 3 });

    const all = await (await get()).json();
    expect(all.ok).toBe(true);
    expect(all.data.map((e: { agent: string; runId: string }) => `${e.runId}:${e.agent}`)).toEqual(["run_2:matchmaker", "run_1:guides", "run_1:matchmaker"]);
    expect(all.data[0]).toMatchObject({ status: "ok", usedFallback: false, purpose: "Form a pod", guardrails: [] });

    const byRun = await (await get("?runId=run_1")).json();
    expect(byRun.data).toHaveLength(2);
    const byAgent = await (await get("?agent=matchmaker&limit=1")).json();
    expect(byAgent.data.map((e: { id: string }) => e.id)).toEqual([expect.stringMatching(/^run_2:matchmaker:\d+$/)]);
  });

  it("returns [] when nothing has run, and sample entries with ?demo=1", async () => {
    expect((await (await get()).json()).data).toEqual([]);
    const demo = await (await get("?demo=1")).json();
    expect(demo.data).toHaveLength(SAMPLE_RUNS.length);
  });

  it("returns 400 bad_request for an unknown agent or a bad limit", async () => {
    for (const qs of ["?agent=hal9000", "?limit=0", "?limit=abc", "?limit=500"]) {
      const res = await get(qs);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ ok: false, error: { code: "bad_request" } });
    }
  });
});
