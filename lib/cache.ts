import "server-only";
import fs from "node:fs/promises";
import path from "node:path";

const mem = new Map<string, { v: unknown; exp: number }>();
const DEMO = () => process.env.DEMO_MODE === "true";
const cacheFile = (key: string) => path.join(process.cwd(), "data/cache", `${key}.json`);
const fixtureFile = (name: string) => path.join(process.cwd(), "data/fixtures", name);

export async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2));
}

/** Committed cache first, then the fixture. Never calls a live service. */
export async function readCached<T>(key: string, fixture?: string): Promise<T | null> {
  const cached = await readJson<T>(cacheFile(key));
  if (cached !== null) return cached;
  return fixture ? readJson<T>(fixtureFile(fixture)) : null;
}

export async function withCache<T>(
  key: string,
  fn: () => Promise<T>,
  opts: { ttlSec?: number; fixture?: string; refresh?: boolean } = {},
): Promise<T> {
  if (DEMO()) {
    const stored = await readCached<T>(key, opts.fixture);
    if (stored !== null) return stored;
  }
  const hit = mem.get(key);
  if (!opts.refresh && hit && hit.exp > Date.now()) return hit.v as T;
  const v = await fn();
  mem.set(key, { v, exp: Date.now() + (opts.ttlSec ?? 86400) * 1000 });
  if (process.env.NODE_ENV !== "production") {
    await writeJson(cacheFile(key), v).catch(() => {});
  }
  return v;
}

export function clearMemCache(): void {
  mem.clear();
}
