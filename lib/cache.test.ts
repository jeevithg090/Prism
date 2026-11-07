import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearMemCache, withCache } from "./cache";

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "keystone-cache-"));
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  clearMemCache();
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await fs.rm(dir, { recursive: true, force: true });
});

async function put(rel: string, value: unknown) {
  const file = path.join(dir, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value));
}

describe("withCache", () => {
  it("returns the cache file in demo mode without calling fn", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    await put("data/cache/k.json", { from: "cache" });
    const fn = vi.fn(async () => ({ from: "fn" }));
    await expect(withCache("k", fn)).resolves.toEqual({ from: "cache" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("falls back to the fixture in demo mode when no cache file exists", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    await put("data/fixtures/f.json", { from: "fixture" });
    const fn = vi.fn(async () => ({ from: "fn" }));
    await expect(withCache("k", fn, { fixture: "f.json" })).resolves.toEqual({ from: "fixture" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("memoises within the TTL outside demo mode", async () => {
    vi.stubEnv("DEMO_MODE", "false");
    const fn = vi.fn(async () => ({ n: 1 }));
    await withCache("k", fn);
    await expect(withCache("k", fn)).resolves.toEqual({ n: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
