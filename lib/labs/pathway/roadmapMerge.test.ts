// Shortest Path to Opportunity → Roadmap merge: valid roadmap, path first, ticks kept, degree skips recorded.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/llm", () => ({ llmJSON: vi.fn().mockRejectedValue(new Error("no_key")), llmText: vi.fn(), LLMError: class extends Error {} }));

import mapJson from "@/data/fixtures/bridgemap.aisha.ml-engineer.json";
import roadmapJson from "@/data/fixtures/roadmap.aisha.ml-engineer.json";
import programmeJson from "@/data/fixtures/programme.uom-bsc-cs.json";
import profileJson from "@/data/fixtures/profile.aisha.json";
import oppJson from "@/data/fixtures/labs/pathway.opportunities.json";
import effortJson from "@/data/fixtures/labs/pathway.effort.json";
import { CURATED_PREREQS } from "@/lib/graph/build";
import { skillMeta } from "@/lib/graph/data";
import { RoadmapZ } from "@/lib/graph/schemas";
import type { BridgeMap, Profile, Programme, Roadmap } from "@/lib/types";
import { mergePathIntoRoadmap, previewOf } from "./roadmapMerge";
import { createSolver } from "./solver";
import { EffortFileZ, OpportunityFileZ } from "./types";

const NOW = new Date("2026-11-07T09:00:00Z");
const profile = profileJson as unknown as Profile;
const roadmap = roadmapJson as unknown as Roadmap;
const opps = OpportunityFileZ.parse(oppJson).opportunities;
const solver = createSolver({
  map: mapJson as unknown as BridgeMap, profile, programme: programmeJson as unknown as Programme, roadmap,
  effort: EffortFileZ.parse(effortJson), meta: skillMeta, curated: CURATED_PREREQS, now: NOW,
});
const pathTo = (id: string) => solver.solve(opps.find((o) => o.id === id)!);

describe("mergePathIntoRoadmap", () => {
  it("puts the path first, keeps the roadmap length and stays a valid roadmap", () => {
    const { roadmap: next, changes } = mergePathIntoRoadmap({ roadmap, path: pathTo("opp-quayline-ml-intern"), profile, now: NOW });
    expect(RoadmapZ.safeParse(next).success).toBe(true);
    expect(next.version).toBe(roadmap.version + 1);
    expect(next.weeks).toHaveLength(roadmap.weeks.length);
    // Docker keeps week 1; TensorFlow (14 h at 8 h a week) gets two new weeks right after it.
    expect(next.weeks.slice(0, 3).map((w) => w.focusSkillId)).toEqual(["docker", "tensorflow", "tensorflow"]);
    expect(changes).toEqual([
      expect.objectContaining({ skillId: "docker", kind: "moved", fromWeek: 1, toWeek: 1 }),
      expect.objectContaining({ skillId: "tensorflow", kind: "added", toWeek: 2 }),
    ]);
    expect(next.weeks[2].tasks[0].title).toMatch(/^Go deeper: /);
    expect(next.weeks[1].receipt.reason).toMatch(/Pulled forward for ML Engineering Summer Intern at Quayline Health/);
    // Re-dated as consecutive Mondays from the old first week, with unique task ids.
    next.weeks.forEach((w, k) => expect(w.startDate).toBe(new Date(Date.parse("2026-11-09") + k * 7 * 86_400_000).toISOString().slice(0, 10)));
    const ids = next.weeks.flatMap((w) => w.tasks.map((t) => t.id));
    expect(new Set(ids).size).toBe(ids.length);
    // The rest follow in their old order.
    const rest = next.weeks.slice(3).map((w) => w.focusSkillId);
    const oldRest = roadmap.weeks.map((w) => w.focusSkillId).filter((s) => s !== "docker" && s !== "tensorflow");
    expect(rest).toEqual(oldRest.slice(0, rest.length));
  });

  it("keeps the ticks on a week it moves", () => {
    const ticked: Roadmap = { ...roadmap, weeks: roadmap.weeks.map((w) => (w.focusSkillId === "sql" ? { ...w, tasks: w.tasks.map((t, k) => (k === 0 ? { ...t, done: true } : t)) } : w)) };
    const path = createSolver({
      map: mapJson as unknown as BridgeMap, profile, programme: programmeJson as unknown as Programme, roadmap: ticked,
      effort: EffortFileZ.parse(effortJson), meta: skillMeta, curated: CURATED_PREREQS, now: NOW,
    }).solve(opps.find((o) => o.id === "opp-larkspur-insight")!);
    const { roadmap: next } = mergePathIntoRoadmap({ roadmap: ticked, path, profile, now: NOW });
    const sql = next.weeks.find((w) => w.focusSkillId === "sql")!;
    expect(sql.tasks[0].done).toBe(true);
    expect(next.weeks[0].focusSkillId).toBe("databases"); // the prerequisite comes first
    expect(next.weeks[0].receipt.reason).toMatch(/SQL builds on it/);
  });

  it("leaves steps that wait for a module beyond the roadmap's weeks for the next re-plan, and records the degree skips", () => {
    const path = pathTo("opp-pennine-placement");
    const merged = mergePathIntoRoadmap({ roadmap, path, profile, now: NOW });
    expect(merged.changes).toEqual([]); // ML, deep learning and PyTorch start after 12 Jun 2027
    expect(merged.laterNotes).toHaveLength(3);
    expect(merged.laterNotes[0]).toMatch(/joins when the roadmap re-plans/);
    expect(merged.roadmap.weeks.map((w) => w.focusSkillId)).toEqual(roadmap.weeks.map((w) => w.focusSkillId));
    expect(merged.degreeNotes).toHaveLength(2);
    expect(merged.roadmap.skipped.filter((s) => s.skillId === "statistics")).toHaveLength(1); // already skipped: not duplicated
  });

  it("previews exactly what changes", () => {
    const path = pathTo("opp-brightmoor-analyst");
    const merged = mergePathIntoRoadmap({ roadmap, path, profile, now: NOW });
    const preview = previewOf(path, roadmap, merged, (id) => skillMeta(id).name);
    expect(preview).toMatchObject({ currentVersion: 1, nextVersion: 2, opportunityId: "opp-brightmoor-analyst", laterNotes: [] });
    expect(preview.changes.map((c) => c.skillId)).toEqual(path.steps.filter((s) => s.mode === "learn").map((s) => s.skillId));
    expect(preview.weeks.filter((w) => w.changed).length).toBeGreaterThanOrEqual(6);
    expect(RoadmapZ.safeParse(merged.roadmap).success).toBe(true);
  });
});
