import skills from "@/data/skills.json";
import type { ApiResult, Skill } from "@/lib/types";

export async function GET() {
  const body: ApiResult<Skill[]> = { ok: true, data: skills as Skill[] };
  return Response.json(body);
}
