import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile, Trajectory } from "@/lib/types";

const { embedMock, emitMock } = vi.hoisted(() => ({ embedMock: vi.fn(), emitMock: vi.fn() }));
vi.mock("@/lib/llm", () => ({
  embed: embedMock,
  cosine: (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0),
}));
vi.mock("@/lib/agents/events", () => ({ emit: emitMock }));

import { jaccard, profileText, similarTrajectories, trajectoryText, OUTCOME_BONUS } from "./trajectories";

const profile: Profile = {
  id: "aisha", name: "Aisha Rahman", programmeId: "uom-bsc-cs", year: 1, startedAt: "2026-09-21",
  badges: ["new-to-uni"], interests: ["computer vision", "healthcare AI", "open source"], availability: ["tue-eve"],
  dna: { targetRoles: ["ml-engineer"], timelineLabel: "", targetDate: "2027-09-01", hoursPerWeek: 8, theoryPractice: 70, formats: ["projects"], budget: "free", constraints: [], accessibility: [], language: "en" },
};

function traj(id: string, outcomeRole: string, labels: string[]): Trajectory {
  return {
    id, userId: id, name: id, programmeId: "uom-bsc-cs", outcomeRole, advice: "Be kind to yourself.", isDemo: true, openToChat: true,
    steps: labels.map((label, i) => ({ year: (Math.min(i + 1, 5) as 1 | 2 | 3 | 4 | 5), kind: "project", label })),
  };
}

const ml = traj("t_ml", "ML engineer at a Manchester health-tech startup", ["Computer vision society", "Open source healthcare project"]);
const bank = traj("t_bank", "Software engineer at a bank", ["Joined the chess club", "Java coursework"]);
const data = traj("t_data", "Data analyst at a retailer", ["Spreadsheet modelling", "Retail placement"]);

describe("similarTrajectories (embedding fallback)", () => {
  beforeEach(() => {
    embedMock.mockReset().mockRejectedValue(new Error("no embeddings"));
    emitMock.mockReset();
  });

  it("ranks an ML-outcome trajectory first for an ML-interest profile", async () => {
    const res = await similarTrajectories(profile, [bank, data, ml]);
    expect(res[0].trajectory.id).toBe("t_ml");
    expect(res).toHaveLength(3);
    expect(res[0].similarity).toBeGreaterThan(res[1].similarity);
  });

  it("applies the +0.15 outcome bonus on top of the Jaccard score", async () => {
    const pText = profileText(profile);
    const res = await similarTrajectories(profile, [ml, bank]);
    const mlRow = res.find((r) => r.trajectory.id === "t_ml")!;
    const bankRow = res.find((r) => r.trajectory.id === "t_bank")!;
    expect(mlRow.similarity).toBeCloseTo(jaccard(pText, trajectoryText(ml)) + OUTCOME_BONUS, 2);
    expect(bankRow.similarity).toBeCloseTo(jaccard(pText, trajectoryText(bank)), 2);
  });

  it("the bonus alone can lift a role match above a closer non-match", async () => {
    // Same words, but only one outcome matches the ML target role.
    const a = traj("t_a", "Founded a startup", ["computer vision"]);
    const b = traj("t_b", "Machine learning engineer", ["computer vision"]);
    const res = await similarTrajectories(profile, [a, b]);
    expect(res.map((r) => r.trajectory.id)).toEqual(["t_b", "t_a"]);
  });

  it("takes the top `limit` and emits start/done with numbers when given a runId", async () => {
    const res = await similarTrajectories(profile, [bank, data, ml], 2, "run_x");
    expect(res).toHaveLength(2);
    expect(emitMock).toHaveBeenCalledWith(expect.objectContaining({ runId: "run_x", agent: "trajectories", status: "started", data: expect.objectContaining({ candidates: 3 }) }));
    expect(emitMock).toHaveBeenCalledWith(expect.objectContaining({ status: "done", data: expect.objectContaining({ returned: 2, roleMatches: 1, method: "jaccard" }) }));
  });

  it("does not emit without a runId", async () => {
    await similarTrajectories(profile, [ml]);
    expect(emitMock).not.toHaveBeenCalled();
  });
});

describe("similarTrajectories (embeddings)", () => {
  it("uses cosine of the embeddings plus the bonus", async () => {
    embedMock.mockReset().mockResolvedValue([[1, 0], [0, 1], [1, 0]]); // profile, bank, ml
    const res = await similarTrajectories(profile, [bank, ml]);
    expect(res[0].trajectory.id).toBe("t_ml");
    expect(res[0].similarity).toBe(1); // 1 + 0.15, clamped
    expect(res[1].similarity).toBe(0);
  });
});
