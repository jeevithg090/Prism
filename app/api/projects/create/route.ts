// STUB (P5 PR1): POST /api/projects/create → the demo VisionAid project. Replaced by the Project Architect (PR3).
import podFixture from "@/data/fixtures/pod.aisha.json";
import { ProjectBriefZ, ProjectCreateReqZ, badRequest, internal, ok } from "@/lib/schemas/community";

export async function POST(req: Request) {
  try {
    const parsed = ProjectCreateReqZ.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return badRequest(parsed.error);
    return ok(ProjectBriefZ.parse(podFixture.project));
  } catch {
    return internal();
  }
}
