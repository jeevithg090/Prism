import "server-only";
// P4 · ElevenLabs REST (no SDK: @elevenlabs/* isn't installed). The API key never leaves the server:
// the browser only ever gets a short-lived signed WebSocket URL for the Conversational AI agent.
//   TTS:        POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}        (xi-api-key, accept audio/mpeg)
//   Signed URL: GET  https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=…  → { signed_url }

export const ELEVENLABS_API = "https://api.elevenlabs.io";
/** "George", a warm British premade voice; override with ELEVENLABS_VOICE_ID. */
export const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";
export const TTS_MODEL_ID = "eleven_multilingual_v2";

export class VoiceError extends Error {
  constructor(public code: "not_configured" | "upstream", message: string, public status?: number) {
    super(message);
    this.name = "VoiceError";
  }
}

export const ttsConfigured = () => !!process.env.ELEVENLABS_API_KEY?.trim();
export const conversationConfigured = () => ttsConfigured() && !!process.env.ELEVENLABS_INTERVIEW_AGENT_ID?.trim();

function key(): string {
  const k = process.env.ELEVENLABS_API_KEY?.trim();
  if (!k) throw new VoiceError("not_configured", "ELEVENLABS_API_KEY isn't set");
  return k;
}

/** MP3 audio for `text`. Throws VoiceError on a missing key or a non-2xx answer. */
export async function tts(text: string, voiceId?: string): Promise<ArrayBuffer> {
  const voice = voiceId || process.env.ELEVENLABS_VOICE_ID?.trim() || DEFAULT_VOICE_ID;
  const r = await fetch(`${ELEVENLABS_API}/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key(), "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: TTS_MODEL_ID }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new VoiceError("upstream", `ElevenLabs TTS answered ${r.status}`, r.status);
  return r.arrayBuffer();
}

/** A signed wss:// URL for one conversation with the agent (valid for a few minutes). */
export async function getSignedConversationUrl(agentId: string): Promise<string> {
  const r = await fetch(`${ELEVENLABS_API}/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`, {
    headers: { "xi-api-key": key() },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new VoiceError("upstream", `ElevenLabs signed URL answered ${r.status}`, r.status);
  const json = (await r.json()) as { signed_url?: string };
  if (!json.signed_url?.startsWith("wss://")) throw new VoiceError("upstream", "ElevenLabs returned no signed URL");
  return json.signed_url;
}
