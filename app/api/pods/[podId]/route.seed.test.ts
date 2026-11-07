// P5 PR1: the pod-detail stub serves the fixture by id and 404s otherwise.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/store", () => ({
  getStore: () => ({ get: async () => null, list: async () => [], upsert: async (_c: string, _i: string, d: unknown) => d, remove: async () => {} }),
}));

import { GET } from "./route";

const call = (podId: string) => GET(new Request(`http://localhost/api/pods/${podId}`), { params: Promise.resolve({ podId }) });

describe("GET /api/pods/[podId] (stub)", () => {
  it("returns the demo pod for pod_demo01 (DEMO_MODE)", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const res = await call("pod_demo01");
    vi.unstubAllEnvs();
    expect(res.status).toBe(200);
    expect((await res.json()).data.name).toBe("Pod Aurora");
  });

  it("returns 404 for an unknown pod", async () => {
    const res = await call("pod_nope");
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
  });
});
