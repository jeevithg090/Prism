import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeStore, serveDataFiles } from "@/lib/agents/matchmaker.testdata";
import type { Pod } from "@/lib/types";
import { GET as getPod } from "./[podId]/route";
import { GET as listPods } from "./route";

vi.mock("@/lib/store", async () => {
  const { fakeStore: store } = await import("@/lib/agents/matchmaker.testdata");
  return { getStore: () => store };
});

const pod = (id: string, createdAt: string, memberIds: string[]): Pod => ({
  id, name: "Pod Nova", score: 0.6, createdAt, explanations: [],
  members: memberIds.map((userId) => ({ userId, learns: ["docker"], teaches: ["python"], role: "Learns Docker · Teaches Python" })),
});

beforeEach(async () => {
  fakeStore.reset();
  serveDataFiles({});
  await fakeStore.upsert("pods", "pod_old", pod("pod_old", "2026-11-07T10:00:00Z", ["aisha", "priya", "tom"]), "aisha");
  await fakeStore.upsert("pods", "pod_new", pod("pod_new", "2026-11-07T12:00:00Z", ["aisha", "mei", "tom"]), "aisha");
  await fakeStore.upsert("pods", "pod_other", pod("pod_other", "2026-11-07T11:00:00Z", ["leo", "dev"]), "leo");
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.DEMO_MODE;
});

describe("GET /api/pods?userId=", () => {
  it("returns the pods whose members include the user, newest first", async () => {
    const res = await listPods(new Request("http://localhost/api/pods?userId=aisha"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.map((p: Pod) => p.id)).toEqual(["pod_new", "pod_old"]);
    const priya = await (await listPods(new Request("http://localhost/api/pods?userId=priya"))).json();
    expect(priya.data.map((p: Pod) => p.id)).toEqual(["pod_old"]); // membership, not the upsert owner
    const none = await (await listPods(new Request("http://localhost/api/pods?userId=zoe"))).json();
    expect(none).toEqual({ ok: true, data: [] });
  });

  it("hides the seeded demo fixture pod so the demo starts on 'Find my pod'", async () => {
    await fakeStore.upsert("pods", "pod_demo01", pod("pod_demo01", "2026-11-07T13:00:00Z", ["aisha", "priya", "tom", "mei"]), "aisha");
    const json = await (await listPods(new Request("http://localhost/api/pods?userId=aisha"))).json();
    expect(json.data.map((p: Pod) => p.id)).toEqual(["pod_new", "pod_old"]);
  });

  it("returns 400 without a userId", async () => {
    const res = await listPods(new Request("http://localhost/api/pods"));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/pods/[podId]", () => {
  const call = (podId: string) => getPod(new Request(`http://localhost/api/pods/${podId}`), { params: Promise.resolve({ podId }) });

  it("returns the pod or 404", async () => {
    const res = await call("pod_new");
    expect(res.status).toBe(200);
    expect((await res.json()).data.id).toBe("pod_new");
    const missing = await call("pod_missing");
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ ok: false, error: { code: "not_found" } });
  });

  it("serves the demo fixture in DEMO_MODE when the store has no such pod", async () => {
    process.env.DEMO_MODE = "true";
    serveDataFiles({ "data/fixtures/pod.aisha.json": pod("pod_demo01", "2026-11-07T09:00:00Z", ["aisha", "priya", "tom", "mei"]) });
    const res = await call("pod_demo01");
    expect(res.status).toBe(200);
    expect((await res.json()).data.id).toBe("pod_demo01");
  });
});
