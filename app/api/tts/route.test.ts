import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const env = { ...process.env };
const post = (body: unknown) => POST(new Request("http://localhost/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
beforeEach(() => { vi.restoreAllMocks(); delete process.env.ELEVENLABS_API_KEY; delete process.env.ELEVENLABS_VOICE_ID; });
afterEach(() => { process.env = { ...env }; });

describe("POST /api/tts", () => {
  it("400s on empty text", async () => {
    expect((await post({ text: "" })).status).toBe(400);
  });
  it("501s with the envelope when ElevenLabs isn't configured", async () => {
    const res = await post({ text: "Hello Aisha" });
    expect(res.status).toBe(501);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: "not_configured" } });
  });
  it("returns audio/mpeg from ElevenLabs when the key is set", async () => {
    process.env.ELEVENLABS_API_KEY = "xi_test";
    process.env.ELEVENLABS_VOICE_ID = "voiceABC123";
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array([0xff, 0xfb, 0x90]), { status: 200, headers: { "content-type": "audio/mpeg" } }));
    const res = await post({ text: "Hello Aisha" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xfb, 0x90]));
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/v1/text-to-speech/voiceABC123");
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("xi_test");
    expect(JSON.parse(String(init.body))).toMatchObject({ text: "Hello Aisha", model_id: "eleven_multilingual_v2" });
  });
  it("502s when ElevenLabs fails", async () => {
    process.env.ELEVENLABS_API_KEY = "xi_test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("quota", { status: 429 }));
    expect((await post({ text: "Hi" })).status).toBe(502);
  });
});
