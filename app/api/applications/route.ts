// P5 · /api/applications: the student's job-application tracker (UC-2).
// GET    ?userId=&status=&limit=   → list applications
// POST   { company, roleTitle, ... } → create
// PATCH  { id, userId, status?, notes? } → update
// DELETE ?id=&userId=               → remove
// POST/PATCH/DELETE are wrapped with withReplayInfo for replay provenance.
import { z } from "zod";
import { withReplayInfo } from "@/lib/replay";
import {
  ApplicationCreateReqZ,
  ApplicationListQueryZ,
  ApplicationUpdateReqZ,
  ApplicationZ,
} from "@/lib/schemas/application";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";
import { createApplication, listApplications, removeApplication, updateApplication } from "@/lib/agents/application-tracker";

const IdUserIdZ = z.object({ id: z.string().min(1), userId: z.string().min(1) });

export const GET = withReplayInfo(async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = ApplicationListQueryZ.safeParse({
      userId: url.searchParams.get("userId") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) return badRequest(parsed.error);
    const items = await listApplications(parsed.data.userId, {
      status: parsed.data.status,
      limit: parsed.data.limit,
    });
    items.sort((a, b) => Date.parse(b.appliedAt) - Date.parse(a.appliedAt));
    return ok(items);
  } catch {
    return internal();
  }
});

export const POST = withReplayInfo(async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Body must be JSON.");
  }
  const parsed = ApplicationCreateReqZ.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);
  const { userId } = parsed.data;
  if (!userId) return badRequest("userId is required.");
  try {
    const app = await createApplication({
      userId,
      company: parsed.data.company,
      roleTitle: parsed.data.roleTitle,
      roleUrl: parsed.data.roleUrl,
      status: parsed.data.status,
      source: parsed.data.source,
      notes: parsed.data.notes,
    });
    return ok(ApplicationZ.parse(app));
  } catch {
    return internal();
  }
});

export const PATCH = withReplayInfo(async function PATCH(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Body must be JSON.");
  }
  const ids = IdUserIdZ.safeParse(body);
  if (!ids.success) return badRequest("id and userId are required.");
  const patch = ApplicationUpdateReqZ.safeParse(body);
  if (!patch.success) return badRequest(patch.error);
  try {
    const updated = await updateApplication(ids.data.id, ids.data.userId, patch.data);
    if (!updated) return fail(404, "not_found", `No application ${ids.data.id}.`);
    return ok(updated);
  } catch {
    return internal();
  }
});

export const DELETE = withReplayInfo(async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const ids = IdUserIdZ.safeParse({ id: url.searchParams.get("id") ?? undefined, userId: url.searchParams.get("userId") ?? undefined });
    if (!ids.success) return badRequest("id and userId are required.");
    const removed = await removeApplication(ids.data.id, ids.data.userId);
    if (!removed) return fail(404, "not_found", `No application ${ids.data.id}.`);
    return ok({ id: ids.data.id, removed: true } as { id: string; removed: boolean });
  } catch {
    return internal();
  }
});
