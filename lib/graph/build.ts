import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { BridgeMap } from "@/lib/types";
// SCAFFOLD STUB (owner: P2). Reads the fixture map; P2 replaces it with the real graph builder.
export async function loadGraph(userId: string, roleId: string): Promise<BridgeMap | null> {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), `data/fixtures/bridgemap.${userId}.${roleId}.json`), "utf8")) as BridgeMap; } catch { return null; }
}
