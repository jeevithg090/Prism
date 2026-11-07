import { scanForInjection } from "@/lib/agents/safety/injection";
// P5 · Help requests (Community feed, inside Keystone only). Shared by POST /api/help and the `ask_for_help` tool.
import "server-only";
import { nanoid } from "nanoid";
import type { z } from "zod";
import { getStore } from "@/lib/store";
import { HelpRequestZ, type HelpCreateReqZ } from "@/lib/schemas/community";
import type { HelpRequest } from "@/lib/types";

export type HelpCreateInput = z.infer<typeof HelpCreateReqZ>;

/** Saves a new open help request (`help_<nanoid>`) for `fromUserId` and returns it. Input is already validated. */
/** Creates an open help request. Messages are for humans, so injected text is accepted but stored with `flagged: true`. */
export async function createHelpRequest(input: HelpCreateInput): Promise<HelpRequest & { flagged?: true }> {
  const id = `help_${nanoid(6)}`;
  const request: HelpRequest & { flagged?: true } = {
    id,
    fromUserId: input.fromUserId,
    ...(input.toUserId ? { toUserId: input.toUserId } : {}),
    kind: input.kind,
    message: input.message,
    status: "open",
    createdAt: new Date().toISOString(),
    ...(scanForInjection(input.message).risk === "high" ? { flagged: true as const } : {}),
  };
  await getStore().upsert("help", id, request, request.fromUserId);
  return { ...HelpRequestZ.parse(request), ...(request.flagged ? { flagged: true as const } : {}) };
}
