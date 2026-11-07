import { beforeEach, describe, expect, it, vi } from "vitest";
import { LecturerCohortZ } from "@/lib/schemas/lecturer";

const { loadCohort, loadMap, loadProgramme, loadRoleDemand } = vi.hoisted(() => ({
  loadCohort: vi.fn(), loadMap: vi.fn(), loadProgramme: vi.fn(), loadRoleDemand: vi.fn(),
}));
vi.mock("@/lib/llm", () => ({ llmJSON: vi.fn(), LLMError: class extends Error {} }));
vi.mock("@/lib/agents/cohort", () => ({ loadCohort, loadMap, loadProgramme, loadRoleDemand }));

import { GET } from "./route";

const profiles = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `uid_${i}_zq`, programmeId: "uom-bsc-cs", dna: { targetRoles: [i < 7 ? "ml-engineer" : "data-analyst"] } }));

beforeEach(() => {
  vi.clearAllMocks();
  loadMap.mockResolvedValue(undefined);
  loadProgramme.mockReturnValue(undefined);
  loadRoleDemand.mockImplementation((r: string) => (r === "ml-engineer" ? { skills: [{ skillId: "docker", share: 0.41 }] } : undefined));
});

describe("GET /api/lecturer/cohort", () => {
  it("returns the anonymous role split", async () => {
    loadCohort.mockResolvedValue({ profiles: profiles(12), skills: {} });
    const res = await GET(new Request("http://localhost/api/lecturer/cohort?programmeId=uom-bsc-cs"));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(LecturerCohortZ.parse(data)).toEqual(data);
    expect(data).toMatchObject({ cohortSize: 12, suppressed: false, demandRole: { roleId: "ml-engineer", roleName: "ML engineer" } });
    expect(data.roles[0]).toEqual({ roleId: "ml-engineer", roleName: "ML engineer", students: 7, pct: 58 });
    expect(JSON.stringify(data)).not.toContain("uid_");
  });

  it("suppresses under 10 and rejects a missing programmeId", async () => {
    loadCohort.mockResolvedValue({ profiles: profiles(7), skills: {} });
    const { data } = await (await GET(new Request("http://localhost/api/lecturer/cohort?programmeId=uom-bsc-cs"))).json();
    expect(data).toMatchObject({ cohortSize: 7, suppressed: true, roles: [], demandRole: null });
    const bad = await GET(new Request("http://localhost/api/lecturer/cohort?programmeId="));
    expect(bad.status).toBe(400);
  });
});
