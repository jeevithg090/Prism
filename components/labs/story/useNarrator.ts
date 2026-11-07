"use client";
// Story Mode narration: ElevenLabs through POST /api/tts when it's configured, otherwise the browser's own
// speechSynthesis, otherwise silence (captions still run). One voice at a time; stop() cancels everything.
import * as React from "react";

export type VoiceEngine = "unknown" | "elevenlabs" | "browser" | "none";

export function useNarrator() {
  const [engine, setEngine] = React.useState<VoiceEngine>("unknown");
  const engineRef = React.useRef<VoiceEngine>("unknown");
  const audio = React.useRef<HTMLAudioElement | null>(null);
  const cache = React.useRef(new Map<string, string>());
  const token = React.useRef(0);

  const setE = (e: VoiceEngine) => { engineRef.current = e; setEngine(e); };

  const stop = React.useCallback(() => {
    token.current++;
    audio.current?.pause();
    audio.current = null;
    try { window.speechSynthesis?.cancel(); } catch { /* not supported */ }
  }, []);

  React.useEffect(() => () => {
    stop();
    for (const url of cache.current.values()) URL.revokeObjectURL(url);
  }, [stop]);

  const browserSpeak = React.useCallback((text: string, mine: number, onEnd: () => void) => {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (!synth || typeof SpeechSynthesisUtterance === "undefined") { setE("none"); onEnd(); return; }
    setE("browser");
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02;
    u.lang = "en-GB";
    u.onend = () => { if (token.current === mine) onEnd(); };
    u.onerror = () => { if (token.current === mine) onEnd(); };
    synth.cancel();
    synth.speak(u);
  }, []);

  /** Speaks `text`, then calls onEnd (also on failure, so autoplay never stalls). */
  const speak = React.useCallback(async (key: string, text: string, onEnd: () => void) => {
    stop();
    const mine = token.current;
    if (engineRef.current === "none") { onEnd(); return; }
    if (engineRef.current === "unknown" || engineRef.current === "elevenlabs") {
      try {
        let url = cache.current.get(key);
        if (!url) {
          const res = await fetch("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
          if (!res.ok || !res.headers.get("content-type")?.includes("audio")) throw new Error(`tts ${res.status}`);
          url = URL.createObjectURL(await res.blob());
          cache.current.set(key, url);
        }
        if (token.current !== mine) return;
        setE("elevenlabs");
        const a = new Audio(url);
        audio.current = a;
        a.onended = () => { if (token.current === mine) onEnd(); };
        a.onerror = () => { if (token.current === mine) onEnd(); };
        await a.play();
        return;
      } catch {
        if (token.current !== mine) return;
        // 501 not_configured (no ElevenLabs key) or a blocked autoplay: use the browser voice from now on.
      }
    }
    browserSpeak(text, mine, onEnd);
  }, [browserSpeak, stop]);

  return { engine, speak, stop };
}
