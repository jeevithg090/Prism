import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/skills", () => {
  it("returns the taxonomy with aliases", async () => {
    const json = await (await GET()).json();
    expect(json.ok).toBe(true);
    expect(json.data.length).toBeGreaterThanOrEqual(43);
    expect(json.data.find((s: { id: string }) => s.id === "llm-evaluation").aliases).toContain("llm evals");
  });
});
