// GET /api/mode → {mode, defaultMode, demoModeEnv, strict, services, githubWrites, recordings: count by namespace,
//   total, recordedAt: {first, last}}
// POST /api/mode {mode: "demo" | "live"} → sets the ks_mode cookie (path /, 30 days) and returns the same shape.
// POST /api/mode {mode: "demo", reset: true} → also clears the in-memory store (evidence, proofs, maps, interviews), so
// the demo starts again from the fixtures: Docker a gap, readiness 38%. Allowed with DEMO_MODE=true or outside production.
// Demo replays recorded results of real runs (OpenAI, Firecrawl, ElevenLabs, GitHub reads, Hacker News); Live AI
// calls them now and records what they return. See lib/replay.ts. No key value ever leaves the server: only
// whether each service is configured.
import { z } from "zod";
import {
  defaultRunMode, fillFromCookieHeader, MODE_COOKIE, MODE_MAX_AGE_S, modeFromCookieHeader, replayStats, strictFromCookieHeader, type RunMode,
} from "@/lib/replay";
import { badRequest, fail, internal, ok } from "@/lib/schemas/community";
import { resetStore } from "@/lib/store";

const ModeReqZ = z.object({ mode: z.enum(["demo", "live"]), reset: z.boolean().optional() });

const canReset = () => process.env.DEMO_MODE === "true" || process.env.NODE_ENV !== "production";

const set = (k: string) => Boolean(process.env[k]?.trim());

function state(mode: RunMode, cookie: string | null) {
  const s = replayStats();
  return {
    mode,
    defaultMode: defaultRunMode(),
    /** DEMO_MODE=true on the server: the instant deterministic demo, so the switch changes nothing there. */
    demoModeEnv: process.env.DEMO_MODE === "true",
    /** Demo never calls a service live (KEYSTONE_REPLAY_STRICT, or the dev-only ks_replay=strict cookie). */
    strict: strictFromCookieHeader(cookie),
    /** Dev-only recording Demo (ks_replay=fill): exact recordings replay, misses are called live and recorded. */
    fill: !strictFromCookieHeader(cookie) && fillFromCookieHeader(cookie),
    /** Which live services are configured here (true/false only). */
    services: { openai: set("OPENAI_API_KEY"), firecrawl: set("FIRECRAWL_API_KEY"), elevenlabs: set("ELEVENLABS_API_KEY"), github: set("GITHUB_TOKEN") },
    /** Live AI here creates GitHub repos and posts PR comments ("Start our project", "Review my PR"). */
    githubWrites: set("GITHUB_TOKEN") && set("GITHUB_ORG"),
    recordings: s.byNamespace,
    total: s.total,
    recordedAt: { first: s.first, last: s.last },
  };
}

export async function GET(req: Request) {
  try {
    const cookie = req.headers.get("cookie");
    return ok(state(modeFromCookieHeader(cookie), cookie));
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
    const { mode, reset } = parsed.data;
    if (reset) {
      if (!canReset()) return fail(403, "forbidden", "Resetting the demo data needs DEMO_MODE=true.");
      resetStore();
      // A fresh instance has no cached AI answers either (llmJSON cacheKey), so the next call replays or records.
      (globalThis as { __ksLLMCache?: Map<string, unknown> }).__ksLLMCache?.clear();
    }
    const res = ok({ ...state(mode, req.headers.get("cookie")), ...(reset ? { reset: true } : {}) });
    const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
    res.headers.append("set-cookie", `${MODE_COOKIE}=${mode}; Path=/; Max-Age=${MODE_MAX_AGE_S}; SameSite=Lax${secure}`);
    return res;
  } catch {
    return internal();
  }
}
