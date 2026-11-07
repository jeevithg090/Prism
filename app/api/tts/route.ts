// P4 · POST /api/tts {text, voiceId?} → audio/mpeg (ElevenLabs TTS). Not an envelope on success.
// Without ELEVENLABS_API_KEY it answers 501 with the envelope, and the UI reads the text with speechSynthesis.
// Demo toggle (lib/replay.ts): Live mode records the mp3 (data/replay/tts/<key>.mp3); Demo mode replays the
// recording of the same text and voice from a real run. `x-keystone-replay` says which one you got.
import { LLMError } from "@/lib/llm-error";
import { replayOrRecordBinary } from "@/lib/replay";
import { badRequest, fail, internal } from "@/lib/schemas/community";
import { TTS_MODEL_ID, tts, ttsConfigured, VoiceError } from "@/lib/voice/elevenlabs";
import { TtsReqZ } from "@/lib/voice/schemas";

const NOT_CONFIGURED = "Voice isn't set up here, so your browser will read it aloud instead.";
const UPSTREAM = "The voice service didn't answer, so your browser will read it aloud instead.";

const audioResponse = (audio: ArrayBuffer, replay: "replayed" | "live" | "off") =>
  new Response(audio, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store", "x-keystone-replay": replay } });

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Body must be JSON like {\"text\":\"Hello\"}");
  }
  const parsed = TtsReqZ.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);
  const { text, voiceId } = parsed.data;

  // DEMO_MODE=true keeps the original path: ElevenLabs when configured, else the browser voice.
  if (process.env.DEMO_MODE === "true") {
    if (!ttsConfigured()) return fail(501, "not_configured", NOT_CONFIGURED);
    try {
      return audioResponse(await tts(text, voiceId), "off");
    } catch (e) {
      if (e instanceof VoiceError) return fail(502, "upstream", UPSTREAM);
      return internal();
    }
  }

  let replayed = false;
  try {
    const audio = await replayOrRecordBinary(
      "tts",
      // The env voice is "default" in the key, so a deploy with a different (or no) ELEVENLABS_VOICE_ID still
      // replays the clips recorded on the Mac; an explicit voiceId is part of the key.
      { text, voice: voiceId || "default", model: TTS_MODEL_ID },
      async () => {
        if (!ttsConfigured()) throw new VoiceError("not_configured", "ELEVENLABS_API_KEY isn't set");
        return tts(text, voiceId);
      },
      {
        ext: "mp3", contentType: "audio/mpeg", requires: ["ELEVENLABS_API_KEY"], loose: false,
        // The voice id stays out of the stored metadata; it is only part of the hashed key.
        meta: { kind: "tts", model: TTS_MODEL_ID, label: text },
        onReplay: () => { replayed = true; },
      },
    );
    return audioResponse(audio, replayed ? "replayed" : "live");
  } catch (e) {
    if ((e instanceof VoiceError && e.code === "not_configured") || (e instanceof LLMError && e.message === "not_recorded")) {
      return fail(501, "not_configured", NOT_CONFIGURED);
    }
    if (e instanceof VoiceError) return fail(502, "upstream", UPSTREAM);
    return internal();
  }
}
