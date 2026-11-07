import "server-only";
import { getStore } from "@/lib/store";
import { ok, fail } from "@/lib/schemas/brain";
import type { BridgeMap, Profile } from "@/lib/types";
import aishaMap from "@/data/fixtures/bridgemap.aisha.ml-engineer.json";

// STUB (PR2): fixture for aisha/ml-engineer. Real builder lands in PR5.
export async function GET(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params;
    const profile = await getStore().get<Profile>("profiles", userId);
    if (!profile) return fail(404, "not_found", "Profile not found");
    const roleId = new URL(req.url).searchParams.get("roleId") ?? profile.dna.targetRoles[0];
    if (userId === "aisha" && roleId === "ml-engineer") return ok(aishaMap as BridgeMap);
    return fail(404, "not_found", "No map for this user and role yet");
  } catch { return fail(500, "internal", "Something went wrong"); }
}
