// P5 · POST /api/projects/portfolio — solo capstone/portfolio projects (UC-4).
// GET ?userId= → list   POST { userId, title, ... } → create
// POST { id, userId, milestoneId, done } → toggle milestone
// PATCH { id, userId, ... } → update (title, pitch, status, showcaseUrl)
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";
import { withReplayInfo } from "@/lib/replay";
import {
  CapstoneCreateReqZ,
  CapstoneUpdateReqZ,
  MilestoneUpdateReqZ,
} from "@/lib/schemas/capstone";
import { createCapstone, listCapstones, toggleMilestone, updateCapstone } from "@/lib/agents/capstone-project";

async function handleGET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  if (!userId) return badRequest("userId is required");
  try {
    const projects = await listCapstones(userId);
    return ok(projects);
  } catch {
    return internal();
  }
}

async function handlePOST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Body must be JSON");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return badRequest("Body must be a JSON object");
  }

  const raw = body as Record<string, unknown>;

  // Toggle a milestone: { id, userId, milestoneId, done }
  if (typeof raw.milestoneId === "string" && typeof raw.done === "boolean") {
    const parsed = MilestoneUpdateReqZ.safeParse({ milestoneId: raw.milestoneId, done: raw.done });
    if (!parsed.success) return badRequest(parsed.error);
    const id = typeof raw.id === "string" ? raw.id : "";
    const userId = typeof raw.userId === "string" ? raw.userId : "";
    if (!id || !userId) return badRequest("id and userId are required");
    const toggled = await toggleMilestone(id, userId, parsed.data.milestoneId, parsed.data.done);
    return ok({ toggled });
  }

  // Create a project: { userId, title, pitch?, roleId?, targetSkills? }
  const parsed = CapstoneCreateReqZ.safeParse(raw);
  if (!parsed.success) return badRequest(parsed.error);

  try {
    const project = await createCapstone(parsed.data);
    return ok(project, 201);
  } catch {
    return internal();
  }
}

async function handlePATCH(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Body must be JSON");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return badRequest("Body must be a JSON object");
  }

  const raw = body as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id : "";
  const userId = typeof raw.userId === "string" ? raw.userId : "";
  if (!id || !userId) return badRequest("id and userId are required");

  const patch = {
    title: typeof raw.title === "string" ? raw.title : undefined,
    pitch: typeof raw.pitch === "string" ? raw.pitch : undefined,
    status: typeof raw.status === "string" ? raw.status : undefined,
    showcaseUrl: typeof raw.showcaseUrl === "string" ? raw.showcaseUrl : undefined,
  };

  const parsed = CapstoneUpdateReqZ.safeParse(patch);
  if (!parsed.success) return badRequest(parsed.error);

  try {
    const project = await updateCapstone(id, userId, parsed.data);
    if (!project) return fail(404, "not_found", "Capstone project not found.");
    return ok(project);
  } catch {
    return internal();
  }
}

export const GET = withReplayInfo(handleGET);
export const POST = withReplayInfo(handlePOST);
export const PATCH = withReplayInfo(handlePATCH);
