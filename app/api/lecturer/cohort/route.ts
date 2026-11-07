// GET /api/lecturer/cohort?programmeId= → LecturerCohort (additive to contract §6).
// Anonymous role split for the Lecturer Insights stat cards; < 10 students → suppressed, no roles.
import { computeCohortRoles, loadLecturerContext } from "@/lib/agents/lecturer";
import { badRequest, internal, ok } from "@/lib/schemas/community";
import { LecturerQueryZ } from "@/lib/schemas/lecturer";

export async function GET(req: Request) {
  try {
    const parsed = LecturerQueryZ.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) return badRequest(parsed.error);
    const { programmeId } = parsed.data;
    // Pure counting over the seeded store: identical (and instant) in DEMO_MODE.
    const { students, demand } = await loadLecturerContext(programmeId);
    return ok(computeCohortRoles(programmeId, students, demand));
  } catch {
    return internal();
  }
}
