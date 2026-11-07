import { cachedTtsAudio, isSameOrigin, readDemoAudio, rememberTtsAudio, takeTtsBudget } from "@/lib/briefing";
import { TtsReqZ } from "@/lib/schemas/voice";
import { tts } from "@/lib/voice/elevenlabs";
import { badRequest, fail, internal, isDemo } from "@/lib/voice/http";


// `x-keystone-audio-source` says where the audio came from, so a regeneration run can tell fresh ElevenLabs audio from the fallback file.
function audio(body: ArrayBuffer | Uint8Array<ArrayBuffer>, source: "elevenlabs" | "demo"): Response {
  return new Response(body, {
    headers: { "content-type": "audio/mpeg", "cache-control": "no-store", "x-keystone-audio-source": source },
  });
}

// POST /api/tts { text, voiceId? } → audio/mpeg (not an ApiResult envelope). Cross-site browser requests get 403.
// In DEMO_MODE, if ElevenLabs fails, or once this process's ElevenLabs budget is spent, it streams the committed
// public/demo/briefing-aisha.mp3; with no file it returns 501 not_ready.
export async function POST(req: Request): Promise<Response> {
  if (!isSameOrigin(req)) return fail("forbidden", "Audio can only be requested from Keystone itself.", 403);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest('Send JSON like {"text": "..."}');
  }
  const parsed = TtsReqZ.safeParse(body);
  if (!parsed.success) return badRequest("text must be 1 to 2500 characters");

  try {
    if (!isDemo()) {
      const { text, voiceId } = parsed.data;
      const hit = cachedTtsAudio(text, voiceId);
      if (hit) return audio(hit, "elevenlabs");
      if (takeTtsBudget()) {
        try {
          const buf = await tts(text, voiceId);
          rememberTtsAudio(text, voiceId, buf);
          return audio(buf, "elevenlabs");
        } catch (e) {
          console.warn("[tts] ElevenLabs unavailable, using demo audio:", e instanceof Error ? e.message : e);
        }
      } else {
        console.warn("[tts] ElevenLabs budget for this window is spent, using demo audio");
      }
    }
    const demo = await readDemoAudio();
    if (demo) return audio(demo, "demo");
    return fail("not_ready", "Audio isn't ready yet. You can read the transcript instead.", 501);
  } catch (e) {
    console.error("[tts] failed", e);
    return internal();
  }
}
