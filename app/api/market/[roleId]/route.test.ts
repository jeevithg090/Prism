import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { emit } = vi.hoisted(() => ({ emit: vi.fn() }));
vi.mock("@/lib/agents/events", () => ({ emit, newRunId: () => "run_test" }));
import { GET } from "./route";
import { RoleDemandZ } from "@/lib/schemas/data";

const call = (roleId: string, qs = "") => GET(new Request(`http://localhost/api/market/${roleId}${qs}`), { params: Promise.resolve({ roleId }) });

let prev: string | undefined;
beforeEach(() => { vi.clearAllMocks(); prev = process.env.DEMO_MODE; delete process.env.ADZUNA_APP_ID; delete process.env.REED_API_KEY; });
afterEach(() => { vi.restoreAllMocks(); if (prev === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = prev; });

describe("GET /api/market/[roleId]", () => {
  it("returns a zod-valid RoleDemand for a known role", async () => {
    const res = await call("ml-engineer", "?location=uk");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.roleId).toBe("ml-engineer");
    expect(RoleDemandZ.parse(json.data).adsAnalysed).toBe(214);
  });

  it("404s an unknown role and 400s a malformed one", async () => {
    const res = await call("nope");
    expect(res.status).toBe(404);
    expect((await res.json()).ok).toBe(false);
    expect((await call("NOT A ROLE")).status).toBe(400);
  });

  it("is instant in DEMO_MODE (no fetch) and emits numbers when given a runId", async () => {
    process.env.DEMO_MODE = "true";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const json = await (await call("data-analyst", "?runId=run_abc")).json();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(json.data.adsAnalysed).toBe(188);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ runId: "run_abc", agent: "market", status: "done", message: expect.stringContaining("188 Data analyst ads analysed") }));
  });
});
