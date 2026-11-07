import { describe, expect, it } from "vitest";
import { readiness, projectedReadiness } from "@/lib/graph/readiness";
import type { BridgeNode } from "@/lib/types";

const node = (skillId: string, demand: number, status: BridgeNode["status"]): BridgeNode => ({
  skillId, name: skillId, category: "practice", status, demand, level: 0, evidenceIds: [], moduleCodes: [],
});

describe("readiness scoring", () => {
  it("weights role skills by demand and projects planned skills", () => {
    const nodes = [node("a", 0.5, "proven"), node("b", 0.3, "degree-done"), node("c", 0.2, "gap"), node("other", 0, "gap")];
    expect(readiness(nodes)).toBe(0.71);
    expect(projectedReadiness(nodes, ["c"], [])).toBe(0.91);
    expect(readiness([node("other", 0, "proven")])).toBe(0);
  });
});
