import { getProgramme } from "@/lib/agents/syllabus";
import type { ApiResult, Programme } from "@/lib/types";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const data = await getProgramme(id);
  if (!data) {
    const body: ApiResult<never> = {
      ok: false,
      error: { code: "not_found", message: `Unknown programme: ${id}` },
    };
    return Response.json(body, { status: 404 });
  }
  const body: ApiResult<Programme> = { ok: true, data };
  return Response.json(body);
}
