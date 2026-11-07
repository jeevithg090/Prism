import "server-only";
import { syncEvidence } from "@/lib/agents/evidence";
import { EvidenceSyncZ, ok, fail } from "@/lib/schemas/brain";

export async function POST(req: Request) {
  try {
    const parsed = EvidenceSyncZ.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(400, "bad_request", "userId is required");
    return ok(await syncEvidence(parsed.data));
  } catch { return fail(500, "internal", "Something went wrong"); }
}
