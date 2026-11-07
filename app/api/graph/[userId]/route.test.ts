import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GET } from "./route";
const call = (id: string) => GET(new Request("http://x/api/graph/" + id), { params: Promise.resolve({ userId: id }) });

describe("GET /api/graph/[userId]", () => {
  it("returns the aisha fixture", async () => {
    const res = await call("aisha");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.nodes.length).toBeGreaterThanOrEqual(30);
  });
  it("404 for an unknown profile", async () => { expect((await call("nobody")).status).toBe(404); });
});
