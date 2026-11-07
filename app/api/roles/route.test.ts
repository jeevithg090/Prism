import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/roles", () => {
  it("returns the 3 roles", async () => {
    const json = await (await GET()).json();
    expect(json).toEqual({ ok: true, data: [{ id: "ml-engineer", name: "ML engineer" }, { id: "software-engineer", name: "Software engineer" }, { id: "data-analyst", name: "Data analyst" }] });
  });
});
