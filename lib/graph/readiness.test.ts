import { describe, expect, it } from "vitest";
import type { BridgeNode } from "@/lib/types";
import { computeReadiness, projectedReadiness, readinessRaw, shiftReadiness } from "./readiness";

const node = (skillId: string, status: BridgeNode["status"], demand: number): BridgeNode => ({
  skillId, name: skillId, category: "practice", status, demand, level: 0, evidenceIds: [], moduleCodes: [],
});

describe("readiness (contract formula)", () => {
  it("weights proven 1.0, degree-done 0.7, degree-upcoming 0.4 and gap 0 by demand", () => {
    expect(computeReadiness([node("a", "proven", 0.5), node("b", "degree-done", 0.3), node("c", "gap", 0.2)])).toBe(0.71);
    expect(computeReadiness([node("a", "degree-upcoming", 1)])).toBe(0.4);
  });
  it("counts planned skills as proven for the projection", () => {
    const nodes = [node("a", "proven", 0.5), node("b", "degree-done", 0.3), node("c", "gap", 0.2)];
    expect(projectedReadiness(nodes, ["c"], [])).toBe(0.91);
    expect(projectedReadiness([node("s", "degree-upcoming", 1)], [], ["s"])).toBe(0.7);
  });
  it("ignores skills that no ad asks for, and returns 0 with no role skills", () => {
    expect(computeReadiness([node("a", "proven", 0.5), node("z", "gap", 0)])).toBe(1);
    expect(computeReadiness([node("z", "proven", 0)])).toBe(0);
  });
  it("shifts a stored readiness by the formula's change", () => {
    const before = [node("docker", "gap", 0.41), node("python", "proven", 0.59)];
    const after = [node("docker", "proven", 0.41), node("python", "proven", 0.59)];
    expect(readinessRaw(after) - readinessRaw(before)).toBeCloseTo(0.41);
    expect(shiftReadiness(0.38, before, after)).toBe(0.79);
    expect(shiftReadiness(0.9, before, after)).toBe(1);
  });
});
