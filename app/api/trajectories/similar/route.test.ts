import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile, Trajectory } from "@/lib/types";

const { listMock, getMock, emitMock } = vi.hoisted(() => ({ listMock: vi.fn(), getMock: vi.fn(), emitMock: vi.fn() }));
vi.mock("@/lib/store", () => ({ getStore: () => ({ list: listMock, get: getMock, upsert: vi.fn(), remove: vi.fn() }) }));
vi.mock("@/lib/llm", () => ({ embed: vi.fn().mockRejectedValue(new Error("no key")), cosine: vi.fn() }));
vi.mock("@/lib/agents/events", () => ({ emit: emitMock, newRunId: () => "run_test" }));

import { GET } from "./route";

const aisha = {
  id: "aisha", name: "Aisha Rahman", programmeId: "uom-bsc-cs", year: 1, startedAt: "2026-09-21", badges: [],
  interests: ["computer vision", "healthcare AI"], availability: [],
  dna: { targetRoles: ["ml-engineer"], timelineLabel: "", targetDate: "", hoursPerWeek: 8, theoryPractice: 70, formats: [], budget: "free", constraints: [], accessibility: [], language: "en" },
} satisfies Profile;

const t = (id: string, outcomeRole: string, label: string): Trajectory => ({
  id, userId: id, name: id, programmeId: "uom-bsc-cs", outcomeRole, advice: "Ask early.", isDemo: true, openToChat: true,
  steps: [{ year: 1, kind: "project", label }],
});

describe("GET /api/trajectories/similar", () => {
  beforeEach(() => {
    listMock.mockReset().mockResolvedValue([
      t("bank", "Software engineer at a bank", "Java coursework"),
      t("ml", "ML engineer at a health-tech startup", "Computer vision project"),
      t("aisha", "ML engineer", "computer vision healthcare"),
    ]);
    getMock.mockReset().mockResolvedValue(aisha);
    emitMock.mockReset();
  });

  it("returns ranked { trajectory, similarity }[] and never the viewer's own journey", async () => {
    const res = await GET(new Request("http://x/api/trajectories/similar?userId=aisha&limit=5"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.map((r: { trajectory: Trajectory }) => r.trajectory.id)).toEqual(["ml", "bank"]);
    expect(typeof body.data[0].similarity).toBe("number");
    expect(getMock).toHaveBeenCalledWith("profiles", "aisha");
    expect(emitMock).toHaveBeenCalledWith(expect.objectContaining({ runId: "run_test", agent: "trajectories", status: "done" }));
  });

  it("respects limit (default 5)", async () => {
    const body = await (await GET(new Request("http://x/api/trajectories/similar?userId=aisha&limit=1"))).json();
    expect(body.data).toHaveLength(1);
  });

  it("returns 404 when the profile is missing", async () => {
    getMock.mockResolvedValue(null);
    const res = await GET(new Request("http://x/api/trajectories/similar?userId=ghost"));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
  });

  it("returns 400 without a userId or with a bad limit", async () => {
    expect((await GET(new Request("http://x/api/trajectories/similar"))).status).toBe(400);
    expect((await GET(new Request("http://x/api/trajectories/similar?userId=aisha&limit=0"))).status).toBe(400);
  });
});
