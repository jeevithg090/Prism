// P5 · /api/help: the "Help a newcomer" feed (learning by teaching).
// GET  → HelpRequest[] (newest first, optional ?status=open|accepted|done, ?demo=1 reads the fixture)
// POST → create (no id) or PATCH-like status update (with id). Accepting a request records the
//        helper's `helped-newcomer` momentum event.
import fs from "node:fs";
import path from "node:path";
import { createHelpRequest } from "@/lib/community/help";
import { getStore } from "@/lib/store";
import type { HelpRequest, Profile } from "@/lib/types";
import {
  HelpCreateReqZ, HelpRequestZ, HelpStatusZ, HelpUpdateReqZ, MomentumEventZ,
  badRequest, fail, internal, ok, type MomentumEvent,
} from "@/lib/schemas/community";

const KIND_PHRASE: Record<HelpRequest["kind"], string> = {
  question: "a question",
  "chat-15": "a 15-min chat",
  "code-review": "a code review",
};

function readFixture(): HelpRequest[] {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/fixtures/help.json"), "utf8")) as unknown;
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function newestFirst(a: HelpRequest, b: HelpRequest) {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt);
}

function firstName(userId: string, profile: Profile | null): string {
  const n = profile?.name?.trim().split(/\s+/)[0];
  return n || userId.charAt(0).toUpperCase() + userId.slice(1);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const statusParam = url.searchParams.get("status");
    const status = statusParam === null ? undefined : HelpStatusZ.safeParse(statusParam);
    if (status && !status.success) return badRequest(status.error);

    const source = url.searchParams.get("demo") === "1"
      ? readFixture()
      : await getStore().list<HelpRequest>("help");

    const items = source
      .map((r) => HelpRequestZ.safeParse(r))
      .filter((r) => r.success)
      .map((r) => r.data)
      .filter((r) => !status || r.status === status.data)
      .sort(newestFirst);
    return ok(items);
  } catch {
    return internal();
  }
}

export async function POST(req: Request) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return badRequest("Body must be JSON.");
    }
    const isUpdate = typeof body === "object" && body !== null && "id" in body;
    return isUpdate ? await update(body) : await create(body);
  } catch {
    return internal();
  }
}

async function create(body: unknown): Promise<Response> {
  const parsed = HelpCreateReqZ.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);
  return ok(await createHelpRequest(parsed.data));
}

async function update(body: unknown): Promise<Response> {
  const parsed = HelpUpdateReqZ.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);
  const { id, status, toUserId } = parsed.data;
  const store = getStore();
  const existing = await store.get<HelpRequest>("help", id);
  if (!existing) return fail(404, "not_found", `We couldn't find help request ${id}.`);
  if (toUserId && toUserId === existing.fromUserId) {
    return badRequest("You can't accept your own request.");
  }

  const updated: HelpRequest = { ...existing, status, ...(toUserId ? { toUserId } : {}) };
  await store.upsert("help", id, updated, existing.fromUserId);

  if (status === "accepted" && toUserId) {
    const requester = await store.get<Profile>("profiles", existing.fromUserId);
    // Deterministic id: accepting the same request twice never double-counts momentum.
    const eventId = `mev_help_${id}_${toUserId}`;
    const event: MomentumEvent = MomentumEventZ.parse({
      id: eventId,
      userId: toUserId,
      kind: "helped-newcomer",
      ts: new Date().toISOString(),
      label: `Helped ${firstName(existing.fromUserId, requester)} with ${KIND_PHRASE[existing.kind]}`,
    });
    await store.upsert("momentum_events", eventId, event, toUserId);
  }
  return ok(HelpRequestZ.parse(updated));
}
