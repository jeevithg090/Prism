// GET /api/labs/pulse?sessionId=&minute= → PulseSnapshot: the Live Lab Pulse board at a lab minute.
// Simulated labs replay the seeded cohort at `minute`; live labs ignore it and read real submissions up to now.
// Aggregated and anonymous: fewer than 10 students → only the group size comes back (anonymityThreshold).
import { getPulseSnapshot, PulseNotFoundError } from "@/lib/labs/pulse/agent";
import { SnapshotQueryZ } from "@/lib/labs/pulse/model";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";

export async function GET(req: Request) {
  const parsed = SnapshotQueryZ.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return badRequest(parsed.error);
  try {
    return ok(await getPulseSnapshot(parsed.data.sessionId, parsed.data.minute));
  } catch (e) {
    if (e instanceof PulseNotFoundError) return fail(404, "not_found", e.message);
    return internal();
  }
}
