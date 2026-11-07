import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/agents/orchestrator", () => ({ runOnboarding: vi.fn(async () => ({ runId: "run_x" })) }));
import { POST } from "./route";
const post = (body: unknown) => POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/onboard/run", () => {
  it("returns a runId for a known user", async () => {
    const res = await post({ userId: "aisha" });
    expect(res.status).toBe(202);
    expect((await res.json()).data.runId).toBe("run_x");
  });
  it("404 for an unknown user, 400 for a missing userId", async () => {
    expect((await post({ userId: "nobody" })).status).toBe(404);
    expect((await post({})).status).toBe(400);
  });
});
