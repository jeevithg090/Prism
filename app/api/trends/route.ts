import { getTrends } from "@/lib/agents/trends";
import type { ApiResult, TrendSeries } from "@/lib/types";

export async function GET(req: Request) {
  const param = new URL(req.url).searchParams.get("skills");
  const skills = param ? param.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  try {
    const body: ApiResult<TrendSeries[]> = { ok: true, data: await getTrends(skills) };
    return Response.json(body);
  } catch {
    const body: ApiResult<never> = { ok: false, error: { code: "internal", message: "Couldn't load trends." } };
    return Response.json(body, { status: 500 });
  }
}
