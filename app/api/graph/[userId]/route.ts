import "server-only";
import { getStore } from "@/lib/store";
import { loadGraph } from "@/lib/graph/build";
import { ok, fail } from "@/lib/schemas/brain";
import type { Profile } from "@/lib/types";

export async function GET(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params;
    const profile = await getStore().get<Profile>("profiles", userId);
    if (!profile) return fail(404, "not_found", "Profile not found");
    const roleId = new URL(req.url).searchParams.get("roleId") ?? profile.dna.targetRoles[0];
    const map = await loadGraph(userId, roleId);
    return map ? ok(map) : fail(404, "not_found", "No map for this user and role yet");
  } catch { return fail(500, "internal", "Something went wrong"); }
}
