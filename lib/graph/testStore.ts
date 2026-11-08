// Test helper: an in-memory Store with the same semantics as lib/store's MemoryStore (no seeding).
import type { Store } from "@/lib/store";

export function memStore(): Store & { dump: () => Map<string, Map<string, { doc: unknown; userId?: string }>> } {
  const data = new Map<string, Map<string, { doc: unknown; userId?: string }>>();
  const col = (c: string) => { let m = data.get(c); if (!m) { m = new Map(); data.set(c, m); } return m; };
  return {
    async get<T>(c: string, id: string) { return (col(c).get(id)?.doc as T) ?? null; },
    async list<T>(c: string, f?: { userId?: string }) { return [...col(c).values()].filter((r) => !f?.userId || r.userId === f.userId).map((r) => r.doc as T); },
    async upsert<T extends { id?: string }>(c: string, id: string, doc: T, userId?: string) { col(c).set(id, { doc, userId }); return doc; },
    async remove(c: string, id: string) { col(c).delete(id); },
    dump: () => data,
  };
}
