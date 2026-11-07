"use client";
// Plays text through ElevenLabs (POST /api/tts) when it's configured, else the browser's speechSynthesis.
import { canSpeak, speak, stopSpeaking } from "./speech";

export type Playback = { via: "elevenlabs" | "browser" | "none"; done: Promise<void>; stop: () => void; audio?: HTMLAudioElement };

export async function playText(text: string, opts: { rate?: number } = {}): Promise<Playback> {
  try {
    const r = await fetch("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
    if (r.ok && r.headers.get("content-type")?.includes("audio")) {
      const url = URL.createObjectURL(await r.blob());
      const audio = new Audio(url);
      audio.playbackRate = opts.rate ?? 1;
      const done = new Promise<void>((resolve) => { audio.onended = () => { URL.revokeObjectURL(url); resolve(); }; audio.onerror = () => resolve(); });
      await audio.play();
      return { via: "elevenlabs", done, stop: () => { audio.pause(); URL.revokeObjectURL(url); }, audio };
    }
  } catch {
    // fall through to the browser voice
  }
  if (!canSpeak()) return { via: "none", done: Promise.resolve(), stop: () => {} };
  return { via: "browser", done: speak(text, opts), stop: stopSpeaking };
}
