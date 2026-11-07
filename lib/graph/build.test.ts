import { describe, expect, it } from "vitest";
import { buildBridgeMap } from "@/lib/graph/build";
import profileFixture from "@/data/fixtures/profile.aisha.json";
import programmeFixture from "@/data/fixtures/programme.uom-bsc-cs.json";
import marketFixture from "@/data/fixtures/market.ml-engineer.json";
import evidenceFixture from "@/data/fixtures/evidence.aisha.json";
import trendsFixture from "@/data/fixtures/trends.json";
import type { EvidenceItem, Profile, Programme, RoleDemand, TrendSeries } from "@/lib/types";

describe("buildBridgeMap", () => {
  it("keeps evidence precedence, connects existing prerequisites, and computes readiness", () => {
    const map = buildBridgeMap({
      profile: profileFixture as Profile, programme: programmeFixture as Programme,
      roleDemand: marketFixture as RoleDemand, evidence: evidenceFixture as EvidenceItem[],
      trends: trendsFixture as TrendSeries[], now: new Date("2026-11-07T12:00:00Z"),
    });
    const ids = new Set(map.nodes.map((node) => node.skillId));
    const python = map.nodes.find((node) => node.skillId === "python");
    expect(python?.status).toBe("proven");
    expect(map.nodes.some((node) => node.status === "degree-upcoming")).toBe(true);
    expect(map.edges.every((edge) => ids.has(edge.from) && ids.has(edge.to))).toBe(true);
    expect(map.readinessNow).toBeGreaterThanOrEqual(0);
    expect(map.readinessProjected).toBeGreaterThanOrEqual(map.readinessNow);
  });
});
