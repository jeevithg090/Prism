import "server-only";
import fs from "node:fs";
import path from "node:path";
// SCAFFOLD STUB (owner: P1). Contract §8 signature; P1 replaces it with the real implementation.
export async function withCache<T>(key: string, fn: () => Promise<T>, opts?: { ttlSec?: number; fixture?: string }): Promise<T> {
  if (process.env.DEMO_MODE === "true") {
    for (const rel of [`data/cache/${key}.json`, opts?.fixture ? `data/fixtures/${opts.fixture}` : ""]) {
      if (!rel) continue;
      try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), "utf8")) as T; } catch { /* next */ }
    }
  }
  return fn();
}
