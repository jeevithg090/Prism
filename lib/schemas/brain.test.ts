import { describe, it, expect } from "vitest";
import { z } from "zod";
import { ProfileZ, EvidenceItemZ, BridgeMapZ, RoadmapZ, AgentEventZ } from "./brain";
import profile from "@/data/fixtures/profile.aisha.json";
import evidence from "@/data/fixtures/evidence.aisha.json";
import map from "@/data/fixtures/bridgemap.aisha.ml-engineer.json";
import roadmap from "@/data/fixtures/roadmap.aisha.ml-engineer.json";
import events from "@/data/fixtures/agent-events.sample.json";

describe("fixtures match their schemas", () => {
  it("validate", () => {
    expect(ProfileZ.parse(profile).id).toBe("aisha");
    expect(z.array(EvidenceItemZ).parse(evidence).length).toBeGreaterThanOrEqual(8);
    BridgeMapZ.parse(map); RoadmapZ.parse(roadmap);
    expect(z.array(AgentEventZ).parse(events).length).toBeGreaterThanOrEqual(20);
  });
  it("bridgemap has ≥30 nodes, all 4 statuses, and valid edges", () => {
    const ids = new Set(map.nodes.map((n) => n.skillId));
    expect(map.nodes.length).toBeGreaterThanOrEqual(30);
    expect(new Set(map.nodes.map((n) => n.status))).toEqual(new Set(["proven", "degree-done", "degree-upcoming", "gap"]));
    for (const e of map.edges) { expect(ids.has(e.from)).toBe(true); expect(ids.has(e.to)).toBe(true); }
    expect([map.readinessNow, map.readinessProjected]).toEqual([0.38, 0.84]);
  });
  it("roadmap has 12 weeks, an exam week, ≥2 skipped, and known focus skills", () => {
    const ids = new Set(map.nodes.map((n) => n.skillId));
    expect(roadmap.weeks).toHaveLength(12);
    expect(roadmap.weeks.some((w) => w.isExamWeek)).toBe(true);
    expect(roadmap.skipped.length).toBeGreaterThanOrEqual(2);
    for (const w of roadmap.weeks) {
      expect(ids.has(w.focusSkillId)).toBe(true);
      expect(w.tasks.reduce((a, t) => a + t.hours, 0)).toBe(w.isExamWeek ? 4 : 8);
    }
    expect(roadmap.weeks[0].receipt.demandPct).toBe(41);
  });
});
