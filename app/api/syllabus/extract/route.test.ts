import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractProgramme } from "@/lib/agents/syllabus";
import { ProgrammeZ } from "@/lib/schemas/data";
import { POST } from "./route";

vi.mock("@/lib/agents/syllabus", async (original) => {
  const real = await original<typeof import("@/lib/agents/syllabus")>();
  return { ...real, extractProgramme: vi.fn(real.extractProgramme) };
});
vi.mock("@/lib/llm", () => ({ llmJSON: vi.fn() }));

const call = (body: string) =>
  POST(new Request("http://localhost/api/syllabus/extract", { method: "POST", body }));

beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "true");
  vi.mocked(extractProgramme).mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/syllabus/extract", () => {
  it("returns 400 for an empty body object", async () => {
    const res = await call("{}");
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error.code).toBe("bad_request");
  });

  it("returns 400 for malformed JSON", async () => {
    expect((await call("not json")).status).toBe(400);
  });

  it("returns a Programme for a valid url", async () => {
    const res = await call(JSON.stringify({ url: "https://example.com" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    ProgrammeZ.parse(body.data);
  });

  it("returns 502 with a friendly message when Firecrawl fails", async () => {
    vi.mocked(extractProgramme).mockRejectedValueOnce(new Error("blocked: secret detail"));
    const res = await call(JSON.stringify({ url: "https://example.com" }));
    const body = await res.json();
    expect(res.status).toBe(502);
    expect(body).toEqual({
      ok: false,
      error: { code: "firecrawl_failed", message: "Couldn't read that page. Paste the course text instead." },
    });
  });
});
