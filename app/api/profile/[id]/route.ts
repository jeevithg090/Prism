// LOCAL SHIM of P2's GET /api/profile/[id]
import { getStore } from "@/lib/store";
import type { Profile } from "@/lib/types";
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const p = await getStore().get<Profile>("profiles", id);
    if (!p) return Response.json({ ok: false, error: { code: "not_found", message: `No profile ${id}` } }, { status: 404 });
    return Response.json({ ok: true, data: p });
  } catch {
    return Response.json({ ok: false, error: { code: "internal", message: "Something went wrong" } }, { status: 500 });
  }
}
