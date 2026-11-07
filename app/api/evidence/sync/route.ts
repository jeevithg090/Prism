import "server-only";
import { getStore } from "@/lib/store";
import { EvidenceSyncZ, ok, fail } from "@/lib/schemas/brain";
import type { EvidenceItem } from "@/lib/types";

// STUB (PR2): returns stored evidence. Real syncEvidence lands in PR4.
export async function POST(req: Request) {
  try {
    const parsed = EvidenceSyncZ.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(400, "bad_request", "userId is required");
    return ok(await getStore().list<EvidenceItem>("evidence", { userId: parsed.data.userId }));
  } catch { return fail(500, "internal", "Something went wrong"); }
}
