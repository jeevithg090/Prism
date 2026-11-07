import "server-only";
import { getStore } from "@/lib/store";
import { ok, fail } from "@/lib/schemas/brain";
import type { Roadmap } from "@/lib/types";

export async function GET(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params;
    const r = await getStore().get<Roadmap>("roadmaps", userId);
    return r ? ok(r) : fail(404, "not_found", "No roadmap yet");
  } catch { return fail(500, "internal", "Something went wrong"); }
}
