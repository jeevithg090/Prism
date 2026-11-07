// STUB (P5 PR1): POST /api/webhooks/github → {reviewed:false}. Replaced by the AI Tech Lead (PR8).
import { z } from "zod";
import { badRequest, internal, ok } from "@/lib/schemas/community";

const GithubEventZ = z.record(z.string(), z.unknown());

export async function POST(req: Request) {
  try {
    const raw = await req.text();
    let body: unknown = null;
    try { body = JSON.parse(raw); } catch { /* invalid JSON → 400 below */ }
    const parsed = GithubEventZ.safeParse(body);
    if (!parsed.success) return badRequest("Expected a GitHub webhook JSON payload");
    return ok({ reviewed: false });
  } catch {
    return internal();
  }
}
