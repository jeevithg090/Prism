import { beforeEach, describe, expect, it, vi } from "vitest";
import { PodInsightsZ } from "@/lib/schemas/studio";

const { loadCohort, countPods } = vi.hoisted(() => ({ loadCohort: vi.fn(), countPods: vi.fn() }));
vi.mock("@/lib/agents/cohort", () => ({ loadCohort, countPods }));

import { GET } from "./route";

const cohort = (n: number) => ({
  profiles: Array.from({ length: n }, (_, i) => ({ id: `stu_${i}`, programmeId: "uom-bsc-cs" })),
  skills: Object.fromEntries(Array.from({ length: n }, (_, i) => [`stu_${i}`, i === 0 ? { proven: ["docker"], gaps: [] } : { proven: [], gaps: ["docker", "mlops"] }])),
});

beforeEach(() => {
  vi.clearAllMocks();
  countPods.mockResolvedValue(1);
});

describe("GET /api/pods/insights", () => {
  it("returns 200 with zod-valid PodInsights for the programme", async () => {
    loadCohort.mockResolvedValue(cohort(12));
    const res = await GET(new Request("http://localhost/api/pods/insights?programmeId=uom-bsc-cs"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    const data = PodInsightsZ.parse(json.data);
    expect(loadCohort).toHaveBeenCalledWith("uom-bsc-cs");
    expect(data).toMatchObject({ programmeId: "uom-bsc-cs", cohortSize: 12, podsCount: 1, suppressed: false });
    expect(data.peerTeachable).toEqual([{ skillId: "docker", teachers: 1, learners: 11 }]);
    expect(data.unteachableGaps).toEqual([{ skillId: "mlops", studentsWithGap: 11 }]);
    expect(JSON.stringify(json)).not.toContain("stu_");
  });

  it("suppresses a cohort under 10", async () => {
    loadCohort.mockResolvedValue(cohort(6));
    const json = await (await GET(new Request("http://localhost/api/pods/insights?programmeId=uom-bsc-cs"))).json();
    expect(json.data).toMatchObject({ cohortSize: 6, suppressed: true, peerTeachable: [], unteachableGaps: [] });
  });

  it("returns 400 bad_request without a programmeId", async () => {
    const res = await GET(new Request("http://localhost/api/pods/insights"));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("bad_request");
    expect(loadCohort).not.toHaveBeenCalled();
  });

  it("returns 500 internal when loading fails", async () => {
    loadCohort.mockRejectedValue(new Error("boom"));
    const res = await GET(new Request("http://localhost/api/pods/insights?programmeId=uom-bsc-cs"));
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("internal");
  });
});
