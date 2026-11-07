import "server-only";
import { nanoid } from "nanoid";
import { getStore } from "@/lib/store";
import { ProfileCreateZ, ok, fail } from "@/lib/schemas/brain";
import type { Profile } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const parsed = ProfileCreateZ.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(400, "bad_request", parsed.error.issues[0]?.message ?? "Invalid profile");
    const id = parsed.data.id ?? nanoid(8);
    const profile = await getStore().upsert<Profile>("profiles", id, { ...parsed.data, id } as Profile, id);
    return ok(profile, { headers: { "Set-Cookie": `ks_uid=${id}; Path=/; SameSite=Lax; Max-Age=31536000` } });
  } catch { return fail(500, "internal", "Something went wrong"); }
}
