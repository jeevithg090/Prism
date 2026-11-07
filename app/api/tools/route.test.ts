import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/store", async () => (await import("@/tests/seededStore")).seededStoreModule());

import { EXTRA_TOOLS } from "@/lib/agents/tools/extensions";
import { GET } from "./route";

describe("GET /api/tools", () => {
  it("returns the manifest: the 13 canonical tools plus the Labs extensions, with JSON Schema, effect, approval and agent", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const { ok, data } = await res.json();
    expect(ok).toBe(true);
    expect(data).toHaveLength(13 + EXTRA_TOOLS.length);
    for (const t of data) {
      expect(Object.keys(t).sort()).toEqual(["agent", "description", "effect", "inputSchema", "name", "requiresApproval", "title"]);
      expect(t.inputSchema.type).toBe("object");
      expect(t.inputSchema.$schema).toBeUndefined();
    }
    const review = data.find((t: { name: string }) => t.name === "review_my_pr");
    expect(review).toMatchObject({ effect: "external", requiresApproval: true, agent: "techlead" });
    expect(review.inputSchema.properties.prNumber).toMatchObject({ type: "integer" });
    // defaulted fields stay optional in the input schema
    const bridge = data.find((t: { name: string }) => t.name === "get_bridge_map");
    expect(bridge.inputSchema.required ?? []).not.toContain("limit");
  });
});
