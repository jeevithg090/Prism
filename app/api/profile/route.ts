import { getStore } from "@/lib/store";
import { badRequest, internal, ProfileZ } from "@/lib/schemas/community";
import type { Profile } from "@/lib/types";

// POST /api/profile (contract §6): body is a Profile without `id`. We create a readable id from the
// first name ("aisha", then "aisha-2"…), store it, and set the `ks_uid` cookie so the app knows who you are.
const CreateProfileZ = ProfileZ.omit({ id: true });
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

function idBaseFromName(name: string): string {
  const first = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().split(/\s+/)[0] ?? "";
  return first.replace(/[^a-z0-9]/g, "").slice(0, 24) || "student";
}

async function uniqueId(base: string): Promise<string> {
  const store = getStore();
  if (!(await store.get("profiles", base))) return base;
  for (let n = 2; n < 1000; n++) {
    const id = `${base}-${n}`;
    if (!(await store.get("profiles", id))) return id;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Send your profile as JSON.");
  }
  const parsed = CreateProfileZ.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);
  try {
    const id = await uniqueId(idBaseFromName(parsed.data.name));
    const profile: Profile = { ...parsed.data, id };
    await getStore().upsert("profiles", id, profile, id);
    const res = Response.json({ ok: true, data: profile }, { status: 201 });
    res.headers.append("Set-Cookie", `ks_uid=${encodeURIComponent(id)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax`);
    return res;
  } catch {
    return internal();
  }
}
