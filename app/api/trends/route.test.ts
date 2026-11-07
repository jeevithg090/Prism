import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const call = async (qs = "") => (await GET(new Request(`http://localhost/api/trends${qs}`))).json();

beforeEach(() => vi.stubEnv("DEMO_MODE", "true"));
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/trends", () => {
  it("returns exactly one series for one skill", async () => {
    const body = await call("?skills=docker");
    expect(body.data).toHaveLength(1);
    expect(body.data[0].skillId).toBe("docker");
  });

  it("returns every series without a filter", async () => {
    const body = await call();
    expect(body.data.length).toBeGreaterThanOrEqual(12);
  });
});
