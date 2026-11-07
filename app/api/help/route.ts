// STUB (P5 PR1): GET /api/help → all help requests (newest first); POST creates one (or updates it when `id` is sent).
import { getStore } from "@/lib/store";
import { HelpCreateReqZ, HelpUpdateReqZ, badRequest, fail, internal, ok } from "@/lib/schemas/community";
import type { HelpRequest } from "@/lib/types";

export async function GET(_req?: Request) {
  try {
    const all = await getStore().list<HelpRequest>("help");
    return ok([...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  } catch {
    return internal();
  }
}

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json().catch(() => null);
    const store = getStore();
    if (body && typeof body === "object" && "id" in body) {
      const upd = HelpUpdateReqZ.safeParse(body);
      if (!upd.success) return badRequest(upd.error);
      const existing = await store.get<HelpRequest>("help", upd.data.id);
      if (!existing) return fail(404, "not_found", `No help request ${upd.data.id}`);
      const next: HelpRequest = { ...existing, status: upd.data.status, ...(upd.data.toUserId ? { toUserId: upd.data.toUserId } : {}) };
      return ok(await store.upsert("help", next.id, next, next.fromUserId));
    }
    const parsed = HelpCreateReqZ.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error);
    const request: HelpRequest = {
      id: `help_${crypto.randomUUID().slice(0, 8)}`,
      ...parsed.data,
      status: "open",
      createdAt: new Date().toISOString(),
    };
    return ok(await store.upsert("help", request.id, request, request.fromUserId), 201);
  } catch {
    return internal();
  }
}
