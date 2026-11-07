import { extractProgramme } from "@/lib/agents/syllabus";
import { ExtractReqZ } from "@/lib/schemas/data";
import type { ApiResult, Programme } from "@/lib/types";

export async function POST(req: Request) {
  const parsed = ExtractReqZ.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const body: ApiResult<never> = {
      ok: false,
      error: { code: "bad_request", message: "Send a programme url or at least 50 characters of text." },
    };
    return Response.json(body, { status: 400 });
  }
  try {
    const body: ApiResult<Programme> = { ok: true, data: await extractProgramme(parsed.data) };
    return Response.json(body);
  } catch {
    const body: ApiResult<never> = {
      ok: false,
      error: { code: "firecrawl_failed", message: "Couldn't read that page. Paste the course text instead." },
    };
    return Response.json(body, { status: 502 });
  }
}
