import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { BridgeMap } from "@/lib/types";
// LOCAL SHIM of P2's loadGraph
export async function loadGraph(userId: string, roleId: string): Promise<BridgeMap | null> {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), `data/fixtures/bridgemap.${userId}.${roleId}.json`), "utf8")) as BridgeMap; } catch { return null; }
}
