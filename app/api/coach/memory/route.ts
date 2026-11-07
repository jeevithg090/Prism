// P5 · The student controls the Coach's memory.
// GET /api/coach/memory?userId= → MemoryNote[] · DELETE /api/coach/memory?userId=&id= → {deleted: true}
import { z } from "zod";
import { deleteMemory, listMemory } from "@/lib/agents/coach/memory";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";

const ListZ = z.object({ userId: z.string().min(1) });
const DeleteZ = z.object({ userId: z.string().min(1), id: z.string().min(1) });

const params = (req: Request) => new URL(req.url).searchParams;

export async function GET(req: Request) {
  const parsed = ListZ.safeParse({ userId: params(req).get("userId") ?? undefined });
  if (!parsed.success) return badRequest(parsed.error);
  try {
    return ok(await listMemory(parsed.data.userId));
  } catch {
    return internal();
  }
}

export async function DELETE(req: Request) {
  const q = params(req);
  const parsed = DeleteZ.safeParse({ userId: q.get("userId") ?? undefined, id: q.get("id") ?? undefined });
  if (!parsed.success) return badRequest(parsed.error);
  try {
    const deleted = await deleteMemory(parsed.data.userId, parsed.data.id);
    if (!deleted) return fail(404, "not_found", "That memory note doesn't exist (it may already be deleted).");
    return ok({ deleted: true, id: parsed.data.id });
  } catch {
    return internal();
  }
}
