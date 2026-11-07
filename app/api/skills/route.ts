// GET /api/skills → Skill[] (contract §6): the taxonomy with the Skill Mapper's aliases merged in.
import { getSkills } from "@/lib/agents/skillmap";
import { internal, ok } from "@/lib/schemas/community";

export async function GET() {
  try {
    return ok(getSkills());
  } catch {
    return internal();
  }
}
