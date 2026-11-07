import { afterEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiPost } from "@/lib/fetcher";

afterEach(() => vi.restoreAllMocks());

describe("fetcher", () => {
  it("returns data for ok:true", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true, data: { a: 1 } })));
    await expect(apiGet<{ a: number }>("/x")).resolves.toEqual({ a: 1 });
  });
  it("throws the error message for ok:false", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: false, error: { code: "bad_request", message: "nope" } }), { status: 400 }));
    await expect(apiPost("/x", {})).rejects.toThrow("nope");
  });
});
