// Keystone Labs · Viva Check: shared route helpers (zod-validated bodies, the API envelope, error mapping).
import "server-only";
import type { z } from "zod";
import { VivaError } from "./agent";
import { badRequest, fail, internal } from "@/lib/schemas/community";

/** Parses a JSON body with a schema; returns the data or a 400 envelope. */
export async function readBody<S extends z.ZodTypeAny>(req: Request, schema: S, example: string): Promise<{ data: z.infer<S> } | { res: Response }> {
  let body: unknown;
  try { body = await req.json(); } catch { return { res: badRequest(`Body must be JSON like ${example}`) }; }
  const parsed = schema.safeParse(body);
  return parsed.success ? { data: parsed.data } : { res: badRequest(parsed.error) };
}

/** A signed-in viewer (ks_uid cookie) can only act as themselves. Requests without a session (MCP, tests) pass. */
export function actingAs(req: Request, claimed: string): Response | null {
  const m = (req.headers.get("cookie") ?? "").match(/(?:^|;\s*)ks_uid=([^;]+)/);
  let viewer: string | null = null;
  try { viewer = m ? decodeURIComponent(m[1]) : null; } catch { viewer = m?.[1] ?? null; }
  return viewer && viewer !== claimed ? fail(403, "forbidden", "You can only act as yourself here.") : null;
}

export function toResponse(e: unknown): Response {
  if (e instanceof VivaError) return fail(e.status, e.code, e.message);
  return internal();
}
