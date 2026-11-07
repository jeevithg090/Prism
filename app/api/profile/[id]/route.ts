import { getStore } from "@/lib/store";
import { badRequest, fail, internal, LearningDNAZ, ok, ProfileZ } from "@/lib/schemas/community";
import type { Profile } from "@/lib/types";

// GET /api/profile/[id] → Profile · PUT (and PATCH) → partial update, `dna` deep-merged (contract §6).
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const p = await getStore().get<Profile>("profiles", id);
    if (!p) return fail(404, "not_found", `No profile ${id}`);
    return ok(p);
  } catch {
    return internal();
  }
}

const ProfilePatchZ = ProfileZ.omit({ id: true }).partial().extend({ dna: LearningDNAZ.partial().optional() });

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Send the fields to change as JSON.");
  }
  const patch = ProfilePatchZ.safeParse(body);
  if (!patch.success) return badRequest(patch.error);
  try {
    const { id } = await ctx.params;
    const store = getStore();
    const current = await store.get<Profile>("profiles", id);
    if (!current) return fail(404, "not_found", `No profile ${id}`);
    const { dna, ...rest } = patch.data;
    const merged = ProfileZ.safeParse({ ...current, ...rest, dna: { ...current.dna, ...dna }, id });
    if (!merged.success) return badRequest(merged.error);
    await store.upsert("profiles", id, merged.data, id);
    return ok(merged.data);
  } catch {
    return internal();
  }
}

export const PATCH = PUT;
