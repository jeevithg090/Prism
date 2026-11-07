import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GET } from "./route";
import { PATCH } from "./tasks/[taskId]/route";

describe("roadmap routes", () => {
  it("GET returns aisha's seeded roadmap; 404 for nobody", async () => {
    const ok = await GET(new Request("http://x"), { params: Promise.resolve({ userId: "aisha" }) });
    expect((await ok.json()).data.weeks).toHaveLength(12);
    const no = await GET(new Request("http://x"), { params: Promise.resolve({ userId: "nobody" }) });
    expect(no.status).toBe(404);
    expect((await no.json()).ok).toBe(false);
  });
  it("PATCH toggles a task; 404 for unknown task; 400 for bad body", async () => {
    const p = (taskId: string, body: unknown) =>
      PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ userId: "aisha", taskId }) });
    expect((await (await p("t_1_0", { done: true })).json()).data.done).toBe(true);
    expect((await p("nope", { done: true })).status).toBe(404);
    expect((await p("t_1_0", { done: "yes" })).status).toBe(400);
  });
});
