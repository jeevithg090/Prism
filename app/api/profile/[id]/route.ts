import "server-only";
import { getStore } from "@/lib/store";
import { ProfileUpdateZ, ok, fail } from "@/lib/schemas/brain";
import type { Profile } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const p = await getStore().get<Profile>("profiles", id);
    return p ? ok(p) : fail(404, "not_found", "Profile not found");
  } catch { return fail(500, "internal", "Something went wrong"); }
}

export async function PUT(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const parsed = ProfileUpdateZ.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(400, "bad_request", parsed.error.issues[0]?.message ?? "Invalid update");
    const store = getStore();
    const existing = await store.get<Profile>("profiles", id);
    if (!existing) return fail(404, "not_found", "Profile not found");
    const merged = { ...existing, ...parsed.data, id, dna: { ...existing.dna, ...parsed.data.dna } } as Profile;
    return ok(await store.upsert("profiles", id, merged, id));
  } catch { return fail(500, "internal", "Something went wrong"); }
}
