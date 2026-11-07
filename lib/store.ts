import "server-only";
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface Store {
  get<T>(c: string, id: string): Promise<T | null>;
  list<T>(c: string, f?: { userId?: string }): Promise<T[]>;
  upsert<T extends { id?: string }>(c: string, id: string, doc: T, userId?: string): Promise<T>;
  remove(c: string, id: string): Promise<void>;
}

type Entry = { doc: unknown; userId?: string };
export type SeedRow = { collection: string; id: string; doc: unknown; userId?: string };
export type SeedLoader = () => SeedRow[];

function readJson(rel: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), "utf8"));
  } catch { return undefined; } // missing files are skipped silently
}
const arr = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x : x ? [x] : []) as Record<string, unknown>[];

export const defaultSeed: SeedLoader = () => {
  const rows: SeedRow[] = [];
  const add = (collection: string, items: Record<string, unknown>[], userKey = "userId", idOf = (d: Record<string, unknown>) => String(d.id)) =>
    items.forEach((d) => rows.push({ collection, id: idOf(d), doc: d, userId: (d[userKey] as string) ?? undefined }));
  const f = "data/fixtures/";
  add("profiles", arr(readJson(f + "profile.aisha.json")), "id");
  add("profiles", arr(readJson("data/seed/students.json")), "id");
  add("evidence", arr(readJson(f + "evidence.aisha.json")));
  const rm = readJson(f + "roadmap.aisha.ml-engineer.json") as Record<string, unknown> | undefined;
  if (rm) rows.push({ collection: "roadmaps", id: "aisha", doc: rm, userId: "aisha" });
  add("pods", arr(readJson(f + "pod.aisha.json")), "id");
  add("trajectories", arr(readJson("data/seed/trajectories.json")));
  add("help", arr(readJson(f + "help.json")), "fromUserId");
  return rows;
};

export class MemoryStore implements Store {
  private data = new Map<string, Map<string, Entry>>();
  private seeded = false;
  constructor(private loader: SeedLoader = defaultSeed) {}

  private col(c: string) {
    if (!this.seeded) {
      this.seeded = true;
      for (const r of this.loader()) this.col(r.collection).set(r.id, { doc: r.doc, userId: r.userId });
    }
    let m = this.data.get(c);
    if (!m) this.data.set(c, (m = new Map()));
    return m;
  }
  async get<T>(c: string, id: string) { return (this.col(c).get(id)?.doc as T) ?? null; }
  async list<T>(c: string, f?: { userId?: string }) {
    return [...this.col(c).values()].filter((e) => !f?.userId || e.userId === f.userId).map((e) => e.doc as T);
  }
  async upsert<T extends { id?: string }>(c: string, id: string, doc: T, userId?: string) {
    this.col(c).set(id, { doc, userId });
    return doc;
  }
  async remove(c: string, id: string) { this.col(c).delete(id); }
}

class SupabaseStore implements Store {
  private db: SupabaseClient;
  constructor(url: string, key: string) {
    this.db = createClient(url, key, { auth: { persistSession: false } });
  }
  async get<T>(c: string, id: string) {
    const { data, error } = await this.db.from("docs").select("data").eq("collection", c).eq("id", id).maybeSingle();
    if (error) throw error;
    return (data?.data as T) ?? null;
  }
  async list<T>(c: string, f?: { userId?: string }) {
    let q = this.db.from("docs").select("data").eq("collection", c);
    if (f?.userId) q = q.eq("user_id", f.userId);
    const { data, error } = await q.order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r) => r.data as T);
  }
  async upsert<T extends { id?: string }>(c: string, id: string, doc: T, userId?: string) {
    const { error } = await this.db.from("docs").upsert({
      collection: c, id, user_id: userId ?? null, data: doc, updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return doc;
  }
  async remove(c: string, id: string) {
    const { error } = await this.db.from("docs").delete().eq("collection", c).eq("id", id);
    if (error) throw error;
  }
}

/** Wraps a primary store; on any throw, warns once and serves from memory so the demo never dies. */
class FallbackStore implements Store {
  private warned = false;
  constructor(private primary: Store, private fallback: Store) {}
  private async run<R>(fn: (s: Store) => Promise<R>): Promise<R> {
    try { return await fn(this.primary); } catch (err) {
      if (!this.warned) { this.warned = true; console.warn("[store] Supabase failed, falling back to memory:", (err as Error).message); }
      return fn(this.fallback);
    }
  }
  get<T>(c: string, id: string) { return this.run((s) => s.get<T>(c, id)); }
  list<T>(c: string, f?: { userId?: string }) { return this.run((s) => s.list<T>(c, f)); }
  upsert<T extends { id?: string }>(c: string, id: string, doc: T, userId?: string) { return this.run((s) => s.upsert(c, id, doc, userId)); }
  remove(c: string, id: string) { return this.run((s) => s.remove(c, id)); }
}

const g = globalThis as unknown as { __ksMem?: MemoryStore; __ksSb?: Store };

export function getStore(): Store {
  const mem = (g.__ksMem ??= new MemoryStore());
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.NODE_ENV === "test" || process.env.DEMO_MODE === "true" || !url || !key) return mem;
  return (g.__ksSb ??= new FallbackStore(new SupabaseStore(url, key), mem));
}
