import "server-only";
import { getStore } from "@/lib/store";
import { TaskPatchZ, ok, fail } from "@/lib/schemas/brain";
import type { Roadmap } from "@/lib/types";

// Momentum event on a completed week is added in PR6.
export async function PATCH(req: Request, { params }: { params: Promise<{ userId: string; taskId: string }> }) {
  try {
    const { userId, taskId } = await params;
    const parsed = TaskPatchZ.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(400, "bad_request", "done must be a boolean");
    const store = getStore();
    const roadmap = await store.get<Roadmap>("roadmaps", userId);
    const task = roadmap?.weeks.flatMap((w) => w.tasks).find((t) => t.id === taskId);
    if (!roadmap || !task) return fail(404, "not_found", "Task not found");
    task.done = parsed.data.done;
    await store.upsert("roadmaps", userId, roadmap as Roadmap & { id?: string }, userId);
    return ok(task);
  } catch { return fail(500, "internal", "Something went wrong"); }
}
