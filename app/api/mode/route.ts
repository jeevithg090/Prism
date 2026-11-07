// GET /api/mode → {mode, defaultMode, demoModeEnv, recordings: count by namespace, total, recordedAt: {first, last}}
// POST /api/mode {mode: "demo" | "live"} → sets the ks_mode cookie (path /, 30 days) and returns the same shape.
// Demo replays recorded results of real runs (OpenAI, Firecrawl, ElevenLabs, Hacker News); Live AI calls them
// now and records what they return. See lib/replay.ts.
import { z } from "zod";
import { defaultRunMode, MODE_COOKIE, MODE_MAX_AGE_S, modeFromCookieHeader, replayStats, type RunMode } from "@/lib/replay";
import { badRequest, internal, ok } from "@/lib/schemas/community";

const ModeReqZ = z.object({ mode: z.enum(["demo", "live"]) });

function state(mode: RunMode) {
  const s = replayStats();
  return {
    mode,
    defaultMode: defaultRunMode(),
    /** DEMO_MODE=true on the server: the instant deterministic demo, so the switch changes nothing there. */
    demoModeEnv: process.env.DEMO_MODE === "true",
    recordings: s.byNamespace,
    total: s.total,
    recordedAt: { first: s.first, last: s.last },
  };
}

export async function GET(req: Request) {
  try {
    return ok(state(modeFromCookieHeader(req.headers.get("cookie"))));
  } catch {
    return internal();
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest('Body must be JSON like {"mode":"demo"}.');
  }
  const parsed = ModeReqZ.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);
  try {
    const { mode } = parsed.data;
    const res = ok(state(mode));
    const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
    res.headers.append("set-cookie", `${MODE_COOKIE}=${mode}; Path=/; Max-Age=${MODE_MAX_AGE_S}; SameSite=Lax${secure}`);
    return res;
  } catch {
    return internal();
  }
}
