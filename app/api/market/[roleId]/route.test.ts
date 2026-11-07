import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoleDemandZ } from "@/lib/schemas/data";
import { GET } from "./route";

vi.mock("@/lib/llm", () => ({ llmJSON: vi.fn() }));

const call = (roleId: string) =>
  GET(new Request(`http://localhost/api/market/${roleId}`), { params: Promise.resolve({ roleId }) });

beforeEach(() => vi.stubEnv("DEMO_MODE", "true"));
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/market/[roleId]", () => {
  it("returns the role's demand for a known role", async () => {
    const res = await call("ml-engineer");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.roleId).toBe("ml-engineer");
    RoleDemandZ.parse(body.data);
  });

  it("returns 404 with the error envelope for an unknown role", async () => {
    const res = await call("nope");
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("not_found");
  });
});
