// P5 · Skill Passport data. GET → Passport (private by default: 403 for anyone but the owner until they opt in).
// PUT {public: boolean} → {isPublic} (owner only). The viewer is the `ks_uid` cookie (the demo persona without one).
import { getPassport, NotFoundError, PrivateError, setPassportVisibility, viewerFromRequest } from "@/lib/agents/ladder";
import { PassportVisibilityReqZ } from "@/components/ladder/model";
import { badRequest, fail, internal, ok, UserIdParamZ } from "@/lib/schemas/community";

type Ctx = { params: Promise<{ userId: string }> };

function known(e: unknown): Response | null {
  if (e instanceof NotFoundError) return fail(404, "not_found", e.message);
  if (e instanceof PrivateError) return fail(403, "private", e.message);
  return null;
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    const params = UserIdParamZ.safeParse(await ctx.params);
    if (!params.success) return badRequest(params.error);
    return ok(await getPassport(params.data.userId, viewerFromRequest(req)));
  } catch (e) {
    return known(e) ?? internal();
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  const params = UserIdParamZ.safeParse(await ctx.params);
  if (!params.success) return badRequest(params.error);
  let body: unknown;
  try { body = await req.json(); } catch { return badRequest("Body must be JSON like {\"public\":true}"); }
  const parsed = PassportVisibilityReqZ.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);
  try {
    return ok(await setPassportVisibility(params.data.userId, viewerFromRequest(req), parsed.data.public));
  } catch (e) {
    return known(e) ?? internal();
  }
}
