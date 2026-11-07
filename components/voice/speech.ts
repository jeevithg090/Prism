"use client";
// Browser speech for Practice mode (no keys): speechSynthesis reads questions aloud,
// webkitSpeechRecognition (when the browser has it) turns spoken answers into text.

type SRResult = { isFinal: boolean; 0: { transcript: string } };
type SREvent = { resultIndex: number; results: ArrayLike<SRResult> };
export interface SpeechRecognitionLike {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type SRCtor = new () => SpeechRecognitionLike;

export function speechRecognitionCtor(): SRCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

/** Reads `text` aloud (British English voice when there is one). Resolves when it ends; no-op without TTS. */
export function speak(text: string, opts: { rate?: number } = {}): Promise<void> {
  if (!canSpeak()) return Promise.resolve();
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voices = synth.getVoices();
    const voice = voices.find((v) => v.lang === "en-GB") ?? voices.find((v) => v.lang?.startsWith("en"));
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? "en-GB";
    u.rate = opts.rate ?? 1;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    synth.speak(u);
  });
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
}

/**
 * Starts listening. `onText(final, interim)` gets the running transcript. Returns a stop function.
 * `onError("not-allowed")` means the microphone was blocked.
 */
export function listen(onText: (finalText: string, interim: string) => void, onError: (code: string) => void, onEnd: () => void): (() => void) | null {
  const Ctor = speechRecognitionCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = "en-GB";
  rec.continuous = true;
  rec.interimResults = true;
  let finalText = "";
  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += `${r[0].transcript.trim()} `;
      else interim += r[0].transcript;
    }
    onText(finalText.trim(), interim.trim());
  };
  rec.onerror = (e) => onError(e.error);
  rec.onend = onEnd;
  try {
    rec.start();
  } catch {
    onError("start-failed");
    return null;
  }
  return () => {
    try { rec.stop(); } catch { /* already stopped */ }
  };
}
