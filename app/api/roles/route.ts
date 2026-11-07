import { getRoles } from "@/lib/agents/market";
import type { ApiResult, Role } from "@/lib/types";

export async function GET() {
  const body: ApiResult<Role[]> = { ok: true, data: getRoles() };
  return Response.json(body);
}
