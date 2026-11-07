import "server-only";
import { getStore } from "@/lib/store";
import { TaskPatchZ, ok, fail } from "@/lib/schemas/brain";
import type { Roadmap } from "@/lib/types";
import { nanoid } from "nanoid";

export async function PATCH(req: Request, { params }: { params: Promise<{ userId: string; taskId: string }> }) {
  try {
    const { userId, taskId } = await params;
    const parsed = TaskPatchZ.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(400, "bad_request", "done must be a boolean");
    const store = getStore();
    const roadmap = await store.get<Roadmap>("roadmaps", userId);
    const week = roadmap?.weeks.find((w) => w.tasks.some((t) => t.id === taskId));
    const task = week?.tasks.find((t) => t.id === taskId);
    if (!roadmap || !week || !task) return fail(404, "not_found", "Task not found");
    const wasWeekComplete = week.tasks.every((item) => item.done);
    task.done = parsed.data.done;
    await store.upsert("roadmaps", userId, roadmap as Roadmap & { id?: string }, userId);
    if (!wasWeekComplete && week.tasks.every((item) => item.done)) {
      const id = nanoid();
      await store.upsert("momentum_events", id, { id, userId, kind: "roadmap-milestone", ts: new Date().toISOString() }, userId);
    }
    return ok(task);
  } catch { return fail(500, "internal", "Something went wrong"); }
}
