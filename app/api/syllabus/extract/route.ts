// POST /api/syllabus/extract {url, programmeId?} or {text, programmeId?} → Programme (contract §6).
// Live with FIRECRAWL_API_KEY; otherwise (and in DEMO_MODE) the saved syllabus. Pasted text is parsed without any key.
import { extractProgramme, SyllabusError } from "@/lib/agents/syllabus";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";
import { ExtractReqZ } from "@/lib/schemas/data";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = ExtractReqZ.safeParse(body ?? {});
    if (!parsed.success) return badRequest(parsed.error);
    const demo = process.env.DEMO_MODE === "true" || new URL(req.url).searchParams.get("demo") === "1";
    try {
      return ok(await extractProgramme({ ...parsed.data, demo }));
    } catch (e) {
      if (e instanceof SyllabusError) {
        return parsed.data.text
          ? fail(422, "no_units", "We couldn't find course units in that text. Paste the list of units with their codes and topics.")
          : fail(502, "firecrawl_failed", "Couldn't read that page. Paste the course text instead.");
      }
      throw e;
    }
  } catch {
    return internal();
  }
}
