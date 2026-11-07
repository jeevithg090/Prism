import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { BridgeMapZ, EvidenceItemZ, RoadmapZ } from "./schemas";

const read = (rel: string) => JSON.parse(fs.readFileSync(rel, "utf8"));

describe("map and roadmap fixtures", () => {
  const map = BridgeMapZ.parse(read("data/fixtures/bridgemap.aisha.ml-engineer.json"));
  const roadmap = RoadmapZ.parse(read("data/fixtures/roadmap.aisha.ml-engineer.json"));
  const evidence = EvidenceItemZ.array().parse(read("data/fixtures/evidence.aisha.json"));

  it("roadmap: 12 weeks from 9 Nov 2026, Docker first with the pod-repo proof, readiness 0.38 → 0.84", () => {
    expect(roadmap.weeks).toHaveLength(12);
    expect(roadmap.weeks[0]).toMatchObject({ startDate: "2026-11-09", focusSkillId: "docker", proof: "Merge a PR that adds a Dockerfile to your pod repo (VisionAid)" });
    expect(roadmap.weeks[0].receipt).toMatchObject({ demandPct: 41, coveredByDegree: "no" });
    expect([roadmap.readinessNow, roadmap.readinessProjected]).toEqual([0.38, 0.84]);
  });
  it("roadmap: ≥ 1 exam week with fewer hours, ≥ 2 skipped items, every focus on the map, hours add up", () => {
    const hours = (w: (typeof roadmap.weeks)[number]) => w.tasks.reduce((s, t) => s + t.hours, 0);
    const exam = roadmap.weeks.filter((w) => w.isExamWeek);
    expect(exam.length).toBeGreaterThanOrEqual(1);
    for (const w of exam) expect(hours(w)).toBe(4);
    expect(roadmap.skipped.length).toBeGreaterThanOrEqual(2);
    expect(roadmap.skipped[0]).toMatchObject({ skillId: "statistics", moduleCode: "COMP1xxx4" });
    expect(roadmap.skipped[0].message).toContain("Semester 2 maths module");
    const ids = new Set(map.nodes.map((n) => n.skillId));
    for (const w of roadmap.weeks) {
      expect(ids.has(w.focusSkillId)).toBe(true);
      expect(w.proof).toContain("your pod repo (VisionAid)");
      expect(w.tasks.every((t) => t.free)).toBe(true);
    }
    expect(new Set(roadmap.weeks.flatMap((w) => w.tasks.map((t) => t.id))).size).toBe(roadmap.weeks.reduce((s, w) => s + w.tasks.length, 0));
  });
  it("evidence: Aisha's GitHub proof for python, git, html-css and javascript, ids matching the map", () => {
    expect(evidence.map((e) => e.skillId).sort()).toEqual(["git", "html-css", "javascript", "python"]);
    expect(evidence.every((e) => e.userId === "aisha" && e.source === "github")).toBe(true);
    const mapIds = new Set(map.nodes.flatMap((n) => n.evidenceIds));
    for (const id of mapIds) expect(evidence.some((e) => e.id === id)).toBe(true);
  });
});
