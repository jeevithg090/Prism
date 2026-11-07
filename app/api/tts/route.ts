// P4 · POST /api/tts {text, voiceId?} → audio/mpeg (ElevenLabs TTS). Not an envelope on success.
// Without ELEVENLABS_API_KEY it answers 501 with the envelope, and the UI reads the text with speechSynthesis.
import { badRequest, fail, internal } from "@/lib/schemas/community";
import { tts, ttsConfigured, VoiceError } from "@/lib/voice/elevenlabs";
import { TtsReqZ } from "@/lib/voice/schemas";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Body must be JSON like {\"text\":\"Hello\"}");
  }
  const parsed = TtsReqZ.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);
  if (!ttsConfigured()) {
    return fail(501, "not_configured", "Voice isn't set up here, so your browser will read it aloud instead.");
  }
  try {
    const audio = await tts(parsed.data.text, parsed.data.voiceId);
    return new Response(audio, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof VoiceError) return fail(502, "upstream", "The voice service didn't answer, so your browser will read it aloud instead.");
    return internal();
  }
}
