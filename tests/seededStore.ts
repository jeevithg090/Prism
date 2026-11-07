// Test helper: an in-memory Store seeded from the same files as the DEMO_MODE store
// (profile.aisha, seed students, pod.aisha, seed trajectories, help). Use with
//   vi.mock("@/lib/store", async () => (await import("@/tests/seededStore")).seededStoreModule());
import fs from "node:fs";
import path from "node:path";

type Row = { doc: unknown; userId?: string };

function readJSON(rel: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), "utf8"));
  } catch {
    return undefined;
  }
}

export function createSeededStore() {
  const data = new Map<string, Map<string, Row>>();
  const col = (c: string) => {
    let m = data.get(c);
    if (!m) data.set(c, (m = new Map()));
    return m;
  };
  const put = (c: string, id: string, doc: unknown, userId?: string) => col(c).set(id, { doc, userId });
  const seed = () => {
    data.clear();
    const aisha = readJSON("data/fixtures/profile.aisha.json") as { id: string } | undefined;
    if (aisha) put("profiles", aisha.id, aisha, aisha.id);
    (readJSON("data/seed/students.json") as { id: string }[] | undefined)?.forEach((s) => put("profiles", s.id, s, s.id));
    const pod = readJSON("data/fixtures/pod.aisha.json") as { id: string } | undefined;
    if (pod) put("pods", pod.id, pod, "aisha");
    (readJSON("data/seed/trajectories.json") as { id: string; userId: string }[] | undefined)?.forEach((t) => put("trajectories", t.id, t, t.userId));
    (readJSON("data/fixtures/help.json") as { id: string; fromUserId: string }[] | undefined)?.forEach((h) => put("help", h.id, h, h.fromUserId));
  };
  seed();
  const clone = <T,>(x: T): T => (x === undefined || x === null ? x : (JSON.parse(JSON.stringify(x)) as T));
  return {
    reset: seed,
    async get<T>(c: string, id: string) { return (clone(col(c).get(id)?.doc) as T) ?? null; },
    async list<T>(c: string, f?: { userId?: string }) {
      return [...col(c).values()].filter((r) => !f?.userId || r.userId === f.userId).map((r) => clone(r.doc) as T);
    },
    async upsert<T extends { id?: string }>(c: string, id: string, doc: T, userId?: string) { put(c, id, clone(doc), userId); return doc; },
    async remove(c: string, id: string) { col(c).delete(id); },
  };
}

const g = globalThis as unknown as { __ksTestStore?: ReturnType<typeof createSeededStore> };
export const testStore = () => (g.__ksTestStore ??= createSeededStore());
export const seededStoreModule = () => ({ getStore: () => testStore() });
