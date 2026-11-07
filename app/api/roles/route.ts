// GET /api/roles → Role[] (contract §6): the role catalogue the Market Agent covers.
import { getRoles } from "@/lib/agents/market";
import { internal, ok } from "@/lib/schemas/community";

export async function GET() {
  try {
    return ok(getRoles());
  } catch {
    return internal();
  }
}
