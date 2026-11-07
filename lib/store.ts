import "server-only";
import fs from "node:fs";
import path from "node:path";
// SCAFFOLD STUB (owner: P2). In-memory store seeded from fixtures (contract §8); P2 adds SupabaseStore + getStore() switching.
export interface Store {
  get<T>(collection: string, id: string): Promise<T | null>;
  list<T>(collection: string, filter?: { userId?: string }): Promise<T[]>;
  upsert<T extends { id?: string }>(collection: string, id: string, doc: T, userId?: string): Promise<T>;
  remove(collection: string, id: string): Promise<void>;
}
type Row = { doc: unknown; userId?: string };
function readJSON(rel: string): unknown { try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", rel.replace(/^data\//, "")), "utf8")); } catch { return undefined; } }
class MemoryStore implements Store {
  private data = new Map<string, Map<string, Row>>();
  private seeded = false;
  private col(c: string) { let m = this.data.get(c); if (!m) { m = new Map(); this.data.set(c, m); } return m; }
  private seed() {
    if (this.seeded) return; this.seeded = true;
    const put = (c: string, id: string, doc: unknown, userId?: string) => this.col(c).set(id, { doc, userId });
    const aisha = readJSON("data/fixtures/profile.aisha.json") as { id: string } | undefined; if (aisha) put("profiles", aisha.id, aisha, aisha.id);
    const students = readJSON("data/seed/students.json") as { id: string }[] | undefined; students?.forEach((s) => put("profiles", s.id, s, s.id));
    const pod = readJSON("data/fixtures/pod.aisha.json") as { id: string; members: { userId: string }[] } | undefined; if (pod) put("pods", pod.id, pod, "aisha");
    const traj = readJSON("data/seed/trajectories.json") as { id: string; userId: string }[] | undefined; traj?.forEach((t) => put("trajectories", t.id, t, t.userId));
    const help = readJSON("data/fixtures/help.json") as { id: string; fromUserId: string }[] | undefined; help?.forEach((h) => put("help", h.id, h, h.fromUserId));
  }
  async get<T>(c: string, id: string) { this.seed(); return (this.col(c).get(id)?.doc as T) ?? null; }
  async list<T>(c: string, f?: { userId?: string }) { this.seed(); return [...this.col(c).values()].filter((r) => !f?.userId || r.userId === f.userId).map((r) => r.doc as T); }
  async upsert<T extends { id?: string }>(c: string, id: string, doc: T, userId?: string) { this.seed(); this.col(c).set(id, { doc, userId }); return doc; }
  async remove(c: string, id: string) { this.seed(); this.col(c).delete(id); }
}
const g = globalThis as unknown as { __ksStore?: Store };
export function getStore(): Store { return (g.__ksStore ??= new MemoryStore()); }
/** Demo reset: drops everything written since the server started (evidence, proofs, maps, interviews), so the next read reseeds from the fixtures. */
export function resetStore(): void { g.__ksStore = new MemoryStore(); }
