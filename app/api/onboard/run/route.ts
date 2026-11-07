import "server-only";
import { getStore } from "@/lib/store";
import { runOnboarding } from "@/lib/agents/orchestrator";
import { OnboardRunZ, ok, fail } from "@/lib/schemas/brain";
import type { Profile } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const parsed = OnboardRunZ.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(400, "bad_request", "userId is required");
    if (!(await getStore().get<Profile>("profiles", parsed.data.userId))) return fail(404, "not_found", "Profile not found");
    return ok(await runOnboarding(parsed.data.userId), { status: 202 });
  } catch { return fail(500, "internal", "Something went wrong"); }
}
