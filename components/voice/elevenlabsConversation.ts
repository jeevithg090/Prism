"use client";
// ElevenLabs Conversational AI over its WebSocket protocol (no SDK installed). The server hands us a signed
// wss:// URL (the API key never reaches the browser). We send the dynamic variables, stream 16-bit PCM from the
// mic as `user_audio_chunk`s, play the agent's PCM audio, answer pings, and surface transcripts as messages.

export type ConversationStatus = "connecting" | "connected" | "ended" | "error";
export interface ConversationMessage { source: "ai" | "user"; text: string }
export interface ConversationHandlers {
  onStatus: (s: ConversationStatus) => void;
  onMessage: (m: ConversationMessage) => void;
  onSpeaking: (agentSpeaking: boolean) => void;
  onError: (message: string) => void;
}
export interface ConversationHandle { end: () => void; setMuted: (muted: boolean) => void }

type Inbound = {
  type?: string;
  conversation_initiation_metadata_event?: { agent_output_audio_format?: string; user_input_audio_format?: string };
  audio_event?: { audio_base_64?: string };
  agent_response_event?: { agent_response?: string };
  user_transcription_event?: { user_transcript?: string };
  ping_event?: { event_id?: number; ping_ms?: number };
  client_tool_call?: { tool_call_id?: string; tool_name?: string };
};

const rateOf = (fmt: string | undefined, fallback = 16000) => {
  const m = fmt?.match(/^pcm_(\d+)$/);
  return m ? Number(m[1]) : fallback;
};

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Float32 mic samples at `fromRate` → 16-bit little-endian PCM at `toRate` (simple averaging downsampler). */
export function encodePcm16(input: Float32Array, fromRate: number, toRate: number): Uint8Array {
  const ratio = fromRate / toRate;
  const n = Math.max(0, Math.floor(input.length / ratio));
  const out = new DataView(new ArrayBuffer(n * 2));
  for (let i = 0; i < n; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio)) || start + 1;
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    const v = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    out.setInt16(i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return new Uint8Array(out.buffer);
}

export function decodePcm16(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float32Array(Math.floor(bytes.byteLength / 2));
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) / 0x8000;
  return out;
}

export async function startConversation(opts: { signedUrl: string; dynamicVariables: Record<string, string> } & ConversationHandlers): Promise<ConversationHandle> {
  const { onStatus, onMessage, onSpeaking, onError } = opts;
  onStatus("connecting");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const inCtx = new Ctx();
  const outCtx = new Ctx();
  const ws = new WebSocket(opts.signedUrl);
  let muted = false;
  let ended = false;
  let inRate = 16000;
  let outRate = 16000;
  let playhead = 0;
  const playing = new Set<AudioBufferSourceNode>();
  let processor: ScriptProcessorNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;

  const send = (msg: unknown) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); };
  const stopPlayback = () => { playing.forEach((s) => { try { s.stop(); } catch { /* done */ } }); playing.clear(); playhead = 0; onSpeaking(false); };

  const startMic = () => {
    source = inCtx.createMediaStreamSource(stream);
    processor = inCtx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e) => {
      if (muted || ws.readyState !== WebSocket.OPEN) return;
      send({ user_audio_chunk: toBase64(encodePcm16(e.inputBuffer.getChannelData(0), inCtx.sampleRate, inRate)) });
    };
    source.connect(processor);
    processor.connect(inCtx.destination);
  };

  const play = (b64: string) => {
    const samples = decodePcm16(fromBase64(b64));
    if (!samples.length) return;
    const buf = outCtx.createBuffer(1, samples.length, outRate);
    buf.getChannelData(0).set(samples);
    const src = outCtx.createBufferSource();
    src.buffer = buf;
    src.connect(outCtx.destination);
    playhead = Math.max(playhead, outCtx.currentTime);
    src.start(playhead);
    playhead += buf.duration;
    playing.add(src);
    onSpeaking(true);
    src.onended = () => { playing.delete(src); if (!playing.size) onSpeaking(false); };
  };

  const cleanup = () => {
    if (ended) return;
    ended = true;
    stopPlayback();
    try { processor?.disconnect(); source?.disconnect(); } catch { /* gone */ }
    stream.getTracks().forEach((t) => t.stop());
    void inCtx.close().catch(() => {});
    void outCtx.close().catch(() => {});
  };

  ws.onopen = () => send({ type: "conversation_initiation_client_data", dynamic_variables: opts.dynamicVariables });
  ws.onmessage = (ev) => {
    let m: Inbound;
    try { m = JSON.parse(String(ev.data)) as Inbound; } catch { return; }
    switch (m.type) {
      case "conversation_initiation_metadata": {
        const meta = m.conversation_initiation_metadata_event;
        inRate = rateOf(meta?.user_input_audio_format);
        outRate = rateOf(meta?.agent_output_audio_format);
        void inCtx.resume();
        void outCtx.resume();
        startMic();
        onStatus("connected");
        break;
      }
      case "audio":
        if (m.audio_event?.audio_base_64) play(m.audio_event.audio_base_64);
        break;
      case "agent_response":
        if (m.agent_response_event?.agent_response) onMessage({ source: "ai", text: m.agent_response_event.agent_response });
        break;
      case "user_transcript":
        if (m.user_transcription_event?.user_transcript) onMessage({ source: "user", text: m.user_transcription_event.user_transcript });
        break;
      case "interruption":
        stopPlayback();
        break;
      case "ping":
        send({ type: "pong", event_id: m.ping_event?.event_id });
        break;
      case "client_tool_call":
        send({ type: "client_tool_result", tool_call_id: m.client_tool_call?.tool_call_id, result: "This tool isn't available in the interview.", is_error: true });
        break;
    }
  };
  ws.onerror = () => { if (!ended) { onError("Voice connection dropped."); onStatus("error"); } cleanup(); };
  ws.onclose = () => { if (!ended) onStatus("ended"); cleanup(); };

  return {
    end: () => { cleanup(); try { ws.close(); } catch { /* closed */ } },
    setMuted: (v) => { muted = v; },
  };
}
