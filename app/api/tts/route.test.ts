import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TTS_MAX_CALLS_PER_WINDOW, resetTtsGuard } from "@/lib/briefing";
import { tts } from "@/lib/voice/elevenlabs";
import { POST } from "./route";

vi.mock("@/lib/voice/elevenlabs", () => ({
  tts: vi.fn(),
  VoiceError: class VoiceError extends Error {},
}));
vi.mock("@/lib/llm", () => ({ llmText: vi.fn(), llmJSON: vi.fn(), LLMError: class LLMError extends Error {} }));

const MP3 = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00]); // "ID3…"
let withAudio: string;
let withoutAudio: string;

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request("http://localhost:3000/api/tts", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

beforeAll(() => {
  withAudio = fs.mkdtempSync(path.join(os.tmpdir(), "ks-tts-"));
  fs.mkdirSync(path.join(withAudio, "public", "demo"), { recursive: true });
  fs.writeFileSync(path.join(withAudio, "public", "demo", "briefing-aisha.mp3"), MP3);
  withoutAudio = fs.mkdtempSync(path.join(os.tmpdir(), "ks-tts-empty-"));
});
afterAll(() => {
  fs.rmSync(withAudio, { recursive: true, force: true });
  fs.rmSync(withoutAudio, { recursive: true, force: true });
});

beforeEach(() => {
  resetTtsGuard();
  vi.mocked(tts).mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  delete process.env.DEMO_MODE;
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.DEMO_MODE;
});

describe("POST /api/tts", () => {
  it("in DEMO_MODE streams the committed demo MP3 as audio/mpeg without calling ElevenLabs", async () => {
    process.env.DEMO_MODE = "true";
    vi.spyOn(process, "cwd").mockReturnValue(withAudio);
    const r = await post({ text: "Morning Aisha!" });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("audio/mpeg");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("x-keystone-audio-source")).toBe("demo");
    expect(Buffer.from(await r.arrayBuffer())).toEqual(MP3);
    expect(tts).not.toHaveBeenCalled();
  });

  it("in DEMO_MODE without the MP3 returns 501 not_ready", async () => {
    process.env.DEMO_MODE = "true";
    vi.spyOn(process, "cwd").mockReturnValue(withoutAudio);
    const r = await post({ text: "Morning Aisha!" });
    expect(r.status).toBe(501);
    expect(await r.json()).toMatchObject({ ok: false, error: { code: "not_ready" } });
  });

  it("returns ElevenLabs audio when live", async () => {
    vi.mocked(tts).mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    const r = await post({ text: "Hello", voiceId: "v1" });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("audio/mpeg");
    expect(r.headers.get("x-keystone-audio-source")).toBe("elevenlabs");
    expect([...new Uint8Array(await r.arrayBuffer())]).toEqual([1, 2, 3]);
    expect(tts).toHaveBeenCalledWith("Hello", "v1");
  });

  it("falls back to the demo MP3 when ElevenLabs fails", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(withAudio);
    vi.mocked(tts).mockRejectedValue(new Error("tts_failed_401"));
    const r = await post({ text: "Hello" });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("audio/mpeg");
    expect(r.headers.get("x-keystone-audio-source")).toBe("demo");
  });

  it("returns 501 when ElevenLabs fails and there is no demo MP3", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(withoutAudio);
    vi.mocked(tts).mockRejectedValue(new Error("no_key"));
    expect((await post({ text: "Hello" })).status).toBe(501);
  });

  it("rejects cross-site browser requests with 403 before calling ElevenLabs", async () => {
    vi.mocked(tts).mockResolvedValue(new Uint8Array([1]).buffer);
    const crossSite: Record<string, string>[] = [{ origin: "https://evil.example" }, { "sec-fetch-site": "cross-site" }];
    for (const headers of crossSite) {
      const r = await post({ text: "Hello" }, headers);
      expect(r.status).toBe(403);
      expect(await r.json()).toMatchObject({ ok: false, error: { code: "forbidden" } });
    }
    expect(tts).not.toHaveBeenCalled();
    expect((await post({ text: "Hello" }, { origin: "http://localhost:3000" })).status).toBe(200);
  });

  it("reuses audio for the same text instead of calling ElevenLabs again", async () => {
    vi.mocked(tts).mockResolvedValue(new Uint8Array([7, 8]).buffer);
    const first = await post({ text: "Same script" });
    const second = await post({ text: "Same script" });
    expect([...new Uint8Array(await first.arrayBuffer())]).toEqual([7, 8]);
    expect([...new Uint8Array(await second.arrayBuffer())]).toEqual([7, 8]);
    expect(tts).toHaveBeenCalledTimes(1);
    await post({ text: "Same script", voiceId: "other" });
    expect(tts).toHaveBeenCalledTimes(2);
  });

  it("stops calling ElevenLabs once the budget is spent and serves the demo MP3", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(withAudio);
    vi.mocked(tts).mockResolvedValue(new Uint8Array([1]).buffer);
    for (let i = 0; i < TTS_MAX_CALLS_PER_WINDOW; i++) await post({ text: `Script ${i}` });
    expect(tts).toHaveBeenCalledTimes(TTS_MAX_CALLS_PER_WINDOW);
    const r = await post({ text: "One too many" });
    expect(r.status).toBe(200);
    expect(r.headers.get("x-keystone-audio-source")).toBe("demo");
    expect(tts).toHaveBeenCalledTimes(TTS_MAX_CALLS_PER_WINDOW);
  });

  it("returns 400 for empty text, over-long text or a non-JSON body", async () => {
    for (const body of [{ text: "" }, { text: "x".repeat(2501) }, {}, "not json"]) {
      const r = await post(body);
      expect(r.status).toBe(400);
      expect(await r.json()).toMatchObject({ ok: false, error: { code: "bad_request" } });
    }
    expect(tts).not.toHaveBeenCalled();
  });
});
