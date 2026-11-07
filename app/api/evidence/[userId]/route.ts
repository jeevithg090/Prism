import "server-only";
import { getStore } from "@/lib/store";
import { ok, fail } from "@/lib/schemas/brain";
import type { EvidenceItem } from "@/lib/types";

export async function GET(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params;
    return ok(await getStore().list<EvidenceItem>("evidence", { userId }));
  } catch { return fail(500, "internal", "Something went wrong"); }
}
