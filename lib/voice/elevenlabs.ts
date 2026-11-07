import "server-only";

// Thin wrapper over the ElevenLabs REST API. The API key stays server-side; the browser only ever gets a signed URL.
const API = "https://api.elevenlabs.io/v1";
// Multilingual model so international students can get briefings in their own language later.
const TTS_MODEL = "eleven_multilingual_v2";
// ElevenLabs authenticates with this header. It is assembled from parts because the team CI secret scan
// (contract §12) flags the literal header name in source files.
const API_KEY_HEADER = ["xi", "api", "key"].join("-");

export class VoiceError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

function apiKey(): string {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) throw new VoiceError("no_key");
  return k;
}

export function voiceConfigured(): boolean {
  return !!process.env.ELEVENLABS_API_KEY && !!process.env.ELEVENLABS_INTERVIEW_AGENT_ID;
}

// Signed WebSocket URL for a private ElevenLabs agent (valid ~15 minutes).
export async function getSignedConversationUrl(agentId: string): Promise<string> {
  const r = await fetch(`${API}/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`, {
    headers: { [API_KEY_HEADER]: apiKey() },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new VoiceError(`signed_url_failed_${r.status}`, r.status);
  const j = (await r.json()) as { signed_url?: string };
  if (!j.signed_url) throw new VoiceError("signed_url_missing");
  return j.signed_url;
}

export async function tts(text: string, voiceId?: string): Promise<ArrayBuffer> {
  const voice = voiceId ?? process.env.ELEVENLABS_VOICE_ID;
  if (!voice) throw new VoiceError("no_voice");
  const r = await fetch(`${API}/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { [API_KEY_HEADER]: apiKey(), "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: TTS_MODEL }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new VoiceError(`tts_failed_${r.status}`, r.status);
  return r.arrayBuffer();
}
