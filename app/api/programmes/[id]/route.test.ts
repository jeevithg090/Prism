import { describe, expect, it } from "vitest";
import { GET } from "./route";

const call = (id: string) => GET(new Request(`http://localhost/api/programmes/${id}`), { params: Promise.resolve({ id }) });

describe("GET /api/programmes/[id]", () => {
  it("returns the UoM programme", async () => {
    const res = await call("uom-bsc-cs");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.university).toBe("University of Manchester");
    expect(json.data.modules.length).toBeGreaterThanOrEqual(12);
  });

  it("404s an unknown programme with the envelope", async () => {
    const res = await call("nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: "not_found" } });
  });
});
